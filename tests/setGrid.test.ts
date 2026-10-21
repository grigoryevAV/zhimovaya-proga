import { describe, expect, it } from 'vitest'
import { bumpBase, bumpValue } from '../src/ui/setGrid'

describe('К6 — шаг ± у подхода без плана («подбор»)', () => {
  it('база: факт → план → прошлый результат', () => {
    expect(bumpBase(70, 80, 60)).toBe(70)
    expect(bumpBase(null, 80, 60)).toBe(80)
    expect(bumpBase(null, null, 60)).toBe(60)
    expect(bumpBase(null, null, null)).toBeNull()
  })

  it('нет ни факта, ни плана, ни прошлого результата — нажатие ничего не меняет', () => {
    expect(bumpValue({ actual: null, planned: null, last: null, delta: 2.5, step: 2.5 })).toBeNull()
    expect(bumpValue({ actual: null, planned: null, last: null, delta: -2.5, step: 2.5 })).toBeNull()
  })

  it('первое нажатие ставит прошлый результат, а не «2,5 кг»', () => {
    expect(bumpValue({ actual: null, planned: null, last: 60, delta: 2.5, step: 2.5 })).toBe(60)
    // следующее нажатие уже прибавляет шаг
    expect(bumpValue({ actual: 60, planned: null, last: 60, delta: 2.5, step: 2.5 })).toBe(62.5)
  })

  it('есть план — шаг идёт от плана', () => {
    expect(bumpValue({ actual: null, planned: 80, last: 60, delta: 2.5, step: 2.5 })).toBe(82.5)
    expect(bumpValue({ actual: null, planned: 80, last: 60, delta: -2.5, step: 2.5 })).toBe(77.5)
  })

  it('вес не уходит в минус (кроме отягощений, где минус разрешён)', () => {
    expect(bumpValue({ actual: 2.5, planned: null, last: null, delta: -2.5, step: 2.5 })).toBe(0)
    expect(bumpValue({ actual: 0, planned: null, last: null, delta: -2.5, step: 2.5 })).toBeNull()
    expect(bumpValue({ actual: 2.5, planned: null, last: null, delta: -2.5, step: 2.5, min: -Infinity })).toBe(0)
  })
})
