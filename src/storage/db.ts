/** Локальная база в IndexedDB (Dexie). Сервера нет: данные живут только в этом браузере. */
import Dexie, { type Table } from 'dexie'
import { defaultChoices } from '../domain/program/definition'
import type { BodyweightRow, ChangeRow, OverrideRow, ProfileRow, TestRow, WorkoutRow } from './types'

/** Версия схемы хранения. Повышается вместе с миграцией в migrate() и в Dexie.version(). */
export const SCHEMA_VERSION = 1

export class AppDB extends Dexie {
  profile!: Table<ProfileRow, string>
  bodyweights!: Table<BodyweightRow, number>
  tests!: Table<TestRow, string>
  workouts!: Table<WorkoutRow, string>
  overrides!: Table<OverrideRow, string>
  changes!: Table<ChangeRow, number>

  constructor(name = 'zhimovaya-proga') {
    super(name)
    this.version(SCHEMA_VERSION).stores({
      profile: 'id',
      bodyweights: '++id, date',
      tests: 'slotId',
      workouts: 'id, sessionId, status, startedAt',
      overrides: 'key',
      changes: '++id, at',
    })
  }
}

export let db = new AppDB()

/** Для тестов: отдельная база с другим именем. */
export function useDatabase(name: string): AppDB {
  db = new AppDB(name)
  return db
}

export function defaultProfile(now = new Date().toISOString()): ProfileRow {
  return {
    id: 'me',
    theme: 'dark',
    choices: defaultChoices(),
    steps: {},
    schemeRows: {},
    restHeavySec: 300,
    restMediumSec: 180,
    restLightSec: 120,
    warmup: { bench: null, deadlift: null },
    createdAt: now,
    updatedAt: now,
  }
}

export async function ensureProfile(d: AppDB = db): Promise<ProfileRow> {
  const p = await d.profile.get('me')
  if (p) return p
  const fresh = defaultProfile()
  await d.profile.put(fresh)
  return fresh
}

/** Долговременное хранение: просим браузер не очищать базу при нехватке места. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist()
  } catch {
    /* браузер не поддерживает — данные всё равно сохраняются */
  }
  return false
}
