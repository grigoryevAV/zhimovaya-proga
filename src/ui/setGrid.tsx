/**
 * Общая сетка подходов «СЕТ | КГ | ПОВТОР | RPE | ✓» для тренировки (ввод) и плана (просмотр).
 * Здесь только отображение: значения берутся из плана движка и записи тренировки, ничего не рассчитывается.
 */
import type { ReactNode } from 'react'
import type { LoadType } from '../domain/exercises/catalog'
import { fmt } from '../domain/format'
import type { Issue } from '../domain/result'
import type { PlannedGroup } from '../domain/program/engine'

/** Подпись колонки веса по типу нагрузки. */
export function weightCaption(t: LoadType): string {
  if (t === 'dumbbell') return 'КГ ×2'
  if (t === 'weighted_bodyweight') return '+КГ'
  if (t === 'bodyweight') return 'СВ. ВЕС'
  return 'КГ'
}

export type WeightState =
  | { kind: 'value'; value: number } // рассчитано программой
  | { kind: 'select' } // подбор веса пользователем
  | { kind: 'waiting'; issue: Issue } // ждёт RPE/повторений этой же тренировки
  | { kind: 'blocked'; issue: Issue } // нет теста, веса тела, RPE прошлой недели
  | { kind: 'bodyweight' }

function groupIssue(g: PlannedGroup): Issue | null {
  if (g.load.kind === 'weight' && !g.load.value.ok) return g.load.value.issue
  if (g.load.kind === 'weighted_bw' && !g.load.added.ok) return g.load.added.issue
  if (g.reps.kind === 'issue') return g.reps.issue
  return null
}

/** Состояние веса группы: число, подбор, ожидание результата этой тренировки или нехватка данных. */
export function weightState(g: PlannedGroup, sessionId: string): WeightState {
  if (g.load.kind === 'bodyweight') {
    const i = groupIssue(g)
    if (i) return i.session === sessionId ? { kind: 'waiting', issue: i } : { kind: 'blocked', issue: i }
    return { kind: 'bodyweight' }
  }
  if (g.load.kind === 'choose') return { kind: 'select' }
  const i = groupIssue(g)
  if (i) return i.session === sessionId ? { kind: 'waiting', issue: i } : { kind: 'blocked', issue: i }
  const v = g.load.kind === 'weight' ? g.load.value : g.load.added
  return v.ok ? { kind: 'value', value: v.value } : { kind: 'blocked', issue: v.issue }
}

/** Короткий текст в ячейке веса, когда числа нет. */
export function weightPlaceholder(st: WeightState): string {
  switch (st.kind) {
    case 'value': return fmt(st.value).replace(/\s/g, '')
    case 'select': return 'подбор'
    case 'waiting': return 'ждёт'
    case 'blocked': return st.issue.code === 'missing-test' ? 'тест?' : st.issue.code === 'missing-bodyweight' ? 'вес тела?' : 'ждёт'
    case 'bodyweight': return '—'
  }
}

export function repsPlaceholder(g: PlannedGroup | undefined, planned: number | 'amrap' | 'toFailure' | null): string {
  if (g?.reps.kind === 'choose') return g.reps.hint.match(/\d+[–-]\d+/)?.[0] ?? 'выбор'
  if (planned === 'amrap') return 'макс'
  if (planned === 'toFailure') return 'отказ'
  if (typeof planned === 'number') return String(planned)
  if (g?.reps.kind === 'issue') return '?'
  return '—'
}

/** Целевой RPE: в книге он задан только у подготовительного периода («RPE 7–9»). */
export function rpeTarget(g: PlannedGroup | undefined): string | null {
  const hint = g?.load.kind === 'choose' ? g.load.hint : g?.reps.kind === 'choose' ? g.reps.hint : ''
  return hint.match(/RPE\s*([\d,.]+[–-][\d,.]+)/)?.[1] ?? null
}

/** Подзаголовок группы: «Тяжёлые · 3 × 3», «Подбор веса · 6–8ПМ · RPE 7–9». */
export function groupHeadline(g: PlannedGroup): string {
  if (g.load.kind === 'choose') return `Подбор веса · ${g.load.hint}`
  if (g.reps.kind === 'choose') return `Повторения на выбор · ${g.reps.hint}`
  const reps = g.reps.kind === 'fixed' ? String(g.reps.value) : g.reps.kind === 'amrap' ? 'макс.' : g.reps.kind === 'toFailure' ? 'до отказа' : '?'
  return `${g.label} · ${g.sets} × ${reps}`
}

/** Нужен ли отдельный подзаголовок: «Подход 2» в подготовке — нет, номер виден в маркере. */
export function needsHeadline(g: PlannedGroup | undefined, label: string): boolean {
  if (g && (g.load.kind === 'choose' || g.reps.kind === 'choose')) return true
  return !/^Подход \d+$/.test(label)
}

export function GridHeader({ withStatus = true, firstLabel = 'СЕТ' }: { withStatus?: boolean; firstLabel?: string }) {
  return (
    <div className={`sg-head${withStatus ? '' : ' no-status'}`} aria-hidden="true">
      <span>{firstLabel}</span><span>КГ</span><span>ПОВТОР</span><span>RPE</span>{withStatus && <span />}
    </div>
  )
}

/** Ячейка только для чтения: крупное значение и подпись. */
export function Cell({ value, caption, tone }: { value: ReactNode; caption: string; tone?: 'muted' | 'accent' | 'warn' }) {
  return (
    <span className={`sg-cell${tone ? ` ${tone}` : ''}`}>
      <span className="v">{value}</span>
      <span className="c">{caption}</span>
    </span>
  )
}

/** Строка плана: одна на группу подходов («3×»), без полей ввода. */
export function PlanGroupRow({ g, loadType, sessionId, done }: { g: PlannedGroup; loadType: LoadType; sessionId: string; done?: boolean }) {
  const st = weightState(g, sessionId)
  const reps = repsPlaceholder(g, g.reps.kind === 'fixed' ? g.reps.value : g.reps.kind === 'amrap' ? 'amrap' : g.reps.kind === 'toFailure' ? 'toFailure' : null)
  const rpe = rpeTarget(g)
  return (
    <div className={`sg-row plan no-status${done ? ' is-done' : ''}`}>
      <span className="sg-mark wide" title={g.label}>{g.sets}×</span>
      <Cell value={weightPlaceholder(st)} caption={weightCaption(loadType)} tone={st.kind === 'value' ? undefined : st.kind === 'blocked' ? 'warn' : 'muted'} />
      <Cell value={reps} caption="ПОВТОР" tone={g.reps.kind === 'fixed' ? undefined : 'muted'} />
      <Cell value={rpe ?? (g.driver === 'rpe' ? 'внести' : '—')} caption="RPE" tone={g.driver ? 'accent' : 'muted'} />
    </div>
  )
}
