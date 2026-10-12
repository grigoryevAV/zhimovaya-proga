import { type Calc, fail, isNum, ok } from '../result'
import { rpeCoefficient } from './rpeTable'

/** Предел для формулы Бжицки: знаменатель 1.0278 − 0.0278·n обращается в 0 при n ≈ 37. */
export const BRZYCKI_MAX_REPS = 15

function checkWeight(w: number | null | undefined): Calc {
  if (w === null || w === undefined) return fail('missing-weight', 'Не указан вес')
  if (!isNum(w) || w <= 0) return fail('invalid-weight', 'Вес должен быть больше нуля')
  return ok(w)
}

/** Оценка 1ПМ по таблице RPE: вес / коэффициент(RPE, повторения). Тест «до отказа» = RPE 10. */
export function e1rmFromRpe(weight: number | null | undefined, reps: number | null | undefined, rpe: number | null | undefined): Calc {
  const w = checkWeight(weight)
  if (!w.ok) return w
  const c = rpeCoefficient(rpe, reps)
  if (!c.ok) return c
  return ok(w.value / c.value)
}

/**
 * Формула Бжицки из книги: вес / (1.0278 − 0.0278 · n).
 * n — повторения до отказа (или повторения + запас 10 − RPE). Применяется только при 1 ≤ n ≤ 15:
 * дальше оценка теряет смысл, а при n ≥ 37 знаменатель становится ≤ 0.
 */
export function brzycki(weight: number | null | undefined, repsToFailure: number | null | undefined): Calc {
  const w = checkWeight(weight)
  if (!w.ok) return w
  if (repsToFailure === null || repsToFailure === undefined) return fail('missing-reps', 'Не указано число повторений')
  if (!isNum(repsToFailure) || repsToFailure < 1 || repsToFailure > BRZYCKI_MAX_REPS) {
    return fail('brzycki-out-of-range', `Оценка 1ПМ по Бжицки допустима для 1–${BRZYCKI_MAX_REPS} повторений, получено ${repsToFailure}`)
  }
  return ok(w.value / (1.0278 - 0.0278 * repsToFailure))
}

/** Бжицки с запасом: повторения + (10 − RPE), как в формулах недель 4/8/12 жима. */
export function brzyckiRir(weight: number | null | undefined, reps: number | null | undefined, rpe: number | null | undefined): Calc {
  if (rpe === null || rpe === undefined) return fail('missing-rpe', 'Не указан RPE')
  if (!isNum(rpe) || rpe < 6.5 || rpe > 10) return fail('rpe-out-of-range', `RPE ${rpe} вне шкалы 6,5–10`)
  if (reps === null || reps === undefined) return fail('missing-reps', 'Не указано число повторений')
  return brzycki(weight, reps + 10 - rpe)
}
