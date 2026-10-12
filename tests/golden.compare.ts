/** Сверка плана движка с пересчётом Excel: возвращает совпадения и расхождения по ячейкам. */
import { SLOTS, WEEKS } from '../src/domain/program/definition'
import { PlanEngine, loadTotal } from '../src/domain/program/engine'
import { type Cells, cellsForGroup, inputFromScenario, num } from './golden.helpers'

export interface Mismatch {
  cell: string
  excel: unknown
  app: unknown
  what: 'weight' | 'sets' | 'reps'
}

export function compareScenario(cells: Cells): { compared: number; mismatches: Mismatch[]; engine: PlanEngine } {
  const engine = new PlanEngine(inputFromScenario(cells))
  const mismatches: Mismatch[] = []
  let compared = 0
  for (const w of WEEKS) {
    for (const s of SLOTS) {
      const ex = engine.exercise(w, s.id)
      if (!ex) continue
      for (const g of ex.groups) {
        const cc = cellsForGroup(s.id, w, g.groupId)
        if (!cc) continue
        const [wc, sc, rc] = cc
        const ev = cells[wc]
        // вес
        if (ev !== undefined && g.load.kind !== 'choose') {
          compared++
          if (ev === 'собств.') {
            if (g.load.kind !== 'bodyweight') mismatches.push({ cell: wc, excel: ev, app: g.load.kind, what: 'weight' })
          } else if (typeof ev === 'number') {
            const t = loadTotal(g.load)
            const appV = t.ok ? t.value : `!${t.issue.code}`
            if (appV !== ev) mismatches.push({ cell: wc, excel: ev, app: appV, what: 'weight' })
          }
        }
        // подходы
        if (sc && cells[sc] !== undefined) {
          compared++
          if (num(cells[sc]) !== g.sets) mismatches.push({ cell: sc, excel: cells[sc], app: g.sets, what: 'sets' })
        }
        // повторения
        const er = cells[rc]
        if (er !== undefined && g.reps.kind !== 'choose' && g.reps.kind !== 'amrap') {
          compared++
          if (typeof er === 'string' && er.trim() === 'до отказа') {
            if (g.reps.kind !== 'toFailure') mismatches.push({ cell: rc, excel: er, app: g.reps, what: 'reps' })
          } else {
            const appR = g.reps.kind === 'fixed' ? g.reps.value : g.reps.kind
            if (num(er) !== appR) mismatches.push({ cell: rc, excel: er, app: appR, what: 'reps' })
          }
        }
      }
    }
  }
  return { compared, mismatches, engine }
}
