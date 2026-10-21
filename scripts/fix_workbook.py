"""Исправленная копия книги: правит формулы, найденные аудитом (docs/WORKBOOK_AUDIT.md).

Исходник не изменяется: копия «Жимовая прога v 2.0 (исправленная).xlsx» правится через Excel (COM),
чтобы сохранить формулы-массивы, списки выбора и оформление. Каждая изменённая ячейка получает
примечание, а лист «Исправления» перечисляет: ячейка, было, стало, причина.

Запуск (Windows + Excel + pywin32): python scripts/fix_workbook.py
"""
import re
import shutil
from pathlib import Path

import win32com.client

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "Жимовая прога v 2.0.xlsx"
DST = ROOT / "Жимовая прога v 2.0 (исправленная).xlsx"
P = "Программа тренировок "
F = "Формулы"
K = "Калькулятор подходов"

log: list[tuple[str, str, str, str, str]] = []  # лист, ячейка, было, стало, причина


def formula_of(c):
    # .Formula отдаёт английские имена функций и для формул-массивов (FormulaArray — локализованные)
    return c.Formula


def setf(ws, addr, new, reason, array=None):
    c = ws.Range(addr)
    old = formula_of(c)
    # одноячеечные формулы-массивы с INDEX/MATCH считаются так же обычной формулой
    c.Formula = new
    log.append((ws.Name, addr, str(old), new, reason))
    try:
        if c.Comment is not None:
            c.Comment.Delete()
        c.AddComment(f"Исправлено (Claude): {reason}")
    except Exception:
        pass


def sub(ws, addr, pairs, reason):
    old = formula_of(ws.Range(addr))
    new = old
    for a, b in pairs:
        assert a in new, (addr, a, old)
        new = new.replace(a, b)
    setf(ws, addr, new, reason)


excel = win32com.client.DispatchEx("Excel.Application")
excel.Visible = False
excel.DisplayAlerts = False
shutil.copy2(SRC, DST)
wb = excel.Workbooks.Open(str(DST))


def _quit():
    try:
        excel.Quit()
    except Exception:
        pass


import atexit  # noqa: E402

atexit.register(_quit)  # Excel не остаётся висеть, если скрипт упал
wp, wf, wk = wb.Worksheets(P), wb.Worksheets(F), wb.Worksheets(K)

# 1. U77: шаг округления — ячейка веса L77 вместо $E$77
sub(wp, "U77", [(",L77)", ",$E$77)")], "№1: MROUND округлял к весу L77, а не к шагу E77")

# 2. AC189 / AC216: доп. подходы жима дня 2 считались от тяжёлого подхода прошлого мезоцикла
sub(wp, "AC189", [("T162", "T189"), ("Q162", "Q189"), ("S162", "S189")], "№2: ссылки на неделю 3 вместо недели 7")
sub(wp, "AC216", [("T189", "T216"), ("Q189", "Q216"), ("S189", "S216")], "№2: ссылки на неделю 7 вместо недели 11")

# 3. Неделя 11, собственный вес: подсобные повторения от RPE недели 10 (BQ/BP) вместо недели 11 (BX/BW)
for r, base in [(14, 14), (37, 37), (59, 59), (68, 68), (69, 68)]:
    sub(wf, f"CA{r}", [(f"BQ{base}", f"BX{base}"), (f"BP{base}", f"BW{base}")], "№3: неделя 11 считалась от RPE недели 10")

# 4. Подтягивания дня 3 в неделях 4/8/12 брали повторения теста дня 1 (D112); "8" — текст
for addr, d in [("AH173", 4), ("AH200", 3), ("AH227", 3)]:
    setf(wp, addr, f'=IF(B130="Подтягивания (собственный вес)", MAX(1,D130-{d}), 8)',
         "№4: повторения из своего теста D130 (было D112 — давало −1 и 0); 8 числом, а не текстом")
for addr, d in [("AH155", 4), ("AH182", 3), ("AH209", 3)]:
    setf(wp, addr, f'=IF(B112="Подтягивания (собственный вес)", MAX(1,D112-{d}), 8)', "№20: 8 числом, а не текстом")

# 5. Жим гантелей дня 1 (строка 10 «Формул») брал RPE из строки жима дня 2
rpe_src = {"T10": "F154", "AA10": "M154", "AH10": "T154", "AO10": "F181", "AV10": "M181", "BC10": "T181",
           "BJ10": "F208", "BQ10": "M208", "BX10": "T208"}
for addr, src in rpe_src.items():
    setf(wf, addr, f"='{P}'!{src}", "№11: RPE своего слота (день 1), а не жима дня 2")

