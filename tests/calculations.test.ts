import { describe, expect, it } from 'vitest'
import { BRZYCKI_MAX_REPS, brzycki, brzyckiRir, e1rmFromRpe } from '../src/domain/calculations/oneRm'
import { ceilingStep, floorStep, mround } from '../src/domain/calculations/rounding'
import { RPE_REPS, RPE_TABLE, RPE_VALUES, rpeCoefficient } from '../src/domain/calculations/rpeTable'
import { pickWarmupTable, warmupPlan } from '../src/domain/calculations/warmup'

const v = (c: { ok: boolean; value?: number }) => (c.ok ? c.value : undefined)

describe('таблица RPE («Формулы»!N92:X100)', () => {
  it('совпадает с книгой по углам и середине', () => {
    expect(RPE_VALUES).toEqual([10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5])
    expect(RPE_REPS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(v(rpeCoefficient(10, 1))).toBe(1)
    expect(v(rpeCoefficient(10, 10))).toBe(0.74)
    expect(v(rpeCoefficient(6.5, 1))).toBe(0.88)
    expect(v(rpeCoefficient(6.5, 10))).toBe(0.64)
    expect(v(rpeCoefficient(8, 5))).toBe(0.81)
    expect(v(rpeCoefficient(9.5, 3))).toBe(0.91)
  })

  it('возвращает значение для всех 80 пар RPE × повторения', () => {
    for (const [i, rpe] of RPE_VALUES.entries()) {
      for (const reps of RPE_REPS) {
        const c = rpeCoefficient(rpe, reps)
        expect(c.ok).toBe(true)
        expect(v(c)).toBe(RPE_TABLE[i][reps - 1])
        expect(v(c)!).toBeGreaterThan(0.6)
        expect(v(c)!).toBeLessThanOrEqual(1)
      }
    }
  })

  it('коэффициент убывает с ростом повторений и падением RPE', () => {
    for (let i = 0; i < RPE_VALUES.length; i++) for (let j = 1; j < 10; j++) expect(RPE_TABLE[i][j]).toBeLessThan(RPE_TABLE[i][j - 1])
    for (let j = 0; j < 10; j++) for (let i = 1; i < RPE_VALUES.length; i++) expect(RPE_TABLE[i][j]).toBeLessThan(RPE_TABLE[i - 1][j])
  })

  it('пустые и недопустимые значения дают понятную ошибку, а не 0', () => {
    expect(rpeCoefficient(null, 5)).toMatchObject({ ok: false, issue: { code: 'missing-rpe' } })
    expect(rpeCoefficient(undefined, 5)).toMatchObject({ ok: false, issue: { code: 'missing-rpe' } })
    expect(rpeCoefficient(0, 5)).toMatchObject({ ok: false, issue: { code: 'rpe-out-of-range' } })
    expect(rpeCoefficient(6, 5)).toMatchObject({ ok: false, issue: { code: 'rpe-out-of-range' } })
    expect(rpeCoefficient(8.3, 5)).toMatchObject({ ok: false, issue: { code: 'rpe-out-of-range' } })
    expect(rpeCoefficient(10.5, 5)).toMatchObject({ ok: false, issue: { code: 'rpe-out-of-range' } })
    expect(rpeCoefficient(8, null)).toMatchObject({ ok: false, issue: { code: 'missing-reps' } })
    expect(rpeCoefficient(8, 0)).toMatchObject({ ok: false, issue: { code: 'reps-out-of-range' } })
    expect(rpeCoefficient(8, 11)).toMatchObject({ ok: false, issue: { code: 'reps-out-of-range' } })
    expect(rpeCoefficient(8, 2.5)).toMatchObject({ ok: false, issue: { code: 'reps-out-of-range' } })
    expect(rpeCoefficient(Number.NaN, 5)).toMatchObject({ ok: false })
  })
})

describe('округление к шагу (MROUND/CEILING/FLOOR)', () => {
  it('к ближайшему кратному, половина — вверх (как MROUND)', () => {
    const cases: [number, number, number][] = [
      // шаг 1
      [72.49, 1, 72], [72.5, 1, 73], [72.51, 1, 73],
      // шаг 2
      [12.99, 2, 12], [13, 2, 14], [13.01, 2, 14], [11, 2, 12],
      // шаг 2,5
      [71.24, 2.5, 70], [71.25, 2.5, 72.5], [73.74, 2.5, 72.5], [73.75, 2.5, 75], [74.07, 2.5, 75],
      // шаг 3
      [4.49, 3, 3], [4.5, 3, 6], [77.9, 3, 78],
      // шаг 5
      [7.49, 5, 5], [7.5, 5, 10], [102.4, 5, 100],
    ]
    for (const [x, step, exp] of cases) expect(v(mround(x, step)), `${x} → ${step}`).toBe(exp)
  })

  it('не путает с округлением только вверх/вниз', () => {
    expect(v(mround(71, 2.5))).toBe(70)
    expect(v(ceilingStep(71, 2.5))).toBe(72.5)
    expect(v(floorStep(71, 2.5))).toBe(70)
    expect(v(ceilingStep(70, 2.5))).toBe(70)
    expect(v(floorStep(72.5, 2.5))).toBe(72.5)
  })

  it('гасит ошибки двоичной арифметики', () => {
    expect(v(mround(72.49999999999, 2.5))).toBe(72.5)
    expect(v(mround(0.1 + 0.2, 0.1))).toBe(0.3)
    expect(v(ceilingStep(95 * 0.65, 5))).toBe(65)
  })

  it('шаг 0 или отрицательный — ошибка, а не Infinity/NaN', () => {
    expect(mround(50, 0)).toMatchObject({ ok: false, issue: { code: 'invalid-step' } })
    expect(mround(50, -2.5)).toMatchObject({ ok: false })
    expect(mround(Number.NaN, 2.5)).toMatchObject({ ok: false })
  })
})

describe('оценка 1ПМ', () => {
  it('по таблице RPE: вес / коэффициент', () => {
    expect(v(e1rmFromRpe(100, 1, 10))).toBe(100)
    expect(v(e1rmFromRpe(80, 6, 10))!).toBeCloseTo(95.238, 3) // тест книги: 80 × 6
    expect(v(e1rmFromRpe(110, 3, 10))!).toBeCloseTo(119.565, 3) // 110 × 3
    expect(v(e1rmFromRpe(100, 5, 8))!).toBeCloseTo(123.457, 3)
  })

  it('формула Бжицки книги: вес / (1.0278 − 0.0278·n)', () => {
    expect(v(brzycki(100, 1))!).toBeCloseTo(100, 6)
    expect(v(brzycki(100, 5))!).toBeCloseTo(112.5, 1)
    expect(v(brzycki(100, 10))!).toBeCloseTo(133.33, 1)
    expect(v(brzycki(90, 3))!).toBeCloseTo(95.299, 3)
    expect(v(brzyckiRir(90, 3, 7.5))).toBeCloseTo(v(brzycki(90, 5.5))!, 9)
  })

  it('Бжицки не применяется вслепую к любому числу повторений', () => {
    expect(brzycki(100, BRZYCKI_MAX_REPS + 1)).toMatchObject({ ok: false, issue: { code: 'brzycki-out-of-range' } })
    expect(brzycki(100, 37)).toMatchObject({ ok: false }) // знаменатель ≤ 0 — в книге дал бы Infinity/отрицательный вес
    expect(brzycki(100, 0)).toMatchObject({ ok: false })
    expect(brzycki(0, 5)).toMatchObject({ ok: false, issue: { code: 'invalid-weight' } })
    expect(brzycki(null, 5)).toMatchObject({ ok: false, issue: { code: 'missing-weight' } })
    expect(brzyckiRir(90, 3, null)).toMatchObject({ ok: false, issue: { code: 'missing-rpe' } })
  })

  it('отсутствие данных не превращается в 0', () => {
    expect(e1rmFromRpe(null, 5, 8)).toMatchObject({ ok: false, issue: { code: 'missing-weight' } })
    expect(e1rmFromRpe(100, null, 8)).toMatchObject({ ok: false, issue: { code: 'missing-reps' } })
    expect(e1rmFromRpe(100, 5, null)).toMatchObject({ ok: false, issue: { code: 'missing-rpe' } })
  })
})

describe('калькулятор подходов (проходка к 1ПМ)', () => {
  const check = (lift: 'bench' | 'deadlift', rm: number, table: string) => {
    const p = warmupPlan(lift, rm)
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.value.table.id, `${lift} ${rm}`).toBe(table)
    const ws = p.value.sets.map((s) => s.weight)
    for (let i = 1; i < ws.length; i++) expect(ws[i], `${lift} ${rm}: подход ${i + 1}`).toBeGreaterThan(ws[i - 1])
    expect(ws.every(Number.isFinite)).toBe(true)
    expect(ws[ws.length - 1]).toBe(v(ceilingStep(rm, 2.5)))
    return p.value
  }

  it('жим: нижняя, средняя и верхняя точки каждого диапазона', () => {
    check('bench', 40, 'bench-100')
    check('bench', 70, 'bench-100')
    check('bench', 100, 'bench-100')
    check('bench', 100.5, 'bench-150')
    check('bench', 125, 'bench-150')
    check('bench', 150, 'bench-150')
    check('bench', 150.5, 'bench-max')
    check('bench', 200, 'bench-max')
  })

  it('жим 95 кг — как в книге', () => {
    const p = check('bench', 95, 'bench-100')!
    expect(p.sets.map((s) => [s.weight, s.reps, s.rest])).toEqual([
      [20, 10, '1 мин'], [50, 4, '1 мин'], [65, 3, '2 мин'], [75, 2, '2 мин'], [80, 1, '3 мин'],
      [85, 1, '4 мин'], [90, 1, '5 мин'], [92.5, 1, '5 мин'], [95, 1, '6 мин'],
    ])
  })

  it('жим 140 кг и становая 150/220/310 кг — как в книге', () => {
    expect(check('bench', 140, 'bench-150')!.sets.map((s) => s.weight)).toEqual([20, 60, 80, 100, 110, 117.5, 122.5, 127.5, 135, 140])
    expect(check('deadlift', 150, 'dl-200')!.sets.map((s) => s.weight)).toEqual([60, 75, 100, 115, 125, 132.5, 140, 145, 150])
    expect(check('deadlift', 220, 'dl-300')!.sets.map((s) => s.weight)).toEqual([70, 90, 125, 155, 172.5, 182.5, 192.5, 202.5, 210, 220])
    // первый подход исправлен: 20 → 70 кг (в книге скопирован из жима)
    expect(check('deadlift', 310, 'dl-max')!.sets.map((s) => s.weight)).toEqual([70, 125, 175, 205, 232.5, 250, 265, 277.5, 287.5, 295, 302.5, 310])
  })

  it('становая: границы и непокрытый в книге диапазон 250–300', () => {
    check('deadlift', 200, 'dl-200')
    check('deadlift', 200.5, 'dl-300')
    check('deadlift', 275, 'dl-300')
    check('deadlift', 300, 'dl-300')
    check('deadlift', 300.5, 'dl-max')
    expect(pickWarmupTable('deadlift', 260).id).toBe('dl-300')
  })

  it('малый 1ПМ: подходы не тяжелее предыдущих убираются, скачков вниз нет', () => {
    const p = check('deadlift', 100, 'dl-200')!
    expect(p.dropped).toBeGreaterThan(0) // 60 кг × 6, затем 50 % = 50 кг — в книге шаг вниз
  })

  it('пустой или слишком малый 1ПМ — подсказка вместо таблицы', () => {
    expect(warmupPlan('bench', null)).toMatchObject({ ok: false, issue: { code: 'missing-weight' } })
    expect(warmupPlan('bench', 15)).toMatchObject({ ok: false })
  })
})
