/**
 * Движок плана: из выбора упражнений, теста, веса тела и отмеченных RPE строит все тренировки.
 * Чистые функции, без побочных эффектов. Завершённые тренировки здесь не хранятся и не меняются —
 * движок только читает из них «опорные» значения (RPE тяжёлого подхода, повторения AMRAP).
 */
import { brzycki, brzyckiRir, e1rmFromRpe } from '../calculations/oneRm'
import { mround } from '../calculations/rounding'
import { rpeCoefficient } from '../calculations/rpeTable'
import { type Exercise, getExercise } from '../exercises/catalog'
import { type Calc, type Issue, fail, isNum, ok } from '../result'
import {
  BLOCK_WEEKS, type Day, type DeloadRule, type SlotDef, type SlotId, type SlotOption, type WeekId,
  SLOTS, WEEKS, getSlot, optionFor, slotsOfDay, weekLabel,
} from './definition'
import { type BwRepsRef, type SchemeBlock, schemeRow } from './workbook'

/** Версия алгоритма. Записывается в каждую завершённую тренировку. */
export const ALGORITHM_VERSION = '1.0.0'

// ---------------------------------------------------------------- входные данные

export interface TestEntry {
  exerciseId: string
  /** Для упражнений «вес тела + отягощение» — только навешенный вес; для гантелей — одна гантель. */
  weight: number | null
  reps: number | null
  /** RPE тестового подхода. Тест «до отказа» = 10 (по умолчанию). */
  rpe?: number | null
  date?: string
  /** Вес тела на дату теста (для отягощений). */
  bodyweight?: number | null
}

/** Фактический подход, от которого считаются следующие веса. */
export interface DriverLog {
  exerciseId: string
  weight: number | null
  reps: number | null
  rpe: number | null
  bodyweight?: number | null
}

export interface GroupOverride {
  weight?: number
  sets?: number
  reps?: number
}

export interface PlanInput {
  choices: Record<SlotId, string | null>
  /** Шаг округления по упражнению, кг. */
  steps: Record<string, number>
  /** Выбранный шаблон прогрессии (строка «Формулы») для упражнений с выбором «рабочего диапазона». */
  schemeRows?: Record<string, number>
  tests: Partial<Record<SlotId, TestEntry>>
  /** Текущий вес тела, кг. */
  bodyweight: number | null
  drivers: Record<string, DriverLog>
  overrides?: Record<string, GroupOverride>
}

// ---------------------------------------------------------------- результат

export type RepsTarget =
  | { kind: 'fixed'; value: number }
  | { kind: 'amrap' }
  | { kind: 'toFailure' }
  | { kind: 'choose'; hint: string }
  | { kind: 'issue'; issue: Issue }

export type LoadTarget =
  | { kind: 'weight'; value: Calc } // штанга/тренажёр/блок — вес снаряда; гантели — одна гантель
  | { kind: 'weighted_bw'; added: Calc; total: Calc; bodyweight: number | null }
  | { kind: 'bodyweight' }
  | { kind: 'choose'; hint: string }

export type GroupRole = 'heavy' | 'medium' | 'light'

export interface PlannedGroup {
  key: string
  week: WeekId
  slotId: SlotId
  groupId: string
  label: string
  sets: number
  reps: RepsTarget
  load: LoadTarget
  /** Что нужно записать в этом подходе, чтобы рассчитать следующие. */
  driver: 'rpe' | 'amrap' | null
  role: GroupRole
  overridden: boolean
  notes: string[]
}

export interface PlannedExercise {
  slotId: SlotId
  exerciseId: string
  exercise: Exercise
  step: number
  groups: PlannedGroup[]
}

export interface PlannedSession {
  id: string
  week: WeekId
  day: Day
  title: string
  exercises: PlannedExercise[]
}

export function groupKey(week: WeekId, slotId: SlotId, groupId: string): string {
  return `${week}|${slotId}|${groupId}`
}

export function sessionId(week: WeekId, day: Day): string {
  return `${week}-${day}`
}

// ---------------------------------------------------------------- правила групп

interface Ref {
  week: WeekId
  slot: SlotId
  group: string
}

type WeightRule =
  | { kind: 'testRpe'; k: number }
  | { kind: 'fromRef'; ref: Ref; k: number; restartFromTest: boolean }
  | { kind: 'testBrzycki'; k: number; ownTest: boolean }
  | { kind: 'brzyckiRir'; ref: Ref; k: number }
  | { kind: 'brzyckiAmrap'; ref: Ref; k: number }
  | { kind: 'pctOf'; ref: Ref; k: number }
  | { kind: 'choose'; hint: string }
  | { kind: 'none' }

