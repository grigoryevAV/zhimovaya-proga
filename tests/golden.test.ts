/**
 * Сверка движка с пересчётом самой книги в Excel (scripts/excel_golden.py, 3 сценария выбора упражнений,
 * все RPE заполнены). Каждое расхождение должно быть в списке ниже — с причиной из WORKBOOK_AUDIT.md.
 * Если список расхождений изменится, тест упадёт: значит, изменилась логика и нужно перепроверить аудит.
 */
import { describe, expect, it } from 'vitest'
import { brzyckiRir } from '../src/domain/calculations/oneRm'
import { mround } from '../src/domain/calculations/rounding'
import { loadTotal } from '../src/domain/program/engine'
import { compareScenario } from './golden.compare'
import { SCENARIOS, num } from './golden.helpers'

const R = {
  prepZero: 'Подготовка: книга считает от 0 кг (собственный вес или нулевой ввод) — у нас «собств. вес» или «введите вес»',
  prepPullups: 'Подготовка, подтягивания с отягощением: книга умножает навешенный вес (0), у нас вес тела + отягощение',
  prepBwChain: 'Подготовка: подтягивания с собственным весом в строке с формулами веса — у нас прибавка повторений по RPE',
  prepBlank: 'Подготовка «+»: книга считает пустые повторения/RPE нулями (7, 15, 23…), у нас «нет данных»',
  u77: 'U77: MROUND(…, L77) округляет к весу 72,5 вместо шага E77',
  dipsDeload: 'Брусья, недели 4/8/12: книга даёт вес (Бжицки) упражнению с собственным весом',
  d112: 'AH173/AH200/AH227: повторения берутся из теста дня 1 (D112) вместо дня 3 (D130)',
  bwWeek11: 'Неделя 11, собственный вес: подсобные повторения считаются от RPE недели 10 (копия ссылок)',
  ac: 'AC189/AC216: ссылки на неделю 3/7 вместо текущей недели 7/11',
  d1Deload: 'Слот «Жим» дня 1, недели 4/8/12: книга берёт жим штанги дня 2 для любого выбранного упражнения',
  dbBenchRpe: 'Жим гантелей лёжа (день 1): книга берёт RPE из строки жима дня 2',
}

