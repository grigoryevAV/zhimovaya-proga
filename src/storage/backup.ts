/** Резервная копия: экспорт/импорт JSON с проверкой схемы и экспорт журнала в CSV. */
import { getExercise } from '../domain/exercises/catalog'
import { SLOTS, weekLabel } from '../domain/program/definition'
import { ALGORITHM_VERSION } from '../domain/program/engine'
import { setTonnage } from '../domain/progression/analytics'
import { SCHEMA_VERSION, db, defaultProfile } from './db'
import type { BackupData, BackupFile, WorkoutRow } from './types'

export const BACKUP_APP_ID = 'zhimovaya-proga'

export async function exportBackup(): Promise<BackupFile> {
  const [profile, bodyweights, tests, workouts, overrides, changes] = await Promise.all([
    db.profile.get('me'), db.bodyweights.toArray(), db.tests.toArray(), db.workouts.toArray(), db.overrides.toArray(), db.changes.toArray(),
  ])
  return {
    app: BACKUP_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    exportedAt: new Date().toISOString(),
    data: { profile: profile ?? null, bodyweights, tests, workouts, overrides, changes },
  }
}

export type ValidateResult = { ok: true; file: BackupFile; summary: string } | { ok: false; error: string }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isNumOrNull = (x: unknown) => x === null || x === undefined || (typeof x === 'number' && Number.isFinite(x))
const SLOT_IDS = new Set(SLOTS.map((s) => s.id as string))
const WEEK_IDS = new Set(['P1', 'P2', 'T', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as unknown[])

/** Миграции старых версий резервной копии к текущей схеме. Пока версия одна. */
const MIGRATIONS: Record<number, (d: BackupData) => BackupData> = {}

function checkWorkout(w: unknown, i: number): string | null {
  if (!isObj(w)) return `тренировка №${i + 1} повреждена`
  if (typeof w.id !== 'string' || typeof w.sessionId !== 'string') return `у тренировки №${i + 1} нет идентификатора`
  if (w.status !== 'active' && w.status !== 'done') return `у тренировки ${w.sessionId} неизвестный статус`
  if (!WEEK_IDS.has(w.week) || ![1, 2, 3].includes(w.day as number)) return `у тренировки ${w.sessionId} неверная неделя/день`
  if (!Array.isArray(w.exercises)) return `у тренировки ${w.sessionId} нет списка упражнений`
  for (const e of w.exercises) {
    if (!isObj(e) || typeof e.exerciseId !== 'string' || !SLOT_IDS.has(e.slotId as string) || !Array.isArray(e.sets)) {
      return `в тренировке ${w.sessionId} повреждено упражнение`
    }
    for (const s of e.sets) {
      if (!isObj(s) || !isObj(s.actual) || !isObj(s.planned) || typeof s.done !== 'boolean') return `в тренировке ${w.sessionId} повреждён подход`
      const a = s.actual as Record<string, unknown>
      if (!isNumOrNull(a.weight) || !isNumOrNull(a.reps) || !isNumOrNull(a.rpe)) return `в тренировке ${w.sessionId} нечисловые значения подхода`
    }
  }
  return null
}

export function validateBackup(raw: unknown): ValidateResult {
  if (!isObj(raw)) return { ok: false, error: 'Файл не похож на резервную копию: ожидался JSON-объект' }
  if (raw.app !== BACKUP_APP_ID) return { ok: false, error: 'Это резервная копия другого приложения' }
  const v = raw.schemaVersion
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { ok: false, error: 'В файле нет версии схемы' }
  if (v > SCHEMA_VERSION) return { ok: false, error: `Копия создана более новой версией приложения (схема ${v}, у вас ${SCHEMA_VERSION}). Обновите приложение.` }
  if (!isObj(raw.data)) return { ok: false, error: 'В файле нет данных' }
  let data = raw.data as unknown as BackupData
  for (const key of ['bodyweights', 'tests', 'workouts', 'overrides', 'changes'] as const) {
    if (!Array.isArray(data[key])) return { ok: false, error: `Повреждён раздел «${key}»` }
  }
  if (data.profile !== null && (!isObj(data.profile) || !isObj(data.profile.choices))) return { ok: false, error: 'Повреждён профиль' }
  for (const b of data.bodyweights) {
    if (!isObj(b) || typeof b.date !== 'string' || typeof b.kg !== 'number' || !(b.kg > 0)) return { ok: false, error: 'Повреждена запись веса тела' }
  }
  for (const t of data.tests) {
    if (!isObj(t) || !SLOT_IDS.has(t.slotId) || typeof t.exerciseId !== 'string' || !isNumOrNull(t.weight) || !isNumOrNull(t.reps)) {
      return { ok: false, error: 'Повреждена запись теста' }
    }
  }
  for (let i = 0; i < data.workouts.length; i++) {
    const err = checkWorkout(data.workouts[i], i)
    if (err) return { ok: false, error: `Повреждены данные: ${err}` }
  }
  for (let ver = v; ver < SCHEMA_VERSION; ver++) data = MIGRATIONS[ver](data)
  const done = data.workouts.filter((w) => w.status === 'done').length
  return {
    ok: true,
    file: { ...(raw as unknown as BackupFile), schemaVersion: SCHEMA_VERSION, data },
    summary: `Тренировок: ${data.workouts.length} (завершено ${done}), тестов: ${data.tests.length}, записей веса: ${data.bodyweights.length}`,
  }
}

export function parseBackupText(text: string): ValidateResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Файл повреждён: это не JSON' }
  }
  return validateBackup(raw)
}

