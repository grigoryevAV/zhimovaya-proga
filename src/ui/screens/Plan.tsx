import { useState } from 'react'
import { fmt, fmtKg, groupText } from '../../domain/format'
import { WEEKS, type WeekId, getSlot, mesocycleOf, weekLabel, weekShort } from '../../domain/program/definition'
import type { PlannedExercise, PlannedGroup } from '../../domain/program/engine'
import { clearOverride, setOverride, startWorkout } from '../../storage/repo'
import { NumberField, Sheet, useToast } from '../components'
import { useData } from '../data'
import { go } from '../nav'
import { Cell, GridHeader, PlanGroupRow, groupHeadline, weightCaption } from '../setGrid'

export function parseWeek(s: string | undefined): WeekId | null {
  if (!s) return null
  if (s === 'P1' || s === 'P2' || s === 'T') return s
  const n = Number(s)
  return WEEKS.includes(n as WeekId) ? (n as WeekId) : null
}

export function PlanScreen({ week }: { week?: string }) {
  const d = useData()
  const toast = useToast()
  const selected = parseWeek(week) ?? d.next?.week ?? 'P1'
  const [edit, setEdit] = useState<{ g: PlannedGroup; e: PlannedExercise } | null>(null)
  const sessions = d.sessions.filter((s) => s.week === selected)
  const meso = mesocycleOf(selected)

  return (
    <div className="screen">
      <div className="screen-head"><h1>План</h1></div>
      <div className="chips" role="tablist" aria-label="Недели">
        {WEEKS.map((w) => {
          const done = d.sessions.filter((s) => s.week === w).every((s) => d.workoutBySession.get(s.id)?.status === 'done')
          return (
            <button key={String(w)} className="chip" role="tab" aria-pressed={w === selected} aria-label={weekLabel(w)} onClick={() => go(`plan/${String(w)}`)}>
              {weekShort(w)}
              {done && <span className="dot" />}
            </button>
          )
        })}
      </div>
      <div className="row between">
        <h2>{weekLabel(selected)}</h2>
        {meso > 0 && <span className="badge accent">Мезоцикл {meso}</span>}
      </div>
      {(selected === 4 || selected === 8 || selected === 12) && (
        <p className="small muted">{selected === 12 ? 'Пиковая неделя: тяжёлые синглы и попытка на новый 1ПМ в жиме.' : 'Неделя смены нагрузки: объём на 65–72 % от оценённого 1ПМ, в жиме — подход на максимум повторений.'}</p>
      )}

      {sessions.map((s) => {
        const w = d.workoutBySession.get(s.id)
        const status = w?.status === 'done' ? 'done' : w?.status === 'active' ? 'active' : d.next?.id === s.id ? 'next' : ''
        return (
          <div key={s.id} className="card day-card compact">
            <div className="day-head">
              <span className={`status-dot ${status === 'done' ? 'done' : status === 'active' || status === 'next' ? 'active' : ''}`} />
              <h3 className="grow">День {s.day}</h3>
              <span className="small muted">{status === 'done' ? 'выполнена' : status === 'active' ? 'идёт' : status === 'next' ? 'следующая' : ''}</span>
            </div>
            <GridHeader withStatus={false} firstLabel="ПОДХ" />
            {s.exercises.map((e) => {
              const logged = w?.status === 'done' ? w.exercises.find((x) => x.slotId === e.slotId) : undefined
              return (
                <div key={e.slotId} className="plan-ex">
                  <div className="plan-ex-name">{logged?.exerciseName ?? e.exercise.name}</div>
                  {logged ? (
                    logged.sets.filter((x) => x.done).length === 0 ? <div className="plan-ex-meta">не выполнено</div> : (
                      logged.sets.filter((x) => x.done).map((x, i) => (
                        <div key={i} className="sg-row plan no-status is-done">
                          <span className="sg-mark">{i + 1}</span>
                          <Cell value={logged.loadType === 'bodyweight' ? '—' : fmt(x.actual.weight)} caption={weightCaption(logged.loadType)} />
                          <Cell value={x.actual.reps ?? '—'} caption="ПОВТОР" />
                          <Cell value={x.actual.rpe !== null ? fmt(x.actual.rpe) : '—'} caption="RPE" tone={x.actual.rpe === null ? 'muted' : undefined} />
                        </div>
                      ))
                    )
                  ) : (
                    e.groups.map((g) => (
                      <button key={g.groupId} className="plan-row-btn" disabled={w?.status === 'done'} onClick={() => setEdit({ g, e })}
                        aria-label={`${e.exercise.name}: ${g.label}, изменить`}>
                        <div className="plan-row-label">
                          <span>{groupHeadline(g)}</span>
                          {g.overridden && <span className="accent">✎ изменено</span>}
                          {g.driver === 'rpe' && <span className="accent">RPE → след. вес</span>}
                          {g.driver === 'amrap' && <span className="accent">макс. повторов</span>}
                        </div>
                        <PlanGroupRow g={g} loadType={e.exercise.loadType} sessionId={s.id} />
                      </button>
                    ))
                  )}
                </div>
              )
            })}
            <button
              className={`btn ${status === 'next' || status === 'active' ? 'primary' : ''}`}
              onClick={async () => {
                if (w) { go(`workout/${s.id}`); return }
                try { await startWorkout(s, d.bodyweight); go(`workout/${s.id}`) } catch (err) { toast((err as Error).message) }
              }}
            >
              {w?.status === 'done' ? 'Открыть запись' : w ? 'Продолжить' : 'Начать эту тренировку'}
            </button>
          </div>
        )
      })}

      <OverrideSheet edit={edit} onClose={() => setEdit(null)} />
    </div>
  )
}

