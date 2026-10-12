import { describe, expect, it } from 'vitest'
import { getExercise } from '../src/domain/exercises/catalog'
import { groupText } from '../src/domain/format'
import { SLOTS, type SlotId, WEEKS, defaultChoices } from '../src/domain/program/definition'
import { type DriverLog, type PlanInput, PlanEngine, groupKey, loadTotal, sessionIssues } from '../src/domain/program/engine'
import { muscleVolume, setTonnage } from '../src/domain/progression/analytics'
import type { WorkoutRow } from '../src/storage/types'

function input(over: Partial<PlanInput> = {}): PlanInput {
  return { choices: defaultChoices(), steps: {}, tests: {}, bodyweight: 80, drivers: {}, ...over }
}
const total = (e: PlanEngine, w: Parameters<PlanEngine['group']>[0], s: SlotId, g: string) => {
  const grp = e.group(w, s, g)!
  const t = loadTotal(grp.load)
  return t.ok ? t.value : `!${t.issue.code}`
}
const drv = (exerciseId: string, rpe: number | null, reps: number | null = null, weight: number | null = null): DriverLog => ({ exerciseId, rpe, reps, weight })

describe('пересчёт рабочих весов', () => {
  const base = () => input({ choices: { ...defaultChoices(), d1s1: 'bench' }, tests: { d1s1: { exerciseId: 'bench', weight: 80, reps: 6 } }, steps: { bench: 2.5 } })

  it('неделя 1: MROUND(тест / коэф(10, повт) × 0,837, шаг) — как в Excel (80×6 → 80)', () => {
    expect(total(new PlanEngine(base()), 1, 'd1s1', 'top')).toBe(80)
  })

  it('смена RPE тяжёлого подхода меняет подсобные этой недели и вес следующей', () => {
    const at = (rpe: number) => {
      const e = new PlanEngine({ ...base(), drivers: { [groupKey(1, 'd1s1', 'top')]: drv('bench', rpe) } })
      return [total(e, 1, 'd1s1', 'back'), total(e, 2, 'd1s1', 'top')]
    }
    // 80 / коэф(RPE, 3) × 0,739 и × 0,85
    expect(at(8)).toEqual([67.5, 80]) // 80/0,86 = 93,0: ×0,739 = 68,7 → 67,5; ×0,85 = 79,1 → 80
    const exact = (rpe: number, k: number) => Math.floor((80 / ({ 7: 0.84, 8: 0.86, 9: 0.89, 10: 0.92 } as Record<number, number>)[rpe]) * k / 2.5 + 0.5) * 2.5
    for (const r of [7, 8, 9, 10]) expect(at(r)).toEqual([exact(r, 0.739), exact(r, 0.85)])
    // чем тяжелее подход, тем ниже следующий вес
    expect(at(10)[1]).toBeLessThan(at(7)[1] as number)
  })

  it('учитывает фактический вес и повторения, если они отличаются от плана', () => {
    const e = new PlanEngine({ ...base(), drivers: { [groupKey(1, 'd1s1', 'top')]: drv('bench', 8, 4, 82.5) } })
    expect(total(e, 2, 'd1s1', 'top')).toBe(Math.floor((82.5 / 0.84) * 0.85 / 2.5 + 0.5) * 2.5)
  })

  it('смена стартового веса и шага округления', () => {
    const e1 = new PlanEngine({ ...base(), tests: { d1s1: { exerciseId: 'bench', weight: 100, reps: 5 } } })
    expect(total(e1, 1, 'd1s1', 'top')).toBe(97.5) // 100/0.86·0.837 = 97.33
    const e2 = new PlanEngine({ ...base(), tests: { d1s1: { exerciseId: 'bench', weight: 100, reps: 5 } }, steps: { bench: 5 } })
    expect(total(e2, 1, 'd1s1', 'top')).toBe(95)
    const e3 = new PlanEngine({ ...base(), tests: { d1s1: { exerciseId: 'bench', weight: 100, reps: 5 } }, steps: { bench: 1 } })
    expect(total(e3, 1, 'd1s1', 'top')).toBe(97)
  })

  it('без RPE прошлой недели вес не выдумывается', () => {
    const g = new PlanEngine(base()).group(2, 'd1s1', 'top')!
    expect(g.load).toMatchObject({ kind: 'weight', value: { ok: false, issue: { code: 'missing-driver' } } })
    expect(groupText(g)).toContain('ждёт RPE')
  })

  it('недели 4/8/12 — Бжицки от собственного теста слота', () => {
    const e = new PlanEngine(input({ tests: { d1s3: { exerciseId: 'squat', weight: 110, reps: 3 }, d3s1: { exerciseId: 'squat', weight: 100, reps: 6 } }, steps: { squat: 2.5 } }))
    // AF224: MROUND(100/(1.0278−0.0278·6)·0.72; 2,5) = 82,5 (а не от теста дня 1)
    expect(total(e, 12, 'd3s1', 'main')).toBe(82.5)
    // недели 1–3: тест дня 1 (как «Формулы»!N17/O17)
    expect(total(e, 1, 'd3s1', 'top')).toBe(Math.floor(110 / 0.92 * 0.83 / 2.5 + 0.5) * 2.5)
    expect(e.group(1, 'd3s1', 'top')!.sets).toBe(1) // приседания в оба дня → 1 тяжёлый подход
  })
})

