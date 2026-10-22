/** «Сейчас / далее»: обновляется раз в минуту собственным таймером. */
import { useEffect, useState } from 'react'
import type { DayPlan } from '../../domain/routine'
import { nowNext } from '../../domain/routine/template'

export function NowNext({ plan, prevPlan, now }: { plan: DayPlan; prevPlan?: DayPlan | null; now?: Date }) {
  const [tick, setTick] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setTick(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const at = now ?? tick
  const { now: current, next } = nowNext(plan.items, prevPlan?.items ?? [], at.getHours() * 60 + at.getMinutes())

  return (
    <div className="card routine-now">
      <span className="eyebrow">Сейчас</span>
      {current ? (
        <>
          <div className="row between">
            <h2>{current.title}</h2>
            <span className="badge accent num">{current.start}</span>
          </div>
          {current.detail && <p className="small muted">{current.detail}</p>}
        </>
      ) : (
        <h2>Свободное время</h2>
      )}
      {next && (
        <div className="row between small">
          <span className="muted">Далее</span>
          <span className="num routine-next">{next.start} · {next.title}</span>
        </div>
      )}
    </div>
  )
}
