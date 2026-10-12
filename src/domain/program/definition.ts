/**
 * Структура программы «Жимовая прога v 2.0»: 3 дня × 5 слотов, подготовительный период (2 недели),
 * тестовая неделя и 12 недель (3 мезоцикла). Все числа — из книги; ячейки-источники указаны рядом.
 * Отступления от книги помечены «ИСПРАВЛЕНО» или «ДОПУЩЕНИЕ» и описаны в docs/WORKBOOK_AUDIT.md.
 */

export type SlotId =
  | 'd1s1' | 'd1s2' | 'd1s3' | 'd1s4' | 'd1s5'
  | 'd2s1' | 'd2s2' | 'd2s3' | 'd2s4' | 'd2s5'
  | 'd3s1' | 'd3s2' | 'd3s3' | 'd3s4' | 'd3s5'

export type Day = 1 | 2 | 3

/** Правило недель 4/8/12 («Программа тренировок»!AF:AK). */
export type DeloadRule =
  | { kind: 'brzycki'; k: number; sets: number; reps: number } // MROUND(Бжицки(тест) × k)
  | { kind: 'bwReps'; minus: number; sets: number } // повторения теста − minus

export interface DeloadSet {
  4: DeloadRule
  8: DeloadRule
  12: DeloadRule
}

export interface SlotOption {
  exerciseId: string
  /** Строка листа «Формулы» с таблицей прогрессии. */
  schemeRow: number
  /** Шаблоны прогрессии, из которых пользователь может выбрать «рабочий диапазон» (для персональных замен). */
  schemeOptions?: { row: number; label: string }[]
  /** «Формулы»!N/O: если в указанном слоте выбрано то же упражнение — используется его тест. */
  shareTestWith?: SlotId
  /** «Формулы»!R: тяжёлых подходов 1, если в указанном слоте то же упражнение, иначе 3. */
  topSetsSameAs?: SlotId
  /** Особая логика жима лёжа (недели 3–5, 7–9, 11–12 связаны между днями). */
  special?: 'bench-d1' | 'bench-d2'
  /** Свои правила недель 4/8/12 (иначе — правила слота). */
  deload?: DeloadSet
  deloadNote?: string
}

export interface PrepConfig {
  /** Условие первого подхода («Программа тренировок»!C:D). */
  condition: string
  rpeRange: string
  /** Коэффициенты подходов 2–3 недели 1 и 1–3 недели 2 (I, L, O, R, U). */
  k: [number, number, number, number, number]
  /** Повторения тех же подходов (J, M, P, S, V). */
  reps: [number, number, number, number, number]
  /**
   * Для упражнений с собственным весом: 'const' — повторения-константы книги (строки 88/96),
   * 'chain' — прибавка повторений по RPE, как в строке 81: следующий = пред. + (10 − RPE − d).
   */
  bwMode: 'const' | 'chain'
  bwChainMinus: [number, number, number, number, number]
}

export interface SlotDef {
  id: SlotId
  day: Day
  order: number
  role: string
  /** Слот «+»: упражнение можно не выбирать. */
  optional: boolean
  defaultExercise: string | null
  options: SlotOption[]
  prep: PrepConfig
  deload: DeloadSet
  /** Правила недель 4/8/12 для упражнений с собственным весом в этом слоте. */
  deloadBw: DeloadSet
  deloadNote?: string
  /** Строки книги: подготовительный период, тестовая неделя, мезоцикл 1. */
  workbook: { prepRow: number; testRow: number; mesoRow: number }
}

const MAIN: DeloadSet = { // «Программа тренировок»!AF156/AF183/AF210 и аналогичные
  4: { kind: 'brzycki', k: 0.68, sets: 4, reps: 8 },
  8: { kind: 'brzycki', k: 0.7, sets: 3, reps: 8 },
  12: { kind: 'brzycki', k: 0.72, sets: 3, reps: 8 },
}
const MAIN_ARMS: DeloadSet = { // AF164/AF191/AF218 (бицепс): неделя 12 — 0.7
  4: { kind: 'brzycki', k: 0.68, sets: 4, reps: 8 },
  8: { kind: 'brzycki', k: 0.7, sets: 3, reps: 8 },
  12: { kind: 'brzycki', k: 0.7, sets: 3, reps: 8 },
}
const ISO: DeloadSet = { // AF157/AF184/AF211 (махи), AF165/AF192/AF219 (трицепс)
  4: { kind: 'brzycki', k: 0.65, sets: 3, reps: 10 },
  8: { kind: 'brzycki', k: 0.68, sets: 3, reps: 8 },
  12: { kind: 'brzycki', k: 0.7, sets: 3, reps: 8 },
}
const DB_PRESS: DeloadSet = { // AF171/AF198/AF225 (жим гантелей сидя)
  4: { kind: 'brzycki', k: 0.65, sets: 3, reps: 10 },
  8: { kind: 'brzycki', k: 0.68, sets: 3, reps: 8 },
  12: { kind: 'brzycki', k: 0.72, sets: 3, reps: 8 },
}
const BW: DeloadSet = { // AH155/AH182/AH209: повторения теста − 4 / − 3 / − 3
  4: { kind: 'bwReps', minus: 4, sets: 4 },
  8: { kind: 'bwReps', minus: 3, sets: 3 },
  12: { kind: 'bwReps', minus: 3, sets: 3 },
}

