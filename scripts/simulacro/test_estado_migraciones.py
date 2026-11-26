"""Pruebas portables del reconocimiento de esquemas. Los ejemplos son ficticios."""
from pathlib import Path
import importlib.util
import re
import subprocess
import sys
import tempfile
import unittest

ARCHIVO = Path(__file__).with_name("estado_migraciones.py")
spec = importlib.util.spec_from_file_location("estado_migraciones", ARCHIVO)
estado = importlib.util.module_from_spec(spec)
spec.loader.exec_module(estado)


def objeto(nombre, tipo, esquema, ddl):
    return f"--\n-- Name: {nombre}; Type: {tipo}; Schema: {esquema}; Owner: postgres\n--\n\n{ddl}\n\n"


def funcion(nombre, privado, definer=False):
    esquema = "private" if privado else "public"
    ddl = (f"CREATE FUNCTION {esquema}.{nombre}() RETURNS trigger\n"
           f"    LANGUAGE plpgsql{' SECURITY DEFINER' if definer else ''}\n"
           "    SET search_path TO ''\n    AS $$\nbegin return new; end;\n$$;\n")
    return objeto(nombre + "()", "FUNCTION", esquema, ddl)


def dump(n):
    bloques = [objeto(t, "TABLE", "public", f"CREATE TABLE public.{t} (id uuid);")
               for t in ("jobs", "client_quotes")]
    bloques.append(funcion("create_job_with_quote", False, n >= 4))
    if n >= 5:
        bloques.extend([objeto("job_cargo_items", "TABLE", "public", "CREATE TABLE public.job_cargo_items (id uuid);"),
                        funcion("insert_cargo_items", True, True)])
    if n >= 6:
        bloques.append(funcion("create_job_with_quote_v2", False, True))
    if n == 7:
        for f, t, tabla in zip(estado.FUNCIONES, estado.TRIGGERS, ("jobs", "client_quotes")):
            bloques.append(funcion(f, True))
            bloques.append(objeto(f"{tabla} {t}", "TRIGGER", "public",
                                  f"CREATE TRIGGER {t} BEFORE INSERT OR UPDATE OF net_price ON public.{tabla} "
                                  f"FOR EACH ROW EXECUTE FUNCTION private.{f}();"))
    return "-- PostgreSQL database dump\n" + "".join(bloques) + "-- PostgreSQL database dump complete\n"


def verificacion(n):
    nombres = ["private.allocate_quote_number", "public.get_public_quote"]
    if n >= 4:
        nombres.append("public.create_job_with_quote")
    if n >= 5:
        nombres.append("private.insert_cargo_items")
    if n >= 6:
        nombres.append("public.create_job_with_quote_v2")
    cargo = "conteo.public.job_cargo_items | 0 | \n" if n >= 5 else ""
    return "inv.security_definer | " + " ".join(nombres) + " | esperado\n" + cargo


class EstadoMigracionesTest(unittest.TestCase):
    def detectar(self, n, volcado=None, huella=None):
        esquema = dump(n) if volcado is None else volcado
        elegido = estado.prefijo(verificacion(n) if huella is None else huella,
                                 bool(estado.descripcion_precio(esquema)))
        estado.comprobar_dependencias(esquema, elegido)
        return elegido

    def test_cinco_prefijos(self):
        for n, nombre in enumerate(("anterior","posterior","m3","i2","precio"), 3):
            with self.subTest(migraciones=n):
                self.assertEqual(self.detectar(n), nombre)

    def test_esquema_con_identificadores_entre_comillas(self):
        sql = dump(7)
        for nombre in ("public", "private", *estado.FUNCIONES, *estado.TRIGGERS):
            sql = re.sub(r"\b" + nombre + r"\b", '"' + nombre + '"', sql)
        self.assertEqual(self.detectar(7, sql), "precio")
        self.assertEqual(estado.descripcion_precio(sql), estado.descripcion_precio(dump(7)))

    def test_archivos_sin_esquema_o_truncados(self):
        for sql in ("-- schema", dump(7).split("-- PostgreSQL database dump complete")[0],
                    dump(7).replace("Name: jobs; Type: TABLE", "Name: otra; Type: TABLE")):
            with self.subTest(), self.assertRaises(estado.EstadoInvalido):
                self.detectar(7, sql)

    def test_funcion_trigger_parcial_o_repetido(self):
        for sql in (dump(7).replace("Name: jobs jobs_precio_entero", "Name: jobs otro"),
                    dump(7).replace("Name: exigir_precio_entero_jobs()", "Name: otra()"),
                    dump(7) + funcion(estado.FUNCIONES[0], True)):
            with self.subTest(), self.assertRaises(estado.EstadoInvalido):
                self.detectar(7, sql)

    def test_ddl_sin_cabeceras_no_equivale_a_ausente(self):
        sql = dump(6) + f"CREATE FUNCTION private.{estado.FUNCIONES[0]}() RETURNS trigger;\n"
        with self.assertRaisesRegex(estado.EstadoInvalido, "contradictorias"):
            self.detectar(6, sql)

    def test_triggers_deshabilitados_o_de_replica(self):
        for modo in ("DISABLE", "ENABLE REPLICA", "ENABLE ALWAYS"):
            with self.subTest(modo=modo), self.assertRaisesRegex(estado.EstadoInvalido, "alterado"):
                self.detectar(7, dump(7) + f"ALTER TABLE public.jobs {modo} TRIGGER jobs_precio_entero;")

    def test_dependencias_sin_saltos(self):
        for n, huella in ((5, verificacion(5).replace("public.create_job_with_quote ", "")),
                          (6, verificacion(6).replace("private.insert_cargo_items ", "")),
                          (7, verificacion(5)), (6, verificacion(5)), (5, verificacion(6))):
            with self.subTest(), self.assertRaises(estado.EstadoInvalido):
                self.detectar(n, huella=huella)

    def test_huellas_duplicadas_y_conteos_invalidos(self):
        for huella in ("", verificacion(6)*2, verificacion(5).replace(" | 0 |", " | ? |")):
            with self.subTest(), self.assertRaises(estado.EstadoInvalido):
                self.detectar(6, huella=huella)

    def test_comparacion_cli_detecta_ddl_alterado(self):
        with tempfile.TemporaryDirectory() as d:
            origen, restaurado = Path(d, "origen.sql"), Path(d, "local.sql")
            origen.write_text(dump(7), encoding="utf-8")
            for cambiado, rc in ((dump(7), 0), (dump(6), 1),
                                 (dump(7).replace("return new", "return null"), 1),
                                 (dump(7).replace("UPDATE OF net_price", "UPDATE OF status"), 1)):
                restaurado.write_text(cambiado, encoding="utf-8")
                p = subprocess.run([sys.executable, "-I", str(ARCHIVO), "comparar",
                                    str(origen), str(restaurado)], capture_output=True)
                self.assertEqual(p.returncode, rc)
                if rc:
                    self.assertIn(b"difieren", p.stderr)


if __name__ == "__main__":
    unittest.main()
