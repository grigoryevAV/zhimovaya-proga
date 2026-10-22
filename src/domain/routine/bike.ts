/**
 * Велосипед: прогрессия 8 недель из `nedelnyy-grafik.md`, раздел 8.
 * Чистые функции, без React и хранилища.
 */
import type { WeekId } from '../program/definition'

/** 1 = понедельник … 7 = воскресенье. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type BikeWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export interface BikeDay {
  minutes: number
  /** Готовая строка для интерфейса: «Z2 40 мин» или «Z2 55 мин + 4×2 мин Z3 (отдых 3 мин)». */
  label: string
}

/** Вторник, четверг, суббота: минуты Z2 и подпись. */
const TUE: Record<BikeWeek, number> = { 1: 35, 2: 40, 3: 40, 4: 35, 5: 45, 6: 45, 7: 50, 8: 35 }
const THU: Partial<Record<BikeWeek, number>> = { 3: 25, 5: 30, 6: 30, 7: 30 }
const SAT_MINUTES: Record<BikeWeek, number> = { 1: 45, 2: 55, 3: 60, 4: 50, 5: 72, 6: 82, 7: 88, 8: 40 }

const SAT_INTERVALS: Partial<Record<BikeWeek, string>> = {
  5: '4×2 мин Z3 (отдых 3 мин)',
  6: '5×3 мин Z3 (отдых 3 мин)',
  7: '6×3 мин Z3 (отдых 2,5 мин)',
}

/**
 * Неделя велосипеда по неделе программы силовых: П1/П2/Тест — 1; 1–8 — как есть;
 * после 8-й — откат на уровень 3/5/6/8; программа пройдена — 3 (старт нового цикла).
 */
export function bikeWeekFor(programWeek: WeekId | 'done'): BikeWeek {
  if (programWeek === 'P1' || programWeek === 'P2' || programWeek === 'T') return 1
  if (programWeek === 'done') return 3
  if (programWeek >= 1 && programWeek <= 8) return programWeek as BikeWeek
  switch (programWeek) {
    case 9: return 3
    case 10: return 5
    case 11: return 6
    default: return 8 // 12
  }
}

/** Велосипед только по вторникам, четвергам и субботам. */
export function bikeDay(week: BikeWeek, weekday: Weekday): BikeDay | null {
  if (weekday === 2) return { minutes: TUE[week], label: `Z2 ${TUE[week]} мин` }
  const thu = THU[week]
  if (weekday === 4) return thu === undefined ? null : { minutes: thu, label: `Z2 ${thu} мин` }
  if (weekday === 6) {
    const extra = SAT_INTERVALS[week]
    return {
      minutes: SAT_MINUTES[week],
      label: extra ? `Z2 55 мин + ${extra}` : `Z2 ${SAT_MINUTES[week]} мин`,
    }
  }
  return null
}
