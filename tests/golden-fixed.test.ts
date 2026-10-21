/**
 * Исправленная копия книги (scripts/fix_workbook.py), пересчитанная Excel на тех же трёх сценариях,
 * должна совпадать с приложением везде, кроме пунктов, которые в Excel намеренно не исправлялись.
 */
import { describe, expect, it } from 'vitest'
import original from './fixtures/excel-golden.json'
import fixed from './fixtures/excel-golden-fixed.json'
import { compareScenario } from './golden.compare'
import type { Cells } from './golden.helpers'

/** Остаются расхождения: подготовка с нулевым/пустым вводом и подтягивания с отягощением в подготовке (№22, 23). */
const REMAINING: Record<string, string[]> = {
  A_исходный_выбор: ['I78', 'L78', 'O78', 'R78', 'U78', 'F88', 'I88', 'L88', 'O88', 'R88', 'U88', 'F96', 'I96', 'L96', 'O96', 'R96', 'U96'],
  B_альтернативы: ['F78', 'I78', 'L78', 'O78', 'R78', 'U78', 'J78', 'P78', 'S78', 'V78', 'I88', 'L88', 'O88', 'R88', 'U88', 'I96', 'L96', 'O96', 'R96', 'U96'],
  C_альтернативы_2: ['I78', 'L78', 'O78', 'R78', 'U78', 'I88', 'L88', 'O88', 'R88', 'U88', 'I96', 'L96', 'O96', 'R96', 'U96'],
}

type G = { scenarios: Record<string, { cells: Cells }> }
const scenarios = (fixed as unknown as G).scenarios
const before = (original as unknown as G).scenarios
const errs = (c: Cells) => Object.keys(c).filter((k) => c[k] === '#ERR').sort()

describe('исправленная книга совпадает с приложением', () => {
  for (const [name, sc] of Object.entries(scenarios)) {
    it(name, () => {
      const r = compareScenario(sc.cells, true)
      const got = r.mismatches.map((m) => m.cell).sort()
      expect(got).toEqual([...REMAINING[name]].sort())
      // новых ошибок нет: остались только вызванные вводом сценария (пустой вес «+» в подготовке, тест 12 повторений)
      expect(errs(sc.cells)).toEqual(errs(before[name].cells))
    })
  }
})
