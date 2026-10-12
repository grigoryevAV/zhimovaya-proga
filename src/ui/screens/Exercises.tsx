import { ROUNDING_STEPS } from '../../domain/calculations/rounding'
import { LOAD_TYPE_LABEL, MUSCLE_LABEL, getExercise } from '../../domain/exercises/catalog'
import { fmtKg } from '../../domain/format'
import { HIDDEN_IN_PICKER, type SlotDef, optionFor, slotsOfDay } from '../../domain/program/definition'
import { setChoice, setSchemeRow, setStep } from '../../storage/repo'
import { Icon, NumberField, useToast } from '../components'
import { useData } from '../data'
import { back } from '../nav'

export function ExercisesScreen() {
  return (
    <div className="screen">
      <div className="screen-head">
        <button className="icon-btn" aria-label="Назад" onClick={() => back('more')}><Icon.back /></button>
        <h1>Упражнения</h1>
      </div>
      <p className="small muted">Выбор действует на все будущие тренировки. Завершённые тренировки сохраняют упражнение, с которым вы работали. У каждого упражнения свой тест, своя история и свой прогресс.</p>
      {([1, 2, 3] as const).map((day) => (
        <div key={day} className="col" style={{ gap: 10 }}>
          <h2>День {day}</h2>
          {slotsOfDay(day).map((s) => <SlotCard key={s.id} slot={s} />)}
        </div>
      ))}
    </div>
  )
}

function SlotCard({ slot }: { slot: SlotDef }) {
  const d = useData()
  const toast = useToast()
  const current = d.profile.choices[slot.id]
  const ex = current ? getExercise(current) : null
  const opt = current ? optionFor(slot, current) : undefined
  const options = slot.options.filter((o) => !HIDDEN_IN_PICKER.has(o.exerciseId))
  const step = ex ? (d.profile.steps[ex.id] ?? ex.defaultStep) : null
  const fixed = options.length === 1 && !slot.optional
  return (
    <div className="card">
      <div className="row between">
        <span className="eyebrow">{slot.role}</span>
        {fixed && <span className="badge">закреплено программой</span>}
      </div>
      {fixed ? <h3>{ex?.name}</h3> : (
        <select className="input" aria-label={`День ${slot.day}: ${slot.role}`} value={current ?? ''}
          onChange={async (e) => { await setChoice(slot.id, e.target.value || null); toast('Программа пересчитана') }}>
          {slot.optional && <option value="">— не выбрано («+»)</option>}
          {options.map((o) => <option key={o.exerciseId} value={o.exerciseId}>{getExercise(o.exerciseId).name}</option>)}
        </select>
      )}
      {ex && (
        <>
          <div className="row wrap">
            <span className="badge">{LOAD_TYPE_LABEL[ex.loadType]}</span>
            <span className="badge">{MUSCLE_LABEL[ex.muscle]}</span>
            {ex.axial && <span className="badge warn">осевая нагрузка</span>}
            {ex.replaces && <span className="badge info">замена: {ex.replaces.name}</span>}
          </div>
          {ex.note && <p className="small muted">{ex.note}</p>}
          {ex.loadType !== 'bodyweight' && (
            <div className="field">
              <span className="label">Шаг округления{ex.loadType === 'dumbbell' ? ' (на одну гантель)' : ex.loadType === 'weighted_bodyweight' ? ' (отягощение)' : ''}: {fmtKg(step)}</span>
              <div className="seg" role="group" aria-label="Шаг округления">
                {ROUNDING_STEPS.map((v) => (
                  <button key={v} aria-pressed={step === v} onClick={() => setStep(ex.id, v)}>{String(v).replace('.', ',')}</button>
                ))}
              </div>
              {!ROUNDING_STEPS.includes(step as (typeof ROUNDING_STEPS)[number]) && <span className="tiny faint">Своё значение: {fmtKg(step)}</span>}
              <details className="more">
                <summary>Другой шаг</summary>
                <NumberField commit="blur" label="Шаг, кг" value={null} placeholder="например, 1,25" onChange={(v) => { if (v && v > 0) void setStep(ex.id, v) }} />
              </details>
            </div>
          )}
          {opt?.schemeOptions && (
            <div className="field">
              <label htmlFor={`scheme-${ex.id}`}>Рабочий диапазон (шаблон прогрессии)</label>
              <select id={`scheme-${ex.id}`} className="input" value={d.profile.schemeRows[ex.id] ?? opt.schemeRow}
                onChange={(e) => {
                  const row = Number(e.target.value)
                  const label = opt.schemeOptions!.find((o) => o.row === row)?.label ?? ''
                  void setSchemeRow(ex.id, row, label)
                }}>
                {opt.schemeOptions.map((o) => <option key={o.row} value={o.row}>{o.label}</option>)}
              </select>
              <span className="tiny faint">Коэффициенты берутся из одноимённого упражнения книги, а веса — только из вашего теста этого упражнения.</span>
            </div>
          )}
          {(opt?.deloadNote ?? slot.deloadNote) && <p className="tiny faint">{opt?.deloadNote ?? slot.deloadNote}</p>}
        </>
      )}
    </div>
  )
}
