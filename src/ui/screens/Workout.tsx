import { type Ref, useEffect, useMemo, useRef, useState } from 'react'
import { LOAD_TYPE_LABEL, getExercise } from '../../domain/exercises/catalog'
import { fmt, fmtDate, fmtDuration, fmtKg, parseNum } from '../../domain/format'
import { HIDDEN_IN_PICKER, getSlot, weekLabel } from '../../domain/program/definition'
import type { PlannedGroup, PlannedSession } from '../../domain/program/engine'
import { type SetAddress, describeActual, findSet, lastResult, setAddress } from '../../domain/progression/workout'
import {
  addExtraSet, completeSet, finishWorkout, setChoice, setExerciseNote, setWorkoutBodyweight, setWorkoutNote,
  startWorkout, swapExerciseForToday, syncActiveWorkout, updateSet,
} from '../../storage/repo'
import type { WorkoutExercise, WorkoutRow, WorkoutSet } from '../../storage/types'
import { ConfirmSheet, Icon, NumberField, RpeSheet, Sheet, useToast } from '../components'
import { type AppData, findSession, useData } from '../data'
import { back, go } from '../nav'
import { type TimerState, readTimer, writeTimer } from '../restTimer'
import { Cell, GridHeader, type WeightState, bumpValue, groupHeadline, needsHeadline, repsPlaceholder, rpeTarget, weightCaption, weightPlaceholder, weightState } from '../setGrid'

// ------------------------------------------------ звук

let audioCtx: AudioContext | null = null

/** Один общий AudioContext на приложение: создаётся и возобновляется при первом нажатии (жест пользователя). */
function audioContext(): AudioContext | null {
  try {
    if (!audioCtx || audioCtx.state === 'closed') {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new Ctx()
    }
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    return audioCtx
  } catch {
    return null
  }
}

function beep() {
  try {
    const ctx = audioContext()
    if (!ctx) return
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = 880
    g.gain.value = 0.15
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.35)
  } catch {
    /* звук недоступен */
  }
}

/** Хранилище таймера (в тестах и при запрете localStorage — null). */
const storage = (): Storage | null => (typeof localStorage === 'undefined' ? null : localStorage)

function RestTimer({ timer, onChange }: { timer: TimerState | null; onChange: (t: TimerState | null) => void }) {
  const [now, setNow] = useState(Date.now())
  const fired = useRef(false)
  useEffect(() => {
    if (!timer) return
    fired.current = timer.endsAt <= Date.now()
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [timer])
  const left = timer ? (timer.endsAt - now) / 1000 : 0
  useEffect(() => {
    if (timer && left <= 0 && !fired.current) {
      fired.current = true
      navigator.vibrate?.([200, 100, 200])
      beep()
    }
  }, [left, timer])
  if (!timer) return null
  const over = left <= 0
  return (
    <div className={`timer${over ? ' over' : ''}`} role="timer" aria-live="off">
      <div className="timer-bar"><div style={{ width: `${Math.max(0, Math.min(100, (left / timer.total) * 100))}%` }} /></div>
      <div className="timer-inner">
        <div className="col" style={{ gap: 0 }}>
          <span className="tiny muted">{over ? 'Отдых окончен' : 'Отдых'}</span>
          <span className="clock">{over ? `+${fmtDuration(-left)}` : fmtDuration(left)}</span>
        </div>
        <div className="row grow" style={{ justifyContent: 'flex-end' }}>
          <button className="btn sm" aria-label="Отдых на 15 секунд меньше" onClick={() => onChange({ ...timer, endsAt: timer.endsAt - 15000 })}>−15</button>
          <button className="btn sm" aria-label="Отдых на 15 секунд больше" onClick={() => onChange({ ...timer, endsAt: timer.endsAt + 15000, total: timer.total + 15 })}>+15</button>
          <button className="btn sm" aria-label="Начать отдых заново" title="Заново" onClick={() => onChange({ ...timer, endsAt: Date.now() + timer.total * 1000 })}>↺</button>
          <button className="btn sm primary" onClick={() => onChange(null)}>{over ? 'Ок' : 'Пропустить'}</button>
        </div>
      </div>
    </div>
  )
}

function restFor(d: AppData, g: PlannedGroup | undefined): number {
  if (!g) return d.profile.restMediumSec
  return g.role === 'heavy' ? d.profile.restHeavySec : g.role === 'light' ? d.profile.restLightSec : d.profile.restMediumSec
}

const userNote = (n: string) => !n.startsWith('ИСПРАВЛЕНО') && !n.startsWith('ДОПУЩЕНИЕ')

/** Часы тренировки: своё состояние и свой таймер — секунды не перерисовывают весь экран. */
function ElapsedClock({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(() => Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 1000))
  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 1000))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [startedAt])
  return <span className="num">{fmtDuration(elapsed)}</span>
}

