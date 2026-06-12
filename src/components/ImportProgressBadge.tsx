import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Loader2, Check } from 'lucide-react'
import { useImportStore } from '../lib/importStore'

/**
 * Плавающий индикатор фоновой массовой загрузки. Виден на всех вкладках, кроме
 * самой страницы импорта (там прогресс и так на виду). Пока импорт идёт или
 * обработанные вещи ещё не сохранены — даёт быстро вернуться в импорт и держит
 * защиту от перезагрузки вкладки, чтобы не потерять обработку.
 */
export function ImportProgressBadge() {
  const navigate = useNavigate()
  const location = useLocation()
  const { items, processing, step } = useImportStore()

  const hasUnsaved = items.length > 0 && step !== 'select'

  // Защита от закрытия/перезагрузки вкладки живёт здесь, а не на странице импорта:
  // Layout смонтирован на всех вкладках, поэтому фоновый импорт защищён, даже
  // когда ты ушла в другой раздел.
  useEffect(() => {
    if (!hasUnsaved) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsaved])

  // На самой странице импорта бейдж не нужен; и нечего показывать, пока импорт
  // не начат или уже сохранён.
  if (location.pathname === '/import' || !hasUnsaved) return null

  const done = items.filter((i) => i.status === 'done').length
  const errored = items.filter((i) => i.status === 'error').length
  const total = items.length
  // Прогресс считаем по «осевшим» элементам (готово + ошибки), иначе при ошибках
  // счётчик навсегда застрянет ниже total, хотя обработка уже идёт дальше.
  const settled = done + errored
  const finished = !processing && step === 'review'

  return (
    <button
      onClick={() => navigate('/import')}
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-black text-white px-4 py-2 text-xs font-medium shadow-lg shadow-black/20 max-w-[calc(100%-2rem)]"
    >
      {finished ? (
        <Check size={14} className="text-green-400 flex-shrink-0" />
      ) : (
        <Loader2 size={14} className="animate-spin flex-shrink-0" />
      )}
      <span className="truncate">
        {finished
          ? `Импорт готов — проверьте (${done})`
          : `Обрабатываю ${settled} из ${total}…`}
      </span>
      {errored > 0 && (
        <span className="flex-shrink-0 text-red-300">· ошибок: {errored}</span>
      )}
    </button>
  )
}
