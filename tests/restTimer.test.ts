import { describe, expect, it } from 'vitest'
import { TIMER_KEY, TIMER_STALE_MS, normalizeTimer, readTimer, writeTimer } from '../src/ui/restTimer'

/** Простое хранилище вместо localStorage (чистые функции без окна браузера). */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
  }
}

describe('К4 — таймер отдыха привязан к тренировке', () => {
  it('нормализация: мусор отбрасывается, протухший таймер — тоже', () => {
    expect(normalizeTimer(null, 1000)).toBeNull()
    expect(normalizeTimer('строка', 1000)).toBeNull()
    expect(normalizeTimer({ endsAt: 1000, total: 60 }, 1000)).toBeNull()
    expect(normalizeTimer({ workoutId: 'w1', endsAt: 'x' }, 1000)).toBeNull()
    expect(normalizeTimer({ workoutId: 'w1', endsAt: 1000, total: 60 }, 1000)).toEqual({ workoutId: 'w1', endsAt: 1000, total: 60 })
    // закончился минуту назад — показываем
    expect(normalizeTimer({ workoutId: 'w1', endsAt: 1000 - 60_000, total: 60 }, 1000)).not.toBeNull()
    // закончился больше 30 минут назад — протух
    expect(normalizeTimer({ workoutId: 'w1', endsAt: 1000 - TIMER_STALE_MS - 1, total: 60 }, 1000)).toBeNull()
  })

  it('таймер другой тренировки не показывается', () => {
    const s = fakeStorage()
    writeTimer(s, { workoutId: 'w2', endsAt: 5000, total: 60 })
    expect(readTimer(s, 1000, 'w1')).toBeNull()
    expect(readTimer(s, 1000, 'w2')).toEqual({ workoutId: 'w2', endsAt: 5000, total: 60 })
  })

  it('протухший таймер удаляется при чтении', () => {
    const s = fakeStorage({ [TIMER_KEY]: JSON.stringify({ workoutId: 'w1', endsAt: 0, total: 60 }) })
    expect(readTimer(s, TIMER_STALE_MS + 1, 'w1')).toBeNull()
    expect(s.map.has(TIMER_KEY)).toBe(false)
  })

  it('битый JSON не ломает чтение и удаляется', () => {
    const s = fakeStorage({ [TIMER_KEY]: '{не json' })
    expect(readTimer(s, 1000, 'w1')).toBeNull()
    expect(s.map.has(TIMER_KEY)).toBe(false)
  })

  it('запись и очистка', () => {
    const s = fakeStorage()
    writeTimer(s, { workoutId: 'w1', endsAt: 5000, total: 60 })
    expect(JSON.parse(s.map.get(TIMER_KEY)!)).toMatchObject({ workoutId: 'w1', endsAt: 5000, total: 60 })
    writeTimer(s, null)
    expect(s.map.has(TIMER_KEY)).toBe(false)
  })
})
