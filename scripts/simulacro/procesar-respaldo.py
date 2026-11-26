#!/usr/bin/env python3
"""SIMULACRO DE RESTAURACIÓN LOCAL (docs/25; A-77, A-78). Procesa un respaldo de respaldo-supabase.sh.

  procesar-respaldo.py auth    <auth-columnas.txt> <data.sql>  → SQL que crea auth.users y auth.identities
  procesar-respaldo.py filtrar <data.sql> <salida.sql>         → datos listos para cargar

auth: la ESTRUCTURA de Auth no viaja en el volcado (docs/17 §5.1). El respaldo trae, en
auth-columnas.txt, el nombre, el TIPO y (si es generada) la expresión de cada columna de auth.users y
auth.identities. Con eso se recrean las dos tablas con sus tipos reales y sus columnas generadas, para
que la verificación compare su contenido completo con el origen. Solo se aceptan tipos del sistema
(pg_catalog): un tipo propio de Supabase o una lista que no coincida con la del COPY es un ERROR
explícito. Esto NO reconstruye Supabase Auth: no hay funciones, triggers, otras tablas de auth ni
inicio de sesión. Es una base de COMPROBACIÓN de datos, no una restauración funcional.

filtrar: conserva solo lo que la app usa (COPY de public, private, auth.users y auth.identities;
setval de public/private; SET y comentarios del preámbulo). Las tablas internas de otros esquemas
(p. ej. auth.sessions o storage.*) se omiten y se informan por nombre y cantidad de filas, NUNCA con
su contenido. Cualquier formato o dato relevante que no sepa interpretar es un ERROR explícito
(A-78): INSERT, COPY binario o CSV, COPY sin lista de columnas, filas con un número de campos
distinto, tablas de la app desconocidas o repetidas, una codificación que no sea UTF-8, sentencias
desconocidas o la falta de una tabla esperada.
"""
import re
import sys

COPY_RE = re.compile(r'^COPY\s+("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)\.("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)\s*(\((.*)\))?\s+FROM\s+stdin(.*)$')
SETVAL_RE = re.compile(r"^SELECT\s+pg_catalog\.setval\('((?:[^']|'')*)'")
ENCODING_RE = re.compile(r"^SET\s+client_encoding\s*=\s*'([^']*)'\s*;\s*$", re.I)
KEEP_AUTH = {'users', 'identities'}
# Tablas de datos de la app, por esquema. Una tabla de public/private que no esté aquí es un ERROR: el
# origen tendría datos que las migraciones del repositorio no saben recibir.
ESPERADAS = {('public', t) for t in ('profiles', 'vehicles', 'jobs', 'client_quotes', 'quote_shares', 'quote_counters')} \
    | {('auth', 'users'), ('auth', 'identities')}
# Tablas que solo existen en algunos estados del origen: job_cargo_items, con las migraciones de I-2 (A-81).
OPCIONALES = {('public', 'job_cargo_items')}
TIPO_OK = re.compile(r'^(uuid|text|boolean|smallint|integer|bigint|numeric(\(\d+(,\d+)?\))?|real|double precision|jsonb|json|bytea|'
                     r'character varying(\(\d+\))?|character(\(\d+\))?|timestamp(\(\d\))? with(out)? time zone|date|'
                     r'time(\(\d\))? with(out)? time zone|interval|inet|text\[\]|uuid\[\]|character varying\[\])$')


class ErrorRespaldo(SystemExit):
    def __init__(self, msg):
        super().__init__(f'ERROR: {msg}')


def unquote(ident):
    ident = ident.strip()
    if ident.startswith('"') and ident.endswith('"'):
        return ident[1:-1].replace('""', '"')
    return ident


def split_columns(cols):
    out, cur, in_q, i = [], '', False, 0
    while i < len(cols):
        ch = cols[i]
        if ch == '"':
            if in_q and i + 1 < len(cols) and cols[i + 1] == '"':
                cur += '""'
                i += 2
                continue
            in_q = not in_q
            cur += ch
        elif ch == ',' and not in_q:
            out.append(unquote(cur))
            cur = ''
        else:
            cur += ch
        i += 1
    if cur.strip():
        out.append(unquote(cur))
    return out


def qi(ident):
    return '"' + ident.replace('"', '""') + '"'


def es_de_la_app(schema, table):
    return schema in ('public', 'private') or (schema == 'auth' and table in KEEP_AUTH)


def leer_copy_headers(path):
    cols = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            m = COPY_RE.match(line.rstrip('\n'))
            if m:
                cols[(unquote(m.group(1)), unquote(m.group(2)))] = split_columns(m.group(4)) if m.group(4) else None
    return cols