type RepsRule =
  | { kind: 'fixed'; n: number }
  | { kind: 'amrap' }
  | { kind: 'toFailure' }
  | { kind: 'choose'; hint: string }
  | { kind: 'bwTest'; minus: number; ownTest: boolean }
  | { kind: 'bwFloor'; ref: Ref; minus: number }
  | { kind: 'bwRound'; ref: Ref; minus: number }

interface GroupDef {
  id: string
  label: string
  sets: number
  reps: RepsRule
  weight: WeightRule
  driver: 'rpe' | 'amrap' | null
  notes?: string[]
}

const PREV_BLOCK_WEEK: Record<number, WeekId> = { 2: 1, 3: 2, 5: 3, 6: 5, 7: 6, 9: 7, 10: 9, 11: 10 }

/** Коэффициенты дополнительных подходов жима в день 2 (недели 3/7/11): ячейки Y и AC. */
const BENCH_D2_EXTRA: Record<number, { e1: [number, number, number]; e2: [number, number, number]; e2Note?: string }> = {
  3: { e1: [0.8, 1, 3], e2: [0.811, 2, 4] },
  7: { e1: [0.907, 1, 2], e2: [0.837, 2, 3], e2Note: 'ИСПРАВЛЕНО: в книге AC189 ссылается на неделю 3 вместо недели 7' },
  11: { e1: [0.955, 1, 1], e2: [0.863, 3, 2], e2Note: 'ИСПРАВЛЕНО: в книге AC216 ссылается на неделю 7 вместо недели 11' },
}

// ---------------------------------------------------------------- движок

export class PlanEngine {
  private cache = new Map<string, PlannedGroup>()
  private defsCache = new Map<string, GroupDef[]>()
  private resolving = new Set<string>()

  constructor(readonly input: PlanInput) {}

  exerciseFor(slotId: SlotId): string | null {
    return this.input.choices[slotId] ?? null
  }

  stepFor(exerciseId: string): number {
    const s = this.input.steps[exerciseId]
    return isNum(s) && s > 0 ? s : getExercise(exerciseId).defaultStep
  }

  private option(slot: SlotDef, exerciseId: string): SlotOption {
    const o = optionFor(slot, exerciseId)
    if (!o) throw new Error(`Упражнение ${exerciseId} недоступно в слоте ${slot.id}`)
    return o
  }

  private schemeRowFor(option: SlotOption): number {
    const chosen = this.input.schemeRows?.[option.exerciseId]
    if (chosen && option.schemeOptions?.some((o) => o.row === chosen)) return chosen
    return option.schemeRow
  }

  // ------------------------------------------------ тест

  /** Тест для расчёта. Правила книги: при одинаковом упражнении в двух днях берётся тест первого дня. */
  resolveTest(slotId: SlotId, exerciseId: string, ownFirst = false): Calc<TestEntry> {
    const slot = getSlot(slotId)
    const opt = this.option(slot, exerciseId)
    const own = this.input.tests[slotId]
    const ownOk = own && own.exerciseId === exerciseId ? own : undefined
    let shared: TestEntry | undefined
    if (opt.shareTestWith && this.exerciseFor(opt.shareTestWith) === exerciseId) {
      const t = this.input.tests[opt.shareTestWith]
      if (t && t.exerciseId === exerciseId) shared = t
    }
    const pick = ownFirst ? ownOk ?? shared : shared ?? ownOk
    if (!pick) {
      return fail('missing-test', `Нет результата теста для «${getExercise(exerciseId).name}» (тестовая неделя, день ${slot.day})`)
    }
    return ok(pick)
  }

  /** Полный перемещаемый вес теста (для отягощений — вес тела + отягощение). */
  private testLoad(t: TestEntry, ex: Exercise): Calc {
    if (t.weight === null || t.weight === undefined || !isNum(t.weight)) return fail('missing-weight', `Не указан вес теста «${ex.name}»`)
    if (ex.loadType === 'weighted_bodyweight') {
      const bw = t.bodyweight ?? this.input.bodyweight
      if (!isNum(bw) || bw <= 0) return fail('missing-bodyweight', 'Укажите вес тела в профиле — он нужен для подтягиваний с отягощением')
      return ok(bw + t.weight)
    }
    if (t.weight <= 0) return fail('invalid-weight', `Вес теста «${ex.name}» должен быть больше нуля`)
    return ok(t.weight)
  }

  // ------------------------------------------------ определения групп

