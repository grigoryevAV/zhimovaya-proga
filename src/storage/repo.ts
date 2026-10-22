/** Операции с данными. Завершённые тренировки меняет только пользователь (правка факта), но не пересчёт плана. */
import { getExercise } from '../domain/exercises/catalog'
import { fmtKg, today } from '../domain/format'
import { type SlotId, getSlot } from '../domain/program/definition'
import type { PlannedSession } from '../domain/program/engine'
import type { NutritionMode } from '../domain/routine/nutrition'
import { type SetAddress, findSet, newWorkout, refreshActiveWorkout, testsFromWorkout } from '../domain/progression/workout'
import { type AppDB, db, ensureProfile } from './db'
import type { ChangeRow, OverrideRow, ProfileRow, TestRow, WorkoutRow, WorkoutSet } from './types'

const now = () => new Date().toISOString()

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * База берётся один раз на операцию: смена базы (например, в тестах) посреди await
 * не должна перенаправлять запись в другую базу.
 */
async function logChangeIn(d: AppDB, kind: ChangeRow['kind'], text: string): Promise<void> {
  await d.changes.add({ at: now(), kind, text })
}

export async function logChange(kind: ChangeRow['kind'], text: string): Promise<void> {
  await logChangeIn(db, kind, text)
}

export async function updateProfile(patch: Partial<ProfileRow>, change?: { kind: ChangeRow['kind']; text: string }): Promise<void> {
  const d = db
  const p = await ensureProfile(d)
  await d.profile.put({ ...p, ...patch, id: 'me', updatedAt: now() })
  if (change) await logChangeIn(d, change.kind, change.text)
}

export async function setChoice(slotId: SlotId, exerciseId: string | null): Promise<void> {
  const d = db
  const p = await ensureProfile(d)
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
  await updateProfile(
    { steps: { ...(await ensureProfile()).steps, [exerciseId]: step } },
    { kind: 'step', text: `Шаг округления «${getExercise(exerciseId).name}»: ${fmtKg(step)}. Будущие веса пересчитаны.` },
  )
}

export async function setSchemeRow(exerciseId: string, row: number, label: string): Promise<void> {
  await updateProfile(
    { schemeRows: { ...(await ensureProfile()).schemeRows, [exerciseId]: row } },
    { kind: 'scheme', text: `Рабочий диапазон «${getExercise(exerciseId).name}»: ${label}` },
  )
}

// ------------------------------------------------ питание

export async function setNutritionMode(mode: NutritionMode): Promise<void> {
  await updateProfile(
    { nutritionMode: mode },
    { kind: 'settings', text: `Режим питания: ${mode === 'maintenance' ? 'поддержание' : 'мягкая рекомпозиция'}` },
  )
}

/** Поправка к цели дня прибавляется к текущей (нажатие «Применить» в подсказке тренда). */
export async function applyNutritionAdvice(deltaKcal: number, reason: string): Promise<void> {
  const d = db
  await d.transaction('rw', [d.profile, d.changes], async () => {
    const p = await ensureProfile(d)
    const next = (p.nutritionAdjustKcal ?? 0) + deltaKcal
    await d.profile.put({ ...p, nutritionAdjustKcal: next, id: 'me', updatedAt: now() })
    await logChangeIn(d, 'settings', `${deltaKcal > 0 ? '+' : ''}${deltaKcal} ккал к цели питания: ${reason}`)
  })
}

export async function resetNutritionAdjust(): Promise<void> {
  await updateProfile({ nutritionAdjustKcal: 0 }, { kind: 'settings', text: 'Поправка питания сброшена' })
}

export async function addBodyweight(kg: number, date = today()): Promise<void> {
  const d = db
  const existing = await d.bodyweights.where('date').equals(date).first()
  if (existing?.id !== undefined) await d.bodyweights.update(existing.id, { kg })
  else await d.bodyweights.add({ date, kg })
  await logChangeIn(d, 'bodyweight', `Вес тела ${fmtKg(kg)} с ${date}. Новые расчёты учитывают его, прошлые тренировки — нет.`)
}

export async function deleteBodyweight(id: number): Promise<void> {
  await db.bodyweights.delete(id)
}

export async function saveTest(t: TestRow): Promise<void> {
  const d = db
  await d.tests.put(t)
  const ex = getExercise(t.exerciseId)
  const w = ex.loadType === 'bodyweight' ? '' : `${ex.loadType === 'weighted_bodyweight' ? '+' : ''}${fmtKg(t.weight)} × `
  await logChangeIn(d, 'test', `Тест «${ex.name}»: ${w}${t.reps ?? '—'}${t.rpe !== null && t.rpe !== 10 ? ` @${t.rpe}` : ''}. Будущие веса пересчитаны.`)
}

