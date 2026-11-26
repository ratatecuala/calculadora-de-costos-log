"""Reconoce los prefijos del esquema en un pg_dump de texto. Nunca ejecuta SQL del respaldo."""
import re
import sys
from pathlib import Path


class EstadoInvalido(ValueError):
    pass


FUNCIONES = ("exigir_precio_entero_jobs", "exigir_precio_entero_client_quotes")
TRIGGERS = ("jobs_precio_entero", "client_quotes_precio_entero")
CABECERA = re.compile(r"^-- Name: (.+?); Type: ([A-Z ]+); Schema: ([^;]+); Owner: .*?$", re.M)
CITA_SIMPLE = re.compile(r'"([a-z_][a-z_0-9]*)"')


def identificadores(sql):
    return CITA_SIMPLE.sub(r"\1", sql)


def descripcion_precio(esquema):
    # Exigimos el principio y final del dump y las dos tablas: un archivo vacío o
    # truncado nunca debe clasificarse como un respaldo anterior a precio entero.
    if not all(x in esquema.splitlines() for x in (
            "-- PostgreSQL database dump", "-- PostgreSQL database dump complete")):
        raise EstadoInvalido("schema.sql incompleto o formato de pg_dump no reconocido")
    bloques = list(CABECERA.finditer(esquema))
    tablas = set()
    objetos = {}
    for indice, cab in enumerate(bloques):
        nombre, tipo, schema = map(identificadores, cab.groups())
        if tipo == "TABLE" and schema == "public":
            tablas.add(nombre)
        if tipo == "FUNCTION" and schema == "private" and nombre in [f + "()" for f in FUNCIONES]:
            clave = nombre[:-2]
        elif tipo == "TRIGGER" and schema == "public" and nombre in (
                "jobs jobs_precio_entero", "client_quotes client_quotes_precio_entero"):
            clave = nombre.split()[1]
        else:
            continue
        if clave in objetos:
            raise EstadoInvalido("objetos de precio entero duplicados")
        fin = bloques[indice + 1].start() if indice + 1 < len(bloques) else len(esquema)
        ddl = esquema[cab.end():fin]
        if tipo == "FUNCTION":
            # pg_dump usa dollar quoting para las funciones PL/pgSQL. Preservar
            # exactamente el cuerpo (incluidos literales); el delimitador no es semántico.
            fn = re.search(r"^CREATE (?:OR REPLACE )?FUNCTION (.+?)\s+AS (\$\w*\$)(.*?)\2;", ddl, re.M | re.S)
            if not fn:
                raise EstadoInvalido("función de precio entero ilegible")
            objetos[clave] = (" ".join(identificadores(fn[1]).split()), fn[3])
        else:
            tr = re.search(r"^CREATE TRIGGER ([^;]+);", ddl, re.M)
            if not tr:
                raise EstadoInvalido("trigger de precio entero ilegible")
            objetos[clave] = " ".join(identificadores(tr[1]).split()).replace("EXECUTE PROCEDURE ", "EXECUTE FUNCTION ")
    if not {"jobs", "client_quotes"} <= tablas:
        raise EstadoInvalido("schema.sql no contiene las tablas de precios")
    if objetos and set(objetos) != set(FUNCIONES + TRIGGERS):
        raise EstadoInvalido("precio entero parcial: faltan funciones o triggers")
    # La configuración de disparo puede aparecer como ALTER TABLE separado.
    sql = identificadores(esquema)
    if re.search(r"\b(?:DISABLE|ENABLE (?:REPLICA|ALWAYS))\s+TRIGGER\s+(?:jobs_precio_entero|client_quotes_precio_entero)\b", sql, re.I):
        raise EstadoInvalido("modo de trigger de precio entero alterado")
    for nombre in FUNCIONES + TRIGGERS:
        declaracion = r"^CREATE (?:OR REPLACE )?FUNCTION private\." if nombre in FUNCIONES else r"^CREATE TRIGGER "
        if len(re.findall(declaracion + nombre + r"\b", sql, re.M)) != int(nombre in objetos):
            raise EstadoInvalido("cabeceras y declaraciones de precio entero contradictorias")
    return objetos


