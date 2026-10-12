import { useEffect, useState } from 'react'
import { Icon, ToastProvider } from './components'
import { DataProvider } from './data'
import { go } from './nav'
import { ExercisesScreen } from './screens/Exercises'
import { HistoryDetail, HistoryScreen } from './screens/History'
import { MoreScreen } from './screens/More'
import { PlanScreen } from './screens/Plan'
import { ProgressScreen } from './screens/Progress'
import { RpeScreen } from './screens/Rpe'
import { SettingsScreen } from './screens/Settings'
import { TestsScreen } from './screens/Tests'
import { TodayScreen } from './screens/Today'
import { WarmupScreen } from './screens/Warmup'
import { WorkoutScreen } from './screens/Workout'

/** Маршрут в hash: #/plan, #/workout/W5-2 и т. п. Кнопка «назад» телефона работает штатно. */
function useHashRoute(): string[] {
  const read = () => (window.location.hash.replace(/^#\/?/, '') || 'today').split('/').map(decodeURIComponent)
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

const TABS = [
  { id: 'today', label: 'Сегодня', icon: Icon.today },
  { id: 'plan', label: 'План', icon: Icon.plan },
  { id: 'history', label: 'История', icon: Icon.history },
  { id: 'progress', label: 'Прогресс', icon: Icon.progress },
  { id: 'more', label: 'Ещё', icon: Icon.more },
] as const

function Screen({ route }: { route: string[] }) {
  const [a, b] = route
  switch (a) {
    case 'workout': return <WorkoutScreen sessionId={b} />
    case 'plan': return <PlanScreen week={b} />
    case 'history': return b ? <HistoryDetail workoutId={b} /> : <HistoryScreen />
    case 'progress': return <ProgressScreen exerciseId={b} />
    case 'more':
      if (b === 'warmup') return <WarmupScreen />
      if (b === 'exercises') return <ExercisesScreen />
      if (b === 'rpe') return <RpeScreen />
      if (b === 'settings') return <SettingsScreen />
      if (b === 'tests') return <TestsScreen />
      return <MoreScreen />
    default: return <TodayScreen />
  }
}

export function App() {
  const route = useHashRoute()
  const inWorkout = route[0] === 'workout'
  return (
    <ToastProvider>
      <DataProvider>
        <div className="app">
          <Screen route={route} />
        </div>
        {!inWorkout && (
          <nav className="nav" aria-label="Разделы">
            <div className="nav-inner">
              {TABS.map((t) => (
                <button key={t.id} aria-current={route[0] === t.id || (t.id === 'today' && !TABS.some((x) => x.id === route[0])) ? 'page' : undefined} onClick={() => go(t.id)}>
                  <t.icon />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </nav>
        )}
      </DataProvider>
    </ToastProvider>
  )
}