const PREP_HEAVY = (condition: string, k: PrepConfig['k'], reps: PrepConfig['reps']): PrepConfig => ({
  condition, rpeRange: '7–9', k, reps, bwMode: 'chain', bwChainMinus: [3, 2, 2, 1, 1],
})
const K_MAIN: PrepConfig['k'] = [0.8, 0.8, 0.82, 0.8, 0.78]
const K_D3: PrepConfig['k'] = [0.8, 0.8, 0.82, 0.8, 0.8]
const K_LIGHT: PrepConfig['k'] = [0.72, 0.72, 0.72, 0.72, 0.69]
const R_MAIN: PrepConfig['reps'] = [5, 5, 4, 5, 6]
const R_D3: PrepConfig['reps'] = [5, 5, 4, 5, 5]
const R_LIGHT: PrepConfig['reps'] = [8, 8, 6, 8, 10]

export const SLOTS: SlotDef[] = [
  // ---------------- День 1 ----------------
  {
    id: 'd1s1', day: 1, order: 1, role: 'Жим', optional: false, defaultExercise: 'bench',
    options: [
      { exerciseId: 'bench', schemeRow: 9, special: 'bench-d1' },
      {
        exerciseId: 'db_bench', schemeRow: 10, deload: DB_PRESS,
        deloadNote: 'ДОПУЩЕНИЕ: в книге недели 4/8/12 этого слота всегда считаются от жима штанги дня 2; для гантелей взяты правила «Жима гантелей сидя».',
      },
      {
        exerciseId: 'incline_bench', schemeRow: 11, topSetsSameAs: 'd2s1', deload: MAIN,
        deloadNote: 'ДОПУЩЕНИЕ: в книге недели 4/8/12 этого слота считаются от жима штанги дня 2; для наклонного жима взяты правила базовых упражнений.',
      },
    ],
    prep: PREP_HEAVY('6–8ПМ', K_MAIN, R_MAIN), deload: MAIN, deloadBw: BW,
    workbook: { prepRow: 77, testRow: 111, mesoRow: 154 },
  },
  {
    id: 'd1s2', day: 1, order: 2, role: 'Вертикальная тяга', optional: false, defaultExercise: 'pullup_weighted',
    options: [
      { exerciseId: 'pullup_weighted', schemeRow: 13 },
      { exerciseId: 'pullup_bw', schemeRow: 14 },
      { exerciseId: 'lat_pulldown', schemeRow: 15 },
    ],
    prep: PREP_HEAVY('6–8ПМ', K_MAIN, R_MAIN), deload: MAIN, deloadBw: BW,
    workbook: { prepRow: 78, testRow: 112, mesoRow: 155 },
  },
  {
    id: 'd1s3', day: 1, order: 3, role: 'Ноги', optional: false, defaultExercise: 'squat',
    options: [
      { exerciseId: 'squat', schemeRow: 54 },
      { exerciseId: 'leg_press', schemeRow: 55 },
      { exerciseId: 'front_squat', schemeRow: 56 },
    ],
    prep: PREP_HEAVY('8–10ПМ', K_MAIN, R_MAIN), deload: MAIN, deloadBw: BW,
    workbook: { prepRow: 79, testRow: 113, mesoRow: 156 },
  },
  {
    id: 'd1s4', day: 1, order: 4, role: 'Дельты', optional: false, defaultExercise: 'lateral_raise',
    options: [
      { exerciseId: 'lateral_raise', schemeRow: 21 },
      { exerciseId: 'upright_row', schemeRow: 22 },
    ],
    prep: PREP_HEAVY('10–12ПМ', K_LIGHT, R_LIGHT), deload: ISO, deloadBw: BW,
    workbook: { prepRow: 80, testRow: 114, mesoRow: 157 },
  },
  {
    id: 'd1s5', day: 1, order: 5, role: 'Дополнительно «+»', optional: true, defaultExercise: null,
    options: [
      { exerciseId: 'crunch', schemeRow: 68 },
      { exerciseId: 'back_extension', schemeRow: 69 },
    ],
    prep: { ...PREP_HEAVY('собств. вес', K_LIGHT, R_LIGHT), bwMode: 'chain' },
    deload: ISO, deloadBw: BW,
    deloadNote: 'ДОПУЩЕНИЕ: в книге для строки «+» недели 4/8/12 не заполнены; используются правила подтягиваний с собственным весом.',
    workbook: { prepRow: 81, testRow: 115, mesoRow: 158 },
  },
  // ---------------- День 2 ----------------
  {
    id: 'd2s1', day: 2, order: 1, role: 'Жим (закреплён)', optional: false, defaultExercise: 'bench',
    options: [{ exerciseId: 'bench', schemeRow: 28, shareTestWith: 'd1s1', special: 'bench-d2' }],
    prep: PREP_HEAVY('8–10ПМ', K_MAIN, R_MAIN), deload: MAIN, deloadBw: BW,
    workbook: { prepRow: 85, testRow: 119, mesoRow: 162 },
  },
  {
    id: 'd2s2', day: 2, order: 2, role: 'Тяга / таз', optional: false, defaultExercise: 'deadlift',
    options: [
      { exerciseId: 'deadlift', schemeRow: 24 },
      { exerciseId: 'rdl', schemeRow: 25 },
      { exerciseId: 'glute_bridge', schemeRow: 26 },
    ],
    prep: PREP_HEAVY('6–8ПМ', K_MAIN, R_MAIN), deload: MAIN, deloadBw: BW,
    workbook: { prepRow: 86, testRow: 120, mesoRow: 163 },
  },
  {
    id: 'd2s3', day: 2, order: 3, role: 'Бицепс', optional: false, defaultExercise: 'scott_machine_curl',
    options: [
      {
        exerciseId: 'scott_machine_curl', schemeRow: 33,
        schemeOptions: [
          { row: 33, label: '5→3 повт. + подсобные 6→4 (как в книге для бицепса)' },
          { row: 34, label: '6→4 повт. + 1 подход до отказа («Молот»)' },
        ],
      },
      { exerciseId: 'barbell_curl', schemeRow: 33 },
      { exerciseId: 'hammer_curl', schemeRow: 34 },
    ],
    prep: PREP_HEAVY('6–8ПМ', K_MAIN, R_MAIN), deload: MAIN_ARMS, deloadBw: BW,
    workbook: { prepRow: 87, testRow: 121, mesoRow: 164 },
  },
  {
    id: 'd2s4', day: 2, order: 4, role: 'Трицепс / жим', optional: false, defaultExercise: 'db_squeeze_incline30',
    options: [
      { exerciseId: 'close_grip_bench', schemeRow: 36 },
      {
        exerciseId: 'db_squeeze_incline30', schemeRow: 45, deload: DB_PRESS,
        schemeOptions: [
          { row: 45, label: '6→4 повт. + 1 подход до отказа (шаблон гантельного жима)' },
          { row: 38, label: '10→8 повт. + 1 подход до отказа (изолирующий шаблон)' },
          { row: 36, label: '5→3 повт. + подсобные 6→4 (тяжёлый шаблон)' },
        ],
        deloadNote: 'Собственные правила: шаблон «Жим гантелей сидя», без коэффициентов отжиманий на брусьях.',
      },
      { exerciseId: 'dips', schemeRow: 37 },
      { exerciseId: 'cable_pushdown', schemeRow: 38 },
    ],
    prep: { ...PREP_HEAVY('10–12ПМ', K_LIGHT, R_LIGHT), bwMode: 'const' }, deload: ISO, deloadBw: BW,
    workbook: { prepRow: 88, testRow: 122, mesoRow: 165 },
  },
  {
    id: 'd2s5', day: 2, order: 5, role: 'Дополнительно «+»', optional: true, defaultExercise: null,
    options: [
      { exerciseId: 'shrug', schemeRow: 40 },
      { exerciseId: 'calf_raise', schemeRow: 41 },
    ],
    prep: PREP_HEAVY('10–12ПМ', K_LIGHT, R_LIGHT), deload: ISO, deloadBw: BW,
    deloadNote: 'ДОПУЩЕНИЕ: в книге для строки «+» недели 4/8/12 не заполнены; используются правила изолирующих упражнений.',
    workbook: { prepRow: 89, testRow: 123, mesoRow: 166 },
  },
  // ---------------- День 3 ----------------
  {
    id: 'd3s1', day: 3, order: 1, role: 'Ноги', optional: false, defaultExercise: 'squat',
    options: [
      { exerciseId: 'squat', schemeRow: 17, shareTestWith: 'd1s3', topSetsSameAs: 'd1s3' },
      { exerciseId: 'box_squat', schemeRow: 18 },
      { exerciseId: 'glute_bridge', schemeRow: 19, shareTestWith: 'd2s2', topSetsSameAs: 'd2s2' },
    ],
    prep: PREP_HEAVY('6–8ПМ', K_D3, R_D3), deload: MAIN, deloadBw: BW,
    workbook: { prepRow: 93, testRow: 127, mesoRow: 170 },
  },
  {
    id: 'd3s2', day: 3, order: 2, role: 'Жим вверх', optional: false, defaultExercise: 'db_seated_press',
    options: [
      { exerciseId: 'ohp', schemeRow: 44 },
      { exerciseId: 'db_seated_press', schemeRow: 45 },
    ],
    prep: PREP_HEAVY('6–8ПМ', K_D3, R_D3), deload: DB_PRESS, deloadBw: BW,
    workbook: { prepRow: 94, testRow: 128, mesoRow: 171 },
  },
  {
    id: 'd3s3', day: 3, order: 3, role: 'Горизонтальная тяга', optional: false, defaultExercise: 'hammer_row',
    options: [
      { exerciseId: 'bb_row', schemeRow: 48 },
      { exerciseId: 'db_row', schemeRow: 49 },
      { exerciseId: 'hammer_row', schemeRow: 50 },
    ],
    prep: PREP_HEAVY('8–10ПМ', K_D3, R_D3), deload: MAIN, deloadBw: BW,
    workbook: { prepRow: 95, testRow: 129, mesoRow: 172 },
  },
  {
    id: 'd3s4', day: 3, order: 4, role: 'Спина', optional: false, defaultExercise: 'pullup_bw',
    options: [
      { exerciseId: 'pullup_bw', schemeRow: 59, shareTestWith: 'd1s2' },
      { exerciseId: 'pullover', schemeRow: 60 },
      { exerciseId: 'cable_row', schemeRow: 61 },
    ],
    prep: { ...PREP_HEAVY('10–12ПМ', K_LIGHT, R_LIGHT), bwMode: 'const' }, deload: MAIN_ARMS, deloadBw: BW,
    workbook: { prepRow: 96, testRow: 130, mesoRow: 173 },
  },
  {
    id: 'd3s5', day: 3, order: 5, role: 'Дополнительно «+»', optional: true, defaultExercise: null,
    options: [
      { exerciseId: 'leg_curl', schemeRow: 64 },
      { exerciseId: 'leg_extension', schemeRow: 65 },
    ],
    prep: PREP_HEAVY('10–12ПМ', K_LIGHT, R_LIGHT), deload: ISO, deloadBw: BW,
    deloadNote: 'ДОПУЩЕНИЕ: в книге для строки «+» недели 4/8/12 не заполнены; используются правила изолирующих упражнений.',
    workbook: { prepRow: 97, testRow: 131, mesoRow: 174 },
  },
]

