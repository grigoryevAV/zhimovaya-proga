import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { RPE_VALUES } from '../domain/calculations/rpeTable'
import { fmt, parseNum } from '../domain/format'

// ---------------------------------------------------------------- иконки

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
export const Icon = {
  today: () => <svg viewBox="0 0 24 24" {...P}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /><circle cx="12" cy="15" r="2" /></svg>,
  plan: () => <svg viewBox="0 0 24 24" {...P}><path d="M4 6h16M4 12h16M4 18h10" /></svg>,
  history: () => <svg viewBox="0 0 24 24" {...P}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>,
  progress: () => <svg viewBox="0 0 24 24" {...P}><path d="M3 20h18" /><path d="M5 16l4-5 4 3 6-8" /></svg>,
  more: () => <svg viewBox="0 0 24 24" {...P}><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>,
  back: () => <svg viewBox="0 0 24 24" {...P}><path d="M15 5l-7 7 7 7" /></svg>,
  check: () => <svg viewBox="0 0 24 24" {...P} strokeWidth={3}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  dots: () => <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>,
  close: () => <svg viewBox="0 0 24 24" {...P}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  edit: () => <svg viewBox="0 0 24 24" {...P}><path d="M4 20h4L19 9l-4-4L4 16v4z" /></svg>,
  sun: () => <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  moon: () => <svg viewBox="0 0 24 24" {...P}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>,
}

// ---------------------------------------------------------------- степпер

/**
 * Поле числа с кнопками − / +. Пустое поле показывает план как подсказку; кнопки начинают от плана.
 * Ввод с запятой допустим. Значение сохраняется при потере фокуса или по кнопкам.
 */
export function Stepper(props: {
  value: number | null
  placeholder?: number | null
  step: number
  min?: number
  onChange: (v: number | null) => void
  label: string
  suffix?: string
  allowNegative?: boolean
  className?: string
}) {
  const { value, placeholder, step, onChange, label } = props
  const min = props.min ?? (props.allowNegative ? -500 : 0)
  const [text, setText] = useState(value === null ? '' : fmt(value).replace(/\s/g, ''))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(value === null ? '' : fmt(value).replace(/\s/g, ''))
  }, [value])
  const base = value ?? placeholder ?? 0
  const bump = (d: number) => {
    const next = Math.max(min, Math.round((base + d) * 1000) / 1000)
    onChange(next)
  }
  return (
    <div className={`stepper ${props.className ?? ''}`} role="group" aria-label={label}>
      <button type="button" aria-label={`${label}: меньше`} onClick={() => bump(-step)}>−</button>
      <input
        inputMode="decimal"
        enterKeyHint="done"
        aria-label={label}
        placeholder={placeholder === null || placeholder === undefined ? '—' : fmt(placeholder).replace(/\s/g, '')}
        value={text}
        onFocus={(e) => { focused.current = true; e.currentTarget.select() }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          focused.current = false
          const n = parseNum(text)
          if (text.trim() === '') onChange(null)
          else if (n === null || n < min) setText(value === null ? '' : fmt(value).replace(/\s/g, ''))
          else onChange(n)
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
      <button type="button" aria-label={`${label}: больше`} onClick={() => bump(step)}>+</button>
    </div>
  )
}

/** Обычное числовое поле с запятой. */
export function NumberField(props: {
  label: string; value: number | null; onChange: (v: number | null) => void; placeholder?: string; hint?: string; id?: string
  /** 'change' — значение передаётся при каждом вводе (по умолчанию), 'blur' — при уходе из поля. */
  commit?: 'change' | 'blur'
}) {
  const commit = props.commit ?? 'change'
  const [text, setText] = useState(props.value === null ? '' : String(props.value).replace('.', ','))
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setText(props.value === null ? '' : String(props.value).replace('.', ',')) }, [props.value])
  const id = props.id ?? `f-${props.label.replace(/[^\p{L}\p{N}]+/gu, '-')}`
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id} className="input num" inputMode="decimal" value={text} placeholder={props.placeholder}
        onFocus={() => { focused.current = true }}
        onChange={(e) => {
          setText(e.target.value)
          if (commit === 'change') props.onChange(e.target.value.trim() === '' ? null : parseNum(e.target.value))
        }}
        onBlur={() => {
          focused.current = false
          if (commit === 'blur') props.onChange(text.trim() === '' ? null : parseNum(text))
        }}
      />
      {props.hint && <span className="tiny faint">{props.hint}</span>}
    </div>
  )
}

// ---------------------------------------------------------------- листы

export function Sheet(props: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!props.open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.open, props.onClose])
  if (!props.open) return null
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {props.title && (
          <div className="row between">
            <h2>{props.title}</h2>
            <button className="icon-btn" aria-label="Закрыть" onClick={props.onClose}><Icon.close /></button>
          </div>
        )}
        {props.children}
      </div>
    </div>
  )
}

const RPE_HINT: Record<string, string> = {
  '10': 'отказ', '9.5': '0 в запасе', '9': '1 в запасе', '8.5': '1–2 в запасе', '8': '2 в запасе', '7.5': '2–3 в запасе', '7': '3 в запасе', '6.5': '3–4 в запасе',
}