export function WorkoutScreen({ sessionId }: { sessionId: string }) {
  const d = useData()
  const toast = useToast()
  const session = findSession(d, sessionId)
  const workout = d.workoutBySession.get(sessionId)
  const [timer, setTimerState] = useState<TimerState | null>(null)
  const [rpeFor, setRpeFor] = useState<{ addr: SetAddress; reason?: string } | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const setTimer = (t: TimerState | null) => { setTimerState(t); writeTimer(storage(), t) }

  // таймер отдыха принадлежит конкретной тренировке: на экране другой тренировки его нет
  useEffect(() => {
    if (!workout) { setTimerState(null); return }
    setTimerState(readTimer(storage(), Date.now(), workout.id))
  }, [workout?.id])

  // свежий план → плановые значения активной тренировки (подсобные пересчитываются после RPE тяжёлого)
  useEffect(() => {
    if (session && workout?.status === 'active') void syncActiveWorkout(session)
  }, [session, workout?.status])

  if (!session) return <div className="screen"><p>Тренировка не найдена.</p><button className="btn" onClick={() => go('today')}>На главную</button></div>

  if (!workout) {
    return (
      <div className="screen">
        <div className="screen-head">
          <button className="icon-btn" aria-label="Назад" onClick={() => back()}><Icon.back /></button>
          <h1>{weekLabel(session.week)} · день {session.day}</h1>
        </div>
        <p className="muted">Тренировка ещё не начата.</p>
        <button className="btn primary block" onClick={async () => {
          try { await startWorkout(session, d.bodyweight) } catch (e) { toast((e as Error).message) }
        }}>Начать тренировку</button>
      </div>
    )
  }

  const isDone = workout.status === 'done'
  const doneSets = workout.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)
  const totalSets = workout.exercises.reduce((n, e) => n + e.sets.length, 0)
  const missingDrivers = workout.exercises.flatMap((e) =>
    e.sets.filter((s) => s.driver === 'rpe' && s.done && s.actual.rpe === null).map(() => e.exerciseName))

  const onDone = async (addr: SetAddress, g: PlannedGroup | undefined) => {
    const r = await completeSet(workout.id, addr)
    if (r.result === 'need-reps') { toast('Введите число выполненных повторений'); return }
    if (r.result === 'need-weight') { toast('Введите рабочий вес'); return }
    if (r.result !== 'ok' || !r.set?.done) return
    navigator.vibrate?.(30)
    if (!isDone) {
      const rest = restFor(d, g)
      setTimer({ workoutId: workout.id, endsAt: Date.now() + rest * 1000, total: rest })
    }
    if (r.set.driver === 'rpe' && r.set.actual.rpe === null) {
      setRpeFor({ addr, reason: 'RPE этого подхода нужен, чтобы рассчитать следующие веса.' })
    }
  }

  return (
    <div style={{ paddingBottom: timer ? 110 : 24 }}>
      <div className="wk-head">
        <div className="row">
          <button className="icon-btn" aria-label="Назад" onClick={() => back()}><Icon.back /></button>
          <div className="grow col" style={{ gap: 0 }}>
            <strong>{weekLabel(session.week)} · день {session.day}</strong>
            <span className="tiny muted num">
              {isDone
                ? `Завершена ${fmtDate(workout.finishedAt ?? workout.startedAt)} · правка записи`
                : <><ElapsedClock startedAt={workout.startedAt} /> · подходов {doneSets}/{totalSets}</>}
            </span>
          </div>
          {!isDone && <button className="btn sm ghost tap44" onClick={() => setConfirmFinish(true)}>Завершить</button>}
        </div>
      </div>

      <div className="screen">
        {workout.exercises.map((ex) => (
          <ExerciseBlock
            key={`${ex.slotId}-${ex.exerciseId}`} d={d} workout={workout} session={session} ex={ex}
            onDone={onDone} onRpe={(addr) => setRpeFor({ addr })}
          />
        ))}

        <div className="card">
          <h3>Заметка к тренировке</h3>
          <NoteEditor value={workout.note} onSave={(note) => void setWorkoutNote(workout.id, note)} />
          {workout.exercises.some((e) => e.loadType === 'weighted_bodyweight' || e.loadType === 'bodyweight') && (
            <NumberField
              commit="blur"
              label="Вес тела на эту тренировку, кг" value={workout.bodyweight}
              onChange={(v) => void setWorkoutBodyweight(workout.id, v)}
              hint="Берётся из профиля при старте. Используется для отягощений и тоннажа именно этой тренировки."
            />
          )}
        </div>

        {isDone ? (
          <button className="btn block" onClick={() => back('history')}>Готово</button>
        ) : (
          <button className="btn ok block" onClick={() => setConfirmFinish(true)}>Завершить тренировку</button>
        )}
      </div>

      {!isDone && <RestTimer timer={timer} onChange={setTimer} />}

      <RpeSheet
        open={rpeFor !== null}
        reason={rpeFor?.reason}
        value={rpeFor ? findSet(workout, rpeFor.addr)?.set.actual.rpe ?? null : null}
        onClose={() => setRpeFor(null)}
        onPick={async (v) => {
          if (rpeFor) await updateSet(workout.id, rpeFor.addr, { actual: { rpe: v } })
          setRpeFor(null)
        }}
      />

      <ConfirmSheet
        open={confirmFinish} title="Завершить тренировку?" confirmText="Завершить" onClose={() => setConfirmFinish(false)}
        onConfirm={async () => {
          setConfirmFinish(false)
          setTimer(null)
          const r = await finishWorkout(workout.id, session)
          toast(r.testsSaved ? `Тренировка сохранена, результатов теста: ${r.testsSaved}` : 'Тренировка сохранена')
          go('today')
        }}
      >
        <p>Выполнено подходов: <strong>{doneSets} из {totalSets}</strong>.</p>
        {missingDrivers.length > 0 && (
          <div className="notice warn small">Не указан RPE тяжёлого подхода: {[...new Set(missingDrivers)].join(', ')}. Без него вес следующей недели не рассчитается — RPE можно добавить и позже в истории.</div>
        )}
        <p className="small muted">Сохранятся фактические веса, повторения и RPE, а также план, по которому вы работали. Будущие пересчёты эту запись не изменят.</p>
      </ConfirmSheet>
    </div>
  )
}

function NoteEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <textarea className="input" value={text} placeholder="Самочувствие, техника, что изменить…" aria-label="Заметка"
      onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== value) onSave(text) }} />
  )
}

function ExerciseBlock(props: {
  d: AppData; workout: WorkoutRow; session: PlannedSession; ex: WorkoutExercise
  onDone: (addr: SetAddress, g: PlannedGroup | undefined) => void
  onRpe: (addr: SetAddress) => void
}) {
  const { d, workout, session, ex } = props
  const toast = useToast()
  const [menu, setMenu] = useState(false)
  const [noteOpen, setNoteOpen] = useState(!!ex.note)
  const [infoOpen, setInfoOpen] = useState(false)
  const [swap, setSwap] = useState(false)
  const [swapScope, setSwapScope] = useState<'today' | 'program'>('today')
  const info = getExercise(ex.exerciseId)
  const live = session.exercises.find((p) => p.slotId === ex.slotId && p.exerciseId === ex.exerciseId)
  const last = useMemo(() => lastResult(d.workouts, ex.exerciseId, ex.sets[0]?.groupId ?? '', workout.id), [d.workouts, ex.exerciseId, workout.id])
  const allDone = ex.sets.length > 0 && ex.sets.every((s) => s.done)
  const bw = workout.bodyweight
  const active = workout.status === 'active'
  const currentIdx = active ? ex.sets.findIndex((s) => !s.done) : -1

  const applyLast = async () => {
    if (!last) return
    const si = ex.sets.findIndex((s) => !s.done)
    if (si < 0) return
    const s = ex.sets[si]
    await updateSet(workout.id, setAddress(ex, s), { actual: { weight: s.actual.weight ?? last.weight, reps: s.actual.reps ?? last.reps } })
    toast('Подставлен прошлый результат в ближайший подход')
  }

  const addSet = async () => {
    const lastSet = ex.sets[ex.sets.length - 1]
    if (!lastSet) return
    await addExtraSet(workout.id, ex.slotId, lastSet.groupId)
    setMenu(false)
  }

  const slot = getSlot(ex.slotId)
  const options = slot.options.filter((o) => !HIDDEN_IN_PICKER.has(o.exerciseId))
  // пояснения к упражнению: что вводить и особенности выполнения
  const hints = [
    ex.loadType === 'weighted_bodyweight' ? `Вводите только навешенный вес. Вес тела: ${fmtKg(bw)}${bw === null ? ' — укажите в профиле' : ''}.` : '',
    ex.loadType === 'dumbbell' ? 'Вес одной гантели, в тоннаже ×2.' : '',
    info.note && ex.loadType !== 'weighted_bodyweight' ? info.note : '',
  ].filter(Boolean)
  const meta = [LOAD_TYPE_LABEL[ex.loadType], ex.loadType !== 'bodyweight' ? `шаг ${fmt(ex.step)}` : '', ex.originalName ? `вместо «${ex.originalName}»` : ''].filter(Boolean).join(' · ')

  // подходы по группам; нумерация сквозная внутри упражнения
  const groups: string[] = [...new Set(ex.sets.map((s) => s.groupId))]
  let n = 0

  return (
    <section className={`ex-block${allDone ? ' done' : ''}`} aria-label={ex.exerciseName}>
      <div className="ex-top">
        <h3 className="ex-name">{ex.exerciseName}</h3>
        <button className="icon-btn ghost" aria-label={`История: ${ex.exerciseName}`} onClick={() => go(`progress/${ex.exerciseId}`)}><Icon.history /></button>
        <button className="icon-btn ghost" aria-label="Действия с упражнением" onClick={() => setMenu(true)}><Icon.dots /></button>
      </div>
      <div className="ex-meta">{slot.role} · {meta}</div>
      {ex.swappedForToday && <div className="sg-wait">Замена только в этой тренировке: вес подбирается сам, программа не изменена.</div>}
      {hints.length > 0 && (
        <button className={`ex-note${infoOpen ? ' open' : ''}`} onClick={() => setInfoOpen(!infoOpen)} aria-expanded={infoOpen}>
          {hints.join(' ')}
        </button>
      )}
      {last && (
        <div className="ex-last">
          <span className="grow">Прошлый раз {fmtDate(last.date)}: <strong>{describeActual(ex, { actual: last })}</strong></span>
          {active && <button className="link-btn tap" onClick={applyLast}>Подставить</button>}
        </div>
      )}

      <GridHeader />
      {groups.map((gid) => {
        const g = live?.groups.find((x) => x.groupId === gid)
        const sets = ex.sets.map((s, si) => ({ s, si })).filter(({ s }) => s.groupId === gid)
        const st = g ? weightState(g, session.id) : null
        const notes = g?.notes ?? []
        const showHead = needsHeadline(g, sets[0].s.groupLabel)
        return (
          <div key={gid} className={`sg-group${showHead ? ' has-head' : ''}`}>
            {showHead && (
              <div className="sg-sub">
                <span className="grow">{g ? groupHeadline(g) : sets[0].s.planned.text}</span>
                {g?.load.kind === 'weighted_bw' && g.load.total.ok && <span>всего {fmtKg(g.load.total.value)}</span>}
                {g?.driver === 'rpe' && <span className="accent">RPE → след. вес</span>}
                {g?.driver === 'amrap' && <span className="accent">запишите повторы</span>}
              </div>
            )}
            {active && st?.kind === 'blocked' && <div className="sg-warn">{st.issue.message}</div>}
            {active && st?.kind === 'waiting' && <div className="sg-wait">Вес появится после оценки RPE предыдущего подхода</div>}
            {notes.filter(userNote).map((t) => <div key={t} className="sg-wait">{t}</div>)}
            {sets.map(({ s, si }) => {
              n++
              return (
                <SetRow key={`${s.groupId}-${s.index}-${s.extra ? 'x' : 'p'}`} num={n} ex={ex} s={s} workout={workout} g={g} st={st}
                  current={si === currentIdx} last={last} onDone={props.onDone} onRpe={props.onRpe} />
              )
            })}
            {notes.some((t) => !userNote(t)) && (
              <details className="more sg-calc">
                <summary>Как рассчитано</summary>
                {notes.filter((t) => !userNote(t)).map((t) => <p key={t} className="tiny faint">{t}</p>)}
              </details>
            )}
          </div>
        )
      })}

      <button className="add-set" onClick={addSet}>+ Добавить сет</button>

      {noteOpen && (
        <div className="ex-notes">
          <NoteEditor value={ex.note} onSave={(note) => void setExerciseNote(workout.id, ex.slotId, note)} />
        </div>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={ex.exerciseName}>
        <button className="btn block" onClick={() => { setNoteOpen(true); setMenu(false) }}>Заметка к упражнению</button>
        <button className="btn block" onClick={addSet}>Добавить подход</button>
        {active && options.length > 1 && (
          <button className="btn block" onClick={() => { setMenu(false); setSwap(true) }}>Заменить упражнение</button>
        )}
        {ex.originalName && <p className="small muted">Персональная замена: в исходной программе — «{ex.originalName}».</p>}
      </Sheet>

      <Sheet open={swap} onClose={() => setSwap(false)} title="Заменить упражнение">
        <div className="seg" role="group" aria-label="Где действует замена">
          <button aria-pressed={swapScope === 'today'} onClick={() => setSwapScope('today')}>Только в этой тренировке</button>
          <button aria-pressed={swapScope === 'program'} onClick={() => setSwapScope('program')}>В программе (все будущие)</button>
        </div>
        {swapScope === 'today' ? (
          <p className="small muted">Упражнение меняется только в этой тренировке: план для него — «подбор» (вес подбираете сами), программа и будущие тренировки не меняются.</p>
        ) : (
          <p className="small muted">Замена действует для этой и всех будущих тренировок слота «{slot.role}». У нового упражнения своя история и свой тест; завершённые тренировки не меняются.</p>
        )}
        {ex.sets.some((s) => s.done) && <div className="notice warn small">В этом упражнении уже есть выполненные подходы — в текущей тренировке оно останется, замена подействует со следующей.</div>}
        {options.map((o) => (
          <button key={o.exerciseId} className={`btn block ${o.exerciseId === ex.exerciseId ? 'primary' : ''}`}
            onClick={async () => {
              if (swapScope === 'today') await swapExerciseForToday(workout.id, ex.slotId, o.exerciseId)
              else await setChoice(ex.slotId, o.exerciseId)
              setSwap(false)
              toast(swapScope === 'today' ? 'Упражнение заменено в этой тренировке' : 'Упражнение заменено в программе')
            }}>
            {getExercise(o.exerciseId).name}
          </button>
        ))}
      </Sheet>
    </section>
  )
}

/**
 * Поле ячейки: крупное число и подпись колонки; сохраняется при уходе из поля, по Enter,
 * через 600 мс после последнего ввода и при сворачивании приложения.
 */
function CellInput(props: {
  value: number | null; placeholder: string; caption: string; label: string
  onCommit: (v: number | null) => void; integer?: boolean; allowNegative?: boolean
  enterKeyHint?: 'next' | 'done'; onEnterNext?: () => void; inputRef?: Ref<HTMLInputElement>
}) {
  const show = (v: number | null) => (v === null ? '' : fmt(v).replace(/\s/g, ''))
  const [text, setText] = useState(show(props.value))
  const focused = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const textRef = useRef(text)
  textRef.current = text
  const valueRef = useRef(props.value)
  valueRef.current = props.value
  const commitRef = useRef(props.onCommit)
  commitRef.current = props.onCommit
  useEffect(() => { if (!focused.current) setText(show(props.value)) }, [props.value])

  /**
   * Разбор строки: ок — значение (пустая строка — сброс), не ок — ввод не разбирается.
   * Незаконченный ввод («72,») не теряем: хвост-разделитель отбрасывается.
   */
  const parsed = (s: string): { ok: true; value: number | null } | { ok: false } => {
    const t = s.trim()
    if (t === '') return { ok: true, value: null }
    const norm = /[,.]$/.test(t) ? t.slice(0, -1) : t
    const v = parseNum(norm)
    if (v === null || (!props.allowNegative && v < 0)) return { ok: false }
    return { ok: true, value: props.integer ? Math.round(v) : v }
  }

  const commitNow = () => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    const r = parsed(textRef.current)
    if (!r.ok) {
      setText(show(valueRef.current)) // неразборчивый ввод не сохраняем — показываем прежнее значение
      return
    }
    commitRef.current(r.value)
  }
  const commitNowRef = useRef(commitNow)
  commitNowRef.current = commitNow

  // ввод сохраняется и без ухода из поля: через 600 мс и при сворачивании приложения
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'hidden') commitNowRef.current() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return (
    <label className="sg-cell input">
      <input
        ref={props.inputRef}
        inputMode={props.integer ? 'numeric' : 'decimal'} enterKeyHint={props.enterKeyHint ?? 'done'} aria-label={props.label}
        placeholder={props.placeholder} value={text}
        onFocus={(e) => { focused.current = true; e.currentTarget.select() }}
        onChange={(e) => {
          setText(e.target.value)
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => commitNowRef.current(), 600)
        }}
        onBlur={() => {
          focused.current = false
          commitNow()
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          if (props.onEnterNext) { props.onEnterNext(); return }
          ;(e.target as HTMLInputElement).blur()
        }}
      />
      <span className="c">{props.caption}</span>
    </label>
  )
}

