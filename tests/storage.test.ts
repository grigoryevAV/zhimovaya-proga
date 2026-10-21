import { beforeEach, describe, expect, it } from 'vitest'
import { PlanEngine, groupKey, loadTotal } from '../src/domain/program/engine'
import { buildPlanInput, driversFromWorkouts } from '../src/domain/progression/fromLogs'
import { exerciseHistory, personalRecords } from '../src/domain/progression/analytics'
import { type SetAddress, refreshActiveWorkout, testsFromWorkout } from '../src/domain/progression/workout'
import { exportBackup, importBackup, parseBackupText, validateBackup, workoutsToCsv } from '../src/storage/backup'
import { AppDB, SCHEMA_VERSION, db, ensureProfile, useDatabase } from '../src/storage/db'
import {
  addBodyweight, addExtraSet, finishWorkout, saveTest, setChoice, setExerciseNote, setOverride, setStep,
  setWorkoutBodyweight, setWorkoutNote, startWorkout, swapExerciseForToday, updateSet,
} from '../src/storage/repo'
import type { SlotId } from '../src/domain/program/definition'
import type { WorkoutRow } from '../src/storage/types'

/** Адрес подхода по снимку записи: упражнение (слот) + группа + номер внутри группы. */
function addrOf(w: WorkoutRow, slotId: SlotId, setPos = 0): SetAddress {
  const ex = w.exercises.find((e) => e.slotId === slotId)!
  const s = ex.sets[setPos]
  return { slotId, groupId: s.groupId, index: s.index, extra: !!s.extra }
}

let n = 0
beforeEach(async () => {
  useDatabase(`test-${++n}-${Math.random()}`)
  await ensureProfile()
})

async function engine(): Promise<PlanEngine> {
  const [profile, tests, bodyweights, workouts, overrides] = await Promise.all([
    db.profile.get('me'), db.tests.toArray(), db.bodyweights.toArray(), db.workouts.toArray(), db.overrides.toArray(),
  ])
  return new PlanEngine(buildPlanInput({ profile: profile!, tests, bodyweights, workouts, overrides }))
}

/** Тест + тренировка недели 1, день 1 с RPE тяжёлого жима. */
async function doWeek1Day1(rpe = 8) {
  await addBodyweight(80, '2026-10-01')
  await saveTest({ slotId: 'd1s1', exerciseId: 'bench', weight: 80, reps: 6, rpe: 10, date: '2026-10-01', bodyweight: 80 })
  await saveTest({ slotId: 'd1s2', exerciseId: 'pullup_weighted', weight: 20, reps: 5, rpe: 10, date: '2026-10-01', bodyweight: 80 })
  const e = await engine()
  const w = await startWorkout(e.session(1, 1), 80)
  await updateSet(w.id, addrOf(w, 'd1s1', 0), { done: true, actual: { weight: 80, reps: 3, rpe } })
  await updateSet(w.id, addrOf(w, 'd1s1', 1), { done: true, actual: { weight: 80, reps: 3, rpe: 8.5 } })
  await updateSet(w.id, addrOf(w, 'd1s2', 0), { done: true, actual: { weight: 17.5, reps: 3, rpe: 8 } })
  await finishWorkout(w.id, (await engine()).session(1, 1))
  return (await db.workouts.get(w.id))!
}