export async function deleteTest(slotId: SlotId): Promise<void> {
  await db.tests.delete(slotId)
}

export async function setOverride(key: string, o: Omit<OverrideRow, 'key' | 'updatedAt'>, text: string): Promise<void> {
  const d = db
  await d.overrides.put({ key, ...o, updatedAt: now() })
  await logChangeIn(d, 'override', text)
}

export async function clearOverride(key: string, text: string): Promise<void> {
  const d = db
  await d.overrides.delete(key)
  await logChangeIn(d, 'override', text)
}

// ------------------------------------------------ тренировки

export async function activeWorkout(): Promise<WorkoutRow | undefined> {
  return db.workouts.where('status').equals('active').first()
}

/** Начать (или продолжить) тренировку по плановой сессии. */
export async function startWorkout(session: PlannedSession, bodyweight: number | null): Promise<WorkoutRow> {
  const d = db
  const existing = await d.workouts.where('sessionId').equals(session.id).first()
  if (existing) {
    if (existing.status === 'active') return existing
    throw new Error('Эта тренировка уже завершена — откройте её в истории')
  }
  const other = await d.workouts.where('status').equals('active').first()
  if (other) throw new Error(`Сначала завершите начатую тренировку (${other.sessionId})`)
  const w = newWorkout(session, bodyweight, now(), uid())
  await d.workouts.put(w)
  return w
}

/**
 * Полная перезапись записи тренировки. Внимание: снимок экрана здесь затрёт факт, введённый раньше
 * (К1) — для точечных правок используйте patchWorkout и его обёртки.
 */
export async function saveWorkout(w: WorkoutRow): Promise<void> {
  await db.workouts.put(w)
}

/**
 * Патч записи тренировки: читает свежую запись внутри транзакции и применяет изменение к ней.
 * Так снимок экрана не затирает факт, введённый раньше (К1).
 */
export async function patchWorkout(workoutId: string, fn: (w: WorkoutRow) => WorkoutRow): Promise<void> {
  const d = db
  await d.transaction('rw', d.workouts, async () => {
    const w = await d.workouts.get(workoutId)
    if (!w) return
    await d.workouts.put(fn(w))
  })
}

/** Заметка к тренировке. */
export async function setWorkoutNote(workoutId: string, note: string): Promise<void> {
  await patchWorkout(workoutId, (w) => ({ ...w, note }))
}

/** Вес тела на эту тренировку (для отягощений и тоннажа). */
export async function setWorkoutBodyweight(workoutId: string, bodyweight: number | null): Promise<void> {
  await patchWorkout(workoutId, (w) => ({ ...w, bodyweight }))
}

/** Заметка к упражнению тренировки. */
export async function setExerciseNote(workoutId: string, slotId: SlotId, note: string): Promise<void> {
  await patchWorkout(workoutId, (w) => ({
    ...w,
    exercises: w.exercises.map((e) => (e.slotId === slotId ? { ...e, note } : e)),
  }))
}

/** Добавить подход вручную в конец группы (копия последнего подхода группы, факт пустой). */
export async function addExtraSet(workoutId: string, slotId: SlotId, groupId: string): Promise<void> {
  await patchWorkout(workoutId, (w) => ({
    ...w,
    exercises: w.exercises.map((e) => {
      if (e.slotId !== slotId) return e
      const group = e.sets.filter((s) => s.groupId === groupId)
      const last = group[group.length - 1]
      if (!last) return e
      const index = group.reduce((mx, s) => Math.max(mx, s.index), 0) + 1
      const extra: WorkoutSet = {
        ...last, index, driver: null, extra: true,
        actual: { weight: null, reps: null, rpe: null }, done: false,
      }
      return { ...e, sets: [...e.sets, extra] }
    }),
  }))
}

/**
 * Замена упражнения только в этой тренировке: меняем упражнение в записи тренировки,
 * план для него — «подбор» (плановых весов не остаётся), программа не меняется.
 */
export async function swapExerciseForToday(workoutId: string, slotId: SlotId, exerciseId: string): Promise<void> {
  const d = db
  const p = await ensureProfile(d)
  const cat = getExercise(exerciseId)
  const step = p.steps[exerciseId] ?? cat.defaultStep
  await patchWorkout(workoutId, (w) => ({
    ...w,
    exercises: w.exercises.map((e) => {
      if (e.slotId !== slotId) return e
      return {
        ...e,
        exerciseId: cat.id,
        exerciseName: cat.name,
        originalName: e.exerciseName,
        loadType: cat.loadType,
        step,
        swappedForToday: true,
        sets: e.sets.map((s) => ({
          ...s,
          driver: null,
          planned: { ...s.planned, weight: null, text: 'подбор веса' },
        })),
      }
    }),
  }))
}

