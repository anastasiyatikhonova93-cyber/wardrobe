import { useState } from 'react'
import { cleanupPhoto, cleanupBest } from '../lib/photo-cleanup'
import { uploadPhoto } from '../lib/storage'
import { classifyPhoto, classifyImageUrl } from '../lib/classify-photo'
import type { ClassificationResult } from '../lib/classify-photo'

export interface IngestResult {
  imageUrl: string
  fields: ClassificationResult
}

async function urlToFile(url: string): Promise<File | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return new File([blob], 'photo', { type: blob.type || 'image/jpeg' })
  } catch {
    // Скорее всего CORS на чужом домене — обработать локально не выйдет.
    return null
  }
}

/**
 * Автоматически приводит добавленное фото к «гардеробному» виду
 * (вырезает фон + цветокоррекция) и распознаёт вещь для предзаполнения полей.
 *
 * Источник — либо загруженный файл, либо ссылка на картинку. Для ссылки сначала
 * пробуем скачать и обработать локально; если домен блокирует CORS — оставляем
 * исходную ссылку, но всё равно распознаём вещь (картинку забирает сам LLM).
 */
export function useAutoIngest(uid: string | undefined) {
  const [processing, setProcessing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function ingest(source: { file?: File; url?: string }): Promise<IngestResult | null> {
    if (!uid) return null
    if (!source.file && !source.url) return null
    setProcessing(true)
    setError(null)
    try {
      const file = source.file ?? (source.url ? await urlToFile(source.url) : null)
      setStatus('Обработка фото…')

      // 1) Сначала распознаём вещь — категория нужна, чтобы выбрать правильный
      //    промт обработки (обувь/сумка/украшение/одежда обрабатываются по-разному).
      const fields = file
        ? await classifyPhoto(file, file.name)
        : await classifyImageUrl(source.url ?? '')

      // 2) Коррекция фото с учётом типа вещи (только если есть локальные байты).
      let imageUrl = source.url ?? ''
      if (file) {
        try {
          let processed: Blob
          try {
            // AI-ретушь (Gemini, белый фон) + вырезание в прозрачный. Если AI
            // недоступен (нет биллинга/сбой) — локальное вырезание + цветокоррекция.
            processed = await cleanupBest(file, fields.category)
          } catch {
            processed = await cleanupPhoto(file)
          }
          imageUrl = await uploadPhoto(processed, uid)
        } catch {
          // Не удалось обработать — оставляем как есть, но не валим весь процесс.
          imageUrl = source.url ?? imageUrl
        }
      }

      return { imageUrl, fields }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обработать фото')
      return null
    } finally {
      setProcessing(false)
      setStatus(null)
    }
  }

  return { processing, status, error, ingest }
}