/** Полная замена данных содержимым копии. Вызывать только после подтверждения пользователя. */
export async function importBackup(file: BackupFile): Promise<void> {
  const d = file.data
  const base = db
  await base.transaction('rw', [base.profile, base.bodyweights, base.tests, base.workouts, base.overrides, base.changes], async () => {
    await Promise.all([base.profile.clear(), base.bodyweights.clear(), base.tests.clear(), base.workouts.clear(), base.overrides.clear(), base.changes.clear()])
    await base.profile.put({ ...defaultProfile(), ...(d.profile ?? {}), id: 'me' })
    await base.bodyweights.bulkPut(d.bodyweights)
    await base.tests.bulkPut(d.tests)
    await base.workouts.bulkPut(d.workouts)
    await base.overrides.bulkPut(d.overrides)
    await base.changes.bulkPut(d.changes)
    await base.changes.add({ at: new Date().toISOString(), kind: 'import', text: `Данные восстановлены из копии от ${file.exportedAt.slice(0, 10)}` })
  })
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Журнал в CSV (разделитель «;», десятичная запятая — открывается в русском Excel). */
export function workoutsToCsv(workouts: WorkoutRow[]): string {
  const header = ['Дата', 'Неделя', 'День', 'Упражнение', 'Исходное название', 'Тип нагрузки', 'Группа', 'Подход', 'План', 'Вес, кг', 'Единица веса', 'Повторения', 'RPE', 'Выполнен', 'Вес тела, кг', 'Тоннаж, кг', 'Заметка']
  const rows = [header]
  const dec = (n: number | null) => (n === null ? '' : String(n).replace('.', ','))
  const sorted = [...workouts].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  for (const w of sorted) {
    for (const e of w.exercises) {
      const ex = getExercise(e.exerciseId)
      const unit = ex.loadType === 'dumbbell' ? 'одна гантель' : ex.loadType === 'weighted_bodyweight' ? 'отягощение' : ex.loadType === 'bodyweight' ? 'собственный вес' : 'снаряд'
      for (const s of e.sets) {
        rows.push([
          (w.finishedAt ?? w.startedAt).slice(0, 10), weekLabel(w.week), String(w.day), e.exerciseName, e.originalName ?? '', unit,
          s.groupLabel, String(s.index), s.planned.text, dec(s.actual.weight), unit, dec(s.actual.reps), dec(s.actual.rpe),
          s.done ? 'да' : 'нет', dec(w.bodyweight), dec(Math.round(setTonnage(e.exerciseId, s, w.bodyweight) * 10) / 10), e.note,
        ])
      }
    }
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n')
}

export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
