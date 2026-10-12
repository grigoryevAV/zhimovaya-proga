/** Записи локальной базы (IndexedDB). Версия схемы — SCHEMA_VERSION в db.ts. */
import type { LoadType } from '../domain/exercises/catalog'
import type { Day, SlotId, WeekId } from '../domain/program/definition'

export type Theme = 'dark' | 'light'

export interface ProfileRow {
  id: 'me'
  theme: Theme
  /** Выбор упражнения в каждом слоте (null — слот «+» пуст). */
  choices: Record<SlotId, string | null>
  /** Шаг округления по упражнению, кг. */
  steps: Record<string, number>
  /** Выбранный шаблон прогрессии для упражнений с выбором «рабочего диапазона». */
  schemeRows: Record<string, number>
  restHeavySec: number
  restMediumSec: number
  restLightSec: number
  warmup: { bench: number | null; deadlift: number | null }
  createdAt: string
  updatedAt: string
}

export interface BodyweightRow {
  id?: number
  /** YYYY-MM-DD */
  date: string
  kg: number
}

export interface TestRow {
  slotId: SlotId
  exerciseId: string
  /** Отягощения — навешенный вес; гантели — одна гантель; собственный вес — null. */
  weight: number | null
  reps: number | null
  rpe: number | null
  date: string
  bodyweight: number | null
}

export type PlannedReps = number | 'amrap' | 'toFailure' | null

export interface WorkoutSet {
  groupId: string
  groupLabel: string
  /** Номер подхода внутри группы, с 1. */
  index: number
  driver: 'rpe' | 'amrap' | null
  planned: {
    /** Как вводит пользователь: отягощение / одна гантель / вес снаряда; null — собственный вес или «подберите». */
    weight: number | null
    reps: PlannedReps
    /** Текст на момент сохранения, например «80 кг × 3» или «ждёт RPE недели 2». */
    text: string
  }
  actual: { weight: number | null; reps: number | null; rpe: number | null }
  done: boolean
  /** Подход добавлен вручную (не из плана). */
  extra?: boolean
}

export interface WorkoutExercise {
  slotId: SlotId
  exerciseId: string
  exerciseName: string
  /** Исходное название в книге, если упражнение — персональная замена. */
  originalName?: string
  loadType: LoadType
  step: number
  note: string
  sets: WorkoutSet[]
}

export interface WorkoutRow {
  id: string
  sessionId: string
  week: WeekId
  day: Day
  status: 'active' | 'done'
  startedAt: string
  finishedAt?: string
  /** Версия алгоритма, по которому рассчитаны плановые значения. */
  algorithmVersion: string
  /** Вес тела на момент тренировки (для отягощений и тоннажа). */
  bodyweight: number | null
  note: string
  exercises: WorkoutExercise[]
}

export interface OverrideRow {
  key: string
  weight?: number
  sets?: number
  reps?: number
  updatedAt: string
}

export interface ChangeRow {
  id?: number
  at: string
  kind: 'choice' | 'step' | 'scheme' | 'test' | 'override' | 'bodyweight' | 'import' | 'reset' | 'settings' | 'workout'
  text: string
}

export interface BackupData {
  profile: ProfileRow | null
  bodyweights: BodyweightRow[]
  tests: TestRow[]
  workouts: WorkoutRow[]
  overrides: OverrideRow[]
  changes: ChangeRow[]
}

export interface BackupFile {
  app: 'zhimovaya-proga'
  schemaVersion: number
  algorithmVersion: string
  exportedAt: string
  data: BackupData
}
