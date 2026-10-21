/** Построение входа движка из эталона Excel (tests/fixtures/excel-golden.json). */
import golden from './fixtures/excel-golden.json'
import { SLOTS, type SlotId, type WeekId } from '../src/domain/program/definition'
import { type DriverLog, type PlanInput, groupKey } from '../src/domain/program/engine'

export type Cells = Record<string, string | number>
export const SCENARIOS = golden.scenarios as unknown as Record<string, { choices: Record<string, string>; cells: Cells }>
export const BODYWEIGHT = 80

/** Название в книге → упражнение каталога («Подъём штанги на бицепс» и «Отжимания на брусьях» — исходные упражнения книги). */
const NAME_TO_ID: Record<string, string> = {
  'Жим штанги лёжа': 'bench', 'Жим гантелей лёжа': 'db_bench', 'Жим штанги лёжа на наклонной скамье': 'incline_bench',
  'Подтягивания (с отягощением)': 'pullup_weighted', 'Подтягивания (собственный вес)': 'pullup_bw', 'Тяга вертикального блока': 'lat_pulldown',
  'Приседания со штангой': 'squat', 'Жим платформы ногами': 'leg_press', 'Фронтальные приседания': 'front_squat',
  'Махи с гантелями в стороны': 'lateral_raise', 'Тяга к подбородку': 'upright_row', 'Скручивания': 'crunch', 'Экстензия': 'back_extension',
  'Становая тяга': 'deadlift', 'Мёртвая тяга': 'rdl', 'Ягодичный мост': 'glute_bridge', 'Подъём штанги на бицепс': 'barbell_curl', 'Молот': 'hammer_curl',
  'Жим лёжа узким хватом': 'close_grip_bench', 'Отжимания на брусьях (собственный вес)': 'dips', 'Разгибания рук на блоке': 'cable_pushdown',
  'Шраги': 'shrug', 'Подъёмы на носки': 'calf_raise', 'Приседания в колодец': 'box_squat', 'Армейский жим': 'ohp', 'Жим гантелей сидя': 'db_seated_press',
  'Тяга штанги в наклоне': 'bb_row', 'Тяга гантели в наклоне': 'db_row', 'Тяга в хаммере': 'hammer_row', 'Пуловер': 'pullover',
  'Тяга горизонтального блока к поясу': 'cable_row', 'Сгибания ног': 'leg_curl', 'Разгибания ног': 'leg_extension',
}

/** Шаг округления, который книга реально использует для слота (столбец I листа «Формулы»). */
const STEP_CELL: Record<SlotId, string | number> = {
  d1s1: 'E77', d1s2: 'E78', d1s3: 'E79', d1s4: 'E80', d1s5: 1, d2s1: 'E85', d2s2: 'E86', d2s3: 'E87', d2s4: 'E88',
  d2s5: 2.5 /* «Формулы»!I23 — константа вместо ссылки на E89 */, d3s1: 'E93', d3s2: 'E94', d3s3: 'E95', d3s4: 'E96', d3s5: 'E97',
}

const PREP_COLS = { s1: ['F', 'G', 'H'], s2: ['I', 'J', 'K'], s3: ['L', 'M', 'N'] } as const
const PREP2_COLS = { s1: ['O', 'P', 'Q'], s2: ['R', 'S', 'T'], s3: ['U', 'V', 'W'] } as const

export function num(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return null
}