def prefijo(verificacion, precio):
    filas = [l.split(" | ") for l in verificacion.splitlines() if l.startswith("inv.security_definer | ")]
    if len(filas) != 1 or len(filas[0]) != 3:
        raise EstadoInvalido("fila inv.security_definer ausente, repetida o ilegible")
    funciones = filas[0][1].split()
    conteos = [l for l in verificacion.splitlines() if l.startswith("conteo.public.job_cargo_items | ")]
    if len(conteos) > 1 or (conteos and not re.fullmatch(r"conteo\.public\.job_cargo_items \| \d+ \| ?", conteos[0])):
        raise EstadoInvalido("conteo de carga duplicado o ilegible")
    m52 = "public.create_job_with_quote" in funciones
    m3 = "private.insert_cargo_items" in funciones
    m4 = "public.create_job_with_quote_v2" in funciones
    if m3 != bool(conteos) or (m3 and not m52) or (m4 and not m3) or (precio and not m4):
        raise EstadoInvalido("huellas de migración contradictorias o fuera de orden")
    if precio:
        return "precio"
    if m4:
        return "i2"
    if m3:
        return "m3"
    return "posterior" if m52 else "anterior"


def comprobar_dependencias(esquema, estado):
    # Contrastar la huella SQL del origen contra el esquema respaldado: una fila
    # editada en verificacion-origen.txt no puede cambiar el prefijo por sí sola.
    sql = identificadores(esquema)
    def funcion(nombre):
        declaraciones = re.findall(r"^CREATE (?:OR REPLACE )?FUNCTION " + re.escape(nombre) +
                                   r"\([^\n]*\).*?^\s+AS [\$']", sql, re.M | re.S)
        if len(declaraciones) > 1:
            raise EstadoInvalido("función de migración repetida en el esquema")
        return declaraciones[0] if declaraciones else None

    base = funcion("public.create_job_with_quote")
    if base is None:
        raise EstadoInvalido("falta el RPC histórico en schema.sql")
    m52 = bool(re.search(r"\bSECURITY DEFINER\b", base))
    tabla = bool(re.search(r"^CREATE TABLE public\.job_cargo_items \(", sql, re.M))
    m3 = funcion("private.insert_cargo_items") is not None
    m4 = funcion("public.create_job_with_quote_v2") is not None
    if ((estado != "anterior") != m52 or tabla != m3
            or (estado in ("m3", "i2", "precio")) != m3
            or (estado in ("i2", "precio")) != m4):
        raise EstadoInvalido("schema.sql y la verificación discrepan sobre #52, M3 o M4")


def verificar_invariantes(texto, estado):
    """Compara valor y esperado sin divulgar los valores. Admite el reporte M3 de A-81."""
    base_m3 = ("private.allocate_quote_number private.insert_cargo_items public.create_job_with_quote "
               "public.create_quote_share public.get_public_quote public.revoke_quote_share")
    esperado_antiguo = base_m3.replace(" public.create_quote_share", " public.create_job_with_quote_v2 public.create_quote_share")
    salida = []
    for linea in texto.splitlines(keepends=True):
        if linea.startswith("inv."):
            columnas = linea.rstrip("\r\n").split(" | ")
            if len(columnas) != 3:
                raise EstadoInvalido("fila de invariante ilegible")
            nombre, valor, esperado = columnas
            if (estado == "m3" and nombre == "inv.security_definer" and valor == base_m3
                    and esperado == esperado_antiguo):
                # Sólo se corrige la expectativa antigua en memoria. El respaldo no se modifica.
                linea = linea.replace(" | " + esperado, " | " + valor)
            elif valor != esperado:
                raise EstadoInvalido("invariante incumplida: " + nombre)
        salida.append(linea)
    return "".join(salida)


def main():
    accion, origen, otro = sys.argv[1:]
    if accion == "invariantes":
        sys.stdout.write(verificar_invariantes(Path(origen).read_text(encoding="utf-8"), otro))
        return
    esquema = Path(origen).read_text(encoding="utf-8")
    src = descripcion_precio(esquema)
    if accion == "estado":
        estado = prefijo(Path(otro).read_text(encoding="utf-8"), bool(src))
        comprobar_dependencias(esquema, estado)
        print(estado)
    elif accion == "comparar":
        if src != descripcion_precio(Path(otro).read_text(encoding="utf-8")):
            raise EstadoInvalido("las definiciones de precio entero del origen y las migraciones locales difieren")
    else:
        raise EstadoInvalido("acción no reconocida")


if __name__ == "__main__":
    try:
        main()
    except (EstadoInvalido, UnicodeError) as exc:
        sys.exit(f"ERROR: {exc}")
