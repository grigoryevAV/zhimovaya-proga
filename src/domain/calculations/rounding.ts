import { type Calc, fail, isNum, ok } from '../result'

/** Шаги округления, которые реально встречаются в книге (Коэффициенты!O18:O22). */
export const ROUNDING_STEPS = [1, 2, 2.5, 3, 5] as const

/** Убирает хвосты двоичной арифметики (72.49999999 → 72.5) перед округлением. */
function clean(q: number): number {
  return Number(q.toFixed(9))
}

function checkStep(step: number): Calc<number> {
  if (!isNum(step) || step <= 0) return fail('invalid-step', 'Шаг округления должен быть больше нуля')
  return ok(step)
}

/** Excel MROUND: к БЛИЖАЙШЕМУ кратному шагу, половина — от нуля. */
export function mround(x: number, step: number): Calc {
  const s = checkStep(step)
  if (!s.ok) return s
  if (!isNum(x)) return fail('invalid-weight', 'Нет числа для округления')
  const q = clean(Math.abs(x) / step)
  return ok(Math.sign(x) * clean(Math.floor(q + 0.5) * step))
}

/** Excel CEILING(x, step) для положительных чисел: вверх до кратного. */
export function ceilingStep(x: number, step: number): Calc {
  const s = checkStep(step)
  if (!s.ok) return s
  if (!isNum(x)) return fail('invalid-weight', 'Нет числа для округления')
  return ok(clean(Math.ceil(clean(x / step)) * step))
}

/** Excel FLOOR(x, step) для положительных чисел: вниз до кратного. */
export function floorStep(x: number, step: number): Calc {
  const s = checkStep(step)
  if (!s.ok) return s
  if (!isNum(x)) return fail('invalid-weight', 'Нет числа для округления')
  return ok(clean(Math.floor(clean(x / step)) * step))
}
