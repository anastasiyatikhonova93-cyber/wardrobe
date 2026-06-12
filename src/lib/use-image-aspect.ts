import { useEffect, useState } from 'react'
import { makeTransparent } from './transparent-image'
import { CANVAS_ASPECT } from './outfit-layout'

/**
 * Реальное соотношение сторон (ширина/высота) ОБРЕЗАННОЙ картинки — той, что реально
 * показывается (`makeTransparent` обрезает фон до bounding box). Раскладка образа
 * (`itemBoxFrac`/`computeBounds`) опирается на эти пропорции, чтобы видимый размер
 * вещи не зависел от ориентации исходного фото.
 */
const aspectCache = new Map<string, number>()

// Ключи кеша — инлайн data-URL картинок (до ~900 КБ каждый). Сами строки — это те же
// ссылки, что уже лежат в сторе (отдельной копии мегабайтов нет), но число ключей
// не должно расти бесконечно при долгих сессиях. Ограничиваем простой FIFO-эвикцией:
// Map хранит порядок вставки → при переполнении удаляем самый старый ключ.
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
 * Хук: догружает аспекты для переданных `srcs` и форсит re-render по мере готовности.
 * Возвращает функцию `aspectOf(src)`; для ещё не загруженных отдаёт фолбэк CANVAS_ASPECT.
 */
export function useAspectRatios(srcs: (string | undefined)[]): (src: string | undefined) => number {
  const [, force] = useState(0)
  // Дешёвый ключ набора: src — это инлайн data-URL (мегабайты base64), поэтому НЕ
  // склеиваем их целиком, а берём длину + хвост (контент-адресный → коллизии при
  // равной длине практически исключены). Меняется при смене набора картинок.
  const key = srcs.map((s) => (s ? `${s.length}:${s.slice(-32)}` : '')).join('|')

  useEffect(() => {
    let cancelled = false
    const pending = srcs.filter((s): s is string => !!s && !aspectCache.has(s))
    if (pending.length === 0) return
    Promise.all(pending.map(loadAspect)).then(() => {
      if (!cancelled) force((n) => n + 1)
    })
    return () => { cancelled = true }
    // key покрывает изменение набора src
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return (src: string | undefined) => (src ? aspectCache.get(src) ?? CANVAS_ASPECT : CANVAS_ASPECT)
}
