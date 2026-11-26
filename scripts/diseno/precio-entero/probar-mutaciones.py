"""Ejecuta el ensayo local original y comprueba que cada mutación falla por su propio motivo."""
from pathlib import Path
import shutil
import subprocess
import tempfile

DIRECTORIO = Path(__file__).resolve().parent
REPO = DIRECTORIO.parents[2]
ENSAYO = "ensayar-precio.sh"
SQL = "pruebas-precio.sql"
REVERSION = "reversion-precio.sql"
FIN = "OK control CHECK y ensayo completo"

# Archivo, fragmento original, sustitución y diagnóstico esperado.
CASOS = [
    (ENSAYO, "10.5, 10.5 from restaurado;", "10.5, 10.5 from restaurado where false;",
     "FALLA: restauración de ambas filas"),
    (REVERSION, "drop trigger if exists jobs_precio_entero on public.jobs;",
     "do $$ begin raise exception 'CONTROL_REVERSION_MUTADA'; end $$;", "CONTROL_REVERSION_MUTADA"),
    (REVERSION, "drop function if exists private.exigir_precio_entero_jobs();",
     "select 1;", "FALLA: reversión de objetos"),
    (ENSAYO, "commit;\nSQL\ncomprobar \"reversión funcional\"", "rollback;\nSQL\ncomprobar \"reversión funcional\"",
     "FALLA: reversión funcional"),
    (ENSAYO, 'q -f "$mig" >/dev/null\nactual="$(huella)"\n[[ "$actual" == "$inicial" ]] || fallar "reaplicación',
     'actual="$(huella)"\n[[ "$actual" == "$inicial" ]] || fallar "reaplicación',
     "FALLA: reaplicación de triggers"),
    (SQL, "-- E1 ·", "raise exception 'CONTROL_SQL_MUTADO';\n  -- E1 ·", "CONTROL_SQL_MUTADO"),
    (SQL, "select 'PRECIO_SQL_COMPLETO';", "\\quit", "FALLA: SQL incompleto: fin"),
    (SQL, "raise notice 'OK E7", "raise notice 'OMITIDO E7", "FALLA: SQL incompleto: E7"),
]


def ejecutar(ruta):
    return subprocess.run(["bash", str(ruta)], text=True, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, check=False)


def main():
    base = ejecutar(DIRECTORIO / ENSAYO)
    if base.returncode or FIN not in base.stdout.splitlines():
        raise SystemExit("Falló el ensayo original:\n" + base.stdout)
    print("OK ensayo original")
    with tempfile.TemporaryDirectory(prefix="mutaciones-precio-") as tmp:
        copia = Path(tmp)
        scripts = copia / "scripts"
        pruebas = scripts / "diseno" / "precio-entero"
        shutil.copytree(DIRECTORIO, pruebas)
        shutil.copytree(REPO / "supabase" / "migrations", copia / "supabase" / "migrations")
        shutil.copy(REPO / "scripts/diseno/stub-supabase.sql", pruebas.parent)
        shutil.copy(REPO / "scripts/verificar-restauracion.sql", scripts)
        for archivo, anterior, nuevo, esperado in CASOS:
            ruta = pruebas / archivo
            original = ruta.read_text(encoding="utf-8")
            if original.count(anterior) != 1:
                raise SystemExit(f"Mutación ambigua o desactualizada en {archivo}: {anterior}")
            ruta.write_text(original.replace(anterior, nuevo), encoding="utf-8")
            resultado = ejecutar(pruebas / ENSAYO)
            ruta.write_text(original, encoding="utf-8")
            if (resultado.returncode == 0 or FIN in resultado.stdout.splitlines()
                    or esperado not in resultado.stdout):
                raise SystemExit(f"Mutación no detectada por su causa en {archivo}:\n{resultado.stdout}")
            print(f"OK mutación: {esperado}")


if __name__ == "__main__":
    main()