  groupDefs(week: WeekId, slotId: SlotId): GroupDef[] {
    const exId = this.exerciseFor(slotId)
    if (!exId) return []
    const cacheKey = `${week}|${slotId}|${exId}`
    const hit = this.defsCache.get(cacheKey)
    if (hit) return hit
    const defs = this.buildDefs(week, getSlot(slotId), exId)
    this.defsCache.set(cacheKey, defs)
    return defs
  }

  private buildDefs(week: WeekId, slot: SlotDef, exId: string): GroupDef[] {
    const ex = getExercise(exId)
    const opt = this.option(slot, exId)
    const bw = ex.loadType === 'bodyweight'
    if (week === 'P1' || week === 'P2') return this.prepDefs(week, slot, bw)
    if (week === 'T') {
      return [{
        id: 'test', label: 'Тестовый подход до отказа', sets: 1, driver: 'amrap',
        reps: { kind: 'amrap' },
        weight: bw ? { kind: 'none' } : { kind: 'choose', hint: 'Вес на 3–6 повторений до отказа (допустимо 1–10)' },
        notes: ['Перед подходом — несколько разминочных, затем отдых 5–6 минут и подход до отказа без нарушения техники.'],
      }]
    }
    if (opt.special === 'bench-d1') {
      const d = this.benchD1(week)
      if (d) return d
    }
    if (opt.special === 'bench-d2') {
      const d = this.benchD2(week, slot, opt)
      if (d) return d
    }
    if (week === 4 || week === 8 || week === 12) {
      const rule: DeloadRule = (bw ? slot.deloadBw : opt.deload ?? slot.deload)[week]
      const notes = [opt.deloadNote ?? slot.deloadNote].filter((n): n is string => !!n)
      if (rule.kind === 'bwReps') {
        return [{ id: 'main', label: 'Рабочие подходы', sets: rule.sets, driver: null, reps: { kind: 'bwTest', minus: rule.minus, ownTest: true }, weight: { kind: 'none' }, notes }]
      }
      if (bw) {
        return [{ id: 'main', label: 'Рабочие подходы', sets: 3, driver: null, reps: { kind: 'bwTest', minus: 3, ownTest: true }, weight: { kind: 'none' }, notes }]
      }
      return [{ id: 'main', label: 'Рабочие подходы', sets: rule.sets, driver: null, reps: { kind: 'fixed', n: rule.reps }, weight: { kind: 'testBrzycki', k: rule.k, ownTest: true }, notes }]
    }
    return this.blockDefs(week as number, slot, opt, bw)
  }

  private prepDefs(week: 'P1' | 'P2', slot: SlotDef, bw: boolean): GroupDef[] {
    const p = slot.prep
    const r = (w: WeekId, g: string): Ref => ({ week: w, slot: slot.id, group: g })
    const hint = `${p.condition}, RPE ${p.rpeRange}`
    const links: [Ref, number][] = week === 'P1'
      ? [[r('P1', 's1'), 0], [r('P1', 's2'), 1]]
      : [[r('P1', 's1'), 2], [r('P2', 's1'), 3], [r('P2', 's2'), 4]]
    const chainLinks: Ref[] = week === 'P1' ? [r('P1', 's1'), r('P1', 's2')] : [r('P1', 's3'), r('P2', 's1'), r('P2', 's2')]
    const defs: GroupDef[] = []
    if (week === 'P1') {
      defs.push({
        id: 's1', label: 'Подход 1', sets: 1, driver: 'rpe',
        reps: { kind: 'choose', hint: bw ? 'Повторения с запасом 1–3 до отказа' : hint },
        weight: bw ? { kind: 'none' } : { kind: 'choose', hint },
        notes: [bw ? 'Сделайте подход, оставив 1–3 повторения в запасе, и оцените RPE.' : `Подберите вес: ${hint}. Внесите вес, повторения и RPE.`],
      })
    }
    const startIdx = week === 'P1' ? 0 : 2
    const count = week === 'P1' ? 2 : 3
    for (let i = 0; i < count; i++) {
      const idx = startIdx + i
      const id = week === 'P1' ? `s${i + 2}` : `s${i + 1}`
      const [ref, kIdx] = links[i]
      let reps: RepsRule
      if (bw && p.bwMode === 'chain') reps = { kind: 'bwRound', ref: chainLinks[i], minus: p.bwChainMinus[idx] }
      else reps = { kind: 'fixed', n: p.reps[idx] }
      defs.push({
        id, label: `Подход ${id.slice(1)}`, sets: 1, driver: 'rpe', reps,
        weight: bw ? { kind: 'none' } : { kind: 'fromRef', ref, k: p.k[kIdx], restartFromTest: false },
      })
    }
    return defs
  }

  private blockIndex(week: number): number {
    return (BLOCK_WEEKS as readonly number[]).indexOf(week)
  }

