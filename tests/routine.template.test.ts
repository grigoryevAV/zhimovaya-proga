import { describe, expect, it } from 'vitest'
import type { WeekId } from '../src/domain/program/definition'
import { type Weekday, bikeDay, bikeWeekFor } from '../src/domain/routine/bike'
import { planDay, weekdayOf } from '../src/domain/routine'
import { type RoutineItem, minutesOf, nowNext } from '../src/domain/routine/template'

const text = (i: RoutineItem) => `${i.title} ${i.detail ?? ''}`
const byStart = (items: RoutineItem[], start: string) => items.filter((i) => i.start === start)

function plan(weekday: Weekday, programWeek: WeekId | 'done' = 5, strengthByDay: Partial<Record<1 | 2 | 3, string[]>> = {}) {
  return planDay(weekday, { programWeek, strengthByDay, mode: 'recomp', adjustKcal: 0 })
}

describe('шаблон дня: инварианты', () => {
  it('время не убывает, интервалы не перевёрнуты, последняя строка — сон 01:00', () => {
    for (const weekday of [1, 2, 3, 4, 5, 6, 7] as Weekday[]) {
      for (const week of [1, 3, 'done'] as const) {
        const { items } = plan(weekday, week)
        const starts = items.map((i) => minutesOf(i.start))
        expect(starts, `${weekday}/${week}`).toEqual([...starts].sort((a, b) => a - b))
        for (const i of items) {
          if (i.end) expect(minutesOf(i.end), `${weekday}/${week} ${i.start}`).toBeGreaterThanOrEqual(minutesOf(i.start))
        }
        for (let i = 0; i < items.length - 1; i++) {
          const end = items[i].end
          if (end) expect(minutesOf(end), `${weekday}/${week} ${items[i].start} → ${items[i + 1].start}`).toBeLessThanOrEqual(minutesOf(items[i + 1].start))
        }
        expect(items[items.length - 1]).toMatchObject({ start: '01:00', kind: 'sleep' })
      }
    }
  })

  it('утренняя прогулка 09:35–09:50 есть в каждом дне', () => {
    for (const weekday of [1, 2, 3, 4, 5, 6, 7] as Weekday[]) {
      const walk = plan(weekday).items.find((i) => i.start === '09:35')
      expect(walk, String(weekday)).toMatchObject({ end: '09:50' })
    }
  })
})

describe('шаблон дня: пятница-исключение', () => {
  it('нет ребёнка и площадки, есть свободный вечер 17:45–19:00', () => {
    const items = plan(5).items
    expect(items.some((i) => /ребёнк/i.test(text(i)))).toBe(false)
    expect(items.some((i) => /Площадка/i.test(text(i)))).toBe(false)
    const free = items.find((i) => i.start === '17:45')
    expect(free).toMatchObject({ start: '17:45', end: '19:00', kind: 'family' })
  })
})

describe('шаблон дня: понедельник', () => {
  it('ребёнок в 17:50 и площадка в 18:00', () => {
    const items = plan(1).items
    expect(byStart(items, '17:50').some((i) => /за ребёнком/i.test(text(i)))).toBe(true)
    expect(byStart(items, '18:00').some((i) => /Площадка/i.test(text(i)))).toBe(true)
  })
})

describe('шаблон дня: суббота', () => {
  it('«Личное время» 23:30–01:00 и сон 01:00', () => {
    const items = plan(6).items
    expect(items).toContainEqual(expect.objectContaining({ start: '23:30', end: '01:00', title: 'Личное время', kind: 'personal' }))
    expect(items[items.length - 1]).toMatchObject({ start: '01:00', kind: 'sleep' })
  })

  it('велосипед 12:20 с окончанием по длительности недели', () => {
    expect(byStart(plan(6, 1).items, '12:20').find((i) => i.kind === 'bike')).toMatchObject({ start: '12:20', end: '13:05' })
    expect(byStart(plan(6, 7).items, '12:20').find((i) => i.kind === 'bike')).toMatchObject({ start: '12:20', end: '13:48' })
  })
})

describe('шаблон дня: четверг', () => {
  it('неделя 1 — велосипеда нет, неделя 3 — 15:30–15:55', () => {
    expect(plan(4, 1).items.some((i) => i.kind === 'bike')).toBe(false)
    expect(byStart(plan(4, 3).items, '15:30').find((i) => i.kind === 'bike')).toMatchObject({ start: '15:30', end: '15:55' })
  })
})

describe('шаблон дня: силовая строка', () => {
  it('упражнения дня попадают в detail', () => {
    const exercises = ['Жим штанги лёжа', 'Подтягивания с отягощением']
    const row = plan(1, 5, { 1: exercises }).items.find((i) => i.kind === 'strength')!
    expect(row).toMatchObject({ start: '15:15', end: '16:45', kind: 'strength' })
    expect(row.detail).toContain(exercises[0])
    expect(row.detail).toContain(exercises[1])
  })

  it('без данных — «Силовая, день 1» и без undefined', () => {
    const row = plan(1).items.find((i) => i.kind === 'strength')!
    expect(row.title).toBe('Силовая, день 1')
    expect(text(row)).not.toContain('undefined')
  })
})

describe('шаблон дня: теперь / далее', () => {
  it('понедельник 12:20 — перерыв, далее работа с 12:25', () => {
    const { now, next } = nowNext(plan(1).items, [], 12 * 60 + 20)
    expect(now?.title).toContain('Перерыв')
    expect(next?.start).toBe('12:25')
  })

  it('воскресенье 00:30 продолжает субботу — «Личное время»', () => {
    const sunday = plan(7).items
    const saturday = plan(6).items
    const { now } = nowNext(sunday, saturday, 30)
    expect(now?.title).toBe('Личное время')
  })
})

describe('день недели по дате', () => {
  it('воскресенье — 7, а не 0', () => {
    expect(weekdayOf(new Date(2026, 9, 22))).toBe(4)
    expect(weekdayOf(new Date(2026, 10, 1))).toBe(7)
  })
})

describe('planDay: сборка', () => {
  it('неделя 1: велосипед недели 1, цель и меню согласованы', () => {
    const p = plan(2, 1)
    expect(p.bikeWeek).toBe(1)
    expect(p.bike).toEqual(bikeDay(bikeWeekFor(1), 2))
    expect(p.dayType).toBe('bike')
    expect(p.menu.length).toBeGreaterThan(0)
    expect(p.target.kcal).toBe(2450)
  })
})

describe('nowNext ночью (между отбоем и подъёмом)', () => {
  const o = { programWeek: 3 as const, strengthByDay: {}, mode: 'recomp' as const, adjustKcal: 0 }
  it('с 01:00 до 09:30 «сейчас» — сон, «далее» — подъём', () => {
    const mon = planDay(1, o), tue = planDay(2, o)
    for (const t of [60, 180, 540, 565]) {
      const r = nowNext(tue.items, mon.items, t)
      expect(r.now?.kind).toBe('sleep')
      expect(r.next?.title).toBe('Подъём')
    }
    expect(nowNext(tue.items, mon.items, 570).now?.title).toBe('Подъём')
    expect(nowNext(tue.items, mon.items, 40).now?.title).toBe('Подготовка ко сну')
  })
})
