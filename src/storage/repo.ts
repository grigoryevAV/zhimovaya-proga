/** Операции с данными. Завершённые тренировки меняет только пользователь (правка факта), но не пересчёт плана. */
import { getExercise } from '../domain/exercises/catalog'
import { fmtKg, today } from '../domain/format'
import { type SlotId, getSlot } from '../domain/program/definition'
import type { PlannedSession } from '../domain/program/engine'
import { newWorkout, refreshActiveWorkout, testsFromWorkout } from '../domain/progression/workout'
import { db, ensureProfile } from './db'
import type { ChangeRow, OverrideRow, ProfileRow, TestRow, WorkoutRow, WorkoutSet } from './types'

const now = () => new Date().toISOString()

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export async function logChange(kind: ChangeRow['kind'], text: string): Promise<void> {
  await db.changes.add({ at: now(), kind, text })
}

export async function updateProfile(patch: Partial<ProfileRow>, change?: { kind: ChangeRow['kind']; text: string }): Promise<void> {
  const p = await ensureProfile()
  await db.profile.put({ ...p, ...patch, id: 'me', updatedAt: now() })
  if (change) await logChange(change.kind, change.text)
}

export async function setChoice(slotId: SlotId, exerciseId: string | null): Promise<void> {
  const p = await ensureProfile()
  const slot = getSlot(slotId)
  const before = p.choices[slotId]
  if (before === exerciseId) return
  const name = (id: string | null) => (id ? getExercise(id).name : 'не выбрано')
  await updateProfile(
    { choices: { ...p.choices, [slotId]: exerciseId } },
    { kind: 'choice', text: `День ${slot.day}, «${slot.role}»: ${name(before)} → ${name(exerciseId)}. Будущие тренировки пересчитаны, журнал не изменён.` },
  )
}

export async function setStep(exerciseId: string, step: number): Promise<void> {
  const p = await ensureProfile()
  await updateProfile(
    { steps: { ...p.steps, [exerciseId]: step } },
    { kind: 'step', text: `Шаг округления «${getExercise(exerciseId).name}»: ${fmtKg(step)}. Будущие веса пересчитаны.` },
  )
}

export async function setSchemeRow(exerciseId: string, row: number, label: string): Promise<void> {
  const p = await ensureProfile()
  await updateProfile(
    { schemeRows: { ...p.schemeRows, [exerciseId]: row } },
    { kind: 'scheme', text: `Рабочий диапазон «${getExercise(exerciseId).name}»: ${label}` },
  )
}

export async function addBodyweight(kg: number, date = today()): Promise<void> {
  const existing = await db.bodyweights.where('date').equals(date).first()
  if (existing?.id !== undefined) await db.bodyweights.update(existing.id, { kg })
  else await db.bodyweights.add({ date, kg })
  await logChange('bodyweight', `Вес тела ${fmtKg(kg)} с ${date}. Новые расчёты учитывают его, прошлые тренировки — нет.`)
}

export async function deleteBodyweight(id: number): Promise<void> {
  await db.bodyweights.delete(id)
}

export async function saveTest(t: TestRow): Promise<void> {
  await db.tests.put(t)
  const ex = getExercise(t.exerciseId)
  const w = ex.loadType === 'bodyweight' ? '' : `${ex.loadType === 'weighted_bodyweight' ? '+' : ''}${fmtKg(t.weight)} × `
  await logChange('test', `Тест «${ex.name}»: ${w}${t.reps ?? '—'}${t.rpe !== null && t.rpe !== 10 ? ` @${t.rpe}` : ''}. Будущие веса пересчитаны.`)
}

export async function deleteTest(slotId: SlotId): Promise<void> {
  await db.tests.delete(slotId)
}

export async function setOverride(key: string, o: Omit<OverrideRow, 'key' | 'updatedAt'>, text: string): Promise<void> {
  await db.overrides.put({ key, ...o, updatedAt: now() })
  await logChange('override', text)
}

export async function clearOverride(key: string, text: string): Promise<void> {
  await db.overrides.delete(key)
  await logChange('override', text)
}

// ------------------------------------------------ тренировки

export async function activeWorkout(): Promise<WorkoutRow | undefined> {
  return db.workouts.where('status').equals('active').first()
}

/** Начать (или продолжить) тренировку по плановой сессии. */
export async function startWorkout(session: PlannedSession, bodyweight: number | null): Promise<WorkoutRow> {
  const existing = await db.workouts.where('sessionId').equals(session.id).first()
  if (existing) {
    if (existing.status === 'active') return existing
    throw new Error('Эта тренировка уже завершена — откройте её в истории')
  }
  const other = await activeWorkout()
  if (other) throw new Error(`Сначала завершите начатую тренировку (${other.sessionId})`)
  const w = newWorkout(session, bodyweight, now(), uid())
  await db.workouts.put(w)
  return w
}

