/**
 * Каталог упражнений. Названия — из листов «Формулы» и «Гайды по упражнениям».
 * Ссылки на платные гайды (Boosty/Sponsr) в приложение не переносятся — по просьбе пользователя;
 * их перечень сохранён в docs/WORKBOOK_AUDIT.md.
 */

export type LoadType =
  | 'barbell' // штанга: вес снаряда целиком
  | 'dumbbell' // гантели: вводится вес ОДНОЙ гантели, в тоннаже ×2
  | 'machine' // тренажёр (свой стек, свой прогресс)
  | 'cable' // блок
  | 'bodyweight' // только повторения, вес тела задаётся один раз в профиле
  | 'weighted_bodyweight' // вводится только навешенный вес; в расчёте вес тела + отягощение

export type Muscle =
  | 'chest' | 'back' | 'legs' | 'glutes' | 'shoulders' | 'biceps' | 'triceps' | 'traps' | 'calves' | 'core' | 'hamstrings'
export type Category = 'main' | 'accessory' | 'isolation'

export interface Exercise {
  id: string
  name: string
  loadType: LoadType
  muscle: Muscle
  /** Мышцы, которые тоже получают объём (для аналитики). */
  secondary?: Muscle[]
  /** Осевая нагрузка на позвоночник (для аналитики объёма). */
  axial: boolean
  category: Category
  /** Шаг округления по умолчанию, кг (для гантелей — на одну гантель). */
  defaultStep: number
  /** Исходное упражнение книги, заменённое персональным вариантом. */
  replaces?: { id: string; name: string; reason: string }
  /** Скрыто в выборе (исходное упражнение, заменённое персональным). */
  hidden?: boolean
  note?: string
}

