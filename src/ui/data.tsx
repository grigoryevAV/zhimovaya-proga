/** Данные приложения: живые запросы к IndexedDB и рассчитанный план. */
import { useLiveQuery } from 'dexie-react-hooks'
import { type ReactNode, createContext, useContext, useEffect, useMemo } from 'react'
import { WEEKS, type Day, type WeekId } from '../domain/program/definition'
import { PlanEngine, type PlannedSession, sessionId } from '../domain/program/engine'
import { bodyweightAt, buildPlanInput } from '../domain/progression/fromLogs'
import { db, ensureProfile } from '../storage/db'
import type { BodyweightRow, ChangeRow, OverrideRow, ProfileRow, TestRow, WorkoutRow } from '../storage/types'

export interface AppData {
  profile: ProfileRow
  tests: TestRow[]
  bodyweights: BodyweightRow[]
  workouts: WorkoutRow[]
  overrides: OverrideRow[]
  changes: ChangeRow[]
  bodyweight: number | null
  engine: PlanEngine
  sessions: PlannedSession[]
  workoutBySession: Map<string, WorkoutRow>
  active: WorkoutRow | undefined
  /** Следующая тренировка по порядку (первая без завершённой записи). */
  next: PlannedSession | undefined
  doneCount: number
}

const Ctx = createContext<AppData | null>(null)

export const ORDER: { week: WeekId; day: Day }[] = WEEKS.flatMap((week) => ([1, 2, 3] as Day[]).map((day) => ({ week, day })))

export function DataProvider({ children }: { children: ReactNode }) {
  useEffect(() => { void ensureProfile() }, [])
  const profile = useLiveQuery(() => db.profile.get('me'))
  const tests = useLiveQuery(() => db.tests.toArray(), [])
  const bodyweights = useLiveQuery(() => db.bodyweights.toArray(), [])
  const workouts = useLiveQuery(() => db.workouts.toArray(), [])
  const overrides = useLiveQuery(() => db.overrides.toArray(), [])
  const changes = useLiveQuery(() => db.changes.orderBy('at').reverse().limit(200).toArray(), [])

  const value = useMemo<AppData | null>(() => {
    if (!profile || !tests || !bodyweights || !workouts || !overrides || !changes) return null
    const engine = new PlanEngine(buildPlanInput({ profile, tests, bodyweights, workouts, overrides }))
    const sessions = ORDER.map(({ week, day }) => engine.session(week, day))
    const workoutBySession = new Map(workouts.map((w) => [w.sessionId, w]))
    const active = workouts.find((w) => w.status === 'active')
    const next = sessions.find((s) => workoutBySession.get(s.id)?.status !== 'done')
    return {
      profile, tests, bodyweights, workouts, overrides, changes,
      bodyweight: bodyweightAt(bodyweights), engine, sessions, workoutBySession, active, next,
      doneCount: workouts.filter((w) => w.status === 'done').length,
    }
  }, [profile, tests, bodyweights, workouts, overrides, changes])

  useEffect(() => {
    if (!value) return
    document.documentElement.dataset.theme = value.profile.theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value.profile.theme === 'light' ? '#f3f5f8' : '#0f1115')
  }, [value?.profile.theme])

  if (!value) return <div className="empty">Загрузка…</div>
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData(): AppData {
  const v = useContext(Ctx)
  if (!v) throw new Error('DataProvider не найден')
  return v
}

export function findSession(d: AppData, id: string): PlannedSession | undefined {
  return d.sessions.find((s) => s.id === id)
}

export { sessionId }
