/**
 * Таймер отдыха. Живёт в localStorage и привязан к тренировке: на экране другой тренировки
 * таймер не показывается, а закончившийся больше 30 минут назад удаляется при чтении.
 * Функции чистые — принимают хранилище и «сейчас», чтобы их можно было проверить без браузера.
 */

export interface TimerState {
  /** Тренировка, к которой относится таймер. */
  workoutId: string
  /** Когда таймер закончится (мс epoch). */
  endsAt: number
  /** Длительность отдыха, с (для шкалы). */
  total: number
}

/** Минимальное хранилище: localStorage удовлетворяет этому интерфейсу. */
export interface TimerStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const TIMER_KEY = 'zp-rest-timer'
/** Таймер, закончившийся больше 30 минут назад, считается протухшим. */
export const TIMER_STALE_MS = 30 * 60 * 1000

/** Привести значение из хранилища к таймеру. null — мусор или протухший таймер. */
export function normalizeTimer(raw: unknown, now: number): TimerState | null {
  if (typeof raw !== 'object' || raw === null) return null
  const t = raw as Partial<TimerState>
  if (typeof t.workoutId !== 'string' || !t.workoutId) return null
  if (typeof t.endsAt !== 'number' || !Number.isFinite(t.endsAt)) return null
  const total = typeof t.total === 'number' && Number.isFinite(t.total) && t.total > 0 ? t.total : 0
  if (now - t.endsAt > TIMER_STALE_MS) return null
  return { workoutId: t.workoutId, endsAt: t.endsAt, total }
}

/** Прочитать таймер: протухший удаляем, чужой тренировке не показываем. */
export function readTimer(storage: TimerStorage | null, now: number, workoutId: string): TimerState | null {
  if (!storage) return null
  let raw: string | null
  try {
    raw = storage.getItem(TIMER_KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  let parsed: unknown = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = null
  }
  const t = normalizeTimer(parsed, now)
  if (!t) {
    try {
      storage.removeItem(TIMER_KEY)
    } catch {
      /* хранилище недоступно — таймер просто не переживёт перезагрузку */
    }
    return null
  }
  if (t.workoutId !== workoutId) return null
  return t
}

/** Сохранить или убрать таймер. */
export function writeTimer(storage: TimerStorage | null, t: TimerState | null): void {
  if (!storage) return
  try {
    if (t) storage.setItem(TIMER_KEY, JSON.stringify(t))
    else storage.removeItem(TIMER_KEY)
  } catch {
    /* хранилище недоступно — таймер просто не переживёт перезагрузку */
  }
}
