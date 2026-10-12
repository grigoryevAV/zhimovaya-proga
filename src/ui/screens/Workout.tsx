import { useEffect, useMemo, useRef, useState } from 'react'
import { LOAD_TYPE_LABEL, getExercise } from '../../domain/exercises/catalog'
import { fmt, fmtDate, fmtDuration, fmtKg, groupText } from '../../domain/format'
import { HIDDEN_IN_PICKER, getSlot, weekLabel } from '../../domain/program/definition'
import type { PlannedGroup, PlannedSession } from '../../domain/program/engine'
import { describeActual, lastResult } from '../../domain/progression/workout'
import {
  completeSet, finishWorkout, saveWorkout, setChoice, startWorkout, syncActiveWorkout, updateSet,
} from '../../storage/repo'
import type { WorkoutExercise, WorkoutRow, WorkoutSet } from '../../storage/types'
import { ConfirmSheet, Icon, NumberField, RpeSheet, Sheet, Stepper, useToast } from '../components'
import { type AppData, findSession, useData } from '../data'
import { back, go } from '../nav'

const TIMER_KEY = 'zp-rest-timer'

interface TimerState { endsAt: number; total: number }

function readTimer(): TimerState | null {
  try {
    const raw = localStorage.getItem(TIMER_KEY)
    return raw ? (JSON.parse(raw) as TimerState) : null
  } catch {
    return null
  }
}
function writeTimer(t: TimerState | null) {
  try {
    if (t) localStorage.setItem(TIMER_KEY, JSON.stringify(t))
    else localStorage.removeItem(TIMER_KEY)
  } catch {
    /* хранилище недоступно — таймер просто не переживёт перезагрузку */
  }
}

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
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
          <button className="btn sm" onClick={() => onChange({ endsAt: Date.now() + timer.total * 1000, total: timer.total })}>Заново</button>
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

