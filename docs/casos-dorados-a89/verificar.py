"""Verifica las referencias ficticias de A-89 sin importar código de la aplicación."""
import csv
import copy
import json
import math
import unittest
from fractions import Fraction as F
from pathlib import Path

HERE = Path(__file__).resolve().parent
with (HERE / "modalidades.csv").open(encoding="utf-8", newline="") as stream:
    ROWS = list(csv.DictReader(stream))
CASES = {row["caso"]: row for row in ROWS}


def known(token):
    if token in {"?", "I0", "NA", "X", "0D", "0C"}:
        return F(0)
    return F(token)


def amount(row, fields, balance=False, price=False):
    # Combustible y ayudante son las dos partidas comunes que componen D junto a peajes y otros.
    subtotal = 5023 + 15000 + sum(known(row[key]) for key in fields)
    partial = any(row[key] in {"?", "I0"} for key in fields)
    if price:
        margin = F(row["margen"])
        if not 0 <= margin <= F("0.8"):
            raise ValueError("margen fuera del intervalo")
        subtotal = 1000 * math.ceil((subtotal / (1 - margin) + F(row["recargo_CLP"])) / 1000)
    if balance:
        subtotal = F(row["P"]) - subtotal
    if partial:
        return "<=" + str(math.ceil(subtotal)) if balance else ">=" + str(math.floor(subtotal))
    return str(math.floor(subtotal + F(1, 2)))


def measures(row):
    d = ["peajes", "otros"]
    op = d + ["W"]
    full = op + ["CF"]
    detailed = row["modo"] == "D" and row["CF"] != "X"
    scoped = (full if detailed else op) + ["R"]
    return {
        "operativo": amount(row, op),
        "antes_meta_costo": amount(row, full) if detailed else "NA",
        "base": amount(row, scoped),
        "sugerido": amount(row, scoped, price=True),
        "saldo": amount(row, d, balance=True),
        "excedente": amount(row, op, balance=True),
        "antes_meta_resultado": amount(row, full, balance=True) if detailed else "NA",
        "sobre_meta": amount(row, scoped, balance=True) if detailed or row["modo"] == "S" else "NA",
    }


def custom_items(items):
    """Unidades y conceptos económicos del ejemplo GB-3, sin dependencias comerciales."""
    seen = set()
    amounts = []
    for concept, unit, quantity_unit, rate, quantity in items:
        if concept in seen or {"CLP/km": "km", "CLP/h": "h", "CLP/servicio": "servicio"}.get(unit) != quantity_unit:
            raise ValueError("concepto duplicado o unidades incompatibles")
        seen.add(concept)
        amounts.append(F(rate) * F(quantity))
    return sum(amounts)


class Modalidades(unittest.TestCase):
    def test_planilla(self):
        self.assertEqual(len(CASES), len(ROWS), "ID duplicado")
        required = {"GM-1", "GM-2", "GM-3", "GM-4", "GM-5", "GM-6a", "GM-6b", "GM-6c", "GM-6d",
                    "GM-7a", "GM-7b", "GM-7c", "GM-8a", "GM-8b", "EX-otros-inicial",
                    "EX-otros-desconocidos", "EX-perdida", "EX-margen-cero", "EX-un-peso-mas",
                    "EX-margen-maximo", "EX-redondeo", "EX-meta-distinta", "EX-CF-excluido"}
        self.assertTrue(required.issubset(CASES))
        for row in ROWS:
            for name, actual in measures(row).items():
                with self.subTest(case=row["caso"], measure=name):
                    self.assertEqual(actual, row[name])

    def test_limites_margen(self):
        for m in ("-.0001", ".8001", "1"):
            with self.subTest(m=m), self.assertRaises(ValueError):
                measures({**CASES["GM-3"], "margen": m})

    def test_monotonia(self):
        simple = CASES["GM-1"]
        for cf in ("0", "0.01", "100", "3350", "1000000"):
            full = measures({**simple, "modo": "D", "CF": cf})
            op = measures(simple)
            self.assertGreaterEqual(int(full["base"]), int(op["base"]))
            self.assertLessEqual(int(full["sobre_meta"]), int(op["sobre_meta"]))
            self.assertEqual(full["excedente"], op["excedente"])
        for field in ("peajes", "otros", "W", "CF", "R"):
            partial = measures({**CASES["GM-3"], field: "?"})
            for value in ("0", "0.61", "24800"):
                final = measures({**CASES["GM-3"], field: value})
                for key, bound in partial.items():
                    if bound.startswith(">="):
                        self.assertGreaterEqual(int(final[key]), int(bound[2:]))
                    elif bound.startswith("<="):
                        self.assertLessEqual(int(final[key]), int(bound[2:]))
                    else:
                        self.assertEqual(final[key], bound)

    def test_kpi_mismo_alcance(self):
        # Referencia ficticia independiente de periodo + comprobantes. R y P nunca entran.
        reference = 25000 + 2000 + 3000
        for row in (CASES["GM-3"], CASES["EX-meta-distinta"], CASES["EX-perdida"]):
            prediction = int(measures(row)["antes_meta_costo"])
            self.assertEqual(prediction - reference, -648)
            self.assertEqual(100 * F(prediction - reference, reference), F("-2.16"))