# 6. Недели 4/8/12 слота «Жим» дня 1 для гантелей/наклонного жима (в книге — всегда от жима штанги дня 2)
BENCH = 'TRIM($B$77)="Жим штанги лёжа"'
DB = 'TRIM($B$77)="Жим гантелей лёжа"'
plan6 = [  # строка, k гантели, k наклонный, подходы гант/накл, повт гант/накл, ячейки «вторая группа»
    (154, 0.65, 0.68, 3, 4, 10, 8, ("AI154", "AJ154", "AK154")),
    (181, 0.68, 0.70, 3, 3, 8, 8, ("AI181", "AJ181", "AK181")),
    (208, 0.72, 0.72, 3, 3, 8, 8, ("AJ208", "AK208", "AL208")),
]
for r, kdb, kinc, sdb, sinc, rdb, rinc, second in plan6:
    orig = formula_of(wp.Range(f"AF{r}"))[1:]
    alt = f'IF($D$111="","",MROUND(($C$111/(1.0278-0.0278*$D$111))*IF({DB},{kdb},{kinc}),$E$77))'
    setf(wp, f"AF{r}", f"=IF({BENCH},{orig},{alt})", "№12 (допущение): для гантелей/наклонного — Бжицки от своего теста, как у аналогичных упражнений")
    sets_orig = wp.Range(f"AG{r}").Value
    reps_orig = wp.Range(f"AH{r}").Value
    setf(wp, f"AG{r}", f"=IF({BENCH},{int(sets_orig)},IF({DB},{sdb},{sinc}))", "№12: подходы для выбранного упражнения")
    setf(wp, f"AH{r}", f"=IF({BENCH},{int(reps_orig)},IF({DB},{rdb},{rinc}))", "№12: повторения для выбранного упражнения")
    w2, s2, r2 = second
    o2 = formula_of(wp.Range(w2))[1:]
    setf(wp, w2, f'=IF({BENCH},{o2},"")', "№12: вторая группа только у жима штанги")
    for a in (s2, r2):
        v = wp.Range(a).Value
        setf(wp, a, f'=IF({BENCH},{int(v)},"")', "№12: вторая группа только у жима штанги")

# 7. Брусья (собственный вес) в неделях 4/8/12 получали вес по Бжицки
DIPS = 'TRIM($B$122)="Отжимания на брусьях (собственный вес)"'
for r, sets_bw, minus in [(165, 4, 4), (192, 3, 3), (219, 3, 3)]:
    orig = formula_of(wp.Range(f"AF{r}"))[1:]
    setf(wp, f"AF{r}", f'=IF({DIPS},"собств.",{orig})', "№13: у упражнения с собственным весом нет рабочего веса")
    s0, r0 = wp.Range(f"AG{r}").Value, wp.Range(f"AH{r}").Value
    setf(wp, f"AG{r}", f"=IF({DIPS},{sets_bw},{int(s0)})", "№13: подходы как у подтягиваний с собственным весом")
    setf(wp, f"AH{r}", f"=IF({DIPS},MAX(1,$D$122-{minus}),{int(r0)})", "№13: повторения = тест − 4/−3, как у подтягиваний")

# 8. AI189: шаг 2,5 зашит в формулу
sub(wp, "AI189", [(", 2.5)", ", $E85)")], "№13 (AI189): шаг округления из E85, а не константа 2,5")

# 9. «Формулы»!I23: константа 2,5 вместо шага пользователя E89
setf(wf, "I23", f"='{P}'!E89", "№8: шаг округления слота «+» дня 2 из E89, а не константа 2,5")

# 10. Сдвинутые и сломанные ссылки шага округления
setf(wf, "P17", f"=IF('{P}'!B127='{P}'!B113,P54,I27)", "№5: сравнивались пустые ячейки B132/B118")
setf(wf, "P19", f"=IF('{P}'!B120='{P}'!B127,I19,I27)", "№6: сравнивались пустые B124/B132 — мост дня 3 брал шаг становой")
setf(wf, "P59", f"=IF('{P}'!B112='{P}'!B130,P14,I30)", "№9: ссылка #REF! на удалённую строку")
c = wf.Range("AL39")
log.append((wf.Name, "AL39", str(formula_of(c)), "(пусто)", "№10: мусорная формула =+AH3AH39:AM39 (#NAME?)"))
c.ClearContents()

# 11. I88: константа 0 вместо формулы (подход 2 подготовки трицепса = 0 кг)
setf(wp, "I88", f'=IF({DIPS},0,MROUND(F88/INDEX($AD$80:$AM$87,MATCH(H88,$AC$80:$AC$87,0),MATCH(G88,$AD$79:$AM$79, 0))*0.72,$E$88))',
     "№21: формула как у соседних строк (k 0,72) вместо константы 0", array=True)

