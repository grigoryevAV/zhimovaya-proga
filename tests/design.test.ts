import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Проверки требований оформления экрана тренировки (Д1–Д3) по исходному CSS:
 * зоны нажатия, размер шрифта и контраст приглушённого текста.
 */
const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8')

/** Переменные темы из блока :root. */
function themeVars(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  expect(start, `блок ${selector} не найден`).toBeGreaterThan(-1)
  const body = css.slice(start, css.indexOf('}', start))
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) out[m[1]] = m[2]
  return out
}

/** Относительная яркость по WCAG. */
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

/** Контраст двух цветов по WCAG. */
function contrast(a: string, b: string): number {
  const l1 = luminance(a)
  const l2 = luminance(b)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

const dark = themeVars(':root {')
const light = themeVars(":root[data-theme='light'] {")

describe('Д3 — контраст приглушённого текста', () => {
  it('тёмная тема: --faint не ниже 4,5:1 на --card и --bg', () => {
    expect(contrast(dark.faint, dark.card)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(dark.faint, dark.bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('светлая тема: --faint не ниже 4,5:1 на --card и --bg', () => {
    expect(contrast(light.faint, light.card)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(light.faint, light.bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('приглушённый текст остаётся между основным и приглушённым по яркости (иерархия сохранена)', () => {
    // тёмная тема: текст светлее приглушённого
    expect(luminance(dark.faint)).toBeLessThan(luminance(dark.muted))
    expect(luminance(dark.muted)).toBeLessThan(luminance(dark.text))
    // светлая тема: текст темнее приглушённого
    expect(luminance(light.text)).toBeLessThan(luminance(light.muted))
    expect(luminance(light.muted)).toBeLessThan(luminance(light.faint))
  })
})

describe('Д1 — зоны нажатия', () => {
  it('кнопки «−/+ шаг» не меньше 44 px', () => {
    expect(css).toMatch(/\.sg-bumps button\s*\{[^}]*min-height:\s*44px/)
  })

  it('иконки «история/⋯» в заголовке упражнения не меньше 44 px', () => {
    expect(css).toMatch(/\.icon-btn\.ghost\s*\{[^}]*width:\s*44px/)
    expect(css).toMatch(/\.icon-btn\.ghost\s*\{[^}]*height:\s*44px/)
  })

  it('«Подставить» — кнопка с зоной нажатия не меньше 44 px', () => {
    expect(css).toMatch(/\.link-btn\.tap\s*\{[^}]*min-height:\s*44px/)
  })
})

describe('Д2 — размер шрифта подписей', () => {
  it('подписи колонок и ячеек не меньше 11 px', () => {
    expect(css).toMatch(/\.sg-head\s*\{[^}]*font-size:\s*11px/)
    expect(css).toMatch(/\.sg-cell \.c\s*\{[^}]*font-size:\s*11px/)
  })
})

describe('Д6 — план отличается от факта не только оттенком', () => {
  it('плановое значение (плейсхолдер) набрано курсивом', () => {
    expect(css).toMatch(/\.sg-cell input::placeholder\s*\{[^}]*font-style:\s*italic/)
    expect(css).toMatch(/\.sg-cell \.v\.ph\s*\{[^}]*font-style:\s*italic/)
  })
})