  private topSets(block: SchemeBlock, opt: SlotOption): number {
    if (typeof block.topSets === 'number') return block.topSets
    const other = opt.topSetsSameAs
    return other && this.exerciseFor(other) === opt.exerciseId ? block.topSets.sameOtherDay : block.topSets.otherwise
  }

  private blockDefs(weekNum: number, slot: SlotDef, opt: SlotOption, bw: boolean): GroupDef[] {
    const week = weekNum as WeekId
    const b = this.blockIndex(weekNum)
    const scheme = schemeRow(this.schemeRowFor(opt))
    const blk = scheme.blocks[b]
    const ref = (w: WeekId, g: string): Ref => ({ week: w, slot: slot.id, group: g })
    const prev = PREV_BLOCK_WEEK[weekNum]
    if (bw || scheme.bodyweight) {
      const topR = blk.topReps as BwRepsRef
      const backR = blk.backReps as BwRepsRef
      const topReps: RepsRule = topR.fromTest ? { kind: 'bwTest', minus: topR.minus, ownTest: false } : { kind: 'bwFloor', ref: ref(prev, 'top'), minus: topR.minus }
      const notes: string[] = []
      if (b === 8 && backR.fromBlock === 7) notes.push('ИСПРАВЛЕНО: в книге повторения подсобных подходов недели 11 считаются от RPE недели 10')
      return [
        { id: 'top', label: 'Контрольный подход', sets: this.topSets(blk, opt), driver: 'rpe', reps: topReps, weight: { kind: 'none' } },
        { id: 'back', label: 'Рабочие подходы', sets: blk.backSets, driver: null, reps: { kind: 'bwFloor', ref: ref(week, 'top'), minus: backR.minus }, weight: { kind: 'none' }, notes },
      ]
    }
    const topRule = blk.top!
    let topWeight: WeightRule
    if (b === 0) topWeight = { kind: 'testRpe', k: topRule.k }
    else topWeight = { kind: 'fromRef', ref: ref(prev, 'top'), k: topRule.k, restartFromTest: true }
    const notes: string[] = []
    if (opt.exerciseId === 'db_bench') notes.push('ИСПРАВЛЕНО: в книге RPE для жима гантелей дня 1 берётся из строки жима дня 2')
    const backReps: RepsRule = blk.backReps === 'toFailure' ? { kind: 'toFailure' } : { kind: 'fixed', n: blk.backReps as number }
    return [
      { id: 'top', label: 'Тяжёлые подходы', sets: this.topSets(blk, opt), driver: 'rpe', reps: { kind: 'fixed', n: blk.topReps as number }, weight: topWeight, notes },
      {
        id: 'back', label: backReps.kind === 'toFailure' ? 'Добивочный подход до отказа' : 'Подсобные подходы',
        sets: blk.backSets, driver: null, reps: backReps, weight: { kind: 'fromRef', ref: ref(week, 'top'), k: blk.back!.k!, restartFromTest: false },
      },
    ]
  }

  /** Жим дня 1: недели 4/8/12 и 5/9 считаются от жима дня 2 (лист «Программа тренировок», AF154…AJ208). */
  private benchD1(week: WeekId): GroupDef[] | null {
    const d2 = (w: WeekId, g: string): Ref => ({ week: w, slot: 'd2s1', group: g })
    const scheme = schemeRow(9)
    if (week === 4) {
      return [
        { id: 'main', label: 'Тяжёлые подходы', sets: 3, driver: null, reps: { kind: 'fixed', n: 3 }, weight: { kind: 'brzyckiRir', ref: d2(3, 'back'), k: 0.878 } },
        { id: 'back', label: 'Подсобные подходы', sets: 2, driver: null, reps: { kind: 'fixed', n: 4 }, weight: { kind: 'brzyckiRir', ref: d2(3, 'back'), k: 0.799 } },
      ]
    }
    if (week === 8) {
      return [
        { id: 'main', label: 'Тяжёлые подходы', sets: 3, driver: null, reps: { kind: 'fixed', n: 2 }, weight: { kind: 'brzyckiRir', ref: d2(7, 'back'), k: 0.907 } },
        { id: 'back', label: 'Подсобные подходы', sets: 2, driver: null, reps: { kind: 'fixed', n: 2 }, weight: { kind: 'brzyckiRir', ref: d2(7, 'back'), k: 0.878 } },
      ]
    }
    if (week === 12) {
      return [
        { id: 'main', label: 'Тяжёлые синглы', sets: 3, driver: 'rpe', reps: { kind: 'fixed', n: 1 }, weight: { kind: 'brzyckiRir', ref: d2(11, 'back'), k: 0.922 } },
        { id: 'back', label: 'Подсобные синглы', sets: 2, driver: null, reps: { kind: 'fixed', n: 1 }, weight: { kind: 'brzyckiRir', ref: { week: 12, slot: 'd1s1', group: 'main' }, k: 0.907 } },
      ]
    }
    if (week === 5 || week === 9) {
      const defs = this.blockDefs(week, getSlot('d1s1'), { exerciseId: 'bench', schemeRow: 9 }, false)
      const blk = scheme.blocks[this.blockIndex(week)]
      defs[0] = { ...defs[0], weight: { kind: 'brzyckiAmrap', ref: d2(week === 5 ? 4 : 8, 'amrap'), k: blk.top!.k } }
      return defs
    }
    return null
  }

