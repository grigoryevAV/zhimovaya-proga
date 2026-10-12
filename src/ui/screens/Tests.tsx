import { useState } from 'react'
import { e1rmFromRpe } from '../../domain/calculations/oneRm'
import { RPE_VALUES } from '../../domain/calculations/rpeTable'
import { getExercise } from '../../domain/exercises/catalog'
import { fmt, fmtKg, today } from '../../domain/format'
import { type SlotDef, getSlot, optionFor, slotsOfDay } from '../../domain/program/definition'
import { deleteTest, saveTest } from '../../storage/repo'
import { Icon, NumberField, useToast } from '../components'
import { useData } from '../data'
import { back } from '../nav'

export function TestsScreen() {
  const d = useData()
  return (
    <div className="screen">
      <div className="screen-head">
        <button className="icon-btn" aria-label="Назад" onClick={() => back('more')}><Icon.back /></button>
        <h1>Тестовые результаты</h1>
      </div>
      <div className="notice info small">
        Один подход до отказа на 3–6 повторений (допустимо 1–10) после разминки и отдыха 5–6 минут. Результаты тестовой недели заносятся сюда автоматически.
        Если упражнение сменилось или тест не проводился, введите рабочий подход и его RPE — программа посчитает от него.
      </div>
      {([1, 2, 3] as const).map((day) => (
        <div key={day} className="col" style={{ gap: 10 }}>
          <h2>День {day}</h2>
          {slotsOfDay(day).map((s) => <TestCard key={`${s.id}-${d.profile.choices[s.id]}`} slot={s} />)}
        </div>
      ))}
    </div>
  )
}

function TestCard({ slot }: { slot: SlotDef }) {
  const d = useData()
  const toast = useToast()
  const exId = d.profile.choices[slot.id]
  const saved = d.tests.find((t) => t.slotId === slot.id)
  const savedOk = saved && saved.exerciseId === exId ? saved : undefined
  const [weight, setWeight] = useState<number | null>(savedOk?.weight ?? null)
  const [reps, setReps] = useState<number | null>(savedOk?.reps ?? null)
  const [rpe, setRpe] = useState<number>(savedOk?.rpe ?? 10)
  if (!exId) return null
  const ex = getExercise(exId)
  const opt = optionFor(slot, exId)
  const shared = opt?.shareTestWith && d.profile.choices[opt.shareTestWith] === exId ? getSlot(opt.shareTestWith) : null
  const bw = ex.loadType === 'bodyweight'
  const wbw = ex.loadType === 'weighted_bodyweight'
  const total = wbw ? (d.bodyweight !== null && weight !== null ? d.bodyweight + weight : null) : weight
  const est = !bw && total !== null ? e1rmFromRpe(total, reps, rpe) : null
  const repsBad = reps !== null && !bw && (reps < 1 || reps > 10)
  return (
    <div className="card">
      <div className="col" style={{ gap: 2 }}>
        <span className="eyebrow">{slot.role}</span>
        <h3>{ex.name}</h3>
      </div>
      {saved && !savedOk && <div className="notice warn small">Сохранён тест другого упражнения ({getExercise(saved.exerciseId).name}) — для «{ex.name}» нужен свой.</div>}
      {shared && <p className="small muted">Как в книге: в неделях 1–3, 5–7, 9–11 используется тест дня {shared.day}. Этот тест нужен для недель 4/8/12{slot.id === 'd2s1' ? ' (подход на максимум)' : ''}; если его нет — берётся тест дня {shared.day}.</p>}
      <div className="row" style={{ alignItems: 'flex-start' }}>
        {!bw && (
          <div className="grow">
            <NumberField id={`t-w-${slot.id}`} label={wbw ? 'Отягощение, кг' : ex.loadType === 'dumbbell' ? 'Одна гантель, кг' : 'Вес, кг'} value={weight} onChange={setWeight} />
          </div>
        )}
        <div className="grow"><NumberField id={`t-r-${slot.id}`} label="Повторения" value={reps} onChange={setReps} /></div>
        <div className="field" style={{ width: 92 }}>
          <label htmlFor={`t-rpe-${slot.id}`}>RPE</label>
          <select id={`t-rpe-${slot.id}`} className="input" value={rpe} onChange={(e) => setRpe(Number(e.target.value))}>
            {[...RPE_VALUES].map((v) => <option key={v} value={v}>{fmt(v)}{v === 10 ? ' (отказ)' : ''}</option>)}
          </select>
        </div>
      </div>
      {wbw && <span className="tiny faint">Только навешенный вес. С весом тела {fmtKg(d.bodyweight)} это {fmtKg(total)}.</span>}
      {repsBad && <div className="notice warn small">Таблица RPE покрывает 1–10 повторений: для точного расчёта возьмите вес тяжелее.</div>}
      {est && est.ok && <span className="small muted">Оценочный 1ПМ: {fmtKg(Math.round(est.value * 10) / 10)}{ex.loadType === 'dumbbell' ? ' (одна гантель)' : ''}</span>}
      <div className="row">
        {savedOk && <span className="tiny faint grow">Сохранено {savedOk.date}</span>}
        {savedOk && <button className="btn sm ghost" onClick={async () => { await deleteTest(slot.id); setWeight(null); setReps(null); toast('Тест удалён') }}>Удалить</button>}
        <button className="btn sm primary" disabled={reps === null || (!bw && weight === null) || (wbw && d.bodyweight === null)}
          onClick={async () => {
            await saveTest({ slotId: slot.id, exerciseId: exId, weight: bw ? null : weight, reps, rpe, date: today(), bodyweight: d.bodyweight })
            toast('Тест сохранён, план пересчитан')
          }}>Сохранить</button>
      </div>
      {wbw && d.bodyweight === null && <span className="tiny faint">Сначала укажите вес тела на главном экране.</span>}
    </div>
  )
}
