// @vitest-environment jsdom
/**
 * Проверка основных экранов в узком окне (375 px): всё рендерится, нет NaN/Infinity/#N/A,
 * тренировка запускается и подход отмечается.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, ensureProfile, useDatabase } from '../src/storage/db'
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
    const weight = (await screen.findAllByLabelText('Сет 1: вес, кг', { selector: 'input' }))[0]
    fireEvent.focus(weight)
    fireEvent.change(weight, { target: { value: '72,5' } })
    fireEvent.blur(weight)
    const reps = screen.getAllByLabelText('Сет 1: повторения', { selector: 'input' })[0]
    fireEvent.focus(reps)
    fireEvent.change(reps, { target: { value: '6' } })
    fireEvent.blur(reps)
    await waitFor(() => expect((screen.getAllByLabelText('Сет 1: вес, кг', { selector: 'input' })[0] as HTMLInputElement).value).toBe('72,5'))
    fireEvent.click(screen.getAllByLabelText('Отметить сет 1 выполненным')[0])
    await screen.findByText('Оцените RPE подхода')
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent === '91 в запасе')!)
    // второй подход рассчитан: 72,5 / коэф(9; 6) = 0,81 → ·0,8 = 71,6 → 72,5
    await waitFor(() => expect((screen.getAllByLabelText('Сет 2: вес, кг')[0] as HTMLInputElement).placeholder).toBe('72,5'))
    expect((screen.getAllByLabelText('Сет 3: вес, кг')[0] as HTMLInputElement).placeholder).toBe('ждёт')
    expect((screen.getAllByLabelText('Сет 1: вес, кг')[1] as HTMLInputElement).placeholder).toBe('подбор')
    expect(document.body.textContent).not.toMatch(BAD)
  })

  it('К2: ввод сохраняется и без ухода из поля — по задержке и при сворачивании приложения', async () => {
    await addBodyweight(80, '2026-10-01')
    render(<App />)
    fireEvent.click(await screen.findByText('Начать тренировку'))
    await waitFor(() => expect(window.location.hash).toBe('#/workout/P1-1'))
    await go('#/workout/P1-1')
    const weight = (await screen.findAllByLabelText('Сет 1: вес, кг', { selector: 'input' }))[0]
    const fact = async () => {
      const rec = await db.workouts.toArray()
      return rec[0].exercises[0].sets[0].actual.weight
    }
    // без blur: значение сохраняется само (задержка ~600 мс после ввода)
    fireEvent.focus(weight)
    fireEvent.change(weight, { target: { value: '65,5' } })
    await waitFor(async () => expect(await fact()).toBe(65.5), { timeout: 3000 })
    // при сворачивании приложения незаконченный ввод не теряется
    fireEvent.change(weight, { target: { value: '66,' } })
    const own = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(async () => expect(await fact()).toBe(66))
    if (own) Object.defineProperty(document, 'visibilityState', own)
    else Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  })

  it('Д4/Д5: Enter переводит фокус на повторы, отметка подхода даёт короткую вибрацию', async () => {
    await addBodyweight(80, '2026-10-01')
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate })
    render(<App />)
    fireEvent.click(await screen.findByText('Начать тренировку'))
    await waitFor(() => expect(window.location.hash).toBe('#/workout/P1-1'))
    await go('#/workout/P1-1')
    const weight = (await screen.findAllByLabelText('Сет 1: вес, кг', { selector: 'input' }))[0]
    const reps = screen.getAllByLabelText('Сет 1: повторения', { selector: 'input' })[0]
    expect(weight.getAttribute('enterkeyhint')).toBe('next')
    expect(reps.getAttribute('enterkeyhint')).toBe('done')
    fireEvent.focus(weight)
    fireEvent.keyDown(weight, { key: 'Enter' })
    expect(document.activeElement).toBe(reps)
    // заполняем факт, чтобы подход можно было отметить выполненным
    fireEvent.change(weight, { target: { value: '60' } })
    fireEvent.blur(weight)
    fireEvent.change(reps, { target: { value: '6' } })
    fireEvent.blur(reps)
    fireEvent.click(screen.getAllByLabelText('Отметить сет 1 выполненным')[0])
    await waitFor(() => expect(vibrate).toHaveBeenCalledWith(30))
  })

  it('Д8: замена упражнения — выбор области действия (эта тренировка или программа)', async () => {
    await addBodyweight(80, '2026-10-01')
    render(<App />)
    fireEvent.click(await screen.findByText('Начать тренировку'))
    await waitFor(() => expect(window.location.hash).toBe('#/workout/P1-1'))
    await go('#/workout/P1-1')
    fireEvent.click((await screen.findAllByLabelText('Действия с упражнением'))[0])
    fireEvent.click(await screen.findByText('Заменить упражнение'))
    expect(await screen.findByText('Только в этой тренировке')).toBeTruthy()
    expect(screen.getByText('В программе (все будущие)')).toBeTruthy()
    // выбор «только в этой тренировке» меняет упражнение в записи тренировки
    fireEvent.click(screen.getByText('Жим штанги лёжа на наклонной скамье'))
    await waitFor(async () => {
      const rec = await db.workouts.toArray()
      expect(rec[0].exercises[0].exerciseId).toBe('incline_bench')
      expect(rec[0].exercises[0].swappedForToday).toBe(true)
    })
    // план для заменённого упражнения — «подбор», без выдуманных весов
    expect((screen.getAllByLabelText('Сет 1: вес, кг', { selector: 'input' })[0] as HTMLInputElement).placeholder).toBe('подбор')
  })
})
