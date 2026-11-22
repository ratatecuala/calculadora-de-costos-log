#!/usr/bin/env python3
"""SIMULACRO DE RESTAURACIÓN LOCAL (docs/25, A-77). Procesa el data.sql de un respaldo.

  procesar-respaldo.py auth    <data.sql>               → SQL que crea auth.users y auth.identities
  procesar-respaldo.py filtrar <data.sql> <salida.sql>  → datos de la app listos para cargar

Por qué existe: el respaldo trae TODAS las columnas de auth.users y auth.identities de Supabase (decenas,
y cambian con las versiones de Supabase), pero la ESTRUCTURA de auth no viaja en el respaldo (docs/17
§5.1). Para poder cargar esos datos en una base local, se crean las dos tablas con exactamente las
columnas que lista el propio COPY del respaldo: `id` de auth.users como uuid (lo referencian las
tablas de la app) y el resto como text. No se pierde ni se transforma ningún dato.

El filtro conserva SOLO lo que la app necesita para la verificación: los COPY de los esquemas public
y private, los de auth.users y auth.identities, los setval de public/private y el preámbulo (SET,
set_config, \\restrict). Los cambios de rol del volcado (SET SESSION AUTHORIZATION, SET ROLE) se omiten. El resto (p. ej., auth.sessions o storage.* en el modo `cli`) se omite y se
informa por nombre de tabla y cantidad de filas, NUNCA con su contenido.
"""
import re
import sys

COPY_RE = re.compile(r'^COPY\s+("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)\.("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)\s*(\((.*)\))?\s+FROM\s+stdin;\s*$')
SETVAL_RE = re.compile(r"^SELECT\s+pg_catalog\.setval\('((?:[^']|'')*)'")
KEEP_SCHEMAS = {'public', 'private'}
KEEP_AUTH = {'users', 'identities'}


def unquote(ident: str) -> str:
    ident = ident.strip()
    if ident.startswith('"') and ident.endswith('"'):
        return ident[1:-1].replace('""', '"')
    return ident


def split_columns(cols: str) -> list[str]:
    out, cur, in_q = [], '', False
    i = 0
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


def qi(ident: str) -> str:
    return '"' + ident.replace('"', '""') + '"'


def keep_table(schema: str, table: str) -> bool:
    return schema in KEEP_SCHEMAS or (schema == 'auth' and table in KEEP_AUTH)


def auth_ddl(path: str) -> str:
    cols: dict[str, list[str]] = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            m = COPY_RE.match(line.rstrip('\n'))
            if m and unquote(m.group(1)) == 'auth' and unquote(m.group(2)) in KEEP_AUTH and m.group(4):
                cols[unquote(m.group(2))] = split_columns(m.group(4))
    users = cols.get('users', ['id'])
    if 'id' not in users:
        raise SystemExit('ERROR: el COPY de auth.users del respaldo no trae la columna id')
    identities = cols.get('identities', ['id', 'user_id'])
    out = ['-- Generado por procesar-respaldo.py a partir del propio respaldo (columnas exactas).']
    defs = [f'{qi(c)} uuid primary key' if c == 'id' else f'{qi(c)} text' for c in users]
    out.append(f'create table auth.users ({", ".join(defs)});')
    out.append(f'create table auth.identities ({", ".join(qi(c) + " text" for c in identities)});')
    out.append(f'-- auth.users: {len(users)} columnas · auth.identities: {len(identities)} columnas')
    return '\n'.join(out) + '\n'


def filtrar(path: str, dest: str) -> None:
    omitidas: list[str] = []
    conservadas: list[str] = []
    with open(path, encoding='utf-8') as f, open(dest, 'w', encoding='utf-8') as out:
        lines = iter(f)
        for line in lines:
            s = line.rstrip('\n')
            m = COPY_RE.match(s)
            if m:
                schema, table = unquote(m.group(1)), unquote(m.group(2))
                keep = keep_table(schema, table)
                if keep:
                    out.write(line)
                filas = 0
                for row in lines:
                    if row.rstrip('\n') == '\\.':
                        if keep:
                            out.write(row)
                        break
                    filas += 1
                    if keep:
                        out.write(row)
                else:
                    raise SystemExit(f'ERROR: el bloque COPY de {schema}.{table} no termina con «\\.» (respaldo dañado)')
                (conservadas if keep else omitidas).append(f'{schema}.{table} ({filas} filas)')
                continue
            sv = SETVAL_RE.match(s)
            if sv:
                seq = sv.group(1).replace('"', '')
                if seq.split('.')[0] in KEEP_SCHEMAS:
                    out.write(line)
                else:
                    omitidas.append(f'setval de {seq}')
                continue
            # Cambios de rol del volcado (p. ej., SET SESSION AUTHORIZATION 'usuario'): nombran roles del
            # origen que no existen en la base local y no son datos. Se omiten.
            if s.upper().startswith(('SET SESSION AUTHORIZATION', 'RESET SESSION AUTHORIZATION', 'SET ROLE', 'RESET ROLE')):
                omitidas.append('cambio de rol del volcado (SET SESSION AUTHORIZATION / SET ROLE)')
                continue
            if s.startswith(('SET ', 'RESET ', 'SELECT pg_catalog.set_config(', '\\restrict ', '\\unrestrict ')) or s == '' or s.startswith('--'):
                out.write(line)
                continue
            # Cualquier otra sentencia se omite y se informa solo por su primera palabra (sin valores).
            omitidas.append(f'sentencia {s.split()[0] if s.split() else "?"} (omitida)')
    for c in conservadas:
        print(f'  conservada: {c}')
    for o in omitidas:
        print(f'  omitida: {o}')


def main() -> None:
    if len(sys.argv) >= 3 and sys.argv[1] == 'auth':
        sys.stdout.write(auth_ddl(sys.argv[2]))
    elif len(sys.argv) >= 4 and sys.argv[1] == 'filtrar':
        filtrar(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit(__doc__)


if __name__ == '__main__':
    main()