export async function saveWorkout(w: WorkoutRow): Promise<void> {
  await db.workouts.put(w)
}

export async function updateSet(workoutId: string, exIdx: number, setIdx: number, patch: Omit<Partial<WorkoutSet>, 'actual'> & { actual?: Partial<WorkoutSet['actual']> }): Promise<void> {
  await db.transaction('rw', db.workouts, async () => {
    const w = await db.workouts.get(workoutId)
    if (!w) return
    const ex = w.exercises[exIdx]
    const s = ex?.sets[setIdx]
    if (!s) return
    ex.sets[setIdx] = { ...s, ...patch, actual: { ...s.actual, ...(patch.actual ?? {}) } }
    await db.workouts.put(w)
  })
}

/**
 * Отметить подход выполненным. Читает свежую запись внутри транзакции (поле, из которого пользователь
 * только что ушёл, уже сохранено), пустые поля берёт из плана. Возвращает, чего не хватает.
 */
export async function completeSet(workoutId: string, exIdx: number, setIdx: number): Promise<{ result: 'ok' | 'need-reps' | 'need-weight' | 'missing'; set?: WorkoutSet }> {
  return db.transaction('rw', db.workouts, async () => {
    const w = await db.workouts.get(workoutId)
    const ex = w?.exercises[exIdx]
    const s = ex?.sets[setIdx]
    if (!w || !ex || !s) return { result: 'missing' as const }
    if (s.done) {
      ex.sets[setIdx] = { ...s, done: false }
      await db.workouts.put(w)
      return { result: 'ok' as const, set: ex.sets[setIdx] }
    }
    const actual = { ...s.actual }
    if (actual.weight === null && s.planned.weight !== null && ex.loadType !== 'bodyweight') actual.weight = s.planned.weight
    if (actual.reps === null && typeof s.planned.reps === 'number') actual.reps = s.planned.reps
    if (actual.reps === null) return { result: 'need-reps' as const, set: s }
    if (ex.loadType !== 'bodyweight' && ex.loadType !== 'weighted_bodyweight' && (actual.weight === null || actual.weight <= 0)) {
      return { result: 'need-weight' as const, set: s }
    }
    ex.sets[setIdx] = { ...s, done: true, actual }
    await db.workouts.put(w)
    return { result: 'ok' as const, set: ex.sets[setIdx] }
  })
}

export async function syncActiveWorkout(session: PlannedSession): Promise<void> {
  await db.transaction('rw', db.workouts, async () => {
    const w = await db.workouts.where('sessionId').equals(session.id).first()
    if (!w || w.status !== 'active') return
    const next = refreshActiveWorkout(w, session)
    if (JSON.stringify(next) !== JSON.stringify(w)) await db.workouts.put(next)
  })
}

/** Завершить: сохраняются фактические значения и снимок плана; для тестовой недели — результаты теста. */
export async function finishWorkout(workoutId: string, session: PlannedSession): Promise<{ testsSaved: number }> {
  let testsSaved = 0
  await db.transaction('rw', [db.workouts, db.tests, db.changes], async () => {
    const w = await db.workouts.get(workoutId)
    if (!w) return
    const finished: WorkoutRow = { ...refreshActiveWorkout(w, session), status: 'done', finishedAt: now() }
    await db.workouts.put(finished)
    const tests = testsFromWorkout(finished)
    for (const t of tests) await db.tests.put(t)
    testsSaved = tests.length
    await db.changes.add({ at: now(), kind: 'workout', text: `Завершена тренировка ${w.sessionId}${tests.length ? `, сохранено тестов: ${tests.length}` : ''}` })
  })
  return { testsSaved }
}

export async function reopenWorkout(workoutId: string): Promise<void> {
  const other = await activeWorkout()
  if (other && other.id !== workoutId) throw new Error('Сначала завершите начатую тренировку')
  await db.workouts.update(workoutId, { status: 'active', finishedAt: undefined })
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  const w = await db.workouts.get(workoutId)
  await db.workouts.delete(workoutId)
  if (w) await logChange('workout', `Удалена запись тренировки ${w.sessionId}`)
}

export async function resetAll(): Promise<void> {
  await db.transaction('rw', [db.profile, db.bodyweights, db.tests, db.workouts, db.overrides, db.changes], async () => {
    await Promise.all([db.profile.clear(), db.bodyweights.clear(), db.tests.clear(), db.workouts.clear(), db.overrides.clear(), db.changes.clear()])
  })
  await ensureProfile()
  await logChange('reset', 'Все данные сброшены')
}
