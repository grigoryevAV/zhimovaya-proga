import { useRef, useState } from 'react'
import { fmtDate, fmtKg, today } from '../../domain/format'
import { ALGORITHM_VERSION } from '../../domain/program/engine'
import { type ValidateResult, downloadText, exportBackup, importBackup, parseBackupText, workoutsToCsv } from '../../storage/backup'
import { SCHEMA_VERSION } from '../../storage/db'
import { addBodyweight, deleteBodyweight, resetAll, updateProfile } from '../../storage/repo'
import { ConfirmSheet, Icon, NumberField, useToast } from '../components'
import { useData } from '../data'
import { back } from '../nav'

export function SettingsScreen() {
  const d = useData()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<ValidateResult | null>(null)
  const [reset, setReset] = useState(false)
  const [bw, setBw] = useState<number | null>(null)
  const [bwDate, setBwDate] = useState(today())

  const doExport = async () => {
    const file = await exportBackup()
    downloadText(`zhimovaya-proga-${today()}.json`, JSON.stringify(file, null, 1), 'application/json')
    toast('Резервная копия сохранена в загрузки')
  }

  return (
    <div className="screen">
      <div className="screen-head">
        <button className="icon-btn" aria-label="Назад" onClick={() => back('more')}><Icon.back /></button>
        <h1>Настройки</h1>
      </div>

      <div className="card">
        <h3>Вес тела</h3>
        <p className="small muted">Вводится один раз и меняется, когда меняется вес. Для подтягиваний с отягощением вы вводите только навешенный вес — вес тела программа добавит сама. Каждая тренировка запоминает вес тела на свой день.</p>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="grow"><NumberField id="bw-new" label="Вес, кг" value={bw} onChange={setBw} /></div>
          <div className="field" style={{ width: 150 }}>
            <label htmlFor="bw-date">Дата</label>
            <input id="bw-date" className="input" type="date" value={bwDate} onChange={(e) => setBwDate(e.target.value)} />
          </div>
        </div>
        <button className="btn" disabled={!bw || bw <= 0} onClick={async () => { if (bw) { await addBodyweight(bw, bwDate); setBw(null); toast('Сохранено') } }}>Добавить запись</button>
        {d.bodyweights.length > 0 && (
          <div className="table-wrap">
            <table className="t">
              <tbody>
                {[...d.bodyweights].sort((a, b) => b.date.localeCompare(a.date)).map((b) => (
                  <tr key={b.id}><td>{fmtDate(b.date)}</td><td className="r">{fmtKg(b.kg)}</td>
                    <td className="r"><button className="btn sm ghost" aria-label={`Удалить запись ${b.date}`} onClick={() => b.id !== undefined && deleteBodyweight(b.id)}>✕</button></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Отдых между подходами</h3>
        <p className="small muted">По книге: тяжёлые подходы на 3–6 повторений — 5–10 минут, средние веса на 5–12 повторений — 3–5 минут. Таймер запускается после отметки подхода.</p>
        <NumberField commit="blur" id="rest-h" label="Тяжёлые подходы базовых упражнений, сек" value={d.profile.restHeavySec} onChange={(v) => v && v > 0 && updateProfile({ restHeavySec: Math.round(v) }, { kind: 'settings', text: `Отдых в тяжёлых подходах: ${Math.round(v)} с` })} />
        <NumberField commit="blur" id="rest-m" label="Средние подходы, сек" value={d.profile.restMediumSec} onChange={(v) => v && v > 0 && updateProfile({ restMediumSec: Math.round(v) }, { kind: 'settings', text: `Отдых в средних подходах: ${Math.round(v)} с` })} />
        <NumberField commit="blur" id="rest-l" label="Изолирующие и «до отказа», сек" value={d.profile.restLightSec} onChange={(v) => v && v > 0 && updateProfile({ restLightSec: Math.round(v) }, { kind: 'settings', text: `Отдых в изолирующих подходах: ${Math.round(v)} с` })} />
      </div>

      <div className="card">
        <h3>Тема</h3>
        <div className="seg" role="group" aria-label="Тема оформления">
          <button aria-pressed={d.profile.theme === 'dark'} onClick={() => updateProfile({ theme: 'dark' })}>Тёмная</button>
          <button aria-pressed={d.profile.theme === 'light'} onClick={() => updateProfile({ theme: 'light' })}>Светлая</button>
        </div>
      </div>

      <div className="card">
        <h3>Резервная копия</h3>
        <p className="small muted">Сервера нет: все данные хранятся только в этом браузере на этом устройстве. Для переноса на другой телефон или компьютер сохраните копию и откройте её там. Автоматической синхронизации нет.</p>
        <button className="btn primary" onClick={doExport}>Сохранить копию (JSON)</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Восстановить из копии…</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          setPending(parseBackupText(await f.text()))
        }} />
        <button className="btn" onClick={() => downloadText(`zhimovaya-proga-zhurnal-${today()}.csv`, workoutsToCsv(d.workouts), 'text/csv;charset=utf-8')}>Журнал в CSV (для Excel)</button>
      </div>

      <div className="card">
        <h3>Журнал изменений</h3>
        {d.changes.length === 0 ? <p className="small muted">Пока пусто.</p> : (
          <details className="more">
            <summary>Последние {Math.min(d.changes.length, 200)} записей</summary>
            <div className="list" style={{ marginTop: 8 }}>
              {d.changes.map((c) => <div key={c.id} className="small"><span className="faint">{fmtDate(c.at)}</span> — {c.text}</div>)}
            </div>
          </details>
        )}
      </div>

      <div className="card">
        <h3>Сброс</h3>
        <p className="small muted">Удаляет все тренировки, тесты, вес тела и настройки на этом устройстве. Сначала сохраните резервную копию.</p>
        <button className="btn danger" onClick={() => setReset(true)}>Сбросить все данные…</button>
      </div>

      <p className="tiny faint center">Алгоритм {ALGORITHM_VERSION} · схема данных {SCHEMA_VERSION} · по книге «Жимовая прога v 2.0»</p>

      <ConfirmSheet open={pending !== null} title={pending?.ok ? 'Заменить данные копией?' : 'Не удалось прочитать копию'}
        confirmText={pending?.ok ? 'Заменить' : 'Понятно'} danger={!!pending?.ok} onClose={() => setPending(null)}
        onConfirm={async () => {
          if (pending?.ok) { await importBackup(pending.file); toast('Данные восстановлены') }
          setPending(null)
        }}>
        {pending?.ok ? (
          <>
            <p className="small">Копия от {fmtDate(pending.file.exportedAt)}. {pending.summary}.</p>
            <div className="notice warn small">Текущие данные на этом устройстве будут полностью заменены.</div>
          </>
        ) : (
          <div className="notice bad small">{pending && !pending.ok ? pending.error : ''}</div>
        )}
      </ConfirmSheet>

      <ConfirmSheet open={reset} title="Сбросить все данные?" danger confirmText="Сбросить" requireWord="СБРОС" onClose={() => setReset(false)}
        onConfirm={async () => { await resetAll(); setReset(false); toast('Данные сброшены') }}>
        <p className="small">Будут удалены тренировки ({d.workouts.length}), тесты ({d.tests.length}), записи веса тела и настройки. Отменить нельзя.</p>
      </ConfirmSheet>
    </div>
  )
}