function SetRow(props: {
  num: number; ex: WorkoutExercise; s: WorkoutSet; workout: WorkoutRow; g: PlannedGroup | undefined
  st: WeightState | null; current: boolean
  last: { weight: number | null; reps: number | null; rpe: number | null; date: string } | null
  onDone: (addr: SetAddress, g: PlannedGroup | undefined) => void
  onRpe: (addr: SetAddress) => void
}) {
  const { ex, s, workout, g, st, num } = props
  const bwOnly = ex.loadType === 'bodyweight'
  const wbw = ex.loadType === 'weighted_bodyweight'
  const repsRef = useRef<HTMLInputElement>(null)
  const addr = setAddress(ex, s)
  const set = (patch: Partial<WorkoutSet['actual']>) => updateSet(workout.id, addr, { actual: patch })
  const plannedReps = typeof s.planned.reps === 'number' ? s.planned.reps : null
  // ячейка веса: факт, иначе план, иначе состояние («подбор», «ждёт») — но не выдуманное число
  const wPlaceholder = s.planned.weight !== null
    ? fmt(s.planned.weight).replace(/\s/g, '')
    : ex.swappedForToday ? 'подбор' : st ? weightPlaceholder(st) : '—'
  const shownWeight = s.actual.weight ?? s.planned.weight
  let sub = ''
  if (wbw && workout.bodyweight !== null && shownWeight !== null) sub = `всего ${fmtKg(workout.bodyweight + shownWeight)} с весом тела`
  if (ex.loadType === 'dumbbell' && shownWeight !== null) sub = `2 × ${fmtKg(shownWeight)} = ${fmtKg(shownWeight * 2)}`
  const needRpe = s.driver === 'rpe' && s.actual.rpe === null
  const target = rpeTarget(g)
  const bump = (field: 'weight' | 'reps', d: number) => {
    const next = field === 'weight'
      ? bumpValue({ actual: s.actual.weight, planned: s.planned.weight, last: props.last?.weight ?? null, delta: d, step: ex.step, min: wbw ? -Infinity : 0 })
      : bumpValue({ actual: s.actual.reps, planned: plannedReps, last: props.last?.reps ?? null, delta: d, step: 1, min: 0 })
    if (next === null) return
    void set(field === 'weight' ? { weight: next } : { reps: next })
  }
  return (
    <>
      <div className={`sg-row${s.done ? ' is-done' : ''}${props.current ? ' is-current' : ''}`}>
        <span className={`sg-mark${s.extra ? ' extra' : ''}`} aria-label={`Сет ${num}`}>{num}</span>
        {bwOnly ? (
          <Cell value="—" caption="СВ. ВЕС" tone="muted" />
        ) : (
          <CellInput label={wbw ? `Сет ${num}: отягощение, кг` : `Сет ${num}: вес, кг`} value={s.actual.weight} placeholder={wPlaceholder}
            caption={weightCaption(ex.loadType)} allowNegative={wbw} enterKeyHint="next" onEnterNext={() => repsRef.current?.focus()}
            onCommit={(v) => set({ weight: v })} />
        )}
        <CellInput label={`Сет ${num}: повторения`} value={s.actual.reps} placeholder={repsPlaceholder(g, s.planned.reps)} caption="ПОВТОР" integer
          enterKeyHint="done" inputRef={repsRef} onCommit={(v) => set({ reps: v })} />
        <button className={`sg-cell rpe${needRpe ? (s.done ? ' need' : ' drive') : ''}`} aria-label={`Сет ${num}: RPE`} onClick={() => props.onRpe(addr)}>
          <span className={`v${s.actual.rpe === null ? ' ph' : ''}`}>{s.actual.rpe !== null ? fmt(s.actual.rpe) : (target ?? '—')}</span>
          <span className="c">RPE</span>
        </button>
        <button className="sg-done" aria-pressed={s.done} aria-label={s.done ? `Сет ${num} выполнен — отменить` : `Отметить сет ${num} выполненным`}
          onClick={() => props.onDone(addr, g)}>
          <Icon.check />
        </button>
      </div>
      {(props.current || sub) && (
        <div className="sg-extra">
          {props.current && !bwOnly && (
            <span className="sg-bumps" aria-label="Быстрая правка веса">
              <button onClick={() => bump('weight', -ex.step)} aria-label={`Вес минус ${fmt(ex.step)}`}>−{fmt(ex.step)}</button>
              <button onClick={() => bump('weight', ex.step)} aria-label={`Вес плюс ${fmt(ex.step)}`}>+{fmt(ex.step)}</button>
            </span>
          )}
          {props.current && (
            <span className="sg-bumps reps" aria-label="Быстрая правка повторений">
              <button onClick={() => bump('reps', -1)} aria-label="Повторы минус 1">−1</button>
              <button onClick={() => bump('reps', 1)} aria-label="Повторы плюс 1">+1</button>
            </span>
          )}
          {sub && <span className="sg-subline">{sub}</span>}
        </div>
      )}
    </>
  )
}
