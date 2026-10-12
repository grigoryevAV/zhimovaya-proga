import data from '../program/workbook.generated.json'
import { type Calc, fail, isNum, ok } from '../result'

/** Матрица «доля от 1ПМ» по RPE (6.5–10) и повторениям (1–10): лист «Формулы»!N92:X100. */
export const RPE_VALUES: readonly number[] = data.rpeTable.rpe
export const RPE_REPS: readonly number[] = data.rpeTable.reps
export const RPE_TABLE: readonly (readonly number[])[] = data.rpeTable.table

export const MIN_RPE = 6.5
export const MAX_RPE = 10

/** Допустимое RPE: 6.5…10 с шагом 0.5 (как выпадающий список книги). */
export function validateRpe(rpe: number | null | undefined): Calc {
  if (rpe === null || rpe === undefined || (typeof rpe === 'number' && Number.isNaN(rpe))) {
    return fail('missing-rpe', 'Не указан RPE')
  }
  if (!isNum(rpe) || !RPE_VALUES.includes(rpe)) {
    return fail('rpe-out-of-range', `RPE ${rpe} вне шкалы 6,5–10 (шаг 0,5)`)
  }
  return ok(rpe)
}

/** INDEX/MATCH книги: коэффициент для пары RPE × повторения. Без подмены пустых значений нулём. */
export function rpeCoefficient(rpe: number | null | undefined, reps: number | null | undefined): Calc {
  const r = validateRpe(rpe)
  if (!r.ok) return r
  if (reps === null || reps === undefined) return fail('missing-reps', 'Не указано число повторений')
  if (!isNum(reps) || !Number.isInteger(reps) || reps < 1 || reps > 10) {
    return fail('reps-out-of-range', `Таблица RPE покрывает 1–10 повторений, указано ${reps}`)
  }
  return ok(RPE_TABLE[RPE_VALUES.indexOf(r.value)][reps - 1])
}