describe('журнал и план', () => {
  it('опорный RPE берётся из первого выполненного подхода с RPE', async () => {
    const w = await doWeek1Day1(8)
    const d = driversFromWorkouts([w])
    expect(d[groupKey(1, 'd1s1', 'top')]).toMatchObject({ exerciseId: 'bench', weight: 80, reps: 3, rpe: 8 })
    const e = await engine()
    expect(loadTotal(e.group(2, 'd1s1', 'top')!.load)).toEqual({ ok: true, value: 80 }) // 80/0,86·0,85 = 79,1 → 80
  })

  it('редактирование плана и пересчёт не меняют завершённую тренировку', async () => {
    const w = await doWeek1Day1()
    const before = JSON.stringify(w)
    await setOverride(groupKey(1, 'd1s1', 'top'), { weight: 90 }, 'тест')
    await setOverride(groupKey(2, 'd1s1', 'top'), { weight: 95, sets: 5 }, 'тест')
    await setChoice('d1s1', 'incline_bench')
    await setStep('bench', 5)
    await saveTest({ slotId: 'd1s1', exerciseId: 'bench', weight: 100, reps: 3, rpe: 10, date: '2026-10-05', bodyweight: 80 })
    await addBodyweight(90, '2026-10-06')
    const e = await engine()
    e.allSessions()
    const after = await db.workouts.get(w.id)
    expect(JSON.stringify(after)).toBe(before)
    expect(after!.exercises.find((x) => x.slotId === 'd1s1')!.exerciseId).toBe('bench')
    expect(after!.bodyweight).toBe(80)
    expect(after!.algorithmVersion).toBeTruthy()
    // снимок плана сохранён
    expect(after!.exercises[0].sets[0].planned.text).toMatch(/кг/)
  })

  it('активная тренировка: подсобные пересчитываются после RPE, факт не теряется', async () => {
    await saveTest({ slotId: 'd1s1', exerciseId: 'bench', weight: 80, reps: 6, rpe: 10, date: '2026-10-01', bodyweight: 80 })
    let e = await engine()
    const w = await startWorkout(e.session(1, 1), 80)
    const ei = w.exercises.findIndex((x) => x.slotId === 'd1s1')
    const backIdx = w.exercises[ei].sets.findIndex((s) => s.groupId === 'back')
    expect(w.exercises[ei].sets[backIdx].planned.weight).toBeNull()
    await updateSet(w.id, addrOf(w, 'd1s1', 0), { done: true, actual: { weight: 80, reps: 3, rpe: 9 } })
    e = await engine()
    const refreshed = refreshActiveWorkout((await db.workouts.get(w.id))!, e.session(1, 1))
    expect(refreshed.exercises[ei].sets[0].actual).toEqual({ weight: 80, reps: 3, rpe: 9 })
    expect(refreshed.exercises[ei].sets[backIdx].planned.weight).toBe(67.5) // 80/0,89·0,739 = 66,4 → 67,5
  })

  it('завершение тестовой недели сохраняет результаты теста (отягощение — навешенный вес)', async () => {
    await addBodyweight(80, '2026-10-01')
    const e = await engine()
    const w = await startWorkout(e.session('T', 1), 80)
    await updateSet(w.id, addrOf(w, 'd1s1', 0), { done: true, actual: { weight: 85, reps: 5, rpe: null } })
    await updateSet(w.id, addrOf(w, 'd1s2', 0), { done: true, actual: { weight: 25, reps: 4, rpe: null } })
    const r = await finishWorkout(w.id, (await engine()).session('T', 1))
    expect(r.testsSaved).toBe(2)
    expect(await db.tests.get('d1s2')).toMatchObject({ exerciseId: 'pullup_weighted', weight: 25, reps: 4, rpe: 10, bodyweight: 80 })
    expect(testsFromWorkout((await db.workouts.get(w.id))!)).toHaveLength(2)
    const e2 = await engine()
    expect(e2.group(1, 'd1s1', 'top')!.load).toMatchObject({ value: { ok: true } })
  })

  it('история и рекорды считаются по факту', async () => {
    const w = await doWeek1Day1()
    const h = exerciseHistory([w], 'bench')
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ topWeight: 80, topReps: 3, doneSets: 2, tonnage: 480 })
    expect(h[0].bestE1rm).toBeCloseTo(80 / 0.86, 6)
    const pr = personalRecords([w], 'pullup_weighted')
    expect(pr.bestE1rm!.value).toBeCloseTo(97.5 / 0.86, 6) // полный вес: 80 + 17,5
    expect(pr.bestByReps[0]).toMatchObject({ reps: 3, weight: 17.5 })
  })
})

