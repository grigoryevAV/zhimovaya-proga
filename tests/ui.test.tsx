// @vitest-environment jsdom
/**
 * Проверка основных экранов в узком окне (375 px): всё рендерится, нет NaN/Infinity/#N/A,
 * тренировка запускается и подход отмечается.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureProfile, useDatabase } from '../src/storage/db'
import { addBodyweight, saveTest } from '../src/storage/repo'
import { App } from '../src/ui/App'

beforeAll(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 })
  window.scrollTo = () => {}
  // jsdom не знает matchMedia/AudioContext — приложению они не обязательны
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})

beforeEach(async () => {
  useDatabase(`ui-${Math.random()}`)
  await ensureProfile()
  window.location.hash = ''
})
afterEach(() => cleanup())

const BAD = /NaN|Infinity|#N\/A|undefined/

async function go(hash: string) {
  await act(async () => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

describe('экраны на мобильной ширине', () => {
  it('все разделы открываются без ошибок и мусорных значений', async () => {
    await addBodyweight(80, '2026-10-01')
    await saveTest({ slotId: 'd1s1', exerciseId: 'bench', weight: 80, reps: 6, rpe: 10, date: '2026-10-01', bodyweight: 80 })
    render(<App />)
    await screen.findByText('Начать тренировку')
    expect(document.body.textContent).not.toMatch(BAD)
    for (const [hash, text] of [
      ['#/plan/1', 'Неделя 1'], ['#/plan/12', 'Пиковая неделя'], ['#/history', 'История'], ['#/progress', 'Прогресс'],
      ['#/more', 'Ещё'], ['#/more/warmup', 'Калькулятор подходов'], ['#/more/exercises', 'Жим-сжимание гантелей лёжа на наклонной скамье 30°'],
      ['#/more/tests', 'Тестовые результаты'], ['#/more/rpe', 'Шкала RPE'], ['#/more/settings', 'Резервная копия'],
    ] as const) {
      await go(hash)
      await waitFor(() => expect(document.body.textContent).toContain(text))
      expect(document.body.textContent, hash).not.toMatch(BAD)
    }
  })

  it('тренировка: старт, ввод с запятой, отметка подхода, запрос RPE', async () => {
    await addBodyweight(80, '2026-10-01')
    render(<App />)
    fireEvent.click(await screen.findByText('Начать тренировку'))
    await waitFor(() => expect(window.location.hash).toBe('#/workout/P1-1'))
    await go('#/workout/P1-1')
    const weight = (await screen.findAllByLabelText('Подход 1: вес, кг', { selector: 'input' }))[0]
    fireEvent.focus(weight)
    fireEvent.change(weight, { target: { value: '72,5' } })
    fireEvent.blur(weight)
    const reps = screen.getAllByLabelText('Подход 1: повторения', { selector: 'input' })[0]
    fireEvent.focus(reps)
    fireEvent.change(reps, { target: { value: '6' } })
    fireEvent.blur(reps)
    await waitFor(() => expect((screen.getAllByLabelText('Подход 1: вес, кг', { selector: 'input' })[0] as HTMLInputElement).value).toBe('72,5'))
    fireEvent.click(screen.getAllByLabelText('Отметить подход 1 выполненным')[0])
    await screen.findByText('Оцените RPE подхода')
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent === '91 в запасе')!)
    // второй подход рассчитан: 72,5 / коэф(9; 6) = 0,81 → ·0,8 = 71,6 → 72,5
    await waitFor(() => expect(document.body.textContent).toContain('1 × 5 · 72,5 кг'))
    expect(document.body.textContent).not.toMatch(BAD)
  })
})
