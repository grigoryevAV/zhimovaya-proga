import { MUSCLE_LABEL, type Muscle, findExercise, getExercise } from '../../domain/exercises/catalog'
import { fmt, fmtDate, fmtKg } from '../../domain/format'
import { WEEKS, weekShort } from '../../domain/program/definition'
import { exerciseHistory, muscleVolume, personalRecords, workoutTonnage } from '../../domain/progression/analytics'
import { BarChart, LineChart } from '../components'
import { useData } from '../data'
import { go } from '../nav'

const short = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

export function ProgressScreen({ exerciseId }: { exerciseId?: string }) {
  const d = useData()
  const done = d.workouts.filter((w) => w.status === 'done')
  const logged = [...new Set(done.flatMap((w) => w.exercises.filter((e) => e.sets.some((s) => s.done)).map((e) => e.exerciseId)))]
  const chosen = Object.values(d.profile.choices).filter((x): x is string => !!x)
  const options = [...new Set([...logged, ...chosen])]
  const selected = exerciseId && findExercise(exerciseId) ? exerciseId : (options.includes('bench') ? 'bench' : options[0])
  const ex = selected ? getExercise(selected) : null
  const hist = selected ? exerciseHistory(d.workouts, selected) : []
  const pr = selected ? personalRecords(d.workouts, selected) : null
  const bwOnly = ex?.loadType === 'bodyweight'
  const wbw = ex?.loadType === 'weighted_bodyweight'
  const unitNote = ex?.loadType === 'dumbbell' ? ' (одна гантель)' : wbw ? ' (вес тела + отягощение)' : ''

  // объём по неделям программы
  const weekVolume = WEEKS.map((w) => {
    const ws = done.filter((x) => x.week === w)
    return { week: w, tonnage: ws.reduce((s, x) => s + workoutTonnage(x), 0), vols: ws.map(muscleVolume) }
  }).filter((x) => x.vols.length)
  const lastWeek = weekVolume[weekVolume.length - 1]
  const muscleSets: Partial<Record<Muscle, number>> = {}
  let axial = 0
  for (const v of lastWeek?.vols ?? []) {
    for (const [m, n] of Object.entries(v.sets)) muscleSets[m as Muscle] = (muscleSets[m as Muscle] ?? 0) + (n ?? 0)
    axial += v.axialSets
  }
  const bwPoints = [...d.bodyweights].sort((a, b) => a.date.localeCompare(b.date)).map((b) => ({ x: short(b.date), y: b.kg }))

  return (
    <div className="screen">
      <div className="screen-head"><h1>Прогресс</h1></div>
      <div className="field">
        <label htmlFor="pr-ex">Упражнение</label>
        <select id="pr-ex" className="input" value={selected ?? ''} onChange={(e) => go(`progress/${e.target.value}`)}>
          {options.map((id) => <option key={id} value={id}>{getExercise(id).name}{logged.includes(id) ? '' : ' (нет записей)'}</option>)}
        </select>
      </div>

      {ex && (
        <>
          <div className="stats">
            {!bwOnly && (
              <div className="stat">
                <span className="k">Оценочный 1ПМ{unitNote}</span>
                <span className="v">{pr?.bestE1rm ? fmtKg(Math.round(pr.bestE1rm.value * 2) / 2) : '—'}</span>
                {pr?.bestE1rm && <span className="tiny faint">{fmtDate(pr.bestE1rm.date)}</span>}
              </div>
            )}
            <div className="stat">
              <span className="k">Последний тяжёлый подход</span>
              <span className="v" style={{ fontSize: 17 }}>
                {hist.length ? (bwOnly ? `${hist[hist.length - 1].maxReps} повт.` : `${wbw ? '+' : ''}${fmtKg(hist[hist.length - 1].topWeight)} × ${hist[hist.length - 1].topReps}`) : '—'}
              </span>
            </div>
            <div className="stat"><span className="k">Тренировок</span><span className="v">{hist.length}</span></div>
          </div>

          {ex.replaces && <p className="tiny faint">Персональная замена «{ex.replaces.name}»: своя история, данные исходного упражнения сюда не переносятся.</p>}

          {!bwOnly ? (
            <div className="card">
              <h3>Оценочный 1ПМ{unitNote}</h3>
              <LineChart label="Оценочный 1ПМ по датам" unit=" кг" points={hist.filter((h) => h.bestE1rm !== null).map((h) => ({ x: short(h.date), y: Math.round(h.bestE1rm! * 10) / 10 }))} />
              <p className="tiny faint">Считается по таблице RPE книги для подходов с отмеченным RPE (1–10 повторений).{wbw ? ' Для подтягиваний — полный вес: тело + отягощение.' : ''}</p>
            </div>
          ) : null}

          <div className="card">
            <h3>{bwOnly ? 'Максимум повторений' : `Вес тяжёлого подхода${wbw ? ' (отягощение)' : unitNote}`}</h3>
            <LineChart
              label="Динамика тяжёлого подхода"
              points={hist.map((h) => ({ x: short(h.date), y: bwOnly ? (h.maxReps ?? 0) : (h.topWeight ?? 0) }))}
            />
            {!bwOnly && <p className="tiny faint">Средний RPE за тренировку — в таблице ниже.</p>}
          </div>

          <div className="card">
            <h3>Тоннаж упражнения</h3>
            <BarChart label="Тоннаж по тренировкам" points={hist.map((h) => ({ x: short(h.date), y: Math.round(h.tonnage) }))} />
            {ex.loadType === 'dumbbell' && <p className="tiny faint">Гантели: вес одной × 2 × повторения.</p>}
          </div>

          <div className="card">
            <h3>Сравнение по датам</h3>
            {hist.length === 0 ? <div className="empty small">Нет выполненных подходов</div> : (
              <div className="table-wrap">
                <table className="t">
                  <thead><tr><th>Дата</th><th className="r">Тяжёлый</th>{!bwOnly && <th className="r">1ПМ</th>}<th className="r">Подх.</th><th className="r">RPE ср.</th><th className="r">Тоннаж</th></tr></thead>
                  <tbody>
                    {[...hist].reverse().map((h) => (
                      <tr key={h.workoutId}>
                        <td>{short(h.date)}</td>
                        <td className="r">{bwOnly ? `${h.maxReps}` : `${fmt(h.topWeight)}×${h.topReps}`}</td>
                        {!bwOnly && <td className="r">{h.bestE1rm ? fmt(Math.round(h.bestE1rm)) : '—'}</td>}
                        <td className="r">{h.doneSets}</td>
                        <td className="r">{h.avgRpe ? fmt(Math.round(h.avgRpe * 10) / 10) : '—'}</td>
                        <td className="r">{fmt(Math.round(h.tonnage))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {pr && pr.bestByReps.length > 0 && !bwOnly && (
            <div className="card">
              <h3>Личные рекорды по повторениям</h3>
              <div className="table-wrap">
                <table className="t">
                  <thead><tr><th>Повторения</th><th className="r">Лучший вес{wbw ? ' (отяг.)' : ''}</th><th className="r">Дата</th></tr></thead>
                  <tbody>{pr.bestByReps.map((r) => <tr key={r.reps}><td>{r.reps}</td><td className="r">{fmtKg(r.weight)}</td><td className="r">{fmtDate(r.date)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="card">
        <h3>Объём по неделям</h3>
        <BarChart label="Тоннаж по неделям программы" points={weekVolume.map((w) => ({ x: weekShort(w.week), y: Math.round(w.tonnage) }))} />
        {lastWeek && (
          <>
            <span className="small muted">Рабочие подходы за {weekShort(lastWeek.week)} (основная мышца — 1, вспомогательная — 0,5):</span>
            <div className="table-wrap">
              <table className="t">
                <tbody>
                  {Object.entries(muscleSets).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([m, n]) => (
                    <tr key={m}><td>{MUSCLE_LABEL[m as Muscle]}</td><td className="r">{fmt(n ?? 0)}</td></tr>
                  ))}
                  <tr><td className="muted">С осевой нагрузкой</td><td className="r">{axial}</td></tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3>Вес тела</h3>
        <LineChart label="Вес тела" unit=" кг" points={bwPoints} />
      </div>
    </div>
  )
}