export function WorkoutScreen({ sessionId }: { sessionId: string }) {
  const d = useData()
  const toast = useToast()
  const session = findSession(d, sessionId)
  const workout = d.workoutBySession.get(sessionId)
  const [timer, setTimerState] = useState<TimerState | null>(readTimer)
  const [rpeFor, setRpeFor] = useState<{ ei: number; si: number; reason?: string } | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const setTimer = (t: TimerState | null) => { setTimerState(t); writeTimer(t) }

  // свежий план → плановые значения активной тренировки (подсобные пересчитываются после RPE тяжёлого)
  useEffect(() => {
    if (session && workout?.status === 'active') void syncActiveWorkout(session)
  }, [session, workout?.status])

  useEffect(() => {
    if (!workout || workout.status !== 'active') return
    const tick = () => setElapsed((Date.now() - new Date(workout.startedAt).getTime()) / 1000)
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [workout?.id, workout?.status, workout?.startedAt])

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

  const onDone = async (ei: number, si: number, _ex: WorkoutExercise, _s: WorkoutSet, g: PlannedGroup | undefined) => {
    const r = await completeSet(workout.id, ei, si)
    if (r.result === 'need-reps') { toast('Введите число выполненных повторений'); return }
    if (r.result === 'need-weight') { toast('Введите рабочий вес'); return }
    if (r.result !== 'ok' || !r.set?.done) return
    if (!isDone) setTimer({ endsAt: Date.now() + restFor(d, g) * 1000, total: restFor(d, g) })
    if (r.set.driver === 'rpe' && r.set.actual.rpe === null) {
      setRpeFor({ ei, si, reason: 'RPE этого подхода нужен, чтобы рассчитать следующие веса.' })
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
              {isDone ? `Завершена ${fmtDate(workout.finishedAt ?? workout.startedAt)} · правка записи` : `${fmtDuration(elapsed)} · подходов ${doneSets}/${totalSets}`}
            </span>
          </div>
          {!isDone && <button className="btn sm ok" onClick={() => setConfirmFinish(true)}>Завершить</button>}
        </div>
      </div>

      <div className="screen">
        {workout.exercises.map((ex, ei) => (
          <ExerciseBlock
            key={`${ex.slotId}-${ex.exerciseId}`} d={d} workout={workout} session={session} ex={ex} ei={ei}
            onDone={onDone} onRpe={(si) => setRpeFor({ ei, si })}
          />
        ))}

        <div className="card">
          <h3>Заметка к тренировке</h3>
          <NoteEditor value={workout.note} onSave={(note) => saveWorkout({ ...workout, note })} />
          {workout.exercises.some((e) => e.loadType === 'weighted_bodyweight' || e.loadType === 'bodyweight') && (
            <NumberField
              commit="blur"
              label="Вес тела на эту тренировку, кг" value={workout.bodyweight}
              onChange={(v) => saveWorkout({ ...workout, bodyweight: v })}
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
        value={rpeFor ? workout.exercises[rpeFor.ei]?.sets[rpeFor.si]?.actual.rpe ?? null : null}
        onClose={() => setRpeFor(null)}
        onPick={async (v) => {
          if (rpeFor) await updateSet(workout.id, rpeFor.ei, rpeFor.si, { actual: { rpe: v } })
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
  d: AppData; workout: WorkoutRow; session: PlannedSession; ex: WorkoutExercise; ei: number
  onDone: (ei: number, si: number, ex: WorkoutExercise, s: WorkoutSet, g: PlannedGroup | undefined) => void
  onRpe: (si: number) => void
}) {
  const { d, workout, session, ex, ei } = props
  const toast = useToast()
  const [menu, setMenu] = useState(false)
  const [noteOpen, setNoteOpen] = useState(!!ex.note)
  const [swap, setSwap] = useState(false)
  const info = getExercise(ex.exerciseId)
  const live = session.exercises.find((p) => p.slotId === ex.slotId && p.exerciseId === ex.exerciseId)
  const last = useMemo(() => lastResult(d.workouts, ex.exerciseId, ex.sets[0]?.groupId ?? '', workout.id), [d.workouts, ex.exerciseId, workout.id])
  const allDone = ex.sets.length > 0 && ex.sets.every((s) => s.done)
  const groups: string[] = [...new Set(ex.sets.map((s) => s.groupId))]
  const bw = workout.bodyweight

  const applyLast = async () => {
    if (!last) return
    const si = ex.sets.findIndex((s) => !s.done)
    if (si < 0) return
    const s = ex.sets[si]
    await updateSet(workout.id, ei, si, { actual: { weight: s.actual.weight ?? last.weight, reps: s.actual.reps ?? last.reps } })
    toast('Подставлен прошлый результат в ближайший подход')
  }

  const addSet = async () => {
    const lastSet = ex.sets[ex.sets.length - 1]
    if (!lastSet) return
    const extra: WorkoutSet = {
      ...lastSet, index: ex.sets.filter((s) => s.groupId === lastSet.groupId).length + 1, driver: null, extra: true,
      actual: { weight: null, reps: null, rpe: null }, done: false,
    }
    const exercises = workout.exercises.map((e, i) => (i === ei ? { ...e, sets: [...e.sets, extra] } : e))
    await saveWorkout({ ...workout, exercises })
    setMenu(false)
  }

  const slot = getSlot(ex.slotId)
  const options = slot.options.filter((o) => !HIDDEN_IN_PICKER.has(o.exerciseId))

  return (
    <div className={`ex-card${allDone ? ' done' : ''}`}>
      <div className="ex-head">
        <div className="row">
          <div className="grow col" style={{ gap: 2 }}>
            <span className="eyebrow">{slot.role}</span>
            <span className="ex-title">{ex.exerciseName}</span>
          </div>
          <button className="icon-btn" aria-label="Действия с упражнением" onClick={() => setMenu(true)}><Icon.dots /></button>
        </div>
        <div className="row wrap">
          <span className="badge">{LOAD_TYPE_LABEL[ex.loadType]}</span>
          {ex.loadType !== 'bodyweight' && <span className="badge">шаг {fmtKg(ex.step)}</span>}
          {ex.originalName && <span className="badge info">вместо: {ex.originalName}</span>}
        </div>
        {ex.loadType === 'weighted_bodyweight' && (
          <span className="small muted">Вводите только навешенный вес. Вес тела: {fmtKg(bw)}{bw === null ? ' — укажите в профиле' : ''}.</span>
        )}
        {ex.loadType === 'dumbbell' && <span className="small muted">Вес одной гантели. В тоннаже считается ×2.</span>}
        {info.note && ex.loadType !== 'weighted_bodyweight' && <span className="small muted">{info.note}</span>}
        {last && (
          <div className="row small">
            <span className="grow muted">Прошлый раз ({fmtDate(last.date)}): {describeActual(ex, { actual: last })}</span>
            {workout.status === 'active' && <button className="btn sm ghost" onClick={applyLast}>Подставить</button>}
          </div>
        )}
      </div>

      {groups.map((gid) => {
        const g = live?.groups.find((x) => x.groupId === gid)
        const sets = ex.sets.map((s, si) => ({ s, si })).filter(({ s }) => s.groupId === gid)
        const issue = g && ((g.load.kind === 'weight' && !g.load.value.ok && g.load.value.issue.message)
          || (g.load.kind === 'weighted_bw' && !g.load.added.ok && g.load.added.issue.message)
          || (g.reps.kind === 'issue' && g.reps.issue.message))
        const notes = g?.notes ?? []
        const issueObj = g && ((g.load.kind === 'weight' && !g.load.value.ok && g.load.value.issue)
          || (g.load.kind === 'weighted_bw' && !g.load.added.ok && g.load.added.issue)
          || (g.reps.kind === 'issue' && g.reps.issue))
        const sameSessionIssue = !!issueObj && issueObj.session === session.id
        return (
          <div key={gid}>
            <div className="group-head">
              <span className="small muted">{sets[0].s.groupLabel}</span>
              <span className="target">{g ? groupText(g) : sets[0].s.planned.text}</span>
              {g?.load.kind === 'weighted_bw' && g.load.total.ok && <span className="tiny faint">всего {fmtKg(g.load.total.value)}</span>}
              {g?.driver === 'rpe' && <span className="badge accent">RPE → след. вес</span>}
              {g?.driver === 'amrap' && <span className="badge accent">запишите повторения</span>}
            </div>
            {issue && workout.status === 'active' && (sameSessionIssue
              ? <div className="small muted" style={{ padding: '6px 14px 0' }}>Вес рассчитается, как только вы отметите RPE предыдущего подхода.</div>
              : <div className="notice warn small" style={{ margin: '8px 10px' }}>{issue}</div>)}
            {notes.filter(userNote).map((n) => <div key={n} className="small muted" style={{ padding: '6px 14px 0' }}>{n}</div>)}
            {notes.some((n) => !userNote(n)) && (
              <details className="more" style={{ padding: '4px 14px' }}>
                <summary>Как рассчитано</summary>
                {notes.filter((n) => !userNote(n)).map((n) => <p key={n} className="tiny faint">{n}</p>)}
              </details>
            )}
            {sets.map(({ s, si }) => <SetRow key={si} ex={ex} s={s} si={si} ei={ei} workout={workout} g={g} onDone={props.onDone} onRpe={props.onRpe} />)}
          </div>
        )
      })}

      {noteOpen && (
        <div style={{ padding: '8px 14px 12px' }}>
          <NoteEditor value={ex.note} onSave={(note) => saveWorkout({ ...workout, exercises: workout.exercises.map((e, i) => (i === ei ? { ...e, note } : e)) })} />
        </div>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={ex.exerciseName}>
        <button className="btn block" onClick={() => { setNoteOpen(true); setMenu(false) }}>Заметка к упражнению</button>
        <button className="btn block" onClick={addSet}>Добавить подход</button>
        {workout.status === 'active' && options.length > 1 && (
          <button className="btn block" onClick={() => { setMenu(false); setSwap(true) }}>Заменить упражнение</button>
        )}
        {ex.originalName && <p className="small muted">Персональная замена: в исходной программе — «{ex.originalName}».</p>}
      </Sheet>

      <Sheet open={swap} onClose={() => setSwap(false)} title="Заменить упражнение">
        <p className="small muted">Замена действует для этой и всех будущих тренировок слота «{slot.role}». У нового упражнения своя история и свой тест; завершённые тренировки не меняются.</p>
        {ex.sets.some((s) => s.done) && <div className="notice warn small">В этом упражнении уже есть выполненные подходы — в текущей тренировке оно останется, замена подействует со следующей.</div>}
        {options.map((o) => (
          <button key={o.exerciseId} className={`btn block ${o.exerciseId === ex.exerciseId ? 'primary' : ''}`}
            onClick={async () => { await setChoice(ex.slotId, o.exerciseId); setSwap(false); toast('Упражнение заменено') }}>
            {getExercise(o.exerciseId).name}
          </button>
        ))}
      </Sheet>
    </div>
  )
}

function SetRow(props: {
  ex: WorkoutExercise; s: WorkoutSet; si: number; ei: number; workout: WorkoutRow; g: PlannedGroup | undefined
  onDone: (ei: number, si: number, ex: WorkoutExercise, s: WorkoutSet, g: PlannedGroup | undefined) => void
  onRpe: (si: number) => void
}) {
  const { ex, s, si, ei, workout, g } = props
  const bwOnly = ex.loadType === 'bodyweight'
  const wbw = ex.loadType === 'weighted_bodyweight'
  const set = (patch: Partial<WorkoutSet['actual']>) => updateSet(workout.id, ei, si, { actual: patch })
  const plannedReps = typeof s.planned.reps === 'number' ? s.planned.reps : null
  const shownWeight = s.actual.weight ?? s.planned.weight
  let sub = ''
  if (wbw && workout.bodyweight !== null && shownWeight !== null) sub = `всего ${fmtKg(workout.bodyweight + shownWeight)} с весом тела`
  if (ex.loadType === 'dumbbell' && shownWeight !== null) sub = `2 × ${fmtKg(shownWeight)} = ${fmtKg(shownWeight * 2)}`
  if (s.planned.reps === 'amrap') sub = [sub, 'на максимум повторений'].filter(Boolean).join(' · ')
  if (s.planned.reps === 'toFailure') sub = [sub, 'до отказа'].filter(Boolean).join(' · ')
  const needRpe = s.driver === 'rpe' && s.done && s.actual.rpe === null
  return (
    <div className={`set-row${bwOnly ? ' bw' : ''}${s.done ? ' is-done' : ''}`}>
      <span className="set-n">{s.extra ? '+' : s.index}</span>
      {!bwOnly && (
        <Stepper
          label={wbw ? `Подход ${s.index}: отягощение, кг` : `Подход ${s.index}: вес, кг`}
          value={s.actual.weight} placeholder={s.planned.weight} step={ex.step} allowNegative={wbw}
          onChange={(v) => set({ weight: v })}
        />
      )}
      <Stepper className="reps" label={`Подход ${s.index}: повторения`} value={s.actual.reps} placeholder={plannedReps} step={1} onChange={(v) => set({ reps: v === null ? null : Math.round(v) })} />
      <button className={`rpe-btn${needRpe ? ' need' : ''}`} aria-label={`Подход ${s.index}: RPE`} onClick={() => props.onRpe(si)}>
        {s.actual.rpe !== null ? fmt(s.actual.rpe) : <span className="ph">RPE</span>}
      </button>
      <button className="done-btn" aria-pressed={s.done} aria-label={s.done ? `Подход ${s.index} выполнен — отменить` : `Отметить подход ${s.index} выполненным`}
        onClick={() => props.onDone(ei, si, ex, s, g)}>
        <Icon.check />
      </button>
      {sub && <span className="set-sub">{sub}</span>}
    </div>
  )
}