function OverrideSheet({ edit, onClose }: { edit: { g: PlannedGroup; e: PlannedExercise } | null; onClose: () => void }) {
  const d = useData()
  const toast = useToast()
  const existing = edit ? d.overrides.find((o) => o.key === edit.g.key) : undefined
  const [weight, setWeight] = useState<number | null>(null)
  const [sets, setSets] = useState<number | null>(null)
  const [reps, setReps] = useState<number | null>(null)
  const [lastKey, setLastKey] = useState<string | null>(null)
  if (edit && edit.g.key !== lastKey) {
    setLastKey(edit.g.key)
    setWeight(existing?.weight ?? null)
    setSets(existing?.sets ?? null)
    setReps(existing?.reps ?? null)
  }
  if (!edit) return null
  const { g, e } = edit
  const wbw = e.exercise.loadType === 'weighted_bodyweight'
  const hasWeight = g.load.kind === 'weight' || g.load.kind === 'weighted_bw'
  const title = `${weekLabel(g.week)}, день ${getSlot(e.slotId).day} — ${e.exercise.name}`
  return (
    <Sheet open onClose={onClose} title="Изменить план">
      <p className="small muted">{title}<br />{g.label}: <strong>{groupText(g)}</strong></p>
      {g.notes.map((n) => <p key={n} className="tiny faint">{n}</p>)}
      {hasWeight && (
        <NumberField label={wbw ? 'Отягощение, кг (без веса тела)' : e.exercise.loadType === 'dumbbell' ? 'Вес одной гантели, кг' : 'Вес, кг'}
          value={weight} onChange={setWeight} placeholder="как в расчёте" />
      )}
      <NumberField label="Подходы" value={sets} onChange={setSets} placeholder={String(g.sets)} />
      {(g.reps.kind === 'fixed' || g.reps.kind === 'issue') && (
        <NumberField label="Повторения" value={reps} onChange={setReps} placeholder={g.reps.kind === 'fixed' ? String(g.reps.value) : ''} />
      )}
      <p className="tiny faint">Изменение действует только на эту группу подходов. Следующие недели считаются от фактически выполненного подхода и его RPE. Завершённые тренировки не меняются.</p>
      <div className="row">
        {existing && (
          <button className="btn grow" onClick={async () => {
            await clearOverride(g.key, `Сброшена ручная правка: ${e.exercise.name}, ${weekLabel(g.week)}, ${g.label.toLowerCase()}`)
            toast('Возвращён расчёт программы'); onClose()
          }}>Вернуть расчёт</button>
        )}
        <button className="btn primary grow" disabled={weight === null && sets === null && reps === null} onClick={async () => {
          const parts = [weight !== null && `вес ${fmtKg(weight)}`, sets !== null && `подходов ${sets}`, reps !== null && `повторений ${reps}`].filter(Boolean).join(', ')
          await setOverride(g.key, {
            weight: weight ?? undefined, sets: sets !== null ? Math.round(sets) : undefined, reps: reps !== null ? Math.round(reps) : undefined,
          }, `Ручная правка плана: ${e.exercise.name}, ${weekLabel(g.week)}, ${g.label.toLowerCase()} — ${parts}`)
          toast('План изменён'); onClose()
        }}>Сохранить</button>
      </div>
    </Sheet>
  )
}