class Ampliaciones(unittest.TestCase):
    def test_vectores(self):
        vectors = json.loads((HERE / "ampliaciones.json").read_text(encoding="utf-8"))
        for v in vectors:
            with self.subTest(caso=v["id"]):
                result = evaluate(v["tipo"], v["entrada"])
                self.assertEqual(result, v["esperado"])


class Aceptacion(unittest.TestCase):
    def test_captura_y_alteraciones(self):
        from cotejar import differences, expected
        want = expected()
        self.assertEqual(list(differences(want, want)), [])
        mutations = [
            (("historicos", "H1", "escrituras"), 1),
            (("historicos", "H2", "modalidad"), "detallada"),
            (("historicos", "H3", "costEstimate"), 38556),
            (("historicos", "H3", "bytesIntactos"), False),
            (("cambioModo", 1, "P"), 47000),
            (("cambioModo", 1, "fixedPerHour"), None),
            (("cambioModo", 3, "priceNeedsConfirmation"), False),
            (("cobertura", "GM-6c", "peajes"), "cero_declarado"),
            (("medidas", "GM-1", "operativo"), "39402"),
        ]
        for (section, key, field), value in mutations:
            with self.subTest(section=section, key=key, field=field):
                got = copy.deepcopy(want)
                got[section][key][field] = value
                self.assertEqual(len(list(differences(want, got))), 1)


def evaluate(kind, x):
    if kind == "fijos":
        if x["periodo_gasto"] != x["periodo_horas"]:
            return "periodos_incompatibles"
        if x["horas_productivas"] in (0, None):
            return "desconocido"
        return str(F(x["gasto"], x["horas_productivas"]) * F(x["minutos_viaje"], 60))
    if kind == "componentes":
        rate = sum(F(cost, life) for cost, life in x["componentes"] if life and life > 0)
        if any(life is None or life <= 0 for _, life in x["componentes"]):
            return {"CLP_km_minimos": str(rate), "CLP_minimos": str(rate * x["km"])}
        return {"CLP_km": str(rate), "CLP": str(rate * x["km"])}
    if kind == "partidas":
        try:
            return str(custom_items(x))
        except ValueError:
            return "rechazo"
    if kind == "capacidad":
        # El sobre incluye todo el JSON, incluidas llaves y comillas.
        encoded = json.dumps({"texto": x["caracter"] * x["repeticiones"] + x["sufijo"]},
                             ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        return {"bytes": len(encoded), "admisible_por_tamano": len(encoded) <= 11000}
    if kind == "limite_partidas":
        return "admisible_por_cantidad" if x["cantidad"] <= x["limite_del_caso"] else "rechazo"
    if kind == "conductor":
        driver = F(x["tarifa"]) * F(x["cantidad"])
        d = x["D_sin_conductor"] + (driver if x["pago"] != "sueldo_fijo_asignado" else 0)
        cf = x["CF_sin_conductor"] + (driver if x["pago"] == "sueldo_fijo_asignado" else 0)
        r = F(x["minutos_propietario"], 60) * x["meta_hora"]
        op = d + x["W"]
        cost = op + cf
        base = cost + r
        return list(map(int, (d, cf, r, op, cost, base, 1000 * math.ceil(base / (1 - F("0.10")) / 1000),
                              x["P"] - op, x["P"] - cost, x["P"] - base)))
    raise ValueError(kind)


if __name__ == "__main__":
    unittest.main(verbosity=2)
