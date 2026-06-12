import { create } from 'zustand'
import type { ClassificationResult } from './classify-photo'
import { classifyPhoto } from './classify-photo'
import { cleanupBest } from './photo-cleanup'
import { removeBackground } from './background-removal'
import { uploadPhoto } from './storage'
import { processQueue } from './process-queue'
import type { ClothingCategory, Season } from '../types'

export type ItemStatus =
  | 'pending'
  | 'removing-bg'
  | 'uploading'
  | 'classifying'
  | 'done'
  | 'error'

export interface ImportItem {
  id: string
  file: File
  status: ItemStatus
  processedImageUrl?: string
  classification?: ClassificationResult
  error?: string
  name: string
  category: ClothingCategory
  color: string
  seasons: Season[]
  excluded: boolean
  thumbnailUrl: string
}

interface ImportState {
  step: 'select' | 'process' | 'review'
  items: ImportItem[]
  processing: boolean
  setStep: (step: ImportState['step']) => void
  addFiles: (files: FileList | File[]) => void
  updateItem: (id: string, patch: Partial<ImportItem>) => void
  removeItem: (id: string) => void
  startProcessing: (uid: string) => Promise<void>
  reset: () => void
}

// Состояние импорта живёт в глобальном сторе, а не в компоненте — поэтому
// прогресс обработки сохраняется при переходе на другие страницы, а сама
// обработка (см. startProcessing) продолжается в фоне, не завися от того,
// смонтирована ли страница импорта.
export const useImportStore = create<ImportState>((set, get) => ({
  step: 'select',
  items: [],
  processing: false,
  setStep: (step) => set({ step }),
  addFiles: (files) =>
    set((s) => {
      const base = Date.now()
      const incoming = Array.from(files)
        .filter((f) => f.type.startsWith('image/'))
        .map((f, i) => ({
          id: `local-${base}-${s.items.length + i}`,
          file: f,
          status: 'pending' as const,
          name: '',
          category: 'tops' as ClothingCategory,
          color: '',
          seasons: [] as Season[],
          excluded: false,
          thumbnailUrl: URL.createObjectURL(f),
        }))
      return { items: [...s.items, ...incoming] }
    }),
  updateItem: (id, patch) =>
    set((s) => ({ items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) })),
  removeItem: (id) =>
    set((s) => {
      const item = s.items.find((it) => it.id === id)
      if (item) URL.revokeObjectURL(item.thumbnailUrl)
      return { items: s.items.filter((it) => it.id !== id) }
    }),
  // Движок обработки живёт в сторе, а не в компоненте: цикл стартует по тапу
  // «Начать обработку», но дальше крутится сам по себе и пишет прогресс прямо
  // в стор. Поэтому можно уйти на любую вкладку — обработка идёт в фоне, а при
  // возврате на /import виден актуальный прогресс. Повторный вызов игнорируется,
  // пока идёт текущая обработка.
  startProcessing: async (uid) => {
    if (get().processing) return
    // Берём всё, что ещё не доведено до 'done': pending, ранее упавшие 'error' (повтор)
    // и застрявшие в транзитных статусах (например, вкладку усыпили на 'uploading') —
    // иначе такая вещь больше никогда бы не переобработалась. processing=false здесь
    // гарантирует, что активного прогона нет, поэтому транзитные статусы безопасно
    // считать застрявшими.
    const queue = get().items.filter((i) => i.status !== 'done')
    if (queue.length === 0) return

    set({ processing: true, step: 'process' })

    await processQueue(
      queue,
      async (item) => {
        const { updateItem } = get()
        try {
          // Сначала распознаём — категория нужна для правильного промта обработки.
          updateItem(item.id, { status: 'classifying', error: undefined })
          const classification = await classifyPhoto(item.file, item.file.name)

          // AI-обработка с учётом типа вещи; при сбое — локальное вырезание фона.
          updateItem(item.id, { status: 'removing-bg' })
          let processed: Blob
          try {
            processed = await cleanupBest(item.file, classification.category)
          } catch {
            processed = await removeBackground(item.file)
          }

          updateItem(item.id, { status: 'uploading' })
          const url = await uploadPhoto(processed, uid)

          updateItem(item.id, {
            status: 'done',
            processedImageUrl: url,
            classification,
            name: classification.name,
            category: classification.category,
            color: classification.color,
            seasons: classification.seasons,
          })
        } catch (e) {
          updateItem(item.id, {
            status: 'error',
            error: e instanceof Error ? e.message : 'Неизвестная ошибка',
          })
        }
      },
      2,
    )

    set({ processing: false, step: 'review' })
  },
  reset: () =>
    set((s) => {
      for (const it of s.items) URL.revokeObjectURL(it.thumbnailUrl)
      return { step: 'select', items: [], processing: false }
    }),
}))
