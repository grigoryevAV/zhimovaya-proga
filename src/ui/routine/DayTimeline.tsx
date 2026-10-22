/** Лента дня: ближайшие 6 строк, «Весь день» раскрывает остальное. */
import { useEffect, useState } from 'react'
import type { RoutineItem } from '../../domain/routine'
import { minutesOf } from '../../domain/routine/template'

export function DayTimeline({ items, now }: { items: RoutineItem[]; now?: Date }) {
  const [expanded, setExpanded] = useState(false)
  const [tick, setTick] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setTick(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const at = now ?? tick
  const minutes = at.getHours() * 60 + at.getMinutes()
  const firstAhead = items.findIndex((i) => minutesOf(i.start) > minutes)
  const currentIndex = firstAhead < 0 ? items.length - 1 : Math.max(0, firstAhead - 1)
  const start = Math.max(0, currentIndex - 1)
  const shown = expanded ? items : items.slice(start, start + 6)

  return (
    <div className="card">
      <div className="row between">
        <h3>Лента дня</h3>
        <button className="link-btn tap" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Свернуть' : 'Весь день'}
        </button>
      </div>
      <div className="routine-list">
        {shown.map((item, i) => {
          const index = expanded ? i : start + i
          return (
            <div key={`${index}-${item.start}-${item.title}`} className={`routine-row${index < currentIndex ? ' passed' : ''}`}>
              <span className="routine-time num">{item.start}{item.end ? `–${item.end}` : ''}</span>
              <span className="routine-body">
                <span className="routine-title">{item.title}</span>
                {item.detail && <span className="routine-detail">{item.detail}</span>}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
