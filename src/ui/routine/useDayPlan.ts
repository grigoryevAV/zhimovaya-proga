/** План дня для экрана «Сегодня»: неделя программы из активной/следующей тренировки. */
import { useMemo } from 'react'
import type { WeekId } from '../../domain/program/definition'
import { type DayPlan, planDay, weekdayOf } from '../../domain/routine'
import { type AppData, useData } from '../data'

/** Текущая неделя программы: активная, иначе следующая, иначе программа пройдена. */
export function programWeekOf(d: AppData): WeekId | 'done' {
  return d.active?.week ?? d.next?.week ?? 'done'
}

/** Названия упражнений по дням 1–3; для подготовки, теста и пройденной программы — пусто. */
export function strengthNamesOf(d: AppData, programWeek: WeekId | 'done'): Partial<Record<1 | 2 | 3, string[]>> {
  const out: Partial<Record<1 | 2 | 3, string[]>> = {}
  if (typeof programWeek !== 'number') return out
  for (const day of [1, 2, 3] as const) {
    out[day] = d.engine.session(programWeek, day).exercises.map((e) => e.exercise.name)
  }
  return out
}

export function useDayPlan(date: Date): DayPlan {
  const d = useData()
  return useMemo(() => {
    const programWeek = programWeekOf(d)
    return planDay(weekdayOf(date), {
      programWeek,
      strengthByDay: strengthNamesOf(d, programWeek),
      mode: d.profile.nutritionMode ?? 'recomp',
      adjustKcal: d.profile.nutritionAdjustKcal ?? 0,
    })
  }, [d, date])
}
