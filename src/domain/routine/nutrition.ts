/**
 * Питание-ориентир: цель дня и меню-пример из `nedelnyy-grafik.md`
 * (разделы 1, 2, 6, 7, 9) с recomp-правками спецификации 3.3.
 * Чистые функции, без React и хранилища.
 */
import type { WeekId } from '../program/definition'
import type { BikeDay, Weekday } from './bike'

export type DayType = 'strength' | 'bike' | 'rest'
export type NutritionMode = 'recomp' | 'maintenance'
export type MealId = 'breakfast' | 'lunch' | 'post' | 'snack' | 'dinner' | 'evening' | 'hungry'

export interface MealItem {
  food: string
  amount: string
  kcal: number
}

export interface Meal {
  id: MealId
  time: string
  title: string
  items: MealItem[]
  kcal: number
  optional?: boolean
  note?: string
}

export interface DayTarget {
  kcal: number
  protein: number
  fat: number
  carbs: number
  mode: NutritionMode
  /** Поддержание включилось само (недели 4/8/12 программы). */
  autoMaintenance: boolean
  adjustKcal: number
}

const BASE_KCAL: Record<NutritionMode, Record<DayType, number>> = {
  recomp: { strength: 2700, bike: 2450, rest: 2200 },
  maintenance: { strength: 2870, bike: 2740, rest: 2480 },
}

/** Границы поправки: rest-цель поддержания ±500 ккал. */
const MIN_KCAL = 1980
const MAX_KCAL = 2980

export function dayTypeOf(weekday: Weekday, bike: BikeDay | null): DayType {
  if (weekday === 1 || weekday === 3 || weekday === 5) return 'strength'
  return bike ? 'bike' : 'rest'
}

export function dayTarget(
  type: DayType,
  mode: NutritionMode,
  programWeek: WeekId | 'done',
  adjustKcal: number,
): DayTarget {
  const autoMaintenance = programWeek === 4 || programWeek === 8 || programWeek === 12
  const effectiveMode: NutritionMode = autoMaintenance ? 'maintenance' : mode
  const kcal = Math.min(MAX_KCAL, Math.max(MIN_KCAL, BASE_KCAL[effectiveMode][type] + adjustKcal))
  const protein = type === 'rest' ? 185 : 190
  const fat = 72
  return {
    kcal,
    protein,
    fat,
    carbs: Math.round((kcal - 4 * protein - 9 * fat) / 4),
    mode: effectiveMode,
    autoMaintenance,
    adjustKcal,
  }
}

const item = (food: string, amount: string, kcal: number): MealItem => ({ food, amount, kcal })

const EGGS = () => item('Яйца целиком, с желтками, C1', '4 шт (~240 г)', 310)
const BANANA = () => item('Банан', '1 шт (~120 г без кожуры)', 105)
const BREAD = (amount: string, kcal: number) => item('Хлеб цельнозерновой', amount, kcal)
const CHICKEN = () => item('Куриная грудка или индейка', '180 г сырого веса', 200)
const RICE = (amount: string, kcal: number) => item('Рис (сухой вес)', amount, kcal)
const VEG = (amount: string) => item('Овощи', amount, 50)
const OIL = (amount: string, kcal: number) => item('Оливковое масло', amount, kcal)
const PROTEIN = (amount: string, kcal: number) => item('Сывороточный протеин', amount, kcal)
const BEEF = () => item('Говядина постная / лосось / курица', '200 г сырого', 340)
const BUCKWHEAT = (amount: string, kcal: number) => item('Гречка (сухой вес)', amount, kcal)
const COTTAGE = (amount: string, kcal: number) => item('Творог 5%', amount, kcal)

function breakfast(weekday: Weekday): MealItem[] {
  if (weekday === 7) return [EGGS(), BREAD('60 г', 150), BANANA()]
  return [EGGS(), BREAD('80 г (2 куска)', 200), BANANA(), item('Мёд или джем', '15 г', 45)]
}

function lunch(weekday: Weekday): MealItem[] {
  if (weekday === 7) return [CHICKEN(), RICE('90 г', 310), VEG('200 г'), OIL('5 г', 45)]
  return [CHICKEN(), RICE('110 г', 380), VEG('200 г'), OIL('5 г', 45), item('Хлеб', '40 г', 100)]
}

function postWorkout(mode: NutritionMode): MealItem[] {
  // recomp: хлеб 60 → 40 г, варенье 30 → 20 г; proтеин и банан не трогаем
  return mode === 'recomp'
    ? [PROTEIN('40 г порошка', 150), BANANA(), BREAD('40 г', 100), item('Варенье или мёд', '20 г', 50)]
    : [PROTEIN('40 г порошка', 150), BANANA(), BREAD('60 г', 150), item('Варенье или мёд', '30 г', 75)]
}

function bikeSnack(mode: NutritionMode): MealItem[] {
  // recomp: без хлеба и мёда
  return mode === 'recomp'
    ? [PROTEIN('30 г', 115), BANANA()]
    : [PROTEIN('30 г', 115), BANANA(), item('Хлеб с мёдом', '40 г', 100)]
}

function dinner(day: DayType, mode: NutritionMode): MealItem[] {
  if (mode === 'maintenance') return [BEEF(), BUCKWHEAT('90 г', 306), VEG('250 г'), OIL('10 г', 90)]
  if (day === 'bike') return [BEEF(), BUCKWHEAT('50 г', 170), VEG('250 г'), OIL('5 г', 45)]
  return [BEEF(), BUCKWHEAT('75 г', 255), VEG('250 г'), OIL('10 г', 90)]
}