  /** Жим дня 2: AMRAP недель 4/8, пиковая неделя 12 и дополнительные подходы недель 3/7/11. */
  private benchD2(week: WeekId, slot: SlotDef, opt: SlotOption): GroupDef[] | null {
    const me = (w: WeekId, g: string): Ref => ({ week: w, slot: 'd2s1', group: g })
    const scheme = schemeRow(28)
    if (week === 4) {
      return [
        { id: 'amrap', label: 'Подход на максимум повторений', sets: 1, driver: 'amrap', reps: { kind: 'amrap' }, weight: { kind: 'testBrzycki', k: 0.922, ownTest: true },
          notes: ['Запишите, сколько повторений сделали: от этого считаются недели 5 и 8.'] },
        { id: 'back', label: 'Подсобные подходы', sets: 2, driver: null, reps: { kind: 'fixed', n: 3 }, weight: { kind: 'pctOf', ref: me(4, 'amrap'), k: 0.95 } },
      ]
    }
    if (week === 8) {
      return [
        { id: 'amrap', label: 'Подход на максимум повторений', sets: 1, driver: 'amrap', reps: { kind: 'amrap' }, weight: { kind: 'brzyckiAmrap', ref: me(4, 'amrap'), k: 0.955 },
          notes: ['Запишите, сколько повторений сделали: от этого считаются недели 9 и 12.'] },
        { id: 'back', label: 'Подсобные подходы', sets: 2, driver: null, reps: { kind: 'fixed', n: 2 }, weight: { kind: 'pctOf', ref: me(8, 'amrap'), k: 0.95 },
          notes: ['ИСПРАВЛЕНО: в книге AI189 округляет к 2,5 кг независимо от выбранного шага'] },
      ]
    }
    if (week === 12) {
      return [
        { id: 'single', label: 'Тяжёлый сингл', sets: 1, driver: 'rpe', reps: { kind: 'fixed', n: 1 }, weight: { kind: 'brzyckiAmrap', ref: me(8, 'amrap'), k: 0.955 } },
        { id: 'attempt', label: 'Попытка на новый 1ПМ', sets: 1, driver: null, reps: { kind: 'fixed', n: 1 }, weight: { kind: 'brzyckiRir', ref: me(12, 'single'), k: 1 } },
        { id: 'amrap', label: 'Подход на максимум повторений', sets: 1, driver: 'amrap', reps: { kind: 'amrap' }, weight: { kind: 'brzyckiRir', ref: me(12, 'single'), k: 0.92 } },
      ]
    }
    if (week === 5 || week === 9) {
      const defs = this.blockDefs(week, slot, opt, false)
      const blk = scheme.blocks[this.blockIndex(week)]
      defs[0] = { ...defs[0], weight: { kind: 'brzyckiAmrap', ref: me(week === 5 ? 4 : 8, 'amrap'), k: blk.top!.k } }
      return defs
    }
    if (week === 3 || week === 7 || week === 11) {
      const defs = this.blockDefs(week, slot, opt, false)
      const x = BENCH_D2_EXTRA[week]
      defs[1] = { ...defs[1], driver: 'rpe' }
      defs.push(
        { id: 'extra1', label: 'Дополнительный подход', sets: x.e1[1], driver: null, reps: { kind: 'fixed', n: x.e1[2] }, weight: { kind: 'brzyckiRir', ref: me(week, 'back'), k: x.e1[0] } },
        { id: 'extra2', label: 'Дополнительные подходы', sets: x.e2[1], driver: null, reps: { kind: 'fixed', n: x.e2[2] }, weight: { kind: 'brzyckiRir', ref: me(week, 'top'), k: x.e2[0] },
          notes: x.e2Note ? [x.e2Note] : [] },
      )
      return defs
    }
    return null
  }

  // ------------------------------------------------ вычисление групп

