import { describe, expect, it } from 'vitest'
import type { Weekday } from '../src/domain/routine/bike'
import { bikeDay, bikeWeekFor } from '../src/domain/routine/bike'
import {
  MEAL_NOTE,
  SUBSTITUTIONS,
  type DayType,
  type Meal,
  type NutritionMode,
  dayMenu,
  dayTarget,
  dayTypeOf,
} from '../src/domain/routine/nutrition'

const WEEK5 = 5 as const
const TYPES: DayType[] = ['strength', 'bike', 'rest']
const MODES: NutritionMode[] = ['recomp', 'maintenance']
const sumKcal = (meals: Meal[]) => meals.filter((m) => !m.optional).reduce((sum, m) => sum + m.kcal, 0)

describe('питание: цель дня', () => {
  it('белок 190 (rest 185), жиры 72, углеводы из остатка', () => {
    expect(dayTarget('strength', 'recomp', WEEK5, 0)).toMatchObject({ kcal: 2700, protein: 190, fat: 72, carbs: 323 })
    expect(dayTarget('rest', 'recomp', WEEK5, 0).protein).toBe(185)
    expect(dayTarget('bike', 'recomp', WEEK5, 0)).toMatchObject({ kcal: 2450, protein: 190, fat: 72 })
  })

  it('в недели 4/8/12 поддержание включается автоматически', () => {
    for (const type of TYPES) {
      for (const week of [4, 8, 12] as const) {
        const auto = dayTarget(type, 'recomp', week, 0)
        expect(auto).toEqual(dayTarget(type, 'maintenance', week, 0))
        expect(auto.mode).toBe('maintenance')
        expect(auto.autoMaintenance).toBe(true)
      }
      expect(dayTarget(type, 'recomp', WEEK5, 0).autoMaintenance).toBe(false)
    }
  })

  it('поправка прибавляется и зажимается в [1980, 2980]', () => {
    expect(dayTarget('bike', 'recomp', WEEK5, 150).kcal).toBe(2600)
    expect(dayTarget('rest', 'recomp', WEEK5, -900).kcal).toBe(1980)
    expect(dayTarget('strength', 'maintenance', WEEK5, 900).kcal).toBe(2980)
    expect(dayTarget('bike', 'recomp', WEEK5, 150).adjustKcal).toBe(150)
  })
})

describe('питание: тип дня', () => {
  it('Пн/Ср/Пт — силовые, Вт/Сб — велосипед, Вс — отдых', () => {
    for (const d of [1, 3, 5] as Weekday[]) expect(dayTypeOf(d, null)).toBe('strength')
    for (const d of [2, 6] as Weekday[]) expect(dayTypeOf(d, bikeDay(1, d))).toBe('bike')
    expect(dayTypeOf(7, null)).toBe('rest')
    expect(dayTypeOf(4, bikeDay(bikeWeekFor(WEEK5), 4))).toBe('bike')
    expect(dayTypeOf(4, null)).toBe('rest')
  })
})

describe('питание: меню-ориентир', () => {
  it('ккал приёма — сумма позиций', () => {
    for (const weekday of [1, 2, 3, 4, 5, 6, 7] as Weekday[]) {
      for (const meal of dayMenu(weekday, dayTypeOf(weekday, bikeDay(bikeWeekFor(WEEK5), weekday)), 'recomp')) {
        expect(meal.kcal).toBe(meal.items.reduce((sum, i) => sum + i.kcal, 0))
      }
    }
  })

  it('сумма меню отклоняется от цели не больше чем на 5 % (все дни, оба режима)', () => {
    const bike = bikeWeekFor(WEEK5)
    const cases: { weekday: Weekday; type: DayType }[] = []
    for (const weekday of [1, 2, 3, 4, 5, 6, 7] as Weekday[]) {
      cases.push({ weekday, type: dayTypeOf(weekday, bikeDay(bike, weekday)) })
    }
    // четверг проверяем и с велосипедом, и без
    cases.push({ weekday: 4, type: 'bike' }, { weekday: 4, type: 'rest' })
    for (const { weekday, type } of cases) {
      for (const mode of MODES) {
        const target = dayTarget(type, mode, WEEK5, 0).kcal
        const total = sumKcal(dayMenu(weekday, type, mode))
        expect(Math.abs(total - target) / target, `${weekday}/${type}/${mode}: ${total} vs ${target}`).toBeLessThanOrEqual(0.05)
      }
    }
  })

  it('recomp: сила — хлеб 40 г после тренировки, гречка 75 г на ужин', () => {
    const meals = dayMenu(1, 'strength', 'recomp')
    const post = meals.find((m) => m.id === 'post')!
    expect(post.items.some((i) => /хлеб/i.test(i.food) && i.amount === '40 г')).toBe(true)
    const dinner = meals.find((m) => m.id === 'dinner')!
    expect(dinner.items.some((i) => /гречка/i.test(i.food) && i.amount === '75 г')).toBe(true)
  })

  it('recomp: вторник — перекус без хлеба', () => {
    const snack = dayMenu(2, 'bike', 'recomp').find((m) => m.id === 'snack')!
    expect(snack.items.some((i) => /хлеб/i.test(i.food))).toBe(false)
    expect(snack.items.some((i) => /мёд|мед/i.test(i.food))).toBe(false)
  })

  it('recomp: суббота — творог 150 г в 21:30', () => {
    const evening = dayMenu(6, 'bike', 'recomp').find((m) => m.id === 'evening')!
    expect(evening.time).toBe('21:30')
    expect(evening.items).toContainEqual(expect.objectContaining({ amount: '150 г' }))
    expect(evening.items[0].food).toMatch(/творог/i)
  })

  it('recomp: воскресенье — картофель 250 г и необязательный приём «при голоде»', () => {
    const meals = dayMenu(7, 'rest', 'recomp')
    const dinner = meals.find((m) => m.id === 'dinner')!
    expect(dinner.items.some((i) => /картофель/i.test(i.food) && i.amount === '250 г')).toBe(true)
    const hungry = meals.find((m) => m.id === 'hungry')
    expect(hungry?.optional).toBe(true)
  })

  it('пятница — ужин 19:00, вечерний перекус 21:45', () => {
    const meals = dayMenu(5, 'strength', 'recomp')
    expect(meals.find((m) => m.id === 'dinner')!.time).toBe('19:00')
    expect(meals.find((m) => m.id === 'evening')!.time).toBe('21:45')
  })

  it('суббота — времена приёмов 09:50 / 14:15 / 17:00 / 19:30 / 21:30', () => {
    const meals = dayMenu(6, 'bike', 'recomp')
    expect(meals.map((m) => [m.id, m.time])).toEqual([
      ['breakfast', '09:50'],
      ['lunch', '14:15'],
      ['snack', '17:00'],
      ['dinner', '19:30'],
      ['evening', '21:30'],
    ])
    expect(dayMenu(6, 'bike', 'maintenance').find((m) => m.id === 'evening')!.time).toBe('22:30')
  })

  it('предтренировочный обед силового дня одинаков в обоих режимах', () => {
    const pick = (mode: NutritionMode) => dayMenu(1, 'strength', mode).find((m) => m.id === 'lunch')!
    expect(pick('recomp')).toEqual(pick('maintenance'))
  })

  it('замены и оговорка под меню', () => {
    expect(MEAL_NOTE).toContain('замен')
    expect(SUBSTITUTIONS.breakfasts).toHaveLength(3)
    expect(SUBSTITUTIONS.protein.map((p) => p.food)).toContain('Куриная грудка')
    expect(SUBSTITUTIONS.carbs.map((c) => c.food)).toContain('Рис')
  })
})
