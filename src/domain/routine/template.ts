/**
 * Шаблон недели по `nedelnyy-grafik.md` (разделы 1–7) и правкам спецификации 3.1.
 * Строки еды приходят из меню (`ctx.meals`), остальные — из графика.
 * Чистые функции, без React и хранилища.
 */
import type { BikeDay, Weekday } from './bike'
import type { Meal, MealId } from './nutrition'

export type RoutineKind = 'work' | 'food' | 'strength' | 'bike' | 'family' | 'rest' | 'sleep' | 'personal'

export interface RoutineItem {
  /** 'HH:MM' */
  start: string
  end?: string
  title: string
  detail?: string
  kind: RoutineKind
  meal?: MealId
}

export interface StrengthDay {
  day: 1 | 2 | 3
  exercises: string[]
}

/** 'HH:MM' → минуты от полуночи дня расписания; часы < 9 относятся к следующему календарному дню (+1440). */
export function minutesOf(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number)
  const total = hours * 60 + (minutes || 0)
  return hours < 9 ? total + 1440 : total
}

function timeOf(minutes: number): string {
  const rest = minutes % 1440
  const h = Math.floor(rest / 60)
  const m = rest % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const row = (
  start: string,
  end: string | undefined,
  title: string,
  kind: RoutineKind,
  detail?: string,
): RoutineItem => ({ start, end, title, kind, ...(detail ? { detail } : {}) })

const WAKE = () => row('09:30', undefined, 'Подъём', 'rest', '500 мл воды + щепотка соли. Дневной свет 5–10 мин')
const WALK = () => row('09:35', '09:50', 'Утренняя прогулка', 'rest', 'Спокойный темп, 15 минут')

/** Общий вечер понедельника/вторника/четверга. */
function commonEvening(items: RoutineItem[]): RoutineItem[] {
  items.push(
    row('17:45', '17:50', 'Сборы', 'work'),
    row('17:50', '18:00', 'Выход за ребёнком', 'family'),
    row('18:00', '19:00', 'Площадка', 'family'),
    row('19:00', '19:15', 'Дорога домой', 'work'),
    row('19:15', '19:45', 'Домашние дела', 'rest'),
    row('20:25', '22:15', 'Работа / семья', 'work'),
  )
  return items
}

function commonNight(items: RoutineItem[]): RoutineItem[] {
  items.push(
    row('22:30', '23:30', 'Свободное время', 'rest'),
    row('23:30', '00:30', 'Приглушить свет, экраны тусклее, никаких рабочих задач', 'rest'),
    row('00:30', '01:00', 'Подготовка ко сну', 'rest'),
    row('01:00', undefined, 'Сон', 'sleep'),
  )
  return items
}

function strengthRow(day: 1 | 2 | 3, ctx: { strength: StrengthDay | null }): RoutineItem {
  const parts: string[] = []
  const exercises = ctx.strength?.exercises ?? []
  if (exercises.length) parts.push(exercises.join(' · '))
  if (day === 2) parts.push('Становая — центральное упражнение недели')
  if (day === 3) parts.push('Если не влезает в 90 минут — режь последнее упражнение')
  return row('15:15', '16:45', `Силовая, день ${day}`, 'strength', parts.length ? parts.join(' · ') : undefined)
}

/** Пн/Ср/Пт: расписание понедельника; в пятницу — свободный вечер вместо ребёнка и площадки. */
function strengthDay(day: 1 | 2 | 3, ctx: { strength: StrengthDay | null }, friday: boolean): RoutineItem[] {
  const items: RoutineItem[] = [
    WAKE(),
    WALK(),
    row('10:25', '11:15', 'Работа, блок 1', 'work'),
    row('11:15', '11:25', 'Перерыв: встать, пройтись, плечи/грудной отдел', 'rest'),
    row('11:25', '12:15', 'Работа, блок 2', 'work'),
    row('12:15', '12:25', 'Перерыв', 'rest'),
    row('12:25', '13:05', 'Работа, блок 3', 'work'),
    row('13:40', '14:40', 'Работа, блок 4 — только лёгкие задачи, без тяжёлого мышления', 'work'),
    row('14:40', '14:55', 'Сборы, дорога в зал', 'work'),
    row('15:00', '15:15', 'Разминка', 'rest'),
    strengthRow(day, ctx),
    row('16:45', '17:00', 'Дорога домой', 'work'),
    row('17:00', '17:20', 'Душ, переодевание', 'rest'),
  ]
  if (friday) {
    items.push(row('17:45', '19:00', 'Свободно: семья, отдых', 'family'))
    items.push(row('19:40', '21:45', 'Работа / семья', 'work'))
  } else {
    commonEvening(items)
  }
  return commonNight(items)
}

/** Вт/Чт: велосипед по таблице недели; в четверг без велосипеда на его месте работа. */
function bikeOrWorkDay(ctx: { bike: BikeDay | null; meals: Meal[] }): RoutineItem[] {
  const items: RoutineItem[] = [
    WAKE(),
    WALK(),
    row('10:25', '11:15', 'Работа, блок 1', 'work'),
    row('11:15', '11:25', 'Перерыв', 'rest'),
    row('11:25', '12:15', 'Работа, блок 2', 'work'),
    row('12:15', '12:25', 'Перерыв', 'rest'),
    row('12:25', '13:00', 'Работа, блок 3', 'work'),
    row('13:35', '15:20', 'Работа, блок 4 (с перерывом 14:20–14:30)', 'work'),
  ]
  const bike = ctx.bike
  const hasSnack = ctx.meals.some((m) => m.id === 'snack')
  if (bike) {
    const startMinutes = minutesOf('15:30')
    const endMinutes = startMinutes + bike.minutes
    items.push(
      row('15:20', '15:30', 'Переодевание, бутылка воды, включить вентилятор', 'bike'),
      row('15:30', timeOf(endMinutes), 'Велосипед', 'bike', `${bike.label} · разговорный темп, вентилятор`),
      row(timeOf(endMinutes), timeOf(endMinutes + 20), 'Душ', 'rest'),
    )
    const workStart = timeOf(endMinutes + 20)
    if (hasSnack && minutesOf(workStart) < minutesOf('16:50')) {
      items.push(row(workStart, '16:50', 'Работа, блок 5', 'work'))
      items.push(row('17:00', '17:45', 'Работа, блок 5', 'work'))
    } else {
      items.push(row(workStart, '17:45', 'Работа, блок 5', 'work'))
    }
  } else {
    // четверг без велосипеда: «велосипедное» окно отдаётся работе
    items.push(
      row('15:20', '15:30', 'Перерыв', 'rest'),
      row('15:30', '16:20', 'Работа', 'work'),
      row('16:20', '17:45', 'Работа, блок 5', 'work'),
    )
  }
  commonEvening(items)
  return commonNight(items)
}

/** Сб: главная велотренировка, поздний завтрак, «Личное время» 23:30–01:00. */
function saturday(ctx: { bike: BikeDay | null }): RoutineItem[] {
  const items: RoutineItem[] = [
    WAKE(),
    WALK(),
    row('10:20', '12:00', 'Семья, свободное время, бытовые дела', 'family'),
    row('12:00', '12:20', 'Подготовка: 300–400 мл воды, вентилятор, бутылка', 'rest'),
  ]
  const bike = ctx.bike
  if (bike) {
    const startMinutes = minutesOf('12:20')
    const endMinutes = startMinutes + bike.minutes
    items.push(
      row('12:20', timeOf(endMinutes), 'Велосипед', 'bike', `${bike.label} · вентилятор, вода`),
      row(timeOf(endMinutes), timeOf(endMinutes + 25), 'Душ', 'rest'),
    )
  }
  items.push(
    row('15:00', '17:00', 'Семейное время, прогулка 40–60 мин в спокойном темпе', 'family'),
    row('17:30', '18:00', 'Семейное время', 'family'),
    row('18:00', '19:30', 'Свободно', 'rest'),
    row('23:30', '01:00', 'Личное время', 'personal'),
    row('01:00', undefined, 'Сон', 'sleep'),
  )
  return items
}

/** Вс: полный отдых, прогулка с семьёй, замеры вечером. */
function sunday(): RoutineItem[] {
  return [
    WAKE(),
    WALK(),
    row('10:30', '13:30', 'Свободное время, семья', 'family'),
    row('14:15', '16:00', 'Свободное время', 'rest'),
    row('16:00', '17:30', 'Прогулка с семьёй 60–90 мин, спокойный темп', 'family'),
    row('18:30', '19:30', 'Домашние дела', 'rest'),
    row('20:15', '21:00', 'Замеры и запись в дневник', 'rest'),
    row('21:00', '23:30', 'Вечер', 'rest'),
    row('23:30', '00:30', 'Приглушить свет, экраны тусклее, никаких рабочих задач', 'rest'),
    row('00:30', '01:00', 'Подготовка ко сну', 'rest'),
    row('01:00', undefined, 'Сон', 'sleep'),
  ]
}

const mealRow = (meal: Meal): RoutineItem => ({
  start: meal.time,
  title: meal.title,
  detail: `${meal.kcal} ккал`,
  kind: 'food',
  meal: meal.id,
})

/** Полный шаблон дня: строки графика + строки еды из меню, по возрастанию времени. */
export function dayRoutine(weekday: Weekday, ctx: { bike: BikeDay | null; strength: StrengthDay | null; meals: Meal[] }): RoutineItem[] {
  const base =
    weekday === 1 ? strengthDay(1, ctx, false)
    : weekday === 2 || weekday === 4 ? bikeOrWorkDay(ctx)
    : weekday === 3 ? strengthDay(2, ctx, false)
    : weekday === 5 ? strengthDay(3, ctx, true)
    : weekday === 6 ? saturday(ctx)
    : sunday()
  // «При голоде» — не точка расписания, её показывает только меню: в ленте дня она пересекалась бы с «Вечером».
  return [...base, ...ctx.meals.filter((meal) => !meal.optional).map(mealRow)].sort((a, b) => minutesOf(a.start) - minutesOf(b.start))
}

function locate(items: RoutineItem[], minutes: number): number {
  for (let i = 0; i < items.length; i++) {
    const start = minutesOf(items[i].start)
    const endText = items[i].end
    const end = endText !== undefined
      ? minutesOf(endText)
      : i + 1 < items.length
        ? minutesOf(items[i + 1].start)
        : start
    if (minutes >= start && minutes < end) return i
  }
  return -1
}

/**
 * Текущая и следующая строка. После полуночи (00:xx) расписание ещё принадлежит
 * предыдущему дню, поэтому при промахе ищем в `prevItems` со сдвигом +1440.
 */
export function nowNext(
  items: RoutineItem[],
  prevItems: RoutineItem[],
  minutesNow: number,
): { now: RoutineItem | null; next: RoutineItem | null } {
  let list = items
  let index = locate(items, minutesNow)
  const wake = items.length ? minutesOf(items[0].start) : 9 * 60 + 30
  if (index < 0 && minutesNow < wake) {
    const prevIndex = locate(prevItems, minutesNow + 1440)
    if (prevIndex >= 0) {
      list = prevItems
      index = prevIndex
    } else {
      // между отбоем (01:00) и подъёмом идёт сон предыдущего дня; «далее» — подъём
      const sleep = prevItems.find((i) => i.kind === 'sleep')
      if (sleep) return { now: sleep, next: items[0] ?? null }
    }
  }
  if (index < 0) {
    return { now: null, next: items.find((i) => minutesOf(i.start) > minutesNow) ?? null }
  }
  return { now: list[index], next: list[index + 1] ?? null }
}
