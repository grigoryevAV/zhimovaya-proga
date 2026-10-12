import { type Calc, fail, isNum, ok } from '../result'
import { ceilingStep, floorStep } from './rounding'

/** Лист «Калькулятор подходов»: «проходка» — выход на 1ПМ (последний подход = 100 %). */
export type WarmupLift = 'bench' | 'deadlift'

type Step =
  | { fixed: number; reps: number; rest: string }
  | { pct: number; round: 'ceil' | 'floor'; step: number; reps: number; rest: string }

interface WarmupTable {
  id: string
  title: string
  /** Диапазон 1ПМ: min < 1ПМ ≤ max. */
  min: number
  max: number
  steps: Step[]
}

const c = (pct: number, step: number, reps: number, rest: string): Step => ({ pct, round: 'ceil', step, reps, rest })
const f = (pct: number, step: number, reps: number, rest: string): Step => ({ pct, round: 'floor', step, reps, rest })

/**
 * Таблицы перенесены из книги без изменения процентов, повторений и отдыха.
 * Исправлено (см. WORKBOOK_AUDIT.md, раздел «Калькулятор подходов»):
 *  - границы: в книге «до 100» и «100–150» оба включают 100 → здесь (min, max];
 *  - становая 250–300 кг в книге не покрыта ни одной таблицей → отнесена к таблице «200–300»;
 *  - становая «свыше 300»: первый подход 20 кг × 10 (скопирован из жима) → 70 кг × 10, как в соседней таблице.
 */
export const WARMUP_TABLES: Record<WarmupLift, WarmupTable[]> = {
  bench: [
    {
      id: 'bench-100', title: 'Жим лёжа до 100 кг', min: 0, max: 100,
      steps: [{ fixed: 20, reps: 10, rest: '1 мин' }, c(0.5, 5, 4, '1 мин'), c(0.65, 5, 3, '2 мин'), c(0.75, 5, 2, '2 мин'),
        c(0.825, 2.5, 1, '3 мин'), c(0.875, 2.5, 1, '4 мин'), c(0.925, 2.5, 1, '5 мин'), f(0.975, 2.5, 1, '5 мин'), c(1, 2.5, 1, '6 мин')],
    },
    {
      id: 'bench-150', title: 'Жим лёжа 100–150 кг', min: 100, max: 150,
      steps: [{ fixed: 20, reps: 10, rest: '1 мин' }, c(0.4, 5, 6, '1 мин'), c(0.55, 5, 4, '2 мин'), c(0.7, 5, 2, '2 мин'),
        c(0.775, 2.5, 1, '3 мин'), c(0.825, 2.5, 1, '4 мин'), c(0.875, 2.5, 1, '5 мин'), f(0.925, 2.5, 1, '5 мин'),
        c(0.95, 2.5, 1, '6 мин'), c(1, 2.5, 1, '6 мин')],
    },
    {
      id: 'bench-max', title: 'Жим лёжа более 150 кг', min: 150, max: Infinity,
      steps: [{ fixed: 20, reps: 10, rest: '1 мин' }, c(0.4, 5, 6, '1 мин'), c(0.55, 5, 4, '2 мин'), c(0.65, 5, 3, '2 мин'),
        c(0.75, 2.5, 2, '3 мин'), c(0.8, 2.5, 1, '4 мин'), c(0.85, 2.5, 1, '5 мин'), f(0.9, 2.5, 1, '5 мин'),
        c(0.925, 2.5, 1, '6 мин'), c(0.95, 2.5, 1, '6 мин'), c(0.975, 2.5, 1, '6 мин'), c(1, 2.5, 1, '6 мин')],
    },
  ],
  deadlift: [
    {
      id: 'dl-200', title: 'Становая тяга до 200 кг', min: 0, max: 200,
      steps: [{ fixed: 60, reps: 6, rest: '1–2 мин' }, c(0.5, 5, 4, '1–2 мин'), c(0.65, 5, 3, '2–3 мин'), c(0.75, 5, 2, '2–3 мин'),
        c(0.825, 2.5, 1, '3 мин'), c(0.875, 2.5, 1, '4 мин'), c(0.925, 2.5, 1, '5 мин'), f(0.975, 2.5, 1, '5 мин'), c(1, 2.5, 1, '6 мин')],
    },
    {
      id: 'dl-300', title: 'Становая тяга 200–300 кг', min: 200, max: 300,
      steps: [{ fixed: 70, reps: 10, rest: '1–2 мин' }, c(0.4, 5, 6, '1–2 мин'), c(0.55, 5, 4, '2–3 мин'), c(0.7, 5, 2, '2–3 мин'),
        c(0.775, 2.5, 1, '3 мин'), c(0.825, 2.5, 1, '4 мин'), c(0.875, 2.5, 1, '5 мин'), f(0.925, 2.5, 1, '5 мин'),
        c(0.95, 2.5, 1, '6 мин'), c(1, 2.5, 1, '6 мин')],
    },
    {
      id: 'dl-max', title: 'Становая тяга свыше 300 кг', min: 300, max: Infinity,
      steps: [{ fixed: 70, reps: 10, rest: '1–2 мин' }, c(0.4, 5, 6, '1–2 мин'), c(0.55, 5, 4, '2–3 мин'), c(0.65, 5, 3, '2–3 мин'),
        c(0.75, 2.5, 2, '3 мин'), c(0.8, 2.5, 1, '4 мин'), c(0.85, 2.5, 1, '5 мин'), f(0.9, 2.5, 1, '5 мин'),
        c(0.925, 2.5, 1, '6 мин'), c(0.95, 2.5, 1, '6 мин'), c(0.975, 2.5, 1, '6 мин'), c(1, 2.5, 1, '6 мин')],
    },
  ],
}

export interface WarmupSet {
  n: number
  weight: number
  reps: number
  rest: string
  pct: number | null
}

export interface WarmupPlan {
  table: WarmupTable
  sets: WarmupSet[]
  /** Подходы, убранные из-за того, что они не тяжелее предыдущего (малый 1ПМ). */
  dropped: number
}

/** Максимум диапазона трактуется включительно: 100 → таблица «до 100», 100.5 → «100–150». */
export function pickWarmupTable(lift: WarmupLift, oneRm: number): WarmupTable {
  return WARMUP_TABLES[lift].find((t) => oneRm > t.min && oneRm <= t.max) ?? WARMUP_TABLES[lift][WARMUP_TABLES[lift].length - 1]
}

export function warmupPlan(lift: WarmupLift, oneRm: number | null | undefined): Calc<WarmupPlan> {
  if (oneRm === null || oneRm === undefined) return fail('missing-weight', 'Введите 1ПМ или целевой вес')
  if (!isNum(oneRm) || oneRm <= 20) return fail('invalid-weight', '1ПМ должен быть больше веса пустого грифа (20 кг)')
  const table = pickWarmupTable(lift, oneRm)
  const sets: WarmupSet[] = []
  let dropped = 0
  for (const s of table.steps) {
    let w: number
    if ('fixed' in s) w = s.fixed
    else {
      const r = s.round === 'ceil' ? ceilingStep(oneRm * s.pct, s.step) : floorStep(oneRm * s.pct, s.step)
      if (!r.ok) return r
      w = r.value
    }
    const last = sets[sets.length - 1]
    // Подход не тяжелее предыдущего не даёт «проходки» — убираем, чтобы не было скачков вниз.
    if (last && w <= last.weight) {
      dropped++
      continue
    }
    sets.push({ n: sets.length + 1, weight: w, reps: s.reps, rest: s.rest, pct: 'fixed' in s ? null : s.pct })
  }
  return ok({ table, sets, dropped })
}
