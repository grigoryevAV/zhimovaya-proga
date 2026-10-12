import { RPE_REPS, RPE_TABLE, RPE_VALUES } from '../../domain/calculations/rpeTable'
import { fmt } from '../../domain/format'
import { Icon } from '../components'
import { back } from '../nav'

/** Пересказ листа «RPE» книги. */
const SCALE: [string, string][] = [
  ['10', 'Максимальное усилие, повторений в запасе нет (отказ).'],
  ['9,5', 'Повторений в запасе нет, но вес можно было немного увеличить.'],
  ['9', 'Очень тяжело: 1 повторение в запасе.'],
  ['8,5', 'Полтора в запасе: 2 повторения не сделать, но вес можно чуть увеличить.'],
  ['8', '2 повторения в запасе.'],
  ['7,5', 'Два с половиной в запасе: можно чуть увеличить вес, оставив 2 в запасе.'],
  ['7', '3 повторения в запасе.'],
  ['6,5', 'Три с половиной в запасе.'],
]

export function RpeScreen() {
  return (
    <div className="screen">
      <div className="screen-head">
        <button className="icon-btn" aria-label="Назад" onClick={() => back('more')}><Icon.back /></button>
        <h1>Шкала RPE</h1>
      </div>
      <div className="card">
        <p>RPE — субъективная оценка тяжести подхода от 0 до 10, где 10 — подход с максимально возможным усилием.</p>
        <p className="small muted">Тяжёлые подходы (меньше 4 повторений в запасе) оцениваются точно, лёгкие — нет, поэтому в программе шкала 6,5–10. Две подготовительные недели нужны, чтобы научиться оценивать.</p>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="t">
            <tbody>{SCALE.map(([r, t]) => <tr key={r}><td><strong>{r}</strong></td><td>{t}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h3>Доля от 1ПМ по RPE и повторениям</h3>
        <p className="tiny faint">Таблица книги («Формулы»!N92:X100). По ней из тяжёлого подхода и его RPE оценивается 1ПМ, а от него — вес следующей недели.</p>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>RPE</th>{RPE_REPS.map((r) => <th key={r} className="r">{r}</th>)}</tr></thead>
            <tbody>
              {RPE_VALUES.map((rpe, i) => (
                <tr key={rpe}><td><strong>{fmt(rpe)}</strong></td>{RPE_TABLE[i].map((c, j) => <td key={j} className="r">{Math.round(c * 100)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