describe('собственный вес и отягощение', () => {
  it('подтягивания с отягощением: вводится только навешенный вес, расчёт от веса тела + отягощения', () => {
    const tests = { d1s2: { exerciseId: 'pullup_weighted', weight: 20, reps: 5, bodyweight: 80 } }
    const e = new PlanEngine(input({ tests, steps: { pullup_weighted: 2.5 } }))
    const g = e.group(1, 'd1s2', 'top')!
    // всего = MROUND(100/0.86·0.83) = 97.5; навешено 17.5
    expect(g.load).toMatchObject({ kind: 'weighted_bw', added: { ok: true, value: 17.5 }, total: { ok: true, value: 97.5 }, bodyweight: 80 })
  })

  it('округляется навешенный вес: при весе тела 80,3 кг — 17,5, а не 17,2', () => {
    const e = new PlanEngine(input({ bodyweight: 80.3, tests: { d1s2: { exerciseId: 'pullup_weighted', weight: 20, reps: 5, bodyweight: 80.3 } } }))
    const g = e.group(1, 'd1s2', 'top')!
    expect(g.load.kind === 'weighted_bw' && g.load.added).toEqual({ ok: true, value: 17.5 })
  })

  it('изменение веса тела меняет новые расчёты', () => {
    const tests = { d1s2: { exerciseId: 'pullup_weighted', weight: 20, reps: 5, bodyweight: 80 } }
    const a = new PlanEngine(input({ tests })).group(1, 'd1s2', 'top')!
    const b = new PlanEngine(input({ tests, bodyweight: 85 })).group(1, 'd1s2', 'top')!
    // тест сделан при 80 кг: полный вес тот же, при весе тела 85 навешивать нужно меньше
    expect(loadTotal(a.load)).toEqual(loadTotal(b.load))
    expect(b.load.kind === 'weighted_bw' && b.load.added).toEqual({ ok: true, value: 12.5 })
  })

  it('без веса тела — понятное требование, а не 0 кг', () => {
    const e = new PlanEngine(input({ bodyweight: null, tests: { d1s2: { exerciseId: 'pullup_weighted', weight: 20, reps: 5 } } }))
    expect(e.group(1, 'd1s2', 'top')!.load).toMatchObject({ kind: 'weighted_bw', added: { ok: false, issue: { code: 'missing-bodyweight' } } })
  })

  it('подтягивания с собственным весом: только повторения, прибавка по RPE', () => {
    const choices = { ...defaultChoices(), d1s2: 'pullup_bw' }
    const tests = { d1s2: { exerciseId: 'pullup_bw', weight: null, reps: 12 } }
    const e = new PlanEngine(input({ choices, tests, drivers: { [groupKey(1, 'd1s2', 'top')]: drv('pullup_bw', 8) } }))
    const top = e.group(1, 'd1s2', 'top')!
    expect(top.load.kind).toBe('bodyweight')
    expect(top.reps).toEqual({ kind: 'fixed', value: 10 }) // тест − 2 («Формулы»!S14)
    expect(e.group(1, 'd1s2', 'back')!.reps).toEqual({ kind: 'fixed', value: 9 }) // FLOOR(10 − 8 + 10 − 3)
    expect(e.group(2, 'd1s2', 'top')!.reps).toEqual({ kind: 'fixed', value: 11 }) // FLOOR(10 − 8 + 10 − 1)
    expect(e.group(4, 'd1s2', 'main')!.reps).toEqual({ kind: 'fixed', value: 8 }) // тест − 4
  })

  it('день 3: подтягивания с собственным весом в неделях 4/8/12 считаются от своего теста (в книге — от теста дня 1)', () => {
    const tests = { d3s4: { exerciseId: 'pullup_bw', weight: null, reps: 10 }, d1s2: { exerciseId: 'pullup_weighted', weight: 30, reps: 3 } }
    const e = new PlanEngine(input({ tests }))
    expect(e.group(4, 'd3s4', 'main')!.reps).toEqual({ kind: 'fixed', value: 6 })
    expect(e.group(8, 'd3s4', 'main')!.reps).toEqual({ kind: 'fixed', value: 7 })
  })
})