/** Изменить подход по адресу (слот + группа + номер): индексы массива могли сдвинуться (К3). */
export async function updateSet(workoutId: string, addr: SetAddress, patch: Omit<Partial<WorkoutSet>, 'actual'> & { actual?: Partial<WorkoutSet['actual']> }): Promise<void> {
  const d = db
  await d.transaction('rw', d.workouts, async () => {
    const w = await d.workouts.get(workoutId)
    if (!w) return
    const found = findSet(w, addr)
    if (!found) return
    const { exIndex, setIndex, set } = found
    w.exercises[exIndex].sets[setIndex] = { ...set, ...patch, actual: { ...set.actual, ...(patch.actual ?? {}) } }
    await d.workouts.put(w)
  })
}

/**
 * Отметить подход выполненным. Читает свежую запись внутри транзакции (поле, из которого пользователь
 * только что ушёл, уже сохранено), пустые поля берёт из плана. Возвращает, чего не хватает.
 */
export async function completeSet(workoutId: string, addr: SetAddress): Promise<{ result: 'ok' | 'need-reps' | 'need-weight' | 'missing'; set?: WorkoutSet }> {
  const d = db
  return d.transaction('rw', d.workouts, async () => {
    const w = await d.workouts.get(workoutId)
    if (!w) return { result: 'missing' as const }
    const found = findSet(w, addr)
    if (!found) return { result: 'missing' as const }
    const { exIndex, setIndex, set: s } = found
    const ex = w.exercises[exIndex]
    if (s.done) {
      ex.sets[setIndex] = { ...s, done: false }
      await d.workouts.put(w)
      return { result: 'ok' as const, set: ex.sets[setIndex] }
    }
    const actual = { ...s.actual }
    if (actual.weight === null && s.planned.weight !== null && ex.loadType !== 'bodyweight') actual.weight = s.planned.weight
    if (actual.reps === null && typeof s.planned.reps === 'number') actual.reps = s.planned.reps
    if (actual.reps === null) return { result: 'need-reps' as const, set: s }
    if (ex.loadType !== 'bodyweight' && ex.loadType !== 'weighted_bodyweight' && (actual.weight === null || actual.weight <= 0)) {
      return { result: 'need-weight' as const, set: s }
    }
    ex.sets[setIndex] = { ...s, done: true, actual }
    await d.workouts.put(w)
    return { result: 'ok' as const, set: ex.sets[setIndex] }
  })
}

export async function syncActiveWorkout(session: PlannedSession): Promise<void> {
  const d = db
  await d.transaction('rw', d.workouts, async () => {
    const w = await d.workouts.where('sessionId').equals(session.id).first()
    if (!w || w.status !== 'active') return
    const next = refreshActiveWorkout(w, session)
    if (JSON.stringify(next) !== JSON.stringify(w)) await d.workouts.put(next)
  })
}

/** Завершить: сохраняются фактические значения и снимок плана; для тестовой недели — результаты теста. */
export async function finishWorkout(workoutId: string, session: PlannedSession): Promise<{ testsSaved: number }> {
  const d = db
  let testsSaved = 0
  await d.transaction('rw', [d.workouts, d.tests, d.changes], async () => {
    const w = await d.workouts.get(workoutId)
    if (!w) return
    const finished: WorkoutRow = { ...refreshActiveWorkout(w, session), status: 'done', finishedAt: now() }
    await d.workouts.put(finished)
    const tests = testsFromWorkout(finished)
    for (const t of tests) await d.tests.put(t)
    testsSaved = tests.length
    await d.changes.add({ at: now(), kind: 'workout', text: `Завершена тренировка ${w.sessionId}${tests.length ? `, сохранено тестов: ${tests.length}` : ''}` })
  })
  return { testsSaved }
}

export async function reopenWorkout(workoutId: string): Promise<void> {
  const d = db
  const other = await d.workouts.where('status').equals('active').first()
  if (other && other.id !== workoutId) throw new Error('Сначала завершите начатую тренировку')
  await d.workouts.update(workoutId, { status: 'active', finishedAt: undefined })
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  const d = db
  const w = await d.workouts.get(workoutId)
  await d.workouts.delete(workoutId)
  if (w) await logChangeIn(d, 'workout', `Удалена запись тренировки ${w.sessionId}`)
}

export async function resetAll(): Promise<void> {
  const d = db
  await d.transaction('rw', [d.profile, d.bodyweights, d.tests, d.workouts, d.overrides, d.changes], async () => {
    await Promise.all([d.profile.clear(), d.bodyweights.clear(), d.tests.clear(), d.workouts.clear(), d.overrides.clear(), d.changes.clear()])
  })
  await ensureProfile(d)
  await logChangeIn(d, 'reset', 'Все данные сброшены')
}
