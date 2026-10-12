/** Результат расчёта: число либо понятная причина, почему его нет. NaN/Infinity/0 вместо ошибки не возвращаются. */
export type IssueCode =
  | 'missing-test'
  | 'missing-rpe'
  | 'missing-reps'
  | 'missing-weight'
  | 'missing-bodyweight'
  | 'missing-driver'
  | 'missing-amrap'
  | 'rpe-out-of-range'
  | 'reps-out-of-range'
  | 'invalid-step'
  | 'invalid-weight'
  | 'brzycki-out-of-range'
  | 'not-applicable'

export interface Issue {
  code: IssueCode
  message: string
  /** Тренировка, где нужно записать недостающее значение («неделя-день»). */
  session?: string
}

export type Calc<T = number> = { ok: true; value: T } | { ok: false; issue: Issue }

export const ok = <T>(value: T): Calc<T> => ({ ok: true, value })
export const fail = (code: IssueCode, message: string): Calc<never> => ({ ok: false, issue: { code, message } })

export function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}
