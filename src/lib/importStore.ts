import { create } from 'zustand'
import type { ClassificationResult } from './classify-photo'
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
  setProcessing: (processing: boolean) => void
  addFiles: (files: FileList | File[]) => void
  updateItem: (id: string, patch: Partial<ImportItem>) => void
  removeItem: (id: string) => void
  reset: () => void
}

// Состояние импорта живёт в глобальном сторе, а не в компоненте — поэтому
// прогресс обработки сохраняется при переходе на другие страницы и обработка
// продолжается в фоне.
export const useImportStore = create<ImportState>((set) => ({
  step: 'select',
  items: [],
  processing: false,
  setStep: (step) => set({ step }),
  setProcessing: (processing) => set({ processing }),
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
  reset: () =>
    set((s) => {
      for (const it of s.items) URL.revokeObjectURL(it.thumbnailUrl)
      return { step: 'select', items: [], processing: false }
    }),
}))
