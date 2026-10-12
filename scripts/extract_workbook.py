"""Извлечение таблиц прогрессии из листа «Формулы» книги «Жимовая прога v 2.0.xlsx».

Книга открывается только на чтение. Результат — src/domain/program/workbook.generated.json:
коэффициенты, подходы и повторения девяти недельных блоков (недели 1-3, 5-7, 9-11)
для каждой строки-упражнения, матрица RPE и признаки найденных ошибок копирования.

Запуск: python scripts/extract_workbook.py "<путь к xlsx>"
"""
import json
import re
import sys
from pathlib import Path

import openpyxl
from openpyxl.utils import column_index_from_string as ci, get_column_letter as gl
from openpyxl.worksheet.formula import ArrayFormula

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "Жимовая прога v 2.0.xlsx"
OUT = Path(__file__).resolve().parents[1] / "src" / "domain" / "program" / "workbook.generated.json"
WEEKS = [1, 2, 3, 5, 6, 7, 9, 10, 11]

wb = openpyxl.load_workbook(SRC, read_only=False, data_only=False)
ws = wb["Формулы"]


def f(cell: str):
    v = ws[cell].value
    if isinstance(v, ArrayFormula):
        v = v.text
    if isinstance(v, str):
        v = v.strip() if not v.startswith("=") else v
    return v


def num(v):
    if isinstance(v, (int, float)):
        return float(v)
    return v


K_RE = re.compile(r"\*\s*([0-9.]+)\s*,")
BW_RE = re.compile(r"FLOOR\(\(10-\$?([A-Z]+)\$?(\d+)\+\$?([A-Z]+)\$?(\d+)\)(?:-(\d+))?,1\)")

rows = {}
for r in range(9, 70):
    name = ws[f"L{r}"].value
    if not isinstance(name, str) or name.strip() in ("", "+"):
        continue
    link = ws[f"L{r}"].hyperlink.target if ws[f"L{r}"].hyperlink else None
    is_bw = f(f"Q{r}") == "собств."
    blocks = []
    for b in range(9):
        c0 = ci("Q") + 7 * b
        cols = [gl(c0 + i) for i in range(7)]
        top_f, top_sets, top_reps, rpe_src, back_f, back_sets, back_reps = (f(f"{c}{r}") for c in cols)
        blk = {"week": WEEKS[b], "cells": {"top": f"{cols[0]}{r}", "back": f"{cols[4]}{r}", "rpe": f"{cols[3]}{r}"}}
        blk["rpeSource"] = str(rpe_src)
        # подходы тяжёлого блока: число или условие «1, если упражнение то же, что в другой день, иначе 3»
        if isinstance(top_sets, str) and top_sets.startswith("=IF("):
            blk["topSets"] = {"sameOtherDay": 1, "otherwise": 3, "formula": top_sets}
        else:
            blk["topSets"] = num(top_sets)
        blk["backSets"] = num(back_sets)
        if is_bw:
            def bw(expr):
                if isinstance(expr, str) and expr.startswith("=O"):
                    m = re.match(r"=O\d+-(\d+)", expr)
                    return {"fromTest": True, "minus": int(m.group(1))}
                m = BW_RE.search(str(expr))
                if not m:
                    return {"raw": expr}
                rpe_col, rpe_row, reps_col, reps_row, d = m.groups()
                # номер блока, на ячейки которого ссылается формула (RPE-ячейка блока = колонка 4)
                src_block = (ci(rpe_col) - ci("Q") - 3) // 7
                return {"fromBlock": src_block, "minus": int(d or 0), "formula": expr}
            blk["topReps"] = bw(top_reps)
            blk["backReps"] = bw(back_reps)
        else:
            if b in (3, 6) and isinstance(top_f, str) and "1.0278" in top_f:
                blk["top"] = {"kind": "amrapBrzycki", "k": float(K_RE.search(top_f).group(1)), "formula": top_f}
            elif b == 0:
                blk["top"] = {"kind": "testRpe", "k": float(K_RE.search(top_f).group(1))}
            else:
                blk["top"] = {"kind": "fromTop", "k": float(K_RE.search(top_f).group(1)), "formula": top_f}
            m = K_RE.search(str(back_f))
            blk["back"] = {"k": float(m.group(1)) if m else None, "formula": back_f}
            blk["topReps"] = num(top_reps)
            blk["backReps"] = num(back_reps) if not isinstance(back_reps, str) else "toFailure"
        blocks.append(blk)
    rows[str(r)] = {
        "row": r,
        "name": name.replace("\xa0", " ").strip(),
        "link": link,
        "bodyweight": is_bw,
        "test": {"weight": f(f"N{r}"), "reps": f(f"O{r}"), "step": f(f"P{r}")},
        "blocks": blocks,
    }

rpe = {"rpe": [], "reps": [num(ws.cell(92, c).value) for c in range(ci("O"), ci("X") + 1)], "table": []}
for r in range(93, 101):
    rpe["rpe"].append(num(ws[f"N{r}"].value))
    rpe["table"].append([num(ws.cell(r, c).value) for c in range(ci("O"), ci("X") + 1)])

def strip(o):
    """Для приложения тексты формул не нужны — они уходят в docs/workbook-formulas.json."""
    if isinstance(o, dict):
        return {k: strip(v) for k, v in o.items() if k not in ("formula", "cells", "rpeSource", "test", "link")}
    if isinstance(o, list):
        return [strip(v) for v in o]
    return o


full = {"source": SRC.name, "rpeTable": rpe, "rows": rows}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(strip(full), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
AUDIT = Path(__file__).resolve().parents[1] / "docs" / "workbook-formulas.json"
AUDIT.parent.mkdir(parents=True, exist_ok=True)
AUDIT.write_text(json.dumps(full, ensure_ascii=False, indent=1), encoding="utf-8")
print("rows:", len(rows), "->", OUT, "and", AUDIT)
