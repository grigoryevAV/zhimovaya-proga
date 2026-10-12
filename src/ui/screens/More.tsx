import { go } from '../nav'

const ITEMS = [
  { path: 'more/warmup', title: 'Калькулятор подходов', text: 'Разминка с выходом на 1ПМ: жим лёжа и становая' },
  { path: 'more/exercises', title: 'Упражнения', text: 'Выбор упражнений, замены, шаг округления' },
  { path: 'more/tests', title: 'Тестовые результаты', text: 'Исходные данные для расчёта весов' },
  { path: 'more/rpe', title: 'Шкала RPE', text: 'Как оценивать тяжесть подхода, таблица коэффициентов' },
  { path: 'more/settings', title: 'Настройки и резервная копия', text: 'Вес тела, отдых, тема, экспорт и импорт, сброс' },
]

export function MoreScreen() {
  return (
    <div className="screen">
      <div className="screen-head"><h1>Ещё</h1></div>
      <div className="list">
        {ITEMS.map((i) => (
          <button key={i.path} className="card tight" style={{ textAlign: 'left' }} onClick={() => go(i.path)}>
            <strong>{i.title}</strong>
            <span className="small muted">{i.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
