"""Ejecuta el adaptador del producto con entradas ciegas y coteja contra el PR #59."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

from cotejar import differences, expected
from verificar import CASES, HERE

BRIDGE = HERE.parents[1] / "scripts" / "aceptacion-a89" / "observar.mjs"
INPUTS = ("modo", "peajes", "otros", "W", "CF", "R", "P", "margen", "recargo_CLP")


def prepare(directory):
    scenarios = [{key: row[key] for key in INPUTS} for row in CASES.values()]
    contract = json.loads((HERE / "historicos-y-cambio.json").read_text(encoding="utf-8"))
    paths = []
    for h in contract["historicos"]:
        path = directory / (h["id"] + ".json")
        path.write_text(json.dumps(h["entrada"], ensure_ascii=False, indent=1), encoding="utf-8")
        paths.append(path)
    steps = contract["cambioModo"]["pasos"]
    batch = {
        "casos": scenarios,
        "comunes": {"combustibleCLP": 5023, "ayudanteCLP": 15000},
        "historicos": [str(p) for p in paths],
        "sesion": {"inicial": contract["cambioModo"]["inicial"],
                   "entrada": {k: CASES[steps[0]["fila"]][k] for k in INPUTS},
                   "acciones": [s["accion"] for s in steps]},
    }
    return batch, paths


def oracle():
    data = expected()
    return {
        "casos": [{"medidas": data["medidas"][k], "cobertura": data["cobertura"][k]} for k in CASES],
        "historicos": list(data["historicos"].values()),
        "pasos": [{"estado": {k: step[k] for k in ("modo", "P", "fixedPerHour", "priceNeedsConfirmation")},
                   "medidas": dict(data["medidas"][step["fila"]]), "cobertura": dict(data["cobertura"][step["fila"]])}
                  for step in data["cambioModo"]],
    }


def execute(adapter, directory):
    batch, paths = prepare(directory)
    original = [p.read_bytes() for p in paths]
    result = subprocess.run(["node", str(BRIDGE), str(adapter.resolve())],
                            input=json.dumps(batch), text=True, encoding="utf-8",
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
    if result.returncode:
        raise ValueError(result.stderr.strip() or "El adaptador terminó sin observaciones")
    observed = json.loads(result.stdout)
    history = observed["historicos"]
    if not isinstance(history, list) or len(history) != len(paths):
        raise ValueError("El adaptador no observó los tres históricos")
    for i, path in enumerate(paths):
        history[i]["bytesIntactos"] = path.is_file() and path.read_bytes() == original[i]
    return list(differences(oracle(), observed))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("adaptador", type=Path, help="Módulo JS que llama al producto real")
    args = parser.parse_args()
    if not args.adaptador.is_file():
        parser.exit(2, "PENDIENTE: falta el adaptador de la implementación comercial.\n")
    try:
        with TemporaryDirectory() as tmp:
            errors = execute(args.adaptador, Path(tmp))
    except (ValueError, KeyError, TypeError, OSError, subprocess.TimeoutExpired) as exc:
        parser.exit(1, f"CAPTURA INVÁLIDA: {exc}\n")
    if errors:
        for error in sorted(errors):
            print(error, file=sys.stderr)
        return 1
    print("El adaptador coincide con los 23 escenarios, tres históricos y cuatro pasos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