# 12. Защита «пусто → пусто» в цепочках собственного веса (пустые RPE считались нулями: 62–79 повторений)
BW_RE = re.compile(r"^=FLOOR\(\(10-(\$?[A-Z]+\$?\d+)\+(\$?[A-Z]+\$?\d+)\)(-\d+)?,1\)$")
for r in (14, 37, 59, 68, 69):
    for col in range(wf.Range("Q1").Column, wf.Range("CA1").Column + 1):
        cell = wf.Cells(r, col)
        fml = cell.Formula
        m = BW_RE.match(fml) if isinstance(fml, str) else None
        if m:
            rpe, reps = m.group(1), m.group(2)
            # пустая ссылка на ячейку RPE даёт 0, поэтому проверяем N(…)=0 (RPE 0 недопустим и так)
            setf(wf, cell.Address.replace("$", ""), f'=IF(OR(N({rpe})=0,{reps}=""),"",{fml[1:]})',
                 "№19: пока RPE не введён — пусто, а не +10 повторений")
for addr, (reps, rpe) in {"J81": ("G81", "H81"), "M81": ("J81", "K81"), "P81": ("M81", "N81"), "S81": ("P81", "Q81"), "V81": ("S81", "T81")}.items():
    orig = formula_of(wp.Range(addr))
    inner = orig[len('=IF(B81="+", "", '):-1] if orig.startswith('=IF(B81="+", "", ') else orig[len('=IF(B81="+","", '):-1]
    setf(wp, addr, f'=IF(B81="+","",IF(OR({reps}="",N({rpe})=0),"",{inner}))', "№18: пустые повторения/RPE не считаются нулями")

# 13. Заглушка «?» в числовых полях AMRAP → пустая ячейка; защита BG9/BG28 проверяла не ту ячейку
for addr in ("AH162", "AH189", "AP216"):
    c = wp.Range(addr)
    log.append((wp.Name, addr, repr(c.Value), "(пусто, ввод повторений)", "№17: текст «?» в числовом поле давал #VALUE!"))
    c.ClearContents()
    c.AddComment("Исправлено (Claude): впишите число повторений подхода на максимум (было «?»)")
for addr in ("BG9", "BG28"):
    sub(wf, addr, [('IF(AM5=""', 'IF(BH5=""')], "№31: защита проверяла AM5 вместо BH5")

# 14. Калькулятор подходов: первый подход становой «свыше 300» скопирован из жима; диапазон 250–300 не покрыт
c = wk.Range("L45")
log.append((wk.Name, "L45", str(c.Value), "70", "№34: 20 кг перед 125 кг — скопировано из жима; как в соседней таблице"))
c.Value = 70
c.AddComment("Исправлено (Claude): было 20 кг (скопировано из таблицы жима)")
for addr, text, reason in [
    ("K21", "ПРОХОДКА (ВЫХОД НА 1ПМ) В СТАНОВОЙ ТЯГЕ 200–300 КГ", "№33: диапазон 250–300 кг не был покрыт ни одной таблицей"),
    ("C21", "ПРОХОДКА (ВЫХОД НА 1ПМ) В ЖИМЕ ЛЁЖА ДЛЯ ЖИМА 100–150 кг (свыше 100)", "№32: 100 кг входило в две таблицы"),
]:
    c = wk.Range(addr)
    log.append((wk.Name, addr, str(c.Value), text, reason))
    c.Value = text

# ---- лист «Исправления»
# позиционные аргументы (Before, After): именованный After через COM не передаётся
ws = wb.Worksheets.Add(None, wb.Worksheets(wb.Worksheets.Count))
ws.Name = "Исправления"
ws.Range("A1").Value = "Исправления формул по аудиту (docs/WORKBOOK_AUDIT.md). Номера — пункты аудита. В изменённых ячейках есть примечание."
ws.Range("A2").Value = ("Не исправлено в Excel (сделано только в приложении): подтягивания с отягощением в подготовке (№22 — нужен ввод веса тела), "
                       "округление навешенного веса (№24), недели 4/8/12 для строк «+» (№28), удаление «скачков вниз» в калькуляторе (№35). "
                       "Пустые RPE по-прежнему дают #Н/Д до заполнения — это ожидание ввода, а не ошибка.")
hdr = ["Лист", "Ячейка", "Было", "Стало", "Причина"]
for i, h in enumerate(hdr):
    ws.Cells(4, i + 1).Value = h
for r, row in enumerate(log, start=5):
    for i, v in enumerate(row):
        cell = ws.Cells(r, i + 1)
        cell.NumberFormat = "@"
        cell.Value = v
ws.Range("A4:E4").Font.Bold = True
ws.Columns("A:B").ColumnWidth = 22
ws.Columns("C:D").ColumnWidth = 70
ws.Columns("E").ColumnWidth = 60
ws.Range(f"C5:E{4 + len(log)}").WrapText = True
ws.Range("A1:A2").WrapText = False

excel.CalculateFull()
wb.Save()
wb.Close(SaveChanges=False)
excel.Quit()
print(f"исправлено ячеек: {len(log)} -> {DST}")