function sundayDinner(mode: NutritionMode): MealItem[] {
  const potato = mode === 'recomp' ? item('Картофель', '250 г', 193) : item('Картофель', '350 г', 270)
  return [item('Рыба или мясо', '200 г', 340), potato, VEG('200 г'), OIL('10 г', 90)]
}

function sundaySnack(mode: NutritionMode): MealItem[] {
  const nuts = mode === 'recomp' ? item('Орехи', '10 г', 65) : item('Орехи', '20 г', 130)
  const items = [COTTAGE('200 г', 210), nuts]
  if (mode === 'maintenance') items.push(BREAD('40 г', 100))
  return items
}

const mealOf = (
  id: MealId,
  time: string,
  title: string,
  items: MealItem[],
  extra: { optional?: boolean; note?: string } = {},
): Meal => ({ id, time, title, items, kcal: items.reduce((sum, i) => sum + i.kcal, 0), ...extra })

/**
 * Меню-ориентир дня. `weekday` нужен, чтобы различить воскресный отдых и четверг
 * без велосипеда (там меню велодня без перекуса 16:50).
 */
export function dayMenu(weekday: Weekday, type: DayType, mode: NutritionMode): Meal[] {
  const meals: Meal[] = [mealOf('breakfast', '09:50', 'Завтрак', breakfast(weekday))]

  if (weekday === 7) {
    meals.push(mealOf('lunch', '13:30', 'Обед', lunch(weekday)))
    meals.push(mealOf('snack', '17:30', 'Перекус', sundaySnack(mode)))
    meals.push(mealOf('dinner', '19:30', 'Ужин', sundayDinner(mode)))
    meals.push(mealOf('hungry', '21:00', 'При голоде', [item('Кефир', '300 мл', 150)], { optional: true }))
    return meals
  }

  const lunchTime = weekday === 6 ? '14:15' : weekday === 2 || weekday === 4 ? '13:00' : '13:05'
  const lunchTitle = type === 'strength' ? 'Обед — предтренировочный' : 'Обед'
  meals.push(mealOf('lunch', lunchTime, lunchTitle, lunch(weekday)))

  if (type === 'strength') {
    meals.push(mealOf('post', '17:20', 'После тренировки', postWorkout(mode)))
  } else if (type === 'bike') {
    meals.push(mealOf('snack', weekday === 6 ? '17:00' : '16:50', 'Перекус после велосипеда', bikeSnack(mode)))
  }
  // четверг без велосипеда: меню велодня без перекуса 16:50

  if (weekday === 5) {
    meals.push(mealOf('dinner', '19:00', 'Ужин', dinner(type, mode)))
    meals.push(mealOf('evening', '21:45', 'Вечерний перекус', [COTTAGE('150 г', 160)]))
  } else if (weekday === 6) {
    meals.push(mealOf('dinner', '19:30', 'Ужин', dinner('bike', mode)))
    meals.push(
      mode === 'recomp'
        ? mealOf('evening', '21:30', 'Вечерний перекус', [COTTAGE('150 г', 160)])
        : mealOf('evening', '22:30', 'Вечерний перекус', [COTTAGE('200 г', 210)]),
    )
  } else {
    meals.push(mealOf('dinner', '19:45', 'Ужин', dinner(type === 'strength' ? 'strength' : 'bike', mode)))
    meals.push(
      type === 'bike'
        ? mealOf('evening', '22:15', 'Вечерний перекус', [COTTAGE('200 г', 210)])
        : mealOf('evening', '22:15', 'Вечерний перекус', [COTTAGE('150 г', 160)]),
    )
  }
  return meals
}

/** Замены из раздела 9 графика. */
export const SUBSTITUTIONS: {
  protein: { food: string; kcal: number; protein: number; fat: number }[]
  carbs: { food: string; kcal: number; carbs: number }[]
  breakfasts: string[]
} = {
  protein: [
    { food: 'Куриная грудка', kcal: 110, protein: 23, fat: 2 },
    { food: 'Индейка (филе бедра)', kcal: 130, protein: 20, fat: 5 },
    { food: 'Говядина постная', kcal: 170, protein: 21, fat: 9 },
    { food: 'Свиная вырезка', kcal: 145, protein: 22, fat: 6 },
    { food: 'Лосось', kcal: 200, protein: 20, fat: 13 },
    { food: 'Треска / минтай', kcal: 80, protein: 18, fat: 1 },
    { food: 'Творог 5%', kcal: 105, protein: 17, fat: 5 },
    { food: 'Яйцо (1 шт целиком)', kcal: 78, protein: 6.3, fat: 5.3 },
  ],
  carbs: [
    { food: 'Рис', kcal: 345, carbs: 77 },
    { food: 'Гречка', kcal: 340, carbs: 68 },
    { food: 'Макароны', kcal: 350, carbs: 71 },
    { food: 'Картофель (сырой, не сухой)', kcal: 77, carbs: 17 },
    { food: 'Хлеб цельнозерновой', kcal: 250, carbs: 45 },
  ],
  breakfasts: [
    '4 яйца целиком + 80 г хлеба + банан + 15 г мёда',
    '250 г творога 5% + банан + 30 г мёда/варенья + 25 г орехов + 40 г хлеба',
    'Вчерашняя курица/мясо 150 г + рис 70 г сухого + 2 яйца',
  ],
}

export const MEAL_NOTE = 'Ориентир: белок и гарнир можно менять на любой из списка замен'
