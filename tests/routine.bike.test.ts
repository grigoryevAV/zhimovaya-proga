import { describe, expect, it } from 'vitest'
import type { WeekId } from '../src/domain/program/definition'
import { type BikeWeek, bikeDay, bikeWeekFor } from '../src/domain/routine/bike'

function week(n: number): BikeWeek {
  return n as BikeWeek
}

describe('велосипед: неделя программы → неделя велосипеда', () => {
  it('подготовка и тест — неделя 1', () => {
    expect(bikeWeekFor('P1')).toBe(1)
    expect(bikeWeekFor('P2')).toBe(1)
    expect(bikeWeekFor('T')).toBe(1)
  })

  it('недели 1–8 совпадают', () => {
    for (let w = 1; w <= 8; w++) expect(bikeWeekFor(w as WeekId)).toBe(w)
  })

  it('после 8-й недели — откат на 3/5/6/8', () => {
    expect(bikeWeekFor(9)).toBe(3)
    expect(bikeWeekFor(10)).toBe(5)
    expect(bikeWeekFor(11)).toBe(6)
    expect(bikeWeekFor(12)).toBe(8)
  })

  it('программа пройдена — неделя 3', () => {
    expect(bikeWeekFor('done')).toBe(3)
  })
})

describe('велосипед: дни недели', () => {
  it('вторник — 35/40/40/35/45/45/50/35 минут', () => {
    const expected = [35, 40, 40, 35, 45, 45, 50, 35]
    expected.forEach((minutes, i) => expect(bikeDay(week(i + 1), 2)?.minutes).toBe(minutes))
  })

  it('четверг — только недели 3, 5, 6, 7', () => {
    for (const w of [1, 2, 4, 8]) expect(bikeDay(week(w), 4)).toBeNull()
    expect(bikeDay(week(3), 4)?.minutes).toBe(25)
    for (const w of [5, 6, 7]) expect(bikeDay(week(w), 4)?.minutes).toBe(30)
  })

  it('суббота — полная длительность по времени окончания графика', () => {
    const expected = [45, 55, 60, 50, 72, 82, 88, 40]
    expected.forEach((minutes, i) => expect(bikeDay(week(i + 1), 6)?.minutes).toBe(minutes))
  })

  it('субботние интервалы Z3 в недели 5–7', () => {
    expect(bikeDay(week(5), 6)?.label).toContain('4×2 мин Z3')
    expect(bikeDay(week(6), 6)?.label).toContain('5×3')
    expect(bikeDay(week(7), 6)?.label).toContain('6×3')
  })

  it('в остальные дни велосипеда нет', () => {
    for (const w of [1, 5, 8]) {
      for (const weekday of [1, 3, 5, 7] as const) expect(bikeDay(week(w), weekday)).toBeNull()
    }
  })
})
