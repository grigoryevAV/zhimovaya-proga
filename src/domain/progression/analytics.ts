/** Аналитика по журналу: тоннаж, оценочный 1ПМ, рекорды, объём по мышцам. Только фактические значения. */
import { brzycki, e1rmFromRpe } from '../calculations/oneRm'
import { type Muscle, getExercise } from '../exercises/catalog'
import type { WorkoutExercise, WorkoutRow, WorkoutSet } from '../../storage/types'
import { setLoad } from './fromLogs'

/** Тоннаж подхода, кг. Гантели: вес одной × 2. Собственный вес и отягощения — с весом тела (если он известен). */
export function setTonnage(exerciseId: string, s: WorkoutSet, bodyweight: number | null): number {
  if (!s.done || s.actual.reps === null || s.actual.reps <= 0) return 0
  const ex = getExercise(exerciseId)
  const load = setLoad(exerciseId, s.actual.weight, bodyweight)
  if (load === null || load <= 0) return 0
  const mult = ex.loadType === 'dumbbell' ? 2 : 1
  return load * mult * s.actual.reps
}

export function exerciseTonnage(e: WorkoutExercise, bodyweight: number | null): number {
  return e.sets.reduce((sum, s) => sum + setTonnage(e.exerciseId, s, bodyweight), 0)
}

export function workoutTonnage(w: WorkoutRow): number {
  return w.exercises.reduce((sum, e) => sum + exerciseTonnage(e, w.bodyweight), 0)
}

/**
 * Оценочный 1ПМ подхода. По таблице RPE (1–10 повторений, RPE 6,5–10); подход «на максимум» без RPE
 * считается до отказа (RPE 10); 11–15 повторений до отказа — по Бжицки. Иначе — нет оценки.
 * Для гантелей — на одну гантель, для отягощений — полный вес (тело + отягощение).
 */
export function setE1rm(exerciseId: string, s: WorkoutSet, bodyweight: number | null): number | null {
  if (!s.done || s.actual.reps === null) return null
  const ex = getExercise(exerciseId)
  if (ex.loadType === 'bodyweight') return null
  const load = setLoad(exerciseId, s.actual.weight, bodyweight)
  if (load === null || load <= 0) return null
  const rpe = s.actual.rpe ?? (s.driver === 'amrap' ? 10 : null)
  if (rpe === null) return null
  if (s.actual.reps <= 10) {
    const r = e1rmFromRpe(load, s.actual.reps, rpe)
    return r.ok ? r.value : null
  }
  if (rpe === 10) {
    const r = brzycki(load, s.actual.reps)
    return r.ok ? r.value : null
  }
  return null
}

export interface ExerciseSessionStat {
  workoutId: string
  date: string
  sessionId: string
  /** Тяжёлый подход: вес (как вводился) × повторения. */
  topWeight: number | null
  topReps: number | null
  bestE1rm: number | null
  maxReps: number | null
  tonnage: number
  doneSets: number
  avgRpe: number | null
  bodyweight: number | null
}

export function exerciseHistory(workouts: WorkoutRow[], exerciseId: string): ExerciseSessionStat[] {
  const out: ExerciseSessionStat[] = []
  for (const w of workouts) {
    if (w.status !== 'done') continue
    for (const e of w.exercises) {
      if (e.exerciseId !== exerciseId) continue
      const done = e.sets.filter((s) => s.done && s.actual.reps !== null)
      if (!done.length) continue
      let top: WorkoutSet | null = null
      for (const s of done) {
        const wv = s.actual.weight ?? 0
        if (!top || wv > (top.actual.weight ?? 0) || (wv === (top.actual.weight ?? 0) && (s.actual.reps ?? 0) > (top.actual.reps ?? 0))) top = s
      }
      const e1 = done.map((s) => setE1rm(e.exerciseId, s, w.bodyweight)).filter((x): x is number => x !== null)
      const rpes = done.map((s) => s.actual.rpe).filter((x): x is number => x !== null)
      out.push({
        workoutId: w.id, date: (w.finishedAt ?? w.startedAt).slice(0, 10), sessionId: w.sessionId,
        topWeight: top?.actual.weight ?? null, topReps: top?.actual.reps ?? null,
        bestE1rm: e1.length ? Math.max(...e1) : null,
        maxReps: Math.max(...done.map((s) => s.actual.reps ?? 0)),
        tonnage: exerciseTonnage(e, w.bodyweight), doneSets: done.length,
        avgRpe: rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null,
        bodyweight: w.bodyweight,
      })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export interface PersonalRecords {
  bestE1rm: { value: number; date: string } | null
  /** Лучший вес для каждого числа повторений (как вводился: отягощение / одна гантель). */
  bestByReps: { reps: number; weight: number; date: string }[]
  maxReps: { reps: number; date: string } | null
}

export function personalRecords(workouts: WorkoutRow[], exerciseId: string): PersonalRecords {
  let bestE1rm: PersonalRecords['bestE1rm'] = null
  let maxReps: PersonalRecords['maxReps'] = null
  const byReps = new Map<number, { weight: number; date: string }>()
  for (const w of workouts) {
    if (w.status !== 'done') continue
    const date = (w.finishedAt ?? w.startedAt).slice(0, 10)
    for (const e of w.exercises) {
      if (e.exerciseId !== exerciseId) continue
      for (const s of e.sets) {
        if (!s.done || s.actual.reps === null || s.actual.reps <= 0) continue
        const e1 = setE1rm(exerciseId, s, w.bodyweight)
        if (e1 !== null && (!bestE1rm || e1 > bestE1rm.value)) bestE1rm = { value: e1, date }
        if (!maxReps || s.actual.reps > maxReps.reps) maxReps = { reps: s.actual.reps, date }
        if (s.actual.weight !== null) {
          const cur = byReps.get(s.actual.reps)
          if (!cur || s.actual.weight > cur.weight) byReps.set(s.actual.reps, { weight: s.actual.weight, date })
        }
      }
    }
  }
  const bestByReps = [...byReps.entries()].map(([reps, v]) => ({ reps, ...v })).sort((a, b) => a.reps - b.reps)
  return { bestE1rm, bestByReps, maxReps }
}

export interface MuscleVolume {
  /** Рабочие подходы по основной мышце (1) и вспомогательным (0,5). */
  sets: Partial<Record<Muscle, number>>
  /** Подходы с осевой нагрузкой на позвоночник. */
  axialSets: number
  tonnage: number
}

/** Объём выполненной тренировки по мышечным группам. */
export function muscleVolume(w: WorkoutRow): MuscleVolume {
  const sets: Partial<Record<Muscle, number>> = {}
  let axialSets = 0
  for (const e of w.exercises) {
    const ex = getExercise(e.exerciseId)
    const n = e.sets.filter((s) => s.done).length
    if (!n) continue
    sets[ex.muscle] = (sets[ex.muscle] ?? 0) + n
    for (const m of ex.secondary ?? []) sets[m] = (sets[m] ?? 0) + n * 0.5
    if (ex.axial) axialSets += n
  }
  return { sets, axialSets, tonnage: workoutTonnage(w) }
}
