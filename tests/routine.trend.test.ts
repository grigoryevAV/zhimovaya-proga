import { describe, expect, it } from 'vitest'
import type { WeekId } from '../src/domain/program/definition'
import { type TrendAdvice, advice, weightTrend } from '../src/domain/routine/trend'
import type { BodyweightRow, WorkoutRow } from '../src/storage/types'

const TODAY = '2026-11-30'

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Ровный ряд: `days` записей подряд, последняя — `end`. */
function span(end: string, days: number, kg: number): BodyweightRow[] {
  return Array.from({ length: days }, (_, i) => ({ id: i + 1, date: shift(end, i - days + 1), kg }))
}

function workout(id: string, date: string, exerciseId: string, weight: number, reps: number, rpe: number): WorkoutRow {
  return {
    id,
    sessionId: id,
    week: 1,
    day: 1,
    status: 'done',
    startedAt: `${date}T15:00:00.000Z`,
    finishedAt: `${date}T16:45:00.000Z`,
    algorithmVersion: 'test',
    bodyweight: null,
    note: '',
    exercises: [
      {
        slotId: 'd1s1',
        exerciseId,
        exerciseName: exerciseId,
        loadType: 'barbell',
        step: 2.5,
        note: '',
        sets: [
          {
            groupId: 'top',
            groupLabel: 'top',
            index: 1,
            driver: 'rpe',
            planned: { weight, reps, text: '' },
            actual: { weight, reps, rpe },
            done: true,
          },
        ],
      },
    ],
  }
}

const trend = (rows: BodyweightRow[]) => weightTrend(rows, TODAY)
const advise = (rows: BodyweightRow[], workouts: WorkoutRow[] = [], week: WeekId | 'done' = 5): TrendAdvice =>
  advice(rows, workouts, TODAY, week)

describe('тренд веса: окна', () => {
  it('avg7 — записи за [today−6, today], prevAvg7 — за [today−13, today−7]', () => {
    const rows = [...span('2026-11-30', 7, 91), ...span('2026-11-23', 7, 92)]
    const t = trend(rows)
    expect(t.avg7).toBe(91)
    expect(t.prevAvg7).toBe(92)
    expect(t.ratePerWeek).toBe(-1)
  })

  it('нет второй недели — темпа нет', () => {
    const t = trend(span('2026-11-30', 7, 91))
    expect(t.avg7).toBe(91)
    expect(t.prevAvg7).toBeNull()
    expect(t.ratePerWeek).toBeNull()
  })
})

describe('подсказки: мало данных', () => {
  it('одна неделя записей — need-data, поправка 0', () => {
    const a = advise(span('2026-11-30', 7, 92))
    expect(a.kind).toBe('need-data')
    expect(a.deltaKcal).toBe(0)
  })

  it('нет записей за последние 7 дней — need-data', () => {
    const a = advise(span('2026-11-23', 7, 92))
    expect(a.kind).toBe('need-data')
    expect(a.deltaKcal).toBe(0)
  })
})

describe('подсказки: темп', () => {
  it('−0,2 кг/нед — норма', () => {
    const a = advise([...span('2026-11-30', 7, 91.8), ...span('2026-11-23', 7, 92)])
    expect(a.kind).toBe('ok')
    expect(a.deltaKcal).toBe(0)
    expect(a.text).toContain('−0,2')
  })

  it('−0,5 кг/нед — слишком быстро, +150', () => {
    const a = advise([...span('2026-11-30', 7, 91.5), ...span('2026-11-23', 7, 92)])
    expect(a.kind).toBe('too-fast')
    expect(a.deltaKcal).toBe(150)
  })
})

describe('подсказки: вес стоит', () => {
  const flat = () => [
    ...span('2026-11-30', 7, 92.0),
    ...span('2026-11-23', 7, 92.05),
    ...span('2026-11-16', 7, 91.98),
    ...span('2026-11-09', 7, 92.02),
  ]

  it('три недели подряд |Δ| < 0,1 — stalled, −150', () => {
    const a = advise(flat())
    expect(a.kind).toBe('stalled')
    expect(a.deltaKcal).toBe(-150)
  })

  it('неделя 12 (поддержание) — stalled не выдаётся', () => {
    const a = advise(flat(), [], 12)
    expect(a.kind).toBe('ok')
    expect(a.deltaKcal).toBe(0)
  })
})

describe('тренд веса: нерегулярный вес', () => {
  it('несколько записей в день и пропуски не ломают среднее', () => {
    const irregular: BodyweightRow[] = [
      { date: '2026-11-24', kg: 92.4 },
      { date: '2026-11-24', kg: 91.8 },
      { date: '2026-11-27', kg: 91.5 },
      { date: '2026-11-30', kg: 91.5 },
      { date: '2026-11-19', kg: 92.2 },
      { date: '2026-11-20', kg: 91.8 },
    ]
    const regular = [...span('2026-11-30', 7, 91.8), ...span('2026-11-23', 7, 92.0)]
    const a = trend(irregular)
    const b = trend(regular)
    expect(a.avg7).toBeCloseTo(b.avg7!, 10)
    expect(a.prevAvg7).toBeCloseTo(b.prevAvg7!, 10)
    expect(a.ratePerWeek).toBeCloseTo(b.ratePerWeek!, 10)
    expect(advise(irregular).kind).toBe('ok')
  })
})

describe('подсказки: предохранитель силы', () => {
  it('жим просел две завершённые недели — strength-guard +200, приоритетнее too-fast', () => {
    const rows = [...span('2026-11-30', 7, 91.5), ...span('2026-11-23', 7, 92)]
    const workouts = [
      workout('w4', '2026-11-04', 'bench', 100, 5, 8),
      workout('w3', '2026-11-11', 'bench', 100, 5, 8),
      workout('w2', '2026-11-18', 'bench', 80, 5, 8),
      workout('w1', '2026-11-25', 'bench', 80, 5, 8),
    ]
    const a = advise(rows, workouts)
    expect(a.kind).toBe('strength-guard')
    expect(a.deltaKcal).toBe(200)
  })

  it('присед просел — тоже strength-guard', () => {
    const workouts = [
      workout('w4', '2026-11-04', 'squat', 140, 5, 8),
      workout('w3', '2026-11-11', 'squat', 140, 5, 8),
      workout('w2', '2026-11-18', 'squat', 110, 5, 8),
      workout('w1', '2026-11-25', 'squat', 110, 5, 8),
    ]
    const rows = [...span('2026-11-30', 7, 91.8), ...span('2026-11-23', 7, 92)]
    expect(advise(rows, workouts).kind).toBe('strength-guard')
  })

  it('ровная сила — предохранитель не срабатывает', () => {
    const workouts = [
      workout('w1', '2026-11-25', 'bench', 100, 5, 8),
      workout('w2', '2026-11-18', 'bench', 100, 5, 8),
      workout('w3', '2026-11-11', 'bench', 100, 5, 8),
      workout('w4', '2026-11-04', 'bench', 100, 5, 8),
    ]
    const rows = [...span('2026-11-30', 7, 91.8), ...span('2026-11-23', 7, 92)]
    expect(advise(rows, workouts).kind).toBe('ok')
  })
})