describe('персональные замены', () => {
  it('отжимания на брусьях заменены жимом-сжиманием гантелей 30° во всех неделях', () => {
    expect(defaultChoices().d2s4).toBe('db_squeeze_incline30')
    const e = new PlanEngine(input())
    for (const w of WEEKS) {
      const s = e.session(w, 2)
      expect(s.exercises.some((x) => x.exerciseId === 'dips')).toBe(false)
      expect(s.exercises.find((x) => x.slotId === 'd2s4')!.exercise.name).toBe('Жим-сжимание гантелей лёжа на наклонной скамье 30°')
    }
  })

  it('жим-сжимание не берёт тест, вес, повторения и коэффициенты брусьев', () => {
    // есть только тест брусьев — у замены нет данных
    const e1 = new PlanEngine(input({ tests: { d2s4: { exerciseId: 'dips', weight: null, reps: 15 } } }))
    expect(e1.group(1, 'd2s4', 'top')!.load).toMatchObject({ kind: 'weight', value: { ok: false, issue: { code: 'missing-test' } } })
    // свой тест: 14 кг (одна гантель) × 8 → шаблон гантельного жима (0,76; 3×6), шаг 2 кг
    const e2 = new PlanEngine(input({ tests: { d2s4: { exerciseId: 'db_squeeze_incline30', weight: 14, reps: 8 } } }))
    const top = e2.group(1, 'd2s4', 'top')!
    expect(top.sets).toBe(3)
    expect(top.reps).toEqual({ kind: 'fixed', value: 6 })
    expect(loadTotal(top.load)).toEqual({ ok: true, value: 14 }) // 14/0.79·0.76 = 13.47 → 14
    expect(e2.group(1, 'd2s4', 'back')!.reps).toEqual({ kind: 'toFailure' })
    // неделя 12 — правила гантельного жима (0,72), а не брусьев (у брусьев нет веса вовсе)
    expect(loadTotal(e2.group(12, 'd2s4', 'main')!.load)).toEqual({ ok: true, value: 12 }) // 14/(1,0278 − 0,0278·8)·0,72 = 12,5 → 12
    expect(getExercise('db_squeeze_incline30').loadType).toBe('dumbbell')
  })

  it('рабочий диапазон замены настраивается отдельно', () => {
    const tests = { d2s4: { exerciseId: 'db_squeeze_incline30', weight: 14, reps: 8 } }
    const e = new PlanEngine(input({ tests, schemeRows: { db_squeeze_incline30: 38 } }))
    expect(e.group(1, 'd2s4', 'top')!.reps).toEqual({ kind: 'fixed', value: 10 })
  })

  it('сгибания на тренажёре Скотта — бицепс, не спина; своя история', () => {
    const ex = getExercise('scott_machine_curl')
    expect(ex.muscle).toBe('biceps')
    expect(ex.secondary ?? []).not.toContain('back')
    expect(ex.axial).toBe(false)
    expect(ex.loadType).toBe('machine')
    expect(ex.replaces?.name).toBe('Подъём штанги на бицепс')
    expect(defaultChoices().d2s3).toBe('scott_machine_curl')
    const w: WorkoutRow = {
      id: 'x', sessionId: '1-2', week: 1, day: 2, status: 'done', startedAt: '2026-10-01T10:00:00Z', algorithmVersion: '1', bodyweight: 80, note: '',
      exercises: [{ slotId: 'd2s3', exerciseId: 'scott_machine_curl', exerciseName: ex.name, loadType: 'machine', step: 2.5, note: '',
        sets: [1, 2, 3].map((i) => ({ groupId: 'top', groupLabel: 'Т', index: i, driver: null, planned: { weight: 30, reps: 5, text: '' }, actual: { weight: 30, reps: 5, rpe: 8 }, done: true })) }],
    }
    const vol = muscleVolume(w)
    expect(vol.sets.biceps).toBe(3)
    expect(vol.sets.back).toBeUndefined()
    expect(vol.axialSets).toBe(0)
    // тест исходного упражнения не переносится
    const e = new PlanEngine(input({ tests: { d2s3: { exerciseId: 'barbell_curl', weight: 50, reps: 6 } } }))
    expect(e.group(1, 'd2s3', 'top')!.load).toMatchObject({ value: { ok: false, issue: { code: 'missing-test' } } })
  })
})

