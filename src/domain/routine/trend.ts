/**
 * Тренд веса и предохранитель силы (спецификация 3.4).
 * Окна — локальные даты `YYYY-MM-DD`; чистая функция без React и IndexedDB.
 */
import type { WeekId } from '../program/definition'
import { setE1rm } from '../progression/analytics'
import type { BodyweightRow, WorkoutRow } from '../../storage/types'

export interface TrendAdvice {
  kind: 'need-data' | 'ok' | 'too-fast' | 'stalled' | 'strength-guard'
  deltaKcal: number
  text: string
  ratePerWeek: number | null
}

export interface WeightTrend {
  avg7: number | null
  prevAvg7: number | null
  ratePerWeek: number | null
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Среднее по всем записям окна [end + from, end + to] включительно; пусто → null. */
function windowAvg(rows: BodyweightRow[], end: string, from: number, to: number): number | null {
  const lo = shift(end, from)
  const hi = shift(end, to)
  let sum = 0
  let count = 0
  for (const r of rows) {
    if (r.date >= lo && r.date <= hi && Number.isFinite(r.kg)) {
      sum += r.kg
      count++
    }
  }
  return count ? sum / count : null
}

export function weightTrend(rows: BodyweightRow[], today: string): WeightTrend {
  const avg7 = windowAvg(rows, today, -6, 0)
  const prevAvg7 = windowAvg(rows, today, -13, -7)
  return {
    avg7,
    prevAvg7,
    ratePerWeek: avg7 !== null && prevAvg7 !== null ? avg7 - prevAvg7 : null,
  }
}

/** Три недельных изменения подряд меньше 0,1 кг по модулю — значит, вес стоит. */
function isStalled(rows: BodyweightRow[], today: string): boolean {
  const weeks = [
    windowAvg(rows, today, -6, 0),
    windowAvg(rows, today, -13, -7),
    windowAvg(rows, today, -20, -14),
    windowAvg(rows, today, -27, -21),
  ]
  if (weeks.some((w) => w === null)) return false
  for (let i = 0; i < weeks.length - 1; i++) {
    if (Math.abs(weeks[i]! - weeks[i + 1]!) >= 0.1) return false
  }
  return true
}

/** Понедельник календарной недели даты (UTC-арифметика над календарной датой). */
function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const day = d.getUTCDay() // 0 = воскресенье
  return shift(date, -((day + 6) % 7))
}

/** Лучший оценочный 1ПМ недели по упражнению: неделя (Пн–Вс) → значение. */
function weeklyBest(workouts: WorkoutRow[], exerciseId: string): Map<string, number> {
  const best = new Map<string, number>()
  for (const w of workouts) {
    if (w.status !== 'done' || !w.finishedAt) continue
    const key = mondayOf(w.finishedAt.slice(0, 10))
    for (const e of w.exercises) {
      if (e.exerciseId !== exerciseId) continue
      for (const s of e.sets) {
        const value = setE1rm(e.exerciseId, s, w.bodyweight)
        if (value === null) continue
        const cur = best.get(key)
        if (cur === undefined || value > cur) best.set(key, value)
      }
    }
  }
  return best
}

/** Две последние завершённые недели ниже лучшего из двух предыдущих более чем на 2,5 %. */
function declined(best: Map<string, number>, currentMonday: string): boolean {
  const last = best.get(shift(currentMonday, -7))
  const prev = best.get(shift(currentMonday, -14))
  if (last === undefined || prev === undefined) return false
  const reference = Math.max(best.get(shift(currentMonday, -21)) ?? -Infinity, best.get(shift(currentMonday, -28)) ?? -Infinity)
  if (!Number.isFinite(reference)) return false
  return last < 0.975 * reference && prev < 0.975 * reference
}

function strengthDropped(workouts: WorkoutRow[], today: string): boolean {
  const currentMonday = mondayOf(today)
  return ['bench', 'squat'].some((id) => declined(weeklyBest(workouts, id), currentMonday))
}

/** Минус — типографский (U+2212), десятичная запятая — как в интерфейсе. */
function formatRate(rate: number): string {
  const fixed = Math.abs(rate) < 0.05 ? '0,0' : rate.toFixed(1).replace('.', ',')
  return rate > 0 && fixed !== '0,0' ? `+${fixed}` : fixed.replace('-', '−')
}

const NO_STALL_WEEKS: (WeekId | 'done')[] = [4, 8, 12]

export function advice(
  rows: BodyweightRow[],
  workouts: WorkoutRow[],
  today: string,
  programWeek: WeekId | 'done',
): TrendAdvice {
  const trend = weightTrend(rows, today)

  if (strengthDropped(workouts, today)) {
    return {
      kind: 'strength-guard',
      deltaKcal: 200,
      ratePerWeek: trend.ratePerWeek,
      text: 'Сила просела две недели подряд — добавьте 200 ккал в силовые дни',
    }
  }

  if (trend.avg7 === null || trend.prevAvg7 === null) {
    return {
      kind: 'need-data',
      deltaKcal: 0,
      ratePerWeek: null,
      text: 'Пока мало данных — внесите вес, чтобы следить за темпом',
    }
  }

  const rate = trend.ratePerWeek!

  if (!NO_STALL_WEEKS.includes(programWeek) && isStalled(rows, today)) {
    return {
      kind: 'stalled',
      deltaKcal: -150,
      ratePerWeek: rate,
      text: 'Вес стоит три недели подряд — уберите 150 ккал в велодни и день отдыха',
    }
  }

  if (rate < -0.4) {
    return {
      kind: 'too-fast',
      deltaKcal: 150,
      ratePerWeek: rate,
      text: `Темп ${formatRate(rate)} кг/нед — быстрее −0,4, добавьте 150 ккал`,
    }
  }

  return {
    kind: 'ok',
    deltaKcal: 0,
    ratePerWeek: rate,
    text: `Темп ${formatRate(rate)} кг/нед — норма, ничего не меняем`,
  }
}
