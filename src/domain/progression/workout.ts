/** Создание и обновление записи тренировки из плана. Чистые функции: на вход старая запись, на выход новая. */
import { getExercise } from '../exercises/catalog'
import { fmtKg, loadText, repsText } from '../format'
import { getSlot } from '../program/definition'
import { ALGORITHM_VERSION, type PlannedExercise, type PlannedGroup, type PlannedSession } from '../program/engine'
import type { PlannedReps, TestRow, WorkoutExercise, WorkoutRow, WorkoutSet } from '../../storage/types'

/** Плановое значение в тех единицах, в которых его вводит пользователь. */
export function plannedOf(g: PlannedGroup): WorkoutSet['planned'] {
  let weight: number | null = null
  const l = g.load
  if (l.kind === 'weight' && l.value.ok) weight = l.value.value
  if (l.kind === 'weighted_bw' && l.added.ok) weight = l.added.value
  let reps: PlannedReps = null
  if (g.reps.kind === 'fixed') reps = g.reps.value
  else if (g.reps.kind === 'amrap') reps = 'amrap'
  else if (g.reps.kind === 'toFailure') reps = 'toFailure'
  const issue = (l.kind === 'weight' && !l.value.ok && l.value.issue.message)
    || (l.kind === 'weighted_bw' && !l.added.ok && l.added.issue.message)
    || (g.reps.kind === 'issue' && g.reps.issue.message)
  const text = issue ? `нет расчёта: ${issue}` : `${loadText(l)} × ${repsText(g.reps)}`
  return { weight, reps, text }
}

function setsFromGroup(g: PlannedGroup): WorkoutSet[] {
  const planned = plannedOf(g)
  return Array.from({ length: g.sets }, (_, i) => ({
    groupId: g.groupId,
    groupLabel: g.label,
    index: i + 1,
    driver: i === 0 ? g.driver : null,
    planned,
    actual: { weight: null, reps: null, rpe: null },
    done: false,
  }))
}

export function exerciseFromPlan(p: PlannedExercise): WorkoutExercise {
  return {
    slotId: p.slotId,
    exerciseId: p.exerciseId,
    exerciseName: p.exercise.name,
    originalName: p.exercise.replaces?.name,
    loadType: p.exercise.loadType,
    step: p.step,
    note: '',
    sets: p.groups.flatMap(setsFromGroup),
  }
}

export function newWorkout(session: PlannedSession, bodyweight: number | null, nowIso: string, id: string): WorkoutRow {
  return {
    id,
    sessionId: session.id,
    week: session.week,
    day: session.day,
    status: 'active',
    startedAt: nowIso,
    algorithmVersion: ALGORITHM_VERSION,
    bodyweight,
    note: '',
    exercises: session.exercises.map(exerciseFromPlan),
  }
}

/**
 * Обновить плановые значения активной тренировки по свежему плану (например, после ввода RPE
 * тяжёлого подхода — пересчитать подсобные). Фактические значения и отметки не трогаются.
 * Упражнение, у которого ещё нет выполненных подходов, заменяется, если в программе выбрано другое.
 */
export function refreshActiveWorkout(w: WorkoutRow, session: PlannedSession): WorkoutRow {
  if (w.status !== 'active') return w
  const exercises: WorkoutExercise[] = []
  for (const p of session.exercises) {
    const cur = w.exercises.find((e) => e.slotId === p.slotId)
    if (!cur || (cur.exerciseId !== p.exerciseId && !cur.sets.some((s) => s.done))) {
      exercises.push(exerciseFromPlan(p))
      continue
    }
    if (cur.exerciseId !== p.exerciseId) {
      exercises.push(cur)
      continue
    }
    const sets: WorkoutSet[] = []
    for (const g of p.groups) {
      const planned = plannedOf(g)
      const existing = cur.sets.filter((s) => s.groupId === g.groupId && !s.extra)
      for (let i = 0; i < Math.max(g.sets, existing.length); i++) {
        const ex = existing[i]
        if (ex) sets.push({ ...ex, planned: i < g.sets ? planned : ex.planned, groupLabel: g.label, driver: i === 0 ? g.driver : null })
        else sets.push({ groupId: g.groupId, groupLabel: g.label, index: i + 1, driver: i === 0 ? g.driver : null, planned, actual: { weight: null, reps: null, rpe: null }, done: false })
      }
      sets.push(...cur.sets.filter((s) => s.groupId === g.groupId && s.extra))
    }
    // невыполненные подходы исчезнувших групп убираем, выполненные сохраняем
    sets.push(...cur.sets.filter((s) => !p.groups.some((g) => g.groupId === s.groupId) && s.done))
    exercises.push({ ...cur, step: p.step, sets })
  }
  // упражнения, убранные из плана (например, слот «+» очищен), остаются, только если в них что-то сделано
  for (const e of w.exercises) {
    if (!session.exercises.some((p) => p.slotId === e.slotId) && e.sets.some((s) => s.done)) exercises.push(e)
  }
  return { ...w, exercises }
}

/** Результаты теста из тренировки тестовой недели (подход «до отказа»). */
export function testsFromWorkout(w: WorkoutRow): TestRow[] {
  if (w.week !== 'T') return []
  const out: TestRow[] = []
  for (const e of w.exercises) {
    const s = e.sets.find((x) => x.groupId === 'test' && x.done && x.actual.reps !== null)
    if (!s) continue
    const ex = getExercise(e.exerciseId)
    if (ex.loadType !== 'bodyweight' && ex.loadType !== 'weighted_bodyweight' && (s.actual.weight === null || s.actual.weight <= 0)) continue
    out.push({
      slotId: e.slotId,
      exerciseId: e.exerciseId,
      weight: ex.loadType === 'bodyweight' ? null : (s.actual.weight ?? 0),
      reps: s.actual.reps,
      rpe: s.actual.rpe ?? 10,
      date: (w.finishedAt ?? w.startedAt).slice(0, 10),
      bodyweight: w.bodyweight,
    })
  }
  return out
}

/** Подсказка «прошлый раз»: последний выполненный подход того же упражнения в той же группе (или любой). */
export function lastResult(workouts: WorkoutRow[], exerciseId: string, groupId: string, excludeWorkoutId?: string): { weight: number | null; reps: number | null; rpe: number | null; date: string } | null {
  const done = workouts
    .filter((w) => w.id !== excludeWorkoutId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  for (const sameGroup of [true, false]) {
    for (const w of done) {
      for (const e of w.exercises) {
        if (e.exerciseId !== exerciseId) continue
        const s = [...e.sets].reverse().find((x) => x.done && (!sameGroup || x.groupId === groupId) && x.actual.reps !== null)
        if (s) return { ...s.actual, date: (w.finishedAt ?? w.startedAt).slice(0, 10) }
      }
    }
  }
  return null
}

export function slotRoleLabel(slotId: WorkoutExercise['slotId']): string {
  return getSlot(slotId).role
}

export function describeActual(e: Pick<WorkoutExercise, 'loadType'>, s: Pick<WorkoutSet, 'actual'>): string {
  const r = s.actual.reps ?? '—'
  const rpe = s.actual.rpe !== null ? ` @${String(s.actual.rpe).replace('.', ',')}` : ''
  if (e.loadType === 'bodyweight') return `${r} повт.${rpe}`
  if (e.loadType === 'weighted_bodyweight') return `+${fmtKg(s.actual.weight ?? 0)} × ${r}${rpe}`
  if (e.loadType === 'dumbbell') return `2 × ${fmtKg(s.actual.weight)} × ${r}${rpe}`
  return `${fmtKg(s.actual.weight)} × ${r}${rpe}`
}
