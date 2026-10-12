import { beforeEach, describe, expect, it } from 'vitest'
import { PlanEngine, groupKey, loadTotal } from '../src/domain/program/engine'
import { buildPlanInput, driversFromWorkouts } from '../src/domain/progression/fromLogs'
import { exerciseHistory, personalRecords } from '../src/domain/progression/analytics'
import { refreshActiveWorkout, testsFromWorkout } from '../src/domain/progression/workout'
import { exportBackup, importBackup, parseBackupText, validateBackup, workoutsToCsv } from '../src/storage/backup'
import { AppDB, SCHEMA_VERSION, db, ensureProfile, useDatabase } from '../src/storage/db'
import {
  addBodyweight, finishWorkout, saveTest, setChoice, setOverride, setStep, startWorkout, updateSet,
} from '../src/storage/repo'

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
  const ei = w.exercises.findIndex((x) => x.slotId === 'd1s1')
  await updateSet(w.id, ei, 0, { done: true, actual: { weight: 80, reps: 3, rpe } })
  await updateSet(w.id, ei, 1, { done: true, actual: { weight: 80, reps: 3, rpe: 8.5 } })
  const pi = w.exercises.findIndex((x) => x.slotId === 'd1s2')
  await updateSet(w.id, pi, 0, { done: true, actual: { weight: 17.5, reps: 3, rpe: 8 } })
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
    await updateSet(w.id, ei, 0, { done: true, actual: { weight: 80, reps: 3, rpe: 9 } })
    e = await engine()
    const refreshed = refreshActiveWorkout((await db.workouts.get(w.id))!, e.session(1, 1))
    expect(refreshed.exercises[ei].sets[0].actual).toEqual({ weight: 80, reps: 3, rpe: 9 })
    expect(refreshed.exercises[ei].sets[backIdx].planned.weight).toBe(67.5) // 80/0,89·0,739 = 66,4 → 67,5
  })

  it('завершение тестовой недели сохраняет результаты теста (отягощение — навешенный вес)', async () => {
    await addBodyweight(80, '2026-10-01')
    const e = await engine()
    const w = await startWorkout(e.session('T', 1), 80)
    const bi = w.exercises.findIndex((x) => x.slotId === 'd1s1')
    const pi = w.exercises.findIndex((x) => x.slotId === 'd1s2')
    await updateSet(w.id, bi, 0, { done: true, actual: { weight: 85, reps: 5, rpe: null } })
    await updateSet(w.id, pi, 0, { done: true, actual: { weight: 25, reps: 4, rpe: null } })
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