  /** Опорные значения подхода: факт, если записан, иначе план. */
  private refValues(ref: Ref): {
    planned: PlannedGroup | null
    log: DriverLog | undefined
    sameExercise: boolean
    weight: Calc
    reps: number | null
    rpe: number | null
  } {
    const exId = this.exerciseFor(ref.slot)
    const planned = exId ? this.group(ref.week, ref.slot, ref.group) : null
    const log = this.input.drivers[groupKey(ref.week, ref.slot, ref.group)]
    const sameExercise = !log || log.exerciseId === exId
    const useLog = log && sameExercise ? log : undefined
    let weight: Calc = planned ? loadTotal(planned.load) : fail('missing-driver', 'Нет плана')
    if (useLog && isNum(useLog.weight)) {
      const ex = getExercise(useLog.exerciseId)
      if (ex.loadType === 'weighted_bodyweight') {
        const bwv = useLog.bodyweight ?? this.input.bodyweight
        weight = isNum(bwv) ? ok(bwv + useLog.weight) : fail('missing-bodyweight', 'Укажите вес тела в профиле')
      } else if (useLog.weight > 0) weight = ok(useLog.weight)
    }
    let reps: number | null = null
    if (useLog && isNum(useLog.reps)) reps = useLog.reps
    else if (planned && planned.reps.kind === 'fixed') reps = planned.reps.value
    return { planned, log: useLog, sameExercise, weight, reps, rpe: useLog && isNum(useLog.rpe) ? useLog.rpe : null }
  }

  private driverMissing(ref: Ref, what: 'rpe' | 'amrap'): Calc<never> {
    const ex = this.exerciseFor(ref.slot)
    const label = this.groupDefs(ref.week, ref.slot).find((d) => d.id === ref.group)?.label ?? ref.group
    const name = ex ? getExercise(ex).name : ''
    const r = fail(what === 'rpe' ? 'missing-driver' : 'missing-amrap', what === 'rpe'
      ? `Сначала отметьте RPE: ${weekLabel(ref.week)}, день ${getSlot(ref.slot).day} — «${name}», ${label.toLowerCase()}`
      : `Сначала запишите повторения: ${weekLabel(ref.week)}, день ${getSlot(ref.slot).day} — «${name}», ${label.toLowerCase()}`)
    if (!r.ok) r.issue.session = sessionId(ref.week, getSlot(ref.slot).day)
    return r
  }

  /** Сырой (неокруглённый) полный вес по правилу. */
  private rawWeight(rule: WeightRule, slotId: SlotId, exId: string, notes: string[]): Calc {
    const ex = getExercise(exId)
    switch (rule.kind) {
      case 'testRpe': {
        const t = this.resolveTest(slotId, exId)
        if (!t.ok) return t
        const load = this.testLoad(t.value, ex)
        if (!load.ok) return load
        const e = e1rmFromRpe(load.value, t.value.reps, t.value.rpe ?? 10)
        if (!e.ok) return withContext(e, `тест «${ex.name}»`)
        return ok(e.value * rule.k)
      }
      case 'testBrzycki': {
        const t = this.resolveTest(slotId, exId, rule.ownTest)
        if (!t.ok) return t
        const load = this.testLoad(t.value, ex)
        if (!load.ok) return load
        if (!isNum(t.value.reps)) return fail('missing-reps', `Не указаны повторения теста «${ex.name}»`)
        const e = brzycki(load.value, t.value.reps + 10 - (t.value.rpe ?? 10))
        if (!e.ok) return withContext(e, `тест «${ex.name}»`)
        return ok(e.value * rule.k)
      }
      case 'fromRef': {
        const v = this.refValues(rule.ref)
        if (!v.sameExercise && rule.restartFromTest) {
          notes.push('Упражнение сменилось — расчёт начат заново от теста')
          return this.rawWeight({ kind: 'testRpe', k: rule.k }, slotId, exId, notes)
        }
        if (v.rpe === null) return this.driverMissing(rule.ref, 'rpe')
        if (!v.weight.ok) return v.weight
        const c = rpeCoefficient(v.rpe, v.reps)
        if (!c.ok) return c
        return ok((v.weight.value / c.value) * rule.k)
      }
      case 'brzyckiRir': {
        const v = this.refValues(rule.ref)
        if (v.rpe === null) return this.driverMissing(rule.ref, 'rpe')
        if (!v.weight.ok) return v.weight
        const e = brzyckiRir(v.weight.value, v.reps, v.rpe)
        if (!e.ok) return e
        return ok(e.value * rule.k)
      }
      case 'brzyckiAmrap': {
        const v = this.refValues(rule.ref)
        if (!v.log || !isNum(v.log.reps)) return this.driverMissing(rule.ref, 'amrap')
        if (!v.weight.ok) return v.weight
        const e = brzycki(v.weight.value, v.log.reps)
        if (!e.ok) return e
        return ok(e.value * rule.k)
      }
      case 'pctOf': {
        const v = this.refValues(rule.ref)
        if (!v.weight.ok) return v.weight
        return ok(v.weight.value * rule.k)
      }
      case 'choose':
      case 'none':
        return fail('not-applicable', 'Вес не рассчитывается')
    }
  }

