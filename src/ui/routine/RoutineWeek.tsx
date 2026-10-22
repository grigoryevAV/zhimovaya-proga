/** «План → Неделя»: велосипед текущей недели, 7 дней, расписание и меню по раскрытию. */
import { useMemo, useState } from 'react'
import { type Weekday, planDay } from '../../domain/routine'
import { MEAL_NOTE, SUBSTITUTIONS } from '../../domain/routine/nutrition'
import { bikeDay } from '../../domain/routine/bike'
import { useData } from '../data'
import { dayTypeLabel } from './DayTargetCard'
import { programWeekOf, strengthNamesOf } from './useDayPlan'

const DAYS: { weekday: Weekday; short: string; full: string }[] = [
  { weekday: 1, short: 'Пн', full: 'Понедельник' },
  { weekday: 2, short: 'Вт', full: 'Вторник' },
  { weekday: 3, short: 'Ср', full: 'Среда' },
  { weekday: 4, short: 'Чт', full: 'Четверг' },
  { weekday: 5, short: 'Пт', full: 'Пятница' },
  { weekday: 6, short: 'Сб', full: 'Суббота' },
  { weekday: 7, short: 'Вс', full: 'Воскресенье' },
]

function strengthDayNumber(weekday: Weekday): 1 | 2 | 3 | null {
  return weekday === 1 ? 1 : weekday === 3 ? 2 : weekday === 5 ? 3 : null
}

export function RoutineWeek() {
  const d = useData()
  const [open, setOpen] = useState<Weekday | null>(null)
  const plans = useMemo(() => {
    const programWeek = programWeekOf(d)
    const strengthByDay = strengthNamesOf(d, programWeek)
    const mode = d.profile.nutritionMode ?? 'recomp'
    const adjustKcal = d.profile.nutritionAdjustKcal ?? 0
    return DAYS.map(({ weekday }) => planDay(weekday, { programWeek, strengthByDay, mode, adjustKcal }))
  }, [d])
  const bikeWeek = plans[0].bikeWeek

  return (
    <>
      <div className="row between">
        <h2>Режим недели</h2>
        <span className="badge accent">неделя велосипеда {bikeWeek} из 8</span>
      </div>

      <div className="card tight">
        <h3>Велосипед</h3>
        {([[2, 'Вторник'], [4, 'Четверг'], [6, 'Суббота']] as const).map(([weekday, name]) => {
          const bike = bikeDay(bikeWeek, weekday)
          return (
            <div key={dayKey(weekday)} className="row between small">
              <span className="muted">{name}</span>
              <span className="num">{bike ? bike.label : '—'}</span>
            </div>
          )
        })}
      </div>

      <div className="card tight">
        {DAYS.map(({ weekday, short }, i) => {
          const plan = plans[i]
          const dayNumber = strengthDayNumber(weekday)
          const label = dayNumber ? `Силовая, день ${dayNumber}` : dayTypeLabel(plan.dayType)
          const expanded = open === weekday
          return (
            <div key={short}>
              <button className="week-row" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : weekday)}>
                <span className="week-day">{short}</span>
                <span className="grow week-label">{label}</span>
                <span className="num week-kcal">{plan.target.kcal} ккал</span>
              </button>
              {expanded && (
                <div className="week-detail">
                  <div className="routine-list">
                    {plan.items.map((item) => (
                      <div key={`${item.start}-${item.title}`} className="routine-row">
                        <span className="routine-time num">{item.start}{item.end ? `–${item.end}` : ''}</span>
                        <span className="routine-body">
                          <span className="routine-title">{item.title}</span>
                          {item.detail && <span className="routine-detail">{item.detail}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="meal-list">
                    {plan.menu.map((meal) => (
                      <div key={meal.id} className="meal">
                        <div className="meal-head">
                          <span>{meal.time} · {meal.title}{meal.optional ? ' (по желанию)' : ''}</span>
                          <span className="num">{meal.kcal} ккал</span>
                        </div>
                        <div className="meal-items">
                          {meal.items.map((item) => (
                            <div key={`${meal.id}-${item.food}`} className="meal-item">
                              <span className="f">{item.food} · {item.amount}</span>
                              <span className="k num">{item.kcal}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="tiny faint">{MEAL_NOTE}</p>
                  <details className="more">
                    <summary>Замены</summary>
                    <div className="list" style={{ marginTop: 8 }}>
                      <span className="small"><strong>Белок:</strong> {SUBSTITUTIONS.protein.map((p) => `${p.food} — ${p.kcal} ккал`).join('; ')}</span>
                      <span className="small"><strong>Углеводы:</strong> {SUBSTITUTIONS.carbs.map((c) => `${c.food} — ${c.kcal} ккал`).join('; ')}</span>
                      <span className="small"><strong>Завтраки:</strong> {SUBSTITUTIONS.breakfasts.join(' / ')}</span>
                    </div>
                  </details>
                  <p className="tiny faint">Цифры — ориентир, не медицинская рекомендация.</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function dayKey(weekday: Weekday): string {
  return `bike-${weekday}`
}
