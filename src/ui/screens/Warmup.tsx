import { type WarmupLift, WARMUP_TABLES, warmupPlan } from '../../domain/calculations/warmup'
import { fmt, fmtKg } from '../../domain/format'
import { personalRecords } from '../../domain/progression/analytics'
import { updateProfile } from '../../storage/repo'
import { Icon, NumberField } from '../components'
import { useData } from '../data'
import { back } from '../nav'
import { useState } from 'react'

export function WarmupScreen() {
  const d = useData()
  const [lift, setLift] = useState<WarmupLift>('bench')
  const oneRm = d.profile.warmup[lift]
  const plan = warmupPlan(lift, oneRm)
  const exId = lift === 'bench' ? 'bench' : 'deadlift'
  const est = personalRecords(d.workouts, exId).bestE1rm
  return (
    <div className="screen">
      <div className="screen-head">
        <button className="icon-btn" aria-label="Назад" onClick={() => back('more')}><Icon.back /></button>
        <h1>Калькулятор подходов</h1>
      </div>
      <div className="seg" role="group" aria-label="Упражнение">
        <button aria-pressed={lift === 'bench'} onClick={() => setLift('bench')}>Жим лёжа</button>
        <button aria-pressed={lift === 'deadlift'} onClick={() => setLift('deadlift')}>Становая тяга</button>
      </div>
      <div className="card">
        <NumberField
          id="warmup-1rm" label="1ПМ или целевой вес последнего подхода, кг" value={oneRm}
          onChange={(v) => updateProfile({ warmup: { ...d.profile.warmup, [lift]: v } })}
          hint="«Проходка» из книги: разминка с выходом на этот вес."
        />
        {est && (
          <button className="btn sm" onClick={() => updateProfile({ warmup: { ...d.profile.warmup, [lift]: Math.round(est.value / 2.5) * 2.5 } })}>
            Взять оценку из журнала: {fmtKg(Math.round(est.value / 2.5) * 2.5)}
          </button>
        )}
      </div>
      {plan.ok ? (
        <div className="card">
          <div className="row between">
            <h3>{plan.value.table.title}</h3>
            <span className="badge">{plan.value.sets.length} подходов</span>
          </div>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>#</th><th className="r">Вес</th><th className="r">Повт.</th><th className="r">% 1ПМ</th><th className="r">Отдых</th></tr></thead>
              <tbody>
                {plan.value.sets.map((s, i) => (
                  <tr key={s.n} className={i === plan.value.sets.length - 1 ? 'hl' : ''}>
                    <td>{s.n}</td>
                    <td className="r"><strong>{fmt(s.weight)}</strong></td>
                    <td className="r">{s.reps}</td>
                    <td className="r faint">{s.pct === null ? 'гриф' : `${fmt(Math.round(s.pct * 1000) / 10)}%`}</td>
                    <td className="r">{s.rest}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plan.value.dropped > 0 && <p className="tiny faint">Убрано подходов: {plan.value.dropped} — при таком весе они получались не тяжелее предыдущих.</p>}
          <p className="tiny faint">Округление как в книге: до 5 кг на лёгких подходах и до 2,5 кг на тяжёлых (вверх, кроме одного подхода вниз).</p>
        </div>
      ) : (
        <div className="notice info">{plan.issue.message}</div>
      )}
      <details className="more">
        <summary>Диапазоны таблиц</summary>
        <div className="list small">
          {WARMUP_TABLES[lift].map((t) => (
            <span key={t.id}>{t.title}: {t.min === 0 ? 'до' : `от ${fmt(t.min)} (не включая)`} {Number.isFinite(t.max) ? `${t.min === 0 ? '' : 'до '}${fmt(t.max)} кг включительно` : 'и выше'}</span>
          ))}
          <span className="faint">В книге становая 250–300 кг не покрыта — отнесена к таблице «200–300». Граница 100 кг в жиме входила в две таблицы — теперь только в «до 100».</span>
        </div>
      </details>
    </div>
  )
}