const EXPECTED: Record<string, Record<string, string>> = {
  A_исходный_выбор: {
    I78: R.prepPullups, L78: R.prepPullups, O78: R.prepPullups, R78: R.prepPullups, U78: R.prepPullups,
    F88: R.prepZero, I88: R.prepZero, L88: R.prepZero, O88: R.prepZero, R88: R.prepZero, U88: R.prepZero,
    F96: R.prepZero, I96: R.prepZero, L96: R.prepZero, O96: R.prepZero, R96: R.prepZero, U96: R.prepZero,
    U77: R.u77,
    AF165: R.dipsDeload, AG165: R.dipsDeload, AH165: R.dipsDeload, AF192: R.dipsDeload, AH192: R.dipsDeload, AF219: R.dipsDeload, AH219: R.dipsDeload,
    AH173: R.d112, AH200: R.d112, AH227: R.d112,
    W219: R.bwWeek11, W227: R.bwWeek11,
    AC216: R.ac,
  },
  B_альтернативы: {
    F78: R.prepZero, I78: R.prepZero, L78: R.prepZero, O78: R.prepZero, R78: R.prepZero, U78: R.prepZero,
    J78: R.prepBwChain, P78: R.prepBwChain, S78: R.prepBwChain, V78: R.prepBwChain,
    J81: R.prepBlank, M81: R.prepBlank, P81: R.prepBlank, S81: R.prepBlank, V81: R.prepBlank,
    I88: R.prepZero, L88: R.prepZero, O88: R.prepZero, R88: R.prepZero, U88: R.prepZero,
    I96: R.prepZero, L96: R.prepZero, O96: R.prepZero, R96: R.prepZero, U96: R.prepZero,
    U77: R.u77,
    N154: R.dbBenchRpe, Q154: R.dbBenchRpe, U154: R.dbBenchRpe, C181: R.dbBenchRpe, G181: R.dbBenchRpe, J181: R.dbBenchRpe,
    N181: R.dbBenchRpe, Q181: R.dbBenchRpe, U181: R.dbBenchRpe, C208: R.dbBenchRpe, J208: R.dbBenchRpe, N208: R.dbBenchRpe,
    Q208: R.dbBenchRpe, U208: R.dbBenchRpe,
    AF154: R.d1Deload, AH154: R.d1Deload, AF181: R.d1Deload, AH181: R.d1Deload, AF208: R.d1Deload, AH208: R.d1Deload,
    W209: R.bwWeek11, W212: R.bwWeek11,
    AC189: R.ac, AC216: R.ac,
  },
  C_альтернативы_2: {
    I78: R.prepZero, L78: R.prepZero, O78: R.prepZero, R78: R.prepZero, U78: R.prepZero,
    J81: R.prepBlank, M81: R.prepBlank, P81: R.prepBlank, S81: R.prepBlank, V81: R.prepBlank,
    I88: R.prepZero, L88: R.prepZero, O88: R.prepZero, R88: R.prepZero, U88: R.prepZero,
    I96: R.prepZero, L96: R.prepZero, O96: R.prepZero, R96: R.prepZero, U96: R.prepZero,
    U77: R.u77,
    AF154: R.d1Deload, AG154: R.d1Deload, AH154: R.d1Deload, AF181: R.d1Deload, AH181: R.d1Deload, AF208: R.d1Deload, AH208: R.d1Deload,
    W212: R.bwWeek11,
    AC189: R.ac, AC216: R.ac,
  },
}

describe('сверка с пересчётом Excel', () => {
  for (const [name, sc] of Object.entries(SCENARIOS)) {
    it(`${name}: всё совпадает, кроме задокументированных исправлений`, () => {
      const r = compareScenario(sc.cells)
      expect(r.compared).toBeGreaterThan(900)
      const got = Object.fromEntries(r.mismatches.map((m) => [m.cell, m]))
      expect(Object.keys(got).sort()).toEqual(Object.keys(EXPECTED[name]).sort())
      // доля совпадений
      expect(1 - r.mismatches.length / r.compared).toBeGreaterThan(0.95)
    })
  }

  it('AC216: исправленная ссылка считает от тяжёлого подхода недели 11', () => {
    const cells = SCENARIOS.A_исходный_выбор.cells
    const { engine } = compareScenario(cells)
    const top = engine.group(11, 'd2s1', 'top')!
    const extra = engine.group(11, 'd2s1', 'extra2')!
    const topW = loadTotal(top.load)
    expect(topW.ok).toBe(true)
    const rpe = num(cells.T216)!
    const reps = (top.reps as { value: number }).value
    const e = brzyckiRir(topW.ok ? topW.value : 0, reps, rpe)
    const expected = mround((e.ok ? e.value : 0) * 0.863, 2.5)
    expect(loadTotal(extra.load)).toEqual(expected)
    // в книге — от недели 7: Q189/S189/T189
    const q189 = num(cells.Q189)!, s189 = num(cells.S189)!, t189 = num(cells.T189)!
    const book = brzyckiRir(q189, s189, t189)
    expect(mround((book.ok ? book.value : 0) * 0.863, 2.5)).toEqual({ ok: true, value: num(cells.AC216) })
  })

  it('U77: книга округляет к L77 (весу), исправлено на шаг E77', () => {
    const { engine } = compareScenario(SCENARIOS.A_исходный_выбор.cells)
    const g = engine.group('P2', 'd1s1', 's3')!
    const w = loadTotal(g.load)
    expect(w.ok && w.value % 2.5).toBe(0)
  })
})
