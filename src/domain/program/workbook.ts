/** Типизированный доступ к таблицам, извлечённым из листа «Формулы» (scripts/extract_workbook.py). */
import data from './workbook.generated.json'

export interface BwRepsRef {
  fromTest?: boolean
  fromBlock?: number
  minus: number
  formula?: string
}

export interface SchemeBlock {
  week: number
  cells?: { top: string; back: string; rpe: string }
  rpeSource?: string
  topSets: number | { sameOtherDay: number; otherwise: number; formula?: string }
  backSets: number
  /** Только для упражнений с весом. */
  top?: { kind: 'testRpe' | 'fromTop' | 'amrapBrzycki'; k: number; formula?: string }
  back?: { k: number | null; formula?: string }
  topReps: number | BwRepsRef
  backReps: number | 'toFailure' | BwRepsRef
}

export interface SchemeRow {
  row: number
  name: string
  link?: string | null
  bodyweight: boolean
  blocks: SchemeBlock[]
}

const rows = data.rows as unknown as Record<string, SchemeRow>

export function schemeRow(row: number): SchemeRow {
  const r = rows[String(row)]
  if (!r) throw new Error(`Нет строки ${row} в таблице «Формулы»`)
  return r
}

export const SCHEME_ROWS: SchemeRow[] = Object.values(rows)