  private finalizeLoad(raw: Calc, ex: Exercise, step: number): LoadTarget {
    if (ex.loadType === 'weighted_bodyweight') {
      const bwv = this.input.bodyweight
      if (!raw.ok) return { kind: 'weighted_bw', added: raw, total: raw, bodyweight: bwv }
      if (!isNum(bwv) || bwv <= 0) {
        const f = fail('missing-bodyweight', 'Укажите вес тела в профиле — он нужен для подтягиваний с отягощением')
        return { kind: 'weighted_bw', added: f, total: f, bodyweight: null }
      }
      // ИСПРАВЛЕНО: округляется навешенный вес, а не сумма (иначе при весе тела 80,3 кг получится «12,2 кг»).
      const added = mround(raw.value - bwv, step)
      if (!added.ok) return { kind: 'weighted_bw', added, total: added, bodyweight: bwv }
      return { kind: 'weighted_bw', added, total: ok(added.value + bwv), bodyweight: bwv }
    }
    if (!raw.ok) return { kind: 'weight', value: raw }
    const r = mround(raw.value, step)
    if (r.ok && r.value <= 0) return { kind: 'weight', value: fail('invalid-weight', 'Расчёт дал нулевой вес — проверьте тест и шаг округления') }
    return { kind: 'weight', value: r }
  }

  private computeReps(rule: RepsRule, slotId: SlotId, exId: string, notes: string[]): RepsTarget {
    switch (rule.kind) {
      case 'fixed': return { kind: 'fixed', value: rule.n }
      case 'amrap': return { kind: 'amrap' }
      case 'toFailure': return { kind: 'toFailure' }
      case 'choose': return { kind: 'choose', hint: rule.hint }
      case 'bwTest': {
        const t = this.resolveTest(slotId, exId, rule.ownTest)
        if (!t.ok) return { kind: 'issue', issue: t.issue }
        if (!isNum(t.value.reps)) return { kind: 'issue', issue: { code: 'missing-reps', message: 'Не указаны повторения теста' } }
        return clampReps(t.value.reps - rule.minus, notes)
      }
      case 'bwFloor':
      case 'bwRound': {
        const v = this.refValues(rule.ref)
        if (v.rpe === null) {
          const m = this.driverMissing(rule.ref, 'rpe')
          return { kind: 'issue', issue: (m as { issue: Issue }).issue }
        }
        if (v.reps === null) {
          const pr = v.planned?.reps
          if (pr && pr.kind === 'issue') return pr
          return { kind: 'issue', issue: { code: 'missing-reps', message: 'Запишите выполненные повторения предыдущего подхода' } }
        }
        const raw = 10 - v.rpe + v.reps - rule.minus
        return clampReps(rule.kind === 'bwFloor' ? Math.floor(raw + 1e-9) : Math.floor(raw + 0.5), notes)
      }
    }
  }

  /** Плановая группа подходов. Мемоизируется; циклические ссылки дают понятную ошибку. */
  group(week: WeekId, slotId: SlotId, groupId: string): PlannedGroup | null {
    const key = groupKey(week, slotId, groupId)
    const hit = this.cache.get(key)
    if (hit) return hit
    const exId = this.exerciseFor(slotId)
    if (!exId) return null
    const def = this.groupDefs(week, slotId).find((d) => d.id === groupId)
    if (!def) return null
    if (this.resolving.has(key)) throw new Error(`Циклическая ссылка в плане: ${key}`)
    this.resolving.add(key)
    try {
      const ex = getExercise(exId)
      const step = this.stepFor(exId)
      const notes = [...(def.notes ?? [])]
      let load: LoadTarget
      if (def.weight.kind === 'none' || ex.loadType === 'bodyweight') load = { kind: 'bodyweight' }
      else if (def.weight.kind === 'choose') load = { kind: 'choose', hint: def.weight.hint }
      else load = this.finalizeLoad(this.rawWeight(def.weight, slotId, exId, notes), ex, step)
      let reps = this.computeReps(def.reps, slotId, exId, notes)
      let sets = def.sets
      const ov = this.input.overrides?.[key]
      let overridden = false
      if (ov) {
        if (isNum(ov.weight) && load.kind !== 'bodyweight') {
          overridden = true
          if (ex.loadType === 'weighted_bodyweight') {
            const bwv = this.input.bodyweight
            load = { kind: 'weighted_bw', added: ok(ov.weight), total: isNum(bwv) ? ok(bwv + ov.weight) : fail('missing-bodyweight', 'Укажите вес тела'), bodyweight: bwv }
          } else load = { kind: 'weight', value: ok(ov.weight) }
        }
        if (isNum(ov.sets) && ov.sets > 0) { sets = ov.sets; overridden = true }
        if (isNum(ov.reps) && ov.reps > 0) { reps = { kind: 'fixed', value: ov.reps }; overridden = true }
        if (overridden) notes.push('Изменено вручную')
      }
      const g: PlannedGroup = {
        key, week, slotId, groupId, label: def.label, sets, reps, load, driver: def.driver,
        role: roleOf(ex, reps), overridden, notes,
      }
      this.cache.set(key, g)
      return g
    } finally {
      this.resolving.delete(key)
    }
  }

