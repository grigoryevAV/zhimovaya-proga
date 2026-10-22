/** Подсказка по тренду веса: поправка применяется только по нажатию «Применить». */
import { useState } from 'react'
import type { TrendAdvice } from '../../domain/routine/trend'
import { applyNutritionAdvice } from '../../storage/repo'
import { useToast } from '../components'

const TITLES: Record<TrendAdvice['kind'], string> = {
  'need-data': 'Мало данных о весе',
  ok: 'Темп в норме',
  'too-fast': 'Слишком быстро',
  stalled: 'Вес стоит',
  'strength-guard': 'Предохранитель силы',
}

export function TrendAdviceCard({ advice }: { advice: TrendAdvice }) {
  const toast = useToast()
  const [hidden, setHidden] = useState(false)
  const [applying, setApplying] = useState(false)
  if (hidden) return null
  const canApply = advice.deltaKcal !== 0
  return (
    <div className={`notice ${advice.kind === 'strength-guard' || advice.kind === 'too-fast' ? 'warn' : 'info'}`}>
      <div className="col grow">
        <strong>{TITLES[advice.kind]}</strong>
        <span className="small">{advice.text}</span>
        {advice.ratePerWeek !== null && (
          <span className="tiny faint">Средний темп за неделю: {formatRate(advice.ratePerWeek)} кг</span>
        )}
        {canApply && (
          <div className="row">
            <button
              className="btn sm tap44"
              disabled={applying}
              onClick={async () => {
                setApplying(true)
                try {
                  await applyNutritionAdvice(advice.deltaKcal, advice.text)
                  toast('Поправка применена')
                  setHidden(true)
                } catch (e) {
                  toast((e as Error).message)
                } finally {
                  setApplying(false)
                }
              }}
            >Применить</button>
            <button className="btn sm ghost tap44" disabled={applying} onClick={() => setHidden(true)}>Не сейчас</button>
          </div>
        )}
      </div>
    </div>
  )
}

function formatRate(rate: number): string {
  const fixed = Math.abs(rate) < 0.05 ? '0,0' : rate.toFixed(1).replace('.', ',')
  return (rate > 0 && fixed !== '0,0' ? '+' : '') + fixed.replace('-', '−')
}
