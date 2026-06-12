import { useEffect, useState } from 'react'
import { makeTransparent } from './transparent-image'
import { CANVAS_ASPECT } from './outfit-layout'

/**
 * Реальное соотношение сторон (ширина/высота) ОБРЕЗАННОЙ картинки — той, что реально
 * показывается (`makeTransparent` обрезает фон до bounding box). Раскладка образа
 * (`itemBoxFrac`/`computeBounds`) опирается на эти пропорции, чтобы видимый размер
 * вещи не зависел от ориентации исходного фото.
 */

// Кросс-инстансный мемо: один раз посчитанный аспект переиспользуется всеми карточками.
// Ключи — инлайн data-URL (до ~900 КБ; строки те же, что лежат в сторе, копии нет), но
// число ключей не должно расти бесконечно за долгую сессию → простая FIFO-эвикция
// (Map хранит порядок вставки, при переполнении удаляем самый старый). Эвикция безопасна:
// каждый хук держит СВОИ разрешённые аспекты в локальном состоянии (см. `useAspectRatios`),
// поэтому выпадение ключа из глобального кэша не «обнуляет» уже показанную карточку —
// в худшем случае новый инстанс пересчитает аспект заново.
const aspectCache = new Map<string, number>()
const CACHE_LIMIT = 500

/** Загружает обрезанную картинку и кладёт её аспект в кеш. Безопасно при многократном вызове. */
async function loadAspect(src: string): Promise<number> {
  const cached = aspectCache.get(src)
  if (cached !== undefined) return cached
  const url = await makeTransparent(src)
  const aspect = await new Promise<number>((resolve) => {
    const img = new Image()
    img.onload = () => resolve((img.naturalWidth || 3) / (img.naturalHeight || 4))
    img.onerror = () => resolve(CANVAS_ASPECT)
    img.src = url
  })
  if (aspectCache.size >= CACHE_LIMIT) {
    const oldest = aspectCache.keys().next().value
    if (oldest !== undefined) aspectCache.delete(oldest)
  }
  aspectCache.set(src, aspect)
  return aspect
}

/**
 * Хук: догружает аспекты для переданных `srcs` и хранит их в локальном состоянии хука.
 * Возвращает функцию `aspectOf(src)`; для ещё не загруженных отдаёт фолбэк CANVAS_ASPECT.
 * Локальное хранение делает результат устойчивым к FIFO-эвикции глобального кэша.
 */
export function useAspectRatios(srcs: (string | undefined)[]): (src: string | undefined) => number {
  const [resolved, setResolved] = useState<Map<string, number>>(() => new Map())
  // Дешёвый ключ набора: src — это инлайн data-URL (мегабайты base64), поэтому НЕ
  // склеиваем их целиком. Для каждого src берём длину + хвост base64 (последние байты
  // сжатой картинки ≈ случайны на каждое фото) → коллизия требует совпадения И длины,
  // И 48 хвостовых символов одновременно у ВСЕХ элементов набора, что для разных фото
  // практически невозможно. Ключ меняется при смене набора/порядка картинок.
  const key = srcs.length + '#' + srcs.map((s) => (s ? `${s.length}:${s.slice(-48)}` : '')).join('|')

  useEffect(() => {
    let cancelled = false
    const need = srcs.filter((s): s is string => !!s)
    if (need.length === 0) return
    Promise.all(need.map(async (s) => [s, await loadAspect(s)] as const)).then((pairs) => {
      if (cancelled) return
      setResolved((prev) => {
        let changed = false
        const next = new Map(prev)
        for (const [s, a] of pairs) {
          if (next.get(s) !== a) { next.set(s, a); changed = true }
        }
        return changed ? next : prev // не плодим лишний re-render, если ничего не поменялось
      })
    })
    return () => { cancelled = true }
    // key покрывает изменение набора src
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return (src: string | undefined) => (src ? resolved.get(src) ?? CANVAS_ASPECT : CANVAS_ASPECT)
}