describe('сохранение и резервная копия', () => {
  it('данные переживают перезапуск (новое подключение к той же базе)', async () => {
    await doWeek1Day1()
    const name = db.name
    db.close()
    const again = new AppDB(name)
    expect(await again.workouts.count()).toBe(1)
    expect(await again.tests.count()).toBe(2)
    expect((await again.profile.get('me'))!.choices.d2s4).toBe('db_squeeze_incline30')
    again.close()
  })

  it('экспорт → сброс → импорт возвращает всё без потерь', async () => {
    await doWeek1Day1()
    await setOverride(groupKey(3, 'd1s1', 'top'), { weight: 82.5 }, 'правка')
    const file = await exportBackup()
    const text = JSON.stringify(file)
    useDatabase(`restore-${Math.random()}`)
    await ensureProfile()
    const parsed = parseBackupText(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    await importBackup(parsed.file)
    const again = await exportBackup()
    expect(again.data.workouts).toEqual(file.data.workouts)
    expect(again.data.tests).toEqual(file.data.tests)
    expect(again.data.bodyweights).toEqual(file.data.bodyweights)
    expect(again.data.overrides).toEqual(file.data.overrides)
    expect({ ...again.data.profile, updatedAt: '' }).toEqual({ ...file.data.profile, updatedAt: '' })
    // журнал изменений + запись об импорте
    expect(again.data.changes.length).toBe(file.data.changes.length + 1)
  })

  it('повреждённый или чужой файл даёт понятную ошибку', () => {
    expect(parseBackupText('{не json')).toMatchObject({ ok: false, error: expect.stringContaining('не JSON') })
    expect(validateBackup([])).toMatchObject({ ok: false })
    expect(validateBackup({ app: 'other', schemaVersion: 1, data: {} })).toMatchObject({ ok: false, error: expect.stringContaining('другого приложения') })
    expect(validateBackup({ app: 'zhimovaya-proga', schemaVersion: SCHEMA_VERSION + 1, data: {} })).toMatchObject({ ok: false, error: expect.stringContaining('более новой') })
    const good = { app: 'zhimovaya-proga', schemaVersion: 1, exportedAt: '2026-10-01', algorithmVersion: '1', data: { profile: null, bodyweights: [], tests: [], workouts: [], overrides: [], changes: [] } }
    expect(validateBackup(good).ok).toBe(true)
    const badWorkout = { ...good, data: { ...good.data, workouts: [{ id: 'x', sessionId: '1-1', status: 'done', week: 1, day: 1, exercises: [{ slotId: 'd1s1', exerciseId: 'bench', sets: [{ done: true, planned: {}, actual: { weight: 'восемьдесят', reps: 3, rpe: 8 } }] }] }] } }
    expect(validateBackup(badWorkout)).toMatchObject({ ok: false, error: expect.stringContaining('нечисловые') })
    const badSlot = { ...good, data: { ...good.data, tests: [{ slotId: 'd9s9', exerciseId: 'bench', weight: 1, reps: 1 }] } }
    expect(validateBackup(badSlot)).toMatchObject({ ok: false })
  })

  it('CSV: разделитель «;», десятичная запятая, единица веса гантелей', async () => {
    const w = await doWeek1Day1()
    const csv = workoutsToCsv([w])
    expect(csv.startsWith('﻿Дата;Неделя;День;Упражнение')).toBe(true)
    expect(csv).toContain('Жим штанги лёжа')
    expect(csv).toContain('17,5')
    expect(csv).toContain('отягощение')
    expect(csv.split('\r\n').length).toBeGreaterThan(5)
  })
})

// ------------------------------------------------ К1: правки не затирают введённое значение

describe('К1 — снимок экрана не затирает введённый факт', () => {
  it('заметка тренировки не стирает вес, введённый в ячейке', async () => {
    const e = await engine()
    const w = await startWorkout(e.session(1, 1), 80)
    await updateSet(w.id, addrOf(w, 'd1s1', 0), { actual: { weight: 75 } })
    await setWorkoutNote(w.id, 'самочувствие хорошее')
    const after = (await db.workouts.get(w.id))!
    expect(after.exercises.find((x) => x.slotId === 'd1s1')!.sets[0].actual.weight).toBe(75)
    expect(after.note).toBe('самочувствие хорошее')
  })

  it('заметка упражнения и вес тела не стирают факт', async () => {
    const e = await engine()
    const w = await startWorkout(e.session(1, 1), 80)
    await updateSet(w.id, addrOf(w, 'd1s1', 0), { actual: { weight: 75, reps: 5 } })
    await setExerciseNote(w.id, 'd1s1', 'боль в плече')
    await setWorkoutBodyweight(w.id, 81.5)
    const after = (await db.workouts.get(w.id))!
    const ex = after.exercises.find((x) => x.slotId === 'd1s1')!
    expect(ex.sets[0].actual.weight).toBe(75)
    expect(ex.sets[0].actual.reps).toBe(5)
    expect(ex.note).toBe('боль в плече')
    expect(after.bodyweight).toBe(81.5)
  })

  it('«+ Добавить сет» не стирает факт в уже введённых подходах', async () => {
    const e = await engine()
    const w = await startWorkout(e.session(1, 1), 80)
    await updateSet(w.id, addrOf(w, 'd1s1', 0), { actual: { weight: 75, reps: 5 } })
    const gid = w.exercises.find((x) => x.slotId === 'd1s1')!.sets[0].groupId
    await addExtraSet(w.id, 'd1s1', gid)
    const after = (await db.workouts.get(w.id))!
    const ex = after.exercises.find((x) => x.slotId === 'd1s1')!
    expect(ex.sets[0].actual.weight).toBe(75)
    expect(ex.sets[0].actual.reps).toBe(5)
    expect(ex.sets.filter((s) => s.extra)).toHaveLength(1)
  })
})

// ------------------------------------------------ К3: адресация подхода

describe('К3 — подход адресуется по слоту, группе и номеру', () => {
  it('правка попадает в нужный подход, даже если план изменился (refreshActiveWorkout)', async () => {
    const e = await engine()
    const w = await startWorkout(e.session(1, 1), 80)
    const ex0 = w.exercises.find((x) => x.slotId === 'd1s1')!
    const gid = ex0.sets[0].groupId
    const plannedCount = ex0.sets.filter((s) => s.groupId === gid).length
    // подход, добавленный вручную
    await addExtraSet(w.id, 'd1s1', gid)
    const extra = (await db.workouts.get(w.id))!.exercises.find((x) => x.slotId === 'd1s1')!.sets.find((s) => s.extra)!
    // план вырос: у группы появился ещё один подход → в записи изменился порядок
    await setOverride(groupKey(1, 'd1s1', gid), { sets: plannedCount + 1 }, 'добавлен подход')
    const session = (await engine()).session(1, 1)
    await db.workouts.put(refreshActiveWorkout((await db.workouts.get(w.id))!, session))
    const rec = (await db.workouts.get(w.id))!
    const sets = rec.exercises.find((x) => x.slotId === 'd1s1')!.sets
    // добавленный подход сдвинулся по массиву, а его номер в группе теперь совпадает с плановым
    expect(sets.findIndex((s) => s.extra)).not.toBe(sets.findIndex((s) => !s.extra && s.groupId === gid && s.index === extra.index))
    // правка по адресу попадает именно в добавленный подход
    await updateSet(w.id, { slotId: 'd1s1', groupId: gid, index: extra.index, extra: true }, { actual: { weight: 42 } })
    const after = (await db.workouts.get(w.id))!.exercises.find((x) => x.slotId === 'd1s1')!.sets
    expect(after.find((s) => s.extra)!.actual.weight).toBe(42)
    expect(after.filter((s) => !s.extra && s.groupId === gid).every((s) => s.actual.weight === null)).toBe(true)
  })

  it('подход, вставленный в начало группы, не перехватывает правку', async () => {
    const e = await engine()
    const w = await startWorkout(e.session(1, 1), 80)
    const target = addrOf(w, 'd1s1', 1)
    // пересчёт вставил подход в начало группы: номера в группе сдвинулись
    const rec = (await db.workouts.get(w.id))!
    const ex = rec.exercises.find((x) => x.slotId === 'd1s1')!
    const inserted = { ...ex.sets[0], groupId: target.groupId, index: 1, actual: { weight: null, reps: null, rpe: null }, done: false }
    const shifted = ex.sets.map((s) => (s.groupId === target.groupId ? { ...s, index: s.index + 1 } : s))
    await db.workouts.put({
      ...rec,
      exercises: rec.exercises.map((x) => (x.slotId === 'd1s1' ? { ...x, sets: [inserted, ...shifted] } : x)),
    })
    await updateSet(w.id, target, { actual: { weight: 77 } })
    const after = (await db.workouts.get(w.id))!.exercises.find((x) => x.slotId === 'd1s1')!.sets
    expect(after.find((s) => s.groupId === target.groupId && s.index === target.index)!.actual.weight).toBe(77)
    expect(after.find((s) => s.groupId === target.groupId && s.index === target.index + 1)!.actual.weight).toBeNull()
  })
})

// ------------------------------------------------ Д8: замена упражнения только в этой тренировке

describe('Д8 — замена упражнения только в текущей тренировке', () => {
  it('замена не откатывается пересчётом и не выдумывает веса', async () => {
    const e = await engine()
    const w = await startWorkout(e.session(1, 1), 80)
    await swapExerciseForToday(w.id, 'd1s1', 'incline_bench')
    const rec = (await db.workouts.get(w.id))!
    const ex = rec.exercises.find((x) => x.slotId === 'd1s1')!
    expect(ex.exerciseId).toBe('incline_bench')
    expect(ex.swappedForToday).toBe(true)
    expect(ex.originalName).toBe('Жим штанги лёжа')
    expect(ex.sets.every((s) => s.planned.weight === null)).toBe(true)
    // пересчёт плана замену не откатывает
    const refreshed = refreshActiveWorkout(rec, (await engine()).session(1, 1))
    const ex2 = refreshed.exercises.find((x) => x.slotId === 'd1s1')!
    expect(ex2.exerciseId).toBe('incline_bench')
    expect(ex2.swappedForToday).toBe(true)
    expect(ex2.sets.every((s) => s.planned.weight === null)).toBe(true)
  })

  it('замена в программе работает как раньше: меняется выбор слота', async () => {
    const e = await engine()
    const w = await startWorkout(e.session(1, 1), 80)
    await setChoice('d1s1', 'incline_bench')
    const refreshed = refreshActiveWorkout((await db.workouts.get(w.id))!, (await engine()).session(1, 1))
    expect(refreshed.exercises.find((x) => x.slotId === 'd1s1')!.exerciseId).toBe('incline_bench')
    expect(refreshed.exercises.find((x) => x.slotId === 'd1s1')!.swappedForToday).toBeUndefined()
  })
})