export const EXERCISES: Exercise[] = [
  // --- жимовые ---
  { id: 'bench', name: 'Жим штанги лёжа', loadType: 'barbell', muscle: 'chest', secondary: ['triceps', 'shoulders'], axial: false, category: 'main', defaultStep: 2.5 },
  { id: 'db_bench', name: 'Жим гантелей лёжа', loadType: 'dumbbell', muscle: 'chest', secondary: ['triceps', 'shoulders'], axial: false, category: 'accessory', defaultStep: 2 },
  { id: 'incline_bench', name: 'Жим штанги лёжа на наклонной скамье', loadType: 'barbell', muscle: 'chest', secondary: ['shoulders', 'triceps'], axial: false, category: 'main', defaultStep: 2.5 },
  { id: 'close_grip_bench', name: 'Жим лёжа узким хватом', loadType: 'barbell', muscle: 'triceps', secondary: ['chest'], axial: false, category: 'main', defaultStep: 2.5 },
  {
    id: 'db_squeeze_incline30',
    name: 'Жим-сжимание гантелей лёжа на наклонной скамье 30°',
    loadType: 'dumbbell', muscle: 'chest', secondary: ['triceps', 'shoulders'], axial: false, category: 'accessory', defaultStep: 2,
    note: 'Гантели прижаты друг к другу на протяжении всего движения. Вес вводится на одну гантель.',
    replaces: { id: 'dips', name: 'Отжимания на брусьях (собственный вес)', reason: 'Персональная замена под оборудование' },
  },
  { id: 'dips', name: 'Отжимания на брусьях (собственный вес)', loadType: 'bodyweight', muscle: 'triceps', secondary: ['chest'], axial: false, category: 'accessory', defaultStep: 1, hidden: true },
  { id: 'cable_pushdown', name: 'Разгибания рук на блоке', loadType: 'cable', muscle: 'triceps', axial: false, category: 'isolation', defaultStep: 2.5 },
  { id: 'ohp', name: 'Армейский жим', loadType: 'barbell', muscle: 'shoulders', secondary: ['triceps'], axial: true, category: 'main', defaultStep: 2.5 },
  { id: 'db_seated_press', name: 'Жим гантелей сидя', loadType: 'dumbbell', muscle: 'shoulders', secondary: ['triceps'], axial: false, category: 'accessory', defaultStep: 2 },
  // --- тяги ---
  {
    id: 'pullup_weighted', name: 'Подтягивания с отягощением', loadType: 'weighted_bodyweight', muscle: 'back', secondary: ['biceps'], axial: false, category: 'main', defaultStep: 2.5,
    note: 'Вводите только навешенный вес. Вес тела берётся из профиля.',
  },
  { id: 'pullup_bw', name: 'Подтягивания (собственный вес)', loadType: 'bodyweight', muscle: 'back', secondary: ['biceps'], axial: false, category: 'accessory', defaultStep: 1 },
  { id: 'lat_pulldown', name: 'Тяга вертикального блока', loadType: 'cable', muscle: 'back', secondary: ['biceps'], axial: false, category: 'accessory', defaultStep: 2.5 },
  { id: 'bb_row', name: 'Тяга штанги в наклоне', loadType: 'barbell', muscle: 'back', secondary: ['biceps'], axial: true, category: 'main', defaultStep: 2.5 },
  { id: 'db_row', name: 'Тяга гантели в наклоне', loadType: 'dumbbell', muscle: 'back', secondary: ['biceps'], axial: false, category: 'accessory', defaultStep: 2 },
  { id: 'hammer_row', name: 'Тяга в хаммере', loadType: 'machine', muscle: 'back', secondary: ['biceps'], axial: false, category: 'accessory', defaultStep: 2.5 },
  { id: 'pullover', name: 'Пуловер у верхнего блока', loadType: 'cable', muscle: 'back', axial: false, category: 'isolation', defaultStep: 2.5 },
  { id: 'cable_row', name: 'Тяга горизонтального блока к поясу', loadType: 'cable', muscle: 'back', secondary: ['biceps'], axial: false, category: 'isolation', defaultStep: 2.5 },
  { id: 'shrug', name: 'Шраги', loadType: 'barbell', muscle: 'traps', axial: true, category: 'isolation', defaultStep: 5 },
  // --- руки и дельты ---
  {
    id: 'scott_machine_curl',
    name: 'Сгибания рук на тренажёре Скотта',
    loadType: 'machine', muscle: 'biceps', axial: false, category: 'isolation', defaultStep: 2.5,
    note: 'Тренажёр с опорой рук, имитирующий скамью Скотта. Упражнение на бицепс, спину почти не нагружает. Вес тренажёра не равен весу свободной штанги — у него своя история.',
    replaces: { id: 'barbell_curl', name: 'Подъём штанги на бицепс', reason: 'Персональная замена под оборудование' },
  },
  { id: 'barbell_curl', name: 'Подъём штанги на бицепс', loadType: 'barbell', muscle: 'biceps', axial: true, category: 'accessory', defaultStep: 2, hidden: true },
  { id: 'hammer_curl', name: 'Молот', loadType: 'dumbbell', muscle: 'biceps', axial: false, category: 'isolation', defaultStep: 2 },
  { id: 'lateral_raise', name: 'Махи с гантелями в стороны', loadType: 'dumbbell', muscle: 'shoulders', axial: false, category: 'isolation', defaultStep: 2 },
  { id: 'upright_row', name: 'Тяга к подбородку', loadType: 'barbell', muscle: 'shoulders', secondary: ['traps'], axial: false, category: 'isolation', defaultStep: 2 },
  // --- ноги ---
  { id: 'squat', name: 'Приседания со штангой', loadType: 'barbell', muscle: 'legs', secondary: ['glutes'], axial: true, category: 'main', defaultStep: 2.5 },
  { id: 'front_squat', name: 'Фронтальные приседания', loadType: 'barbell', muscle: 'legs', secondary: ['glutes'], axial: true, category: 'main', defaultStep: 2.5 },
  { id: 'box_squat', name: 'Приседания в колодец', loadType: 'barbell', muscle: 'legs', secondary: ['glutes'], axial: true, category: 'accessory', defaultStep: 2.5 },
  { id: 'leg_press', name: 'Жим платформы ногами', loadType: 'machine', muscle: 'legs', secondary: ['glutes'], axial: false, category: 'accessory', defaultStep: 2.5 },
  { id: 'deadlift', name: 'Становая тяга', loadType: 'barbell', muscle: 'back', secondary: ['legs', 'glutes', 'hamstrings'], axial: true, category: 'main', defaultStep: 2.5 },
  { id: 'rdl', name: 'Мёртвая тяга', loadType: 'barbell', muscle: 'hamstrings', secondary: ['glutes', 'back'], axial: true, category: 'main', defaultStep: 2.5 },
  { id: 'glute_bridge', name: 'Ягодичный мост', loadType: 'barbell', muscle: 'glutes', secondary: ['hamstrings'], axial: false, category: 'accessory', defaultStep: 2.5 },
  { id: 'leg_curl', name: 'Сгибания ног в тренажёре', loadType: 'machine', muscle: 'hamstrings', axial: false, category: 'isolation', defaultStep: 3 },
  { id: 'leg_extension', name: 'Разгибания ног сидя', loadType: 'machine', muscle: 'legs', axial: false, category: 'isolation', defaultStep: 3 },
  { id: 'calf_raise', name: 'Подъёмы на носки', loadType: 'machine', muscle: 'calves', axial: false, category: 'isolation', defaultStep: 5 },
  // --- корпус ---
  { id: 'crunch', name: 'Скручивания', loadType: 'bodyweight', muscle: 'core', axial: false, category: 'isolation', defaultStep: 1 },
  { id: 'back_extension', name: 'Экстензия', loadType: 'bodyweight', muscle: 'back', secondary: ['glutes', 'hamstrings'], axial: false, category: 'isolation', defaultStep: 1 },
]

/** Названия в книге, отличающиеся от названий каталога (для аудита). */
export const WORKBOOK_NAMES: Record<string, string> = {
  pullup_weighted: 'Подтягивания (с отягощением)',
  pullover: 'Пуловер',
  leg_curl: 'Сгибания ног',
  leg_extension: 'Разгибания ног',
}

const byId = new Map(EXERCISES.map((e) => [e.id, e]))

export function getExercise(id: string): Exercise {
  const e = byId.get(id)
  if (!e) throw new Error(`Неизвестное упражнение: ${id}`)
  return e
}

export function findExercise(id: string | null | undefined): Exercise | undefined {
  return id ? byId.get(id) : undefined
}

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Грудь', back: 'Спина', legs: 'Квадрицепс', glutes: 'Ягодицы', shoulders: 'Дельты', biceps: 'Бицепс',
  triceps: 'Трицепс', traps: 'Трапеции', calves: 'Икры', core: 'Пресс', hamstrings: 'Задняя поверхность бедра',
}

export const LOAD_TYPE_LABEL: Record<LoadType, string> = {
  barbell: 'Штанга', dumbbell: 'Гантели (вес одной)', machine: 'Тренажёр', cable: 'Блок',
  bodyweight: 'Собственный вес', weighted_bodyweight: 'Вес тела + отягощение',
}
