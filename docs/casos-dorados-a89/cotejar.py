"""Compara una captura de la futura implementación con las referencias independientes."""
import argparse
import json
from pathlib import Path

from verificar import CASES, HERE

METRICS = ("operativo", "antes_meta_costo", "base", "sugerido", "saldo", "excedente",
           "antes_meta_resultado", "sobre_meta")

def coverage(row):
    labels = {"?": "desconocido", "I0": "cero_inicial_sin_confirmar", "NA": "no_aplicable",
              "0D": "cero_declarado", "0C": "cero_comprobado", "X": "excluido_usuario"}
    result = {k: labels.get(row[k], "incluido") for k in ("peajes", "otros", "W", "CF", "R")}
    if row["modo"] == "S":
        result["CF"] = "excluido_modalidad"
    return result


def expected():
    contract = json.loads((HERE / "historicos-y-cambio.json").read_text(encoding="utf-8"))
    return {
        "medidas": {case: {k: row[k] for k in METRICS} for case, row in CASES.items()},
        "cobertura": {case: coverage(row) for case, row in CASES.items()},
        "historicos": {h["id"]: {**h["esperado"], "bytesIntactos": True} for h in contract["historicos"]},
        "cambioModo": contract["cambioModo"]["pasos"],
    }


def differences(want, got, path="$"):
    if type(want) is not type(got):
        yield f"{path}: tipo incorrecto"
    elif isinstance(want, dict):
        if want.keys() != got.keys():
            yield f"{path}: claves faltantes {sorted(want.keys() - got.keys())}, extras {sorted(got.keys() - want.keys())}"
        for k in want.keys() & got.keys():
            yield from differences(want[k], got[k], f"{path}.{k}")
    elif isinstance(want, list):
        if len(want) != len(got):
            yield f"{path}: se esperaban {len(want)} elementos"
        for i, (a, b) in enumerate(zip(want, got)):
            yield from differences(a, b, f"{path}[{i}]")
    elif want != got:
        yield f"{path}: se esperaba {want!r}, se obtuvo {got!r}"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("captura", type=Path)
    args = parser.parse_args()
    errors = list(differences(expected(), json.loads(args.captura.read_text(encoding="utf-8"))))
    if errors:
        raise SystemExit("\n".join(sorted(errors)))
    print("La captura coincide con las medidas, los históricos y las transiciones esperados.")