def auth_ddl(columnas_path, data_path):
    tablas = {'users': [], 'identities': []}
    with open(columnas_path, encoding='utf-8') as f:
        for n, linea in enumerate(f, 1):
            linea = linea.rstrip('\n')
            if not linea:
                continue
            partes = linea.split('\t')
            if len(partes) != 6 or partes[0] not in tablas:
                raise ErrorRespaldo(f'auth-columnas.txt, línea {n}: formato no reconocido')
            tabla, _num, nombre, tipo, generada, expr = partes
            if not TIPO_OK.match(tipo):
                raise ErrorRespaldo(f'auth.{tabla}.{nombre}: tipo «{tipo}» no reconocido por el simulacro')
            if generada not in ('', 's'):
                raise ErrorRespaldo(f'auth.{tabla}.{nombre}: tipo de columna generada «{generada}» no reconocido')
            if generada == 's' and not expr:
                raise ErrorRespaldo(f'auth.{tabla}.{nombre}: columna generada sin expresión')
            tablas[tabla].append((nombre, tipo, generada, expr))
    copy = leer_copy_headers(data_path)
    out = ['-- Generado por procesar-respaldo.py a partir del propio respaldo (columnas y tipos de origen).']
    for tabla, cols in tablas.items():
        if not cols:
            raise ErrorRespaldo(f'auth-columnas.txt no trae las columnas de auth.{tabla}')
        if ('auth', tabla) not in copy:
            raise ErrorRespaldo(f'el respaldo no trae los datos de auth.{tabla}')
        normales = [c[0] for c in cols if c[2] == '']
        if copy[('auth', tabla)] != normales:
            raise ErrorRespaldo(f'las columnas de auth.{tabla} en data.sql no coinciden con auth-columnas.txt')
        if 'id' not in normales:
            raise ErrorRespaldo(f'auth.{tabla} no tiene la columna id')
        defs = []
        for nombre, tipo, generada, expr in cols:
            d = f'{qi(nombre)} {tipo}'
            if nombre == 'id':
                d += ' primary key'
            if generada == 's':
                d += f' generated always as ({expr}) stored'
            defs.append(d)
        out.append(f'create table auth.{tabla} ({", ".join(defs)});')
    out.append(f'-- auth.users: {len(tablas["users"])} columnas · auth.identities: {len(tablas["identities"])} columnas, con sus tipos')
    return '\n'.join(out) + '\n'


def filtrar(path, dest):
    omitidas, conservadas, vistas = [], [], set()
    with open(path, encoding='utf-8') as f, open(dest, 'w', encoding='utf-8') as out:
        n = 0
        lines = iter(f)
        for line in lines:
            n += 1
            s = line.rstrip('\n')
            m = COPY_RE.match(s)
            if m:
                schema, table = unquote(m.group(1)), unquote(m.group(2))
                keep = es_de_la_app(schema, table)
                if keep:
                    if m.group(5).strip() != ';':
                        raise ErrorRespaldo(f'línea {n}: COPY de {schema}.{table} con opciones no reconocidas (solo se admite texto)')
                    if (schema, table) not in ESPERADAS | OPCIONALES:
                        raise ErrorRespaldo(f'línea {n}: tabla {schema}.{table} no reconocida (las migraciones no la crean)')
                    if (schema, table) in vistas:
                        raise ErrorRespaldo(f'línea {n}: {schema}.{table} aparece dos veces')
                    if not m.group(4):
                        raise ErrorRespaldo(f'línea {n}: COPY de {schema}.{table} sin lista de columnas')
                    vistas.add((schema, table))
                    ncols = len(split_columns(m.group(4)))
                    out.write(line)
                filas = 0
                for row in lines:
                    n += 1
                    if row.rstrip('\n') == '\\.':
                        if keep:
                            out.write(row)
                        break
                    filas += 1
                    if keep:
                        if row.rstrip('\n').count('\t') + 1 != ncols:
                            raise ErrorRespaldo(f'línea {n}: una fila de {schema}.{table} no tiene {ncols} columnas')
                        out.write(row)
                else:
                    raise ErrorRespaldo(f'el bloque COPY de {schema}.{table} no termina con «\\.» (respaldo dañado)')
                (conservadas if keep else omitidas).append(f'{schema}.{table} ({filas} filas)')
                continue
            if s.upper().startswith('COPY '):
                raise ErrorRespaldo(f'línea {n}: COPY con un formato no reconocido')
            if s.upper().startswith('INSERT '):
                raise ErrorRespaldo(f'línea {n}: el respaldo usa INSERT; el simulacro solo admite COPY (pg_dump sin --inserts)')
            sv = SETVAL_RE.match(s)
            if sv:
                seq = sv.group(1).replace('"', '')
                if seq.split('.')[0] in ('public', 'private'):
                    out.write(line)
                else:
                    omitidas.append(f'setval de {seq}')
                continue
            enc = ENCODING_RE.match(s)
            if enc and enc.group(1).upper().replace('-', '') != 'UTF8':
                raise ErrorRespaldo(f'línea {n}: codificación {enc.group(1)} no reconocida (se espera UTF8)')
            # Cambios de rol del volcado: nombran roles del origen que no existen localmente y no son datos.
            if s.upper().startswith(('SET SESSION AUTHORIZATION', 'RESET SESSION AUTHORIZATION', 'SET ROLE', 'RESET ROLE')):
                omitidas.append('cambio de rol del volcado (SET SESSION AUTHORIZATION / SET ROLE)')
                continue
            if s.startswith(('SET ', 'RESET ', 'SELECT pg_catalog.set_config(', '\\restrict ', '\\unrestrict ')) or s == '' or s.startswith('--'):
                out.write(line)
                continue
            raise ErrorRespaldo(f'línea {n}: sentencia no reconocida «{s.split()[0]}» (el simulacro no sabe interpretarla)')
    faltan = sorted(f'{a}.{b}' for a, b in ESPERADAS - vistas)
    if faltan:
        raise ErrorRespaldo(f'el respaldo no trae datos de: {", ".join(faltan)}')
    for c in conservadas:
        print(f'  conservada: {c}')
    for o in omitidas:
        print(f'  omitida (fuera del alcance del simulacro): {o}')


def main():
    if len(sys.argv) == 4 and sys.argv[1] == 'auth':
        sys.stdout.write(auth_ddl(sys.argv[2], sys.argv[3]))
    elif len(sys.argv) == 4 and sys.argv[1] == 'filtrar':
        filtrar(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit(__doc__)


if __name__ == '__main__':
    main()
