import { useState } from 'react'
import { fmt, fmtDate, fmtKg } from '../../domain/format'
import { weekLabel } from '../../domain/program/definition'
import { exerciseTonnage, workoutTonnage } from '../../domain/progression/analytics'
import { describeActual } from '../../domain/progression/workout'
import { deleteWorkout, reopenWorkout } from '../../storage/repo'
import { ConfirmSheet, Icon, useToast } from '../components'
import { useData } from '../data'
import { back, go } from '../nav'

export function HistoryScreen() {
  const d = useData()
  const [filter, setFilter] = useState('')
  const done = d.workouts.filter((w) => w.status === 'done').sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))
  const exercises = [...new Map(done.flatMap((w) => w.exercises.map((e) => [e.exerciseId, e.exerciseName] as const))).entries()]
  const shown = filter ? done.filter((w) => w.exercises.some((e) => e.exerciseId === filter && e.sets.some((s) => s.done))) : done
  return (
    <div className="screen">
      <div className="screen-head"><h1>История</h1></div>
      {done.length === 0 ? (
        <div className="empty">Завершённых тренировок пока нет.<br />Они появятся здесь после кнопки «Завершить».</div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="hist-filter">Упражнение</label>
            <select id="hist-filter" className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Все тренировки</option>
              {exercises.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
          {filter && <button className="btn sm" onClick={() => go(`progress/${filter}`)}>Динамика упражнения →</button>}
          <div className="list">
            {shown.map((w) => {
              const ex = filter ? w.exercises.find((e) => e.exerciseId === filter) : undefined
              return (
                <button key={w.id} className="card tight" style={{ textAlign: 'left' }} onClick={() => go(`history/${w.id}`)}>
                  <div className="row between">
                    <strong>{weekLabel(w.week)} · день {w.day}</strong>
                    <span className="small muted">{fmtDate(w.finishedAt ?? w.startedAt)}</span>
                  </div>
                  {ex ? (
                    <span className="small">{ex.sets.filter((s) => s.done).map((s) => describeActual(ex, s)).join(', ')}</span>
                  ) : (
                    <span className="small muted">{w.exercises.map((e) => e.exerciseName).join(' · ')}</span>
                  )}
                  <span className="tiny faint num">Тоннаж {fmtKg(Math.round(ex ? exerciseTonnage(ex, w.bodyweight) : workoutTonnage(w)))}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export function HistoryDetail({ workoutId }: { workoutId: string }) {
  const d = useData()
  const toast = useToast()
  const [del, setDel] = useState(false)
  const w = d.workouts.find((x) => x.id === workoutId)
  if (!w) return <div className="screen"><p>Запись не найдена.</p><button className="btn" onClick={() => go('history')}>К истории</button></div>
  return (
    <div className="screen">
      <div className="screen-head">
        <button className="icon-btn" aria-label="Назад" onClick={() => back('history')}><Icon.back /></button>
        <h1>{weekLabel(w.week)} · день {w.day}</h1>
      </div>
      <div className="stats">
        <div className="stat"><span className="k">Дата</span><span className="v" style={{ fontSize: 16 }}>{fmtDate(w.finishedAt ?? w.startedAt)}</span></div>
        <div className="stat"><span className="k">Тоннаж</span><span className="v">{fmtKg(Math.round(workoutTonnage(w)))}</span></div>
        <div className="stat"><span className="k">Вес тела</span><span className="v">{fmtKg(w.bodyweight)}</span></div>
      </div>
      {w.exercises.map((e) => (
        <div key={e.slotId + e.exerciseId} className="card">
          <div className="col" style={{ gap: 2 }}>
            <h3>{e.exerciseName}</h3>
            {e.originalName && <span className="tiny faint">вместо «{e.originalName}»</span>}
          </div>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Подход</th><th>План</th><th>Факт</th></tr></thead>
              <tbody>
                {e.sets.map((s, i) => (
                  <tr key={i} className={s.done ? '' : 'faint'}>
                    <td>{s.groupLabel.split(' ')[0]} {s.extra ? '+' : s.index}</td>
                    <td className="small">{s.planned.text}</td>
                    <td>{s.done ? describeActual(e, s) : 'не выполнен'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="tiny faint num">Тоннаж {fmt(Math.round(exerciseTonnage(e, w.bodyweight)))} кг{e.loadType === 'dumbbell' ? ' (две гантели)' : ''}</span>
          {e.note && <p className="small">📝 {e.note}</p>}
        </div>
      ))}
      {w.note && <div className="card"><h3>Заметка</h3><p>{w.note}</p></div>}
      <p className="tiny faint">План сохранён на момент тренировки (алгоритм {w.algorithmVersion}). Пересчёт программы эту запись не меняет.</p>
      <button className="btn block" onClick={() => go(`workout/${w.sessionId}`)}>Исправить фактические значения</button>
      <button className="btn block" onClick={async () => {
        try { await reopenWorkout(w.id); go(`workout/${w.sessionId}`) } catch (err) { toast((err as Error).message) }
      }}>Вернуть в работу (продолжить тренировку)</button>
      <button className="btn danger block" onClick={() => setDel(true)}>Удалить запись</button>
      <ConfirmSheet open={del} title="Удалить запись тренировки?" danger confirmText="Удалить" onClose={() => setDel(false)}
        onConfirm={async () => { await deleteWorkout(w.id); setDel(false); toast('Запись удалена'); go('history') }}>
        <p className="small">Запись «{weekLabel(w.week)} · день {w.day}» будет удалена без возможности восстановления (кроме как из резервной копии). Веса недель, которые считались от её RPE, придётся рассчитать заново.</p>
      </ConfirmSheet>
    </div>
  )
}
