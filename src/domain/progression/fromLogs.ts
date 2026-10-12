/**
 * Связка журнала и движка: из записанных тренировок берутся опорные значения (RPE, повторения AMRAP),
 * из профиля — выбор упражнений и шаги. Сами записи журнала здесь не меняются.
 */
import { getExercise } from '../exercises/catalog'
import type { SlotId } from '../program/definition'
import { type DriverLog, type GroupOverride, type PlanInput, type TestEntry, groupKey } from '../program/engine'
import type { BodyweightRow, OverrideRow, ProfileRow, TestRow, WorkoutRow } from '../../storage/types'

/** Вес тела на дату (последняя запись не позже даты); без даты — последняя запись. */
export function bodyweightAt(rows: BodyweightRow[], date?: string): number | null {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  let found: number | null = null
  for (const r of sorted) {
    if (date && r.date > date) break
    found = r.kg
  }
  return found
}

/**
 * Опорные подходы: для каждой группы — первый выполненный подход, где записан RPE
 * (или повторения для AMRAP). Учитываются и незавершённые тренировки, чтобы
 * подсобные подходы пересчитывались сразу после оценки тяжёлого.
 */
export function driversFromWorkouts(workouts: WorkoutRow[]): Record<string, DriverLog> {
  const out: Record<string, DriverLog> = {}
  const ordered = [...workouts].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  for (const w of ordered) {
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        if (!s.done || !s.driver) continue
        const key = groupKey(w.week, ex.slotId, s.groupId)
        if (out[key]) continue
        const hasValue = s.driver === 'amrap' ? s.actual.reps !== null : s.actual.rpe !== null
        if (!hasValue) continue
        out[key] = {
          exerciseId: ex.exerciseId,
          weight: s.actual.weight,
          reps: s.actual.reps,
          rpe: s.actual.rpe,
          bodyweight: w.bodyweight,
        }
      }
    }
  }
  return out
}

export function testsToEntries(tests: TestRow[]): Partial<Record<SlotId, TestEntry>> {
  const out: Partial<Record<SlotId, TestEntry>> = {}
  for (const t of tests) {
    out[t.slotId] = { exerciseId: t.exerciseId, weight: t.weight, reps: t.reps, rpe: t.rpe ?? 10, date: t.date, bodyweight: t.bodyweight }
  }
  return out
}

export function overridesToMap(rows: OverrideRow[]): Record<string, GroupOverride> {
  return Object.fromEntries(rows.map((r) => [r.key, { weight: r.weight, sets: r.sets, reps: r.reps }]))
}

export function buildPlanInput(args: {
  profile: ProfileRow
  tests: TestRow[]
  bodyweights: BodyweightRow[]
  workouts: WorkoutRow[]
  overrides: OverrideRow[]
}): PlanInput {
  return {
    choices: args.profile.choices,
    steps: args.profile.steps,
    schemeRows: args.profile.schemeRows,
    tests: testsToEntries(args.tests),
    bodyweight: bodyweightAt(args.bodyweights),
    drivers: driversFromWorkouts(args.workouts),
    overrides: overridesToMap(args.overrides),
  }
}

/** Полный перемещаемый вес подхода (для тоннажа и 1ПМ): отягощение + вес тела; гантели — одна гантель. */
export function setLoad(exerciseId: string, weight: number | null, bodyweight: number | null): number | null {
  const ex = getExercise(exerciseId)
  switch (ex.loadType) {
    case 'bodyweight':
      return bodyweight
    case 'weighted_bodyweight':
      return bodyweight === null ? null : bodyweight + (weight ?? 0)
    default:
      return weight
  }
}
