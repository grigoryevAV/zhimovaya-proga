/** Форматирование и разбор чисел для русского интерфейса (десятичная запятая). */
import type { LoadTarget, PlannedGroup, RepsTarget } from './program/engine'

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return nf.format(n)
}

export function fmtKg(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '—' : `${fmt(n)} кг`
}

/** «82,5», «82.5», « 82 » → 82.5 / 82; пусто или мусор → null. */
export function parseNum(s: string | number | null | undefined): number | null {
  if (s === null || s === undefined) return null
  if (typeof s === 'number') return Number.isFinite(s) ? s : null
  const t = s.trim().replace(/\s/g, '').replace(',', '.')
  if (t === '' || !/^-?\d*\.?\d+$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function repsText(r: RepsTarget): string {
  switch (r.kind) {
    case 'fixed': return String(r.value)
    case 'amrap': return 'макс.'
    case 'toFailure': return 'до отказа'
    case 'choose': return 'подберите'
    case 'issue': return '?'
  }
}

function missingText(code: string): string {
  if (code === 'missing-driver') return 'ждёт RPE'
  if (code === 'missing-amrap') return 'ждёт повторений'
  if (code === 'missing-test') return 'нужен тест'
  if (code === 'missing-bodyweight') return 'нужен вес тела'
  return 'нет данных'
}

export function loadText(l: LoadTarget): string {
  switch (l.kind) {
    case 'weight': return l.value.ok ? fmtKg(l.value.value) : missingText(l.value.issue.code)
    case 'weighted_bw':
      if (!l.added.ok) return missingText(l.added.issue.code)
      return l.added.value >= 0 ? `+${fmtKg(l.added.value)}` : `−${fmtKg(-l.added.value)} (помощь)`
    case 'bodyweight': return 'собств. вес'
    case 'choose': return 'подберите вес'
  }
}

/** Текст группы: «3 × 3 · 80 кг». */
export function groupText(g: PlannedGroup): string {
  if (g.load.kind === 'choose') return `${g.sets} × ${g.reps.kind === 'amrap' ? 'макс. повторений' : 'подберите вес'}: ${g.load.hint}`
  if (g.reps.kind === 'choose') return `${g.sets} подход: ${g.reps.hint}`
  return `${g.sets} × ${repsText(g.reps)} · ${loadText(g.load)}`
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export function fmtDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