/** Варианты, которые пользователь видит при выборе (исходные упражнения, заменённые персональными, скрыты). */
export const HIDDEN_IN_PICKER = new Set(['dips', 'barbell_curl'])

const slotMap = new Map(SLOTS.map((s) => [s.id, s]))
export function getSlot(id: SlotId): SlotDef {
  const s = slotMap.get(id)
  if (!s) throw new Error(`Неизвестный слот ${id}`)
  return s
}

export function slotsOfDay(day: Day): SlotDef[] {
  return SLOTS.filter((s) => s.day === day).sort((a, b) => a.order - b.order)
}

export function optionFor(slot: SlotDef, exerciseId: string): SlotOption | undefined {
  return slot.options.find((o) => o.exerciseId === exerciseId)
}

export function defaultChoices(): Record<SlotId, string | null> {
  return Object.fromEntries(SLOTS.map((s) => [s.id, s.defaultExercise])) as Record<SlotId, string | null>
}

/** Недели программы по порядку. */
export type WeekId = 'P1' | 'P2' | 'T' | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
export const WEEKS: WeekId[] = ['P1', 'P2', 'T', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
/** Недели, рассчитываемые таблицей «Формулы» (блоки 0–8). */
export const BLOCK_WEEKS = [1, 2, 3, 5, 6, 7, 9, 10, 11] as const
export const DELOAD_WEEKS = [4, 8, 12] as const

export function weekLabel(w: WeekId): string {
  if (w === 'P1') return 'Подготовка, неделя 1'
  if (w === 'P2') return 'Подготовка, неделя 2'
  if (w === 'T') return 'Тестовая неделя'
  return `Неделя ${w}`
}

export function weekShort(w: WeekId): string {
  if (w === 'P1') return 'П1'
  if (w === 'P2') return 'П2'
  if (w === 'T') return 'Тест'
  return `Н${w}`
}

export function mesocycleOf(w: WeekId): 0 | 1 | 2 | 3 {
  if (typeof w !== 'number') return 0
  return (Math.floor((w - 1) / 4) + 1) as 1 | 2 | 3
}