  exercise(week: WeekId, slotId: SlotId): PlannedExercise | null {
    const exId = this.exerciseFor(slotId)
    if (!exId) return null
    const groups = this.groupDefs(week, slotId).map((d) => this.group(week, slotId, d.id)!).filter(Boolean)
    return { slotId, exerciseId: exId, exercise: getExercise(exId), step: this.stepFor(exId), groups }
  }

  session(week: WeekId, day: Day): PlannedSession {
    const exercises = slotsOfDay(day).map((s) => this.exercise(week, s.id)).filter((e): e is PlannedExercise => !!e)
    return { id: sessionId(week, day), week, day, title: `${weekLabel(week)} · день ${day}`, exercises }
  }

  allSessions(): PlannedSession[] {
    const out: PlannedSession[] = []
    for (const w of WEEKS) for (const d of [1, 2, 3] as Day[]) out.push(this.session(w, d))
    return out
  }
}

// ---------------------------------------------------------------- вспомогательные

function withContext(c: Calc<never>, ctx: string): Calc<never> {
  return c.ok ? c : fail(c.issue.code, `${c.issue.message} (${ctx})`)
}

function clampReps(n: number, notes: string[]): RepsTarget {
  if (!isNum(n)) return { kind: 'issue', issue: { code: 'reps-out-of-range', message: 'Не удалось рассчитать повторения' } }
  if (n < 1) {
    notes.push(`Расчёт дал ${n} повторений — проверьте RPE; показан минимум 1`)
    return { kind: 'fixed', value: 1 }
  }
  return { kind: 'fixed', value: n }
}

function roleOf(ex: Exercise, reps: RepsTarget): GroupRole {
  if (ex.category === 'isolation' || reps.kind === 'toFailure') return 'light'
  const n = reps.kind === 'fixed' ? reps.value : reps.kind === 'amrap' ? 5 : 8
  if (ex.category === 'main' && n <= 6) return 'heavy'
  return 'medium'
}

/** Полный вес группы (для отягощений — вес тела + навешенный). */
export function loadTotal(load: LoadTarget): Calc {
  switch (load.kind) {
    case 'weight': return load.value
    case 'weighted_bw': return load.total
    case 'bodyweight': return fail('not-applicable', 'Собственный вес')
    case 'choose': return fail('missing-weight', load.hint)
  }
}

/** Все проблемы сессии, без повторов (для подсказки «что нужно заполнить»). */
export function sessionIssues(s: PlannedSession): Issue[] {
  const seen = new Set<string>()
  const out: Issue[] = []
  for (const e of s.exercises) {
    for (const g of e.groups) {
      const list: Issue[] = []
      const l = g.load
      if (l.kind === 'weight' && !l.value.ok) list.push(l.value.issue)
      if (l.kind === 'weighted_bw' && !l.added.ok) list.push(l.added.issue)
      if (g.reps.kind === 'issue') list.push(g.reps.issue)
      for (const i of list) {
        if (!seen.has(i.message)) { seen.add(i.message); out.push(i) }
      }
    }
  }
  return out
}

export function buildPlan(input: PlanInput): PlanEngine {
  return new PlanEngine(input)
}

/** Все слоты, где выбранное упражнение недоступно (например, после импорта старых данных). */
export function invalidChoices(choices: Record<SlotId, string | null>): SlotId[] {
  return SLOTS.filter((s) => {
    const c = choices[s.id]
    if (c === null) return !s.optional
    return !s.options.some((o) => o.exerciseId === c)
  }).map((s) => s.id)
}
