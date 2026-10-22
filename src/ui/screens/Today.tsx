import { useEffect, useState } from 'react'
import { fmtKg, groupText, today } from '../../domain/format'
import { mesocycleOf, weekLabel } from '../../domain/program/definition'
import { sessionIssues } from '../../domain/program/engine'
import { advice } from '../../domain/routine/trend'
import { addBodyweight, startWorkout, updateProfile } from '../../storage/repo'
import { Icon, NumberField, useToast } from '../components'
import { ORDER, useData } from '../data'
import { go } from '../nav'
import { DayTargetCard } from '../routine/DayTargetCard'
import { DayTimeline } from '../routine/DayTimeline'
import { NowNext } from '../routine/NowNext'
import { TrendAdviceCard } from '../routine/TrendAdviceCard'
import { programWeekOf, useDayPlan } from '../routine/useDayPlan'

export function TodayScreen() {
  const d = useData()
  const toast = useToast()
  const [bw, setBw] = useState<number | null>(null)
  const [planDate, setPlanDate] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = new Date()
      setPlanDate((prev) => (prev.toDateString() === next.toDateString() ? prev : next))
    }, 60_000)
    return () => window.clearInterval(id)
  }, [])
  const plan = useDayPlan(planDate)
  const prevDate = new Date(planDate)
  prevDate.setDate(planDate.getDate() - 1)
  const prevPlan = useDayPlan(prevDate)
  const trend = advice(d.bodyweights, d.workouts, today(), programWeekOf(d))
  const session = d.active ? d.sessions.find((s) => s.id === d.active!.sessionId) : d.next
  const needsBw = Object.values(d.profile.choices).some((c) => c === 'pullup_weighted')
  // недостающее, что заполняется по ходу этой же тренировки (RPE первого подхода и т. п.), не показываем
  const issues = session ? sessionIssues(session).filter((i) => i.session !== session.id) : []
  const meso = session ? mesocycleOf(session.week) : 0
  const phase = !session ? '' : session.week === 'P1' || session.week === 'P2' ? 'Подготовительный период' : session.week === 'T' ? 'Тестовая неделя' : `Мезоцикл ${meso} из 3`

  const begin = async () => {
    if (!session) return
    try {
      await startWorkout(session, d.bodyweight)
      go(`workout/${session.id}`)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Жимовая прога</h1>
        <button
          className="icon-btn" aria-label={d.profile.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          onClick={() => updateProfile({ theme: d.profile.theme === 'dark' ? 'light' : 'dark' })}
        >
          {d.profile.theme === 'dark' ? <Icon.sun /> : <Icon.moon />}
        </button>
      </div>

      <NowNext plan={plan} prevPlan={prevPlan} />
      <DayTimeline items={plan.items} />
      <DayTargetCard plan={plan} />
      {plan.bike && (
        <div className="card">
          <div className="row between">
            <h3>Велосипед</h3>
            <span className="badge info num">{plan.bike.minutes} мин</span>
          </div>
          <p className="small">Велосипед: {plan.bike.label} · разговорный темп, вентилятор</p>
        </div>
      )}

      {session ? (
        <div className="card hero">
          <div className="row between">
            <span className="eyebrow">{d.active ? 'Тренировка идёт' : 'Следующая тренировка'}</span>
            <span className="badge accent">{phase}</span>
          </div>
          <h2>{weekLabel(session.week)} · день {session.day}</h2>
          <div className="list">
            {session.exercises.map((e) => (
              <div key={e.slotId} className="row between small">
                <span className="grow">{e.exercise.name}</span>
                <span className="muted num">{e.groups[0] ? groupText(e.groups[0]) : ''}</span>
              </div>
            ))}
          </div>
          {issues.length > 0 && !d.active && (
            <div className="notice warn">
              <div className="col">
                <strong>Часть весов пока не рассчитана</strong>
                {issues.slice(0, 4).map((i) => <span key={i.message} className="small">• {i.message}</span>)}
                {issues.length > 4 && <span className="small">…и ещё {issues.length - 4}</span>}
              </div>
            </div>
          )}
          <button className="btn primary block" onClick={d.active ? () => go(`workout/${d.active!.sessionId}`) : begin}>
            {d.active ? 'Продолжить тренировку' : 'Начать тренировку'}
          </button>
          <button className="btn ghost sm" onClick={() => go(`plan/${String(session.week)}`)}>Открыть в плане</button>
        </div>
      ) : (
        <div className="card hero">
          <h2>Программа пройдена</h2>
          <p className="muted">Все 12 недель завершены. Результаты — в разделах «История» и «Прогресс».</p>
        </div>
      )}

      {session && (session.week === 'P1' || session.week === 'P2') && !d.active && (
        <div className="notice info small">
          Подготовительный период (2 недели) учит оценивать RPE. В первом подходе подберите вес по условию, отметьте повторения и RPE — следующие подходы рассчитаются сами.
          Если вы уже уверенно оцениваете RPE, можно сразу открыть тестовую неделю в «Плане».
        </div>
      )}
      {session?.week === 'T' && !d.active && (
        <div className="notice info small">
          Тестовая неделя: в каждом упражнении один подход до отказа на 3–6 повторений (допустимо 1–10). Результаты сохранятся автоматически при завершении тренировки, их можно поправить в «Ещё → Тестовые результаты».
        </div>
      )}

      <div className="card">
        <div className="row between">
          <h3>Прогресс программы</h3>
          <span className="muted small num">{d.doneCount} из {ORDER.length}</span>
        </div>
        <div className="progress" aria-label="Выполнено тренировок"><div style={{ width: `${(d.doneCount / ORDER.length) * 100}%` }} /></div>
      </div>

      <div className="card">
        <div className="row between">
          <h3>Вес тела</h3>
          <span className="big num">{fmtKg(d.bodyweight)}</span>
        </div>
        {needsBw && d.bodyweight === null && (
          <div className="notice warn small">Укажите вес тела: он нужен для подтягиваний с отягощением (вы вводите только навешенный вес).</div>
        )}
        <div className="row">
          <div className="grow"><NumberField label="Новое значение, кг" value={bw} onChange={setBw} placeholder="например, 80,5" /></div>
          <button
            className="btn" style={{ alignSelf: 'flex-end' }} disabled={bw === null || bw <= 0}
            onClick={async () => { if (bw) { await addBodyweight(bw, today()); setBw(null); toast('Вес тела сохранён') } }}
          >Сохранить</button>
        </div>
        <span className="tiny faint">Новый вес влияет на будущие расчёты. Записанные тренировки хранят вес тела на свой день и не пересчитываются.</span>
        <TrendAdviceCard advice={trend} />
      </div>
    </div>
  )
}
