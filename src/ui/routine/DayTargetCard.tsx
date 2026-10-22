/** Цель дня и меню-ориентир; меню раскрывается по нажатию. */
import { useState } from 'react'
import type { DayPlan, DayType } from '../../domain/routine'

const DAY_TYPE_LABEL: Record<DayType, string> = {
  strength: 'Силовой день',
  bike: 'Велосипед',
  rest: 'Отдых',
}

export function dayTypeLabel(type: DayType): string {
  return DAY_TYPE_LABEL[type]
}

export function DayTargetCard({ plan }: { plan: DayPlan }) {
  const [open, setOpen] = useState(false)
  const t = plan.target
  return (
    <div className="card">
      <div className="row between">
        <h3>Цель дня</h3>
        <span className="badge accent">{dayTypeLabel(plan.dayType)}</span>
      </div>
      <div className="row between wrap">
        <span className="big num">{t.kcal} ккал</span>
        <span className="small num muted">Б {t.protein} / Ж {t.fat} / У ~{t.carbs}</span>
      </div>
      {t.autoMaintenance && <p className="tiny faint">Неделя 4/8/12: поддержание включено автоматически.</p>}
      {t.adjustKcal !== 0 && (
        <p className="tiny faint">к меню: {t.adjustKcal > 0 ? '+' : ''}{t.adjustKcal} ккал углеводами (рис/хлеб)</p>
      )}
      <button className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Скрыть меню' : 'Показать меню'}
      </button>
      {open && (
        <div className="meal-list">
          {plan.menu.map((meal) => (
            <div key={meal.id} className="meal">
              <div className="meal-head">
                <span>{meal.time} · {meal.title}{meal.optional ? ' (по желанию)' : ''}</span>
                <span className="num">{meal.kcal} ккал</span>
              </div>
              <div className="meal-items">
                {meal.items.map((i) => (
                  <div key={`${meal.id}-${i.food}`} className="meal-item">
                    <span className="f">{i.food} · {i.amount}</span>
                    <span className="k num">{i.kcal}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="tiny faint">Ориентир: белок и гарнир можно менять на любой из списка замен.</p>
        </div>
      )}
      <p className="tiny faint">Цифры — ориентир, не медицинская рекомендация.</p>
    </div>
  )
}