describe('гантели и тоннаж', () => {
  it('тоннаж гантелей = вес одной × 2 × повторения', () => {
    const s = { groupId: 'top', groupLabel: '', index: 1, driver: null, planned: { weight: 16, reps: 10, text: '' }, actual: { weight: 16, reps: 10, rpe: 8 }, done: true }
    expect(setTonnage('db_squeeze_incline30', s, 80)).toBe(320)
    expect(setTonnage('bench', { ...s, actual: { weight: 80, reps: 5, rpe: 8 } }, 80)).toBe(400)
    expect(setTonnage('pullup_weighted', { ...s, actual: { weight: 20, reps: 5, rpe: 8 } }, 80)).toBe(500)
    expect(setTonnage('pullup_bw', { ...s, actual: { weight: null, reps: 10, rpe: 8 } }, 80)).toBe(800)
    expect(setTonnage('bench', { ...s, done: false }, 80)).toBe(0)
  })
})

describe('пустые и необязательные данные', () => {
  it('незаполненная строка «+» не даёт ошибок и не влияет на остальные упражнения', () => {
    const e = new PlanEngine(input())
    for (const w of WEEKS) for (const day of [1, 2, 3] as const) {
      const s = e.session(w, day)
      expect(s.exercises.map((x) => x.slotId)).not.toContain(`d${day}s5`)
      for (const i of sessionIssues(s)) expect(i.message).not.toMatch(/«\+»|undefined/)
    }
    // с «+» результаты остальных слотов те же
    const tests = { d1s1: { exerciseId: 'bench', weight: 80, reps: 6 } }
    const a = new PlanEngine(input({ tests }))
    const b = new PlanEngine(input({ tests, choices: { ...defaultChoices(), d1s5: 'crunch' } }))
    expect(loadTotal(a.group(1, 'd1s1', 'top')!.load)).toEqual(loadTotal(b.group(1, 'd1s1', 'top')!.load))
    expect(b.group(1, 'd1s5', 'top')!.reps).toMatchObject({ kind: 'issue', issue: { code: 'missing-test' } })
  })

  it('во всём плане без данных нет NaN, Infinity, #N/A и нулевых весов', () => {
    for (const bodyweight of [null, 80]) {
      const e = new PlanEngine(input({ bodyweight, choices: Object.fromEntries(SLOTS.map((s) => [s.id, s.options.find((o) => o.exerciseId !== 'dips' && o.exerciseId !== 'barbell_curl')!.exerciseId])) as Record<SlotId, string> }))
      for (const s of e.allSessions()) {
        for (const ex of s.exercises) for (const g of ex.groups) {
          const t = groupText(g)
          expect(t).not.toMatch(/NaN|Infinity|#N\/A|undefined|null/)
          const l = loadTotal(g.load)
          if (l.ok) expect(l.value).toBeGreaterThan(0)
        }
        for (const i of sessionIssues(s)) expect(i.message.length).toBeGreaterThan(10)
      }
    }
  })

  it('тест вне таблицы RPE (12 повторений) — предупреждение, а не #N/A', () => {
    const e = new PlanEngine(input({ tests: { d1s1: { exerciseId: 'bench', weight: 60, reps: 12 } } }))
    expect(e.group(1, 'd1s1', 'top')!.load).toMatchObject({ value: { ok: false, issue: { code: 'reps-out-of-range' } } })
  })
})

describe('ручные правки будущего плана', () => {
  it('правка веса группы меняет её и цепочку, если RPE ещё не записан', () => {
    const base = input({ tests: { d1s1: { exerciseId: 'bench', weight: 80, reps: 6 } } })
    const key = groupKey(1, 'd1s1', 'top')
    const e = new PlanEngine({ ...base, overrides: { [key]: { weight: 85, sets: 2 } }, drivers: { [key]: drv('bench', 8) } })
    const g = e.group(1, 'd1s1', 'top')!
    expect(g.overridden).toBe(true)
    expect(g.sets).toBe(2)
    expect(loadTotal(g.load)).toEqual({ ok: true, value: 85 })
    // следующая неделя — от 85 кг × 3 @8 (факт не записан → плановое значение)
    expect(total(e, 2, 'd1s1', 'top')).toBe(Math.floor((85 / 0.86) * 0.85 / 2.5 + 0.5) * 2.5)
  })
})