/** fixedWorkbook: исправленная книга берёт шаг слота «+» дня 2 из E89 (в исходной — константа 2,5). */
export function inputFromScenario(cells: Cells, fixedWorkbook = false): PlanInput {
  const choices = {} as Record<SlotId, string | null>
  const steps: Record<string, number> = {}
  const tests: PlanInput['tests'] = {}
  const drivers: Record<string, DriverLog> = {}
  for (const s of SLOTS) {
    const nm = String(cells[`B${s.workbook.prepRow}`] ?? '+').trim()
    const id = nm === '+' ? null : NAME_TO_ID[nm]
    if (id === undefined) throw new Error(`Нет соответствия для «${nm}»`)
    choices[s.id] = id
    if (!id) continue
    const sc = fixedWorkbook && s.id === 'd2s5' ? 'E89' : STEP_CELL[s.id]
    steps[id] = typeof sc === 'number' ? sc : (num(cells[sc]) ?? 1)
    const tw = num(cells[`C${s.workbook.testRow}`])
    const tr = num(cells[`D${s.workbook.testRow}`])
    tests[s.id] = { exerciseId: id, weight: id === 'pullup_weighted' && tw !== null ? tw - BODYWEIGHT : tw, reps: tr, bodyweight: BODYWEIGHT }
    // RPE тяжёлых подходов: столбцы F/M/T каждого мезоцикла
    const blockWeeks: [WeekId, string, number][] = [
      [1, 'F', 0], [2, 'M', 0], [3, 'T', 0], [5, 'F', 27], [6, 'M', 27], [7, 'T', 27], [9, 'F', 54], [10, 'M', 54], [11, 'T', 54],
    ]
    for (const [w, col, off] of blockWeeks) {
      const rpe = num(cells[`${col}${s.workbook.mesoRow + off}`])
      if (rpe !== null) drivers[groupKey(w, s.id, 'top')] = { exerciseId: id, weight: null, reps: null, rpe }
    }
    // подготовительный период
    const pr = s.workbook.prepRow
    for (const [g, [wc, rc, ec]] of Object.entries(PREP_COLS)) {
      drivers[groupKey('P1', s.id, g)] = {
        exerciseId: id, weight: g === 's1' ? num(cells[`${wc}${pr}`]) : null,
        reps: g === 's1' ? num(cells[`${rc}${pr}`]) : null, rpe: num(cells[`${ec}${pr}`]), bodyweight: BODYWEIGHT,
      }
    }
    for (const [g, cols] of Object.entries(PREP2_COLS)) {
      drivers[groupKey('P2', s.id, g)] = { exerciseId: id, weight: null, reps: null, rpe: num(cells[`${cols[2]}${pr}`]), bodyweight: BODYWEIGHT }
    }
  }
  // жим: RPE подсобного подхода недель 3/7/11, AMRAP недель 4/8, синглы недели 12
  for (const [w, cell] of [[3, 'X162'], [7, 'X189'], [11, 'X216']] as const) {
    drivers[groupKey(w, 'd2s1', 'back')] = { exerciseId: 'bench', weight: null, reps: null, rpe: num(cells[cell]) }
  }
  drivers[groupKey(4, 'd2s1', 'amrap')] = { exerciseId: 'bench', weight: null, reps: num(cells.AH162), rpe: null }
  drivers[groupKey(8, 'd2s1', 'amrap')] = { exerciseId: 'bench', weight: null, reps: num(cells.AH189), rpe: null }
  drivers[groupKey(12, 'd2s1', 'single')] = { exerciseId: 'bench', weight: null, reps: null, rpe: num(cells.AI216) }
  drivers[groupKey(12, 'd1s1', 'main')] = { exerciseId: 'bench', weight: null, reps: null, rpe: num(cells.AI208) }
  return { choices, steps, tests, bodyweight: BODYWEIGHT, drivers }
}

/** Ячейки книги для группы подходов: [вес, подходы, повторения] (подходы пустые для подготовки). */
export function cellsForGroup(slotId: SlotId, week: WeekId, groupId: string): [string, string, string] | null {
  const slot = SLOTS.find((s) => s.id === slotId)!
  if (week === 'P1' || week === 'P2') {
    const map = week === 'P1' ? PREP_COLS : PREP2_COLS
    const c = map[groupId as keyof typeof map]
    if (!c) return null
    return [`${c[0]}${slot.workbook.prepRow}`, '', `${c[1]}${slot.workbook.prepRow}`]
  }
  if (week === 'T') return null
  const meso = Math.floor((week - 1) / 4)
  const r = slot.workbook.mesoRow + 27 * meso
  const pos = (week - 1) % 4
  const cc = (a: string, b: string, c: string): [string, string, string] => [`${a}${r}`, `${b}${r}`, `${c}${r}`]
  if (pos < 3) {
    const top = [['C', 'D', 'E'], ['J', 'K', 'L'], ['Q', 'R', 'S']][pos]
    const back = [['G', 'H', 'I'], ['N', 'O', 'P'], ['U', 'V', 'W']][pos]
    if (groupId === 'top') return cc(top[0], top[1], top[2])
    if (groupId === 'back') return cc(back[0], back[1], back[2])
    if (groupId === 'extra1') return cc('Y', 'Z', 'AA')
    if (groupId === 'extra2') return cc('AC', 'AD', 'AE')
    return null
  }
  if (groupId === 'main' || groupId === 'single' || (groupId === 'amrap' && week !== 12)) return cc('AF', 'AG', 'AH')
  if (groupId === 'back' && slotId === 'd1s1' && week === 12) return cc('AJ', 'AK', 'AL')
  if (groupId === 'back') return cc('AI', 'AJ', 'AK')
  if (groupId === 'attempt') return cc('AJ', 'AK', 'AL')
  if (groupId === 'amrap' && week === 12) return cc('AN', 'AO', 'AP')
  return null
}
