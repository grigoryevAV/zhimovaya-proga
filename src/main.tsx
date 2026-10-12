import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { requestPersistence } from './storage/db'
import { App } from './ui/App'
import './ui/styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Офлайн-работа: service worker кэширует приложение после первого открытия.
const updateSW = registerSW({
  onNeedRefresh() {
    if (window.confirm('Доступна новая версия приложения. Обновить сейчас? Данные сохранятся.')) void updateSW(true)
  },
})

void requestPersistence()
