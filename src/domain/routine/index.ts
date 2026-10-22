/**
 * Сборка плана дня: неделя велосипеда → велосипед → тип дня → цель → меню → шаблон.
 * Точка входа для UI (`useDayPlan`), чистые функции.
 */
import type { WeekId } from '../program/definition'
import { type BikeDay, type BikeWeek, type Weekday, bikeDay, bikeWeekFor } from './bike'
import {
  type DayTarget,
  type DayType,
  type Meal,
  type NutritionMode,
  dayMenu,
  dayTarget,
  dayTypeOf,
} from './nutrition'
import { type RoutineItem, type StrengthDay, dayRoutine } from './template'

export interface DayPlan {
  weekday: Weekday
  dayType: DayType
  items: RoutineItem[]
  target: DayTarget
  menu: Meal[]
  bike: BikeDay | null
  bikeWeek: BikeWeek
}

export interface PlanDayOptions {
  programWeek: WeekId | 'done'
  strengthByDay: Partial<Record<1 | 2 | 3, string[]>>
  mode: NutritionMode
  adjustKcal: number
}

export function planDay(weekday: Weekday, opts: PlanDayOptions): DayPlan {
  const bikeWeek = bikeWeekFor(opts.programWeek)
  const bike = bikeDay(bikeWeek, weekday)
  const dayType = dayTypeOf(weekday, bike)
  const target = dayTarget(dayType, opts.mode, opts.programWeek, opts.adjustKcal)
  const menu = dayMenu(weekday, dayType, target.mode)
  const strengthNumber = weekday === 1 ? 1 : weekday === 3 ? 2 : weekday === 5 ? 3 : null
  const strength: StrengthDay | null =
    strengthNumber === null ? null : { day: strengthNumber, exercises: opts.strengthByDay[strengthNumber] ?? [] }
  return {
    weekday,
    dayType,
    items: dayRoutine(weekday, { bike, strength, meals: menu }),
    target,
    menu,
    bike,
    bikeWeek,
  }
}

/** `Date.getDay()`: 0 (воскресенье) → 7. */
export function weekdayOf(date: Date): Weekday {
  const day = date.getDay()
  return (day === 0 ? 7 : day) as Weekday
}

export type { BikeDay, BikeWeek, Weekday } from './bike'
export type { DayTarget, DayType, Meal, MealId, NutritionMode } from './nutrition'
export type { RoutineItem, RoutineKind, StrengthDay } from './template'
