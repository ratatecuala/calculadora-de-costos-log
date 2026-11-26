import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from aceptar import HERE, execute, oracle, prepare
from cotejar import differences


class ConexionDeAceptacion(unittest.TestCase):
    def test_futuro_producto_recibe_solo_estimulos(self):
        with tempfile.TemporaryDirectory() as tmp:
            batch, paths = prepare(Path(tmp))
            self.assertEqual(len(batch["casos"]), 23)
            forbidden = {"caso", "fila", "base", "sobre_meta", "esperado", "bytesIntactos",
                         "priceNeedsConfirmation", "escrituras", "recalculos", "cobertura"}
            def keys(value):
                if isinstance(value, list):
                    for child in value:
                        yield from keys(child)
                if isinstance(value, dict):
                    for key, child in value.items():
                        yield key
                        yield from keys(child)
            self.assertFalse(set(keys(batch)) & forbidden)
            for path in paths:
                self.assertFalse(set(keys(json.loads(path.read_bytes()))) & forbidden)
            self.assertEqual(batch["sesion"]["acciones"],
                             ["abrir", "elegir_simplificada", "confirmar_precio", "elegir_detallada"])

    def test_faltantes_cotas_perdidas_y_cambio(self):
        want = oracle()
        # Mutaciones sobre la captura de referencia para comprobar el cotejador.
        # Estos datos jamás se pasan al puente que invoca el producto.
        changes = [
            ("casos", 0, "medidas", "operativo", "39402"),
            ("casos", 1, "medidas", "excedente", "<=28998"),
            ("casos", 1, "medidas", "antes_meta_costo", "26002"),
            ("casos", 4, "cobertura", "W", "desconocido"),
            ("casos", 7, "cobertura", "peajes", "cero_declarado"),
            ("pasos", 1, "estado", "fixedPerHour", None),
            ("pasos", 2, "estado", "priceNeedsConfirmation", True),
            ("pasos", 3, "medidas", "sobre_meta", "15598"),
        ]
        for section, index, group, field, altered in changes:
            with self.subTest(section=section, index=index, field=field):
                got = copy.deepcopy(want)
                got[section][index][group][field] = altered
                self.assertEqual(len(list(differences(want, got))), 1)

    def test_adaptador_erroneo_no_puede_aprobar(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            adapter = root / "incompleto.mjs"
            adapter.write_text("""
import { appendFileSync } from 'node:fs';
export const evaluar = () => ({});
export function abrirHistorico(path) {
  appendFileSync(path, ' ');
  return {bytesIntactos:true};
}
export function iniciarSesion() {
  let n = 0;
  return {elegirModalidad(){n++}, confirmarPrecio(){n++}, observar(){return {contador:n}}};
}
""", encoding="utf-8")
            errors = execute(adapter, root)
            self.assertTrue(any("bytesIntactos" in e for e in errors))
            self.assertTrue(any("casos[0]" in e for e in errors))
            self.assertTrue(any("pasos[3]" in e for e in errors))

    def test_sin_adaptador_devuelve_pendiente(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run([sys.executable, "-X", "utf8", str(HERE / "aceptar.py"), str(Path(tmp) / "ausente.mjs")],
                                    capture_output=True, text=True, encoding="utf-8", timeout=15)
        self.assertEqual(result.returncode, 2)
        self.assertIn("PENDIENTE", result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