export function RpeSheet(props: { open: boolean; value: number | null; onPick: (v: number | null) => void; onClose: () => void; reason?: string }) {
  return (
    <Sheet open={props.open} onClose={props.onClose} title="Оцените RPE подхода">
      {props.reason && <div className="notice info">{props.reason}</div>}
      <div className="rpe-grid">
        {[...RPE_VALUES].reverse().map((r) => (
          <button key={r} aria-pressed={props.value === r} onClick={() => props.onPick(r)}>
            {String(r).replace('.', ',')}
            <small>{RPE_HINT[String(r)]}</small>
          </button>
        ))}
      </div>
      <button className="btn ghost" onClick={() => props.onPick(null)}>Без оценки</button>
    </Sheet>
  )
}

export function ConfirmSheet(props: {
  open: boolean; title: string; children?: ReactNode; confirmText: string; danger?: boolean
  onConfirm: () => void; onClose: () => void; requireWord?: string
}) {
  const [word, setWord] = useState('')
  useEffect(() => { if (!props.open) setWord('') }, [props.open])
  const blocked = props.requireWord !== undefined && word.trim().toUpperCase() !== props.requireWord
  return (
    <Sheet open={props.open} onClose={props.onClose} title={props.title}>
      {props.children}
      {props.requireWord && (
        <div className="field">
          <label htmlFor="confirm-word">Для подтверждения введите «{props.requireWord}»</label>
          <input id="confirm-word" className="input" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" />
        </div>
      )}
      <div className="row">
        <button className="btn grow" onClick={props.onClose}>Отмена</button>
        <button className={`btn grow ${props.danger ? 'danger' : 'primary'}`} disabled={blocked} onClick={props.onConfirm}>{props.confirmText}</button>
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------- уведомления

const ToastCtx = createContext<(msg: string) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2800)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

// ---------------------------------------------------------------- графики

export interface Point { x: string; y: number; y2?: number | null }

/** Простой линейный график (SVG, без библиотек). */
export function LineChart({ points, unit, label, secondLabel }: { points: Point[]; unit?: string; label: string; secondLabel?: string }) {
  if (points.length === 0) return <div className="empty small">Пока нет данных</div>
  const W = 340, H = 170, pl = 36, pr = 10, pt = 12, pb = 26
  const ys = points.flatMap((p) => [p.y, ...(p.y2 !== null && p.y2 !== undefined ? [p.y2] : [])])
  let lo = Math.min(...ys), hi = Math.max(...ys)
  if (lo === hi) { lo -= 1; hi += 1 }
  const pad = (hi - lo) * 0.1
  lo -= pad; hi += pad
  const x = (i: number) => pl + (points.length === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (points.length - 1))
  const y = (v: number) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')
  const p2 = points.filter((p) => p.y2 !== null && p.y2 !== undefined)
  const path2 = points.map((p, i) => (p.y2 === null || p.y2 === undefined ? '' : `${x(i).toFixed(1)},${y(p.y2).toFixed(1)}`)).filter(Boolean)
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad]
  const labelIdx = points.length <= 4 ? points.map((_, i) => i) : [0, Math.floor((points.length - 1) / 2), points.length - 1]
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line className="axis" x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} opacity={0.6} />
          <text className="lbl" x={pl - 4} y={y(t) + 3} textAnchor="end">{fmt(Math.round(t * 10) / 10)}</text>
        </g>
      ))}
      {labelIdx.map((i) => <text key={i} className="lbl" x={x(i)} y={H - 8} textAnchor="middle">{points[i].x}</text>)}
      {p2.length > 1 && <polyline className="line2" points={path2.join(' ')} />}
      <path className="line" d={path} />
      {points.map((p, i) => <circle key={i} className="pt" cx={x(i)} cy={y(p.y)} r={3.2}><title>{`${p.x}: ${fmt(p.y)}${unit ?? ''}`}</title></circle>)}
      {secondLabel && <text className="lbl" x={W - pr} y={pt} textAnchor="end">пунктир — {secondLabel}</text>}
    </svg>
  )
}

export function BarChart({ points, label }: { points: Point[]; label: string }) {
  if (points.length === 0) return <div className="empty small">Пока нет данных</div>
  const W = 340, H = 150, pl = 40, pr = 8, pt = 10, pb = 24
  const hi = Math.max(...points.map((p) => p.y), 1)
  const bw = (W - pl - pr) / points.length
  const labelIdx = points.length <= 6 ? points.map((_, i) => i) : [0, Math.floor((points.length - 1) / 2), points.length - 1]
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <line className="axis" x1={pl} x2={W - pr} y1={H - pb} y2={H - pb} />
      <text className="lbl" x={pl - 4} y={pt + 4} textAnchor="end">{fmt(Math.round(hi))}</text>
      {points.map((p, i) => {
        const h = (p.y / hi) * (H - pt - pb)
        return <rect key={i} className="bar" x={pl + i * bw + bw * 0.15} width={bw * 0.7} y={H - pb - h} height={h} rx={2}><title>{`${p.x}: ${fmt(p.y)}`}</title></rect>
      })}
      {labelIdx.map((i) => <text key={i} className="lbl" x={pl + i * bw + bw / 2} y={H - 8} textAnchor="middle">{points[i].x}</text>)}
    </svg>
  )
}
