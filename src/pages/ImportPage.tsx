import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload,
  Loader2,
  Check,
  AlertCircle,
  ArrowLeft,
  Wand2,
  X,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useStore } from '../store'
import { removeBackground, preloadModel } from '../lib/background-removal'
import { classifyPhoto } from '../lib/classify-photo'
import type { ClassificationResult } from '../lib/classify-photo'
import { uploadPhoto } from '../lib/storage'
import { processQueue } from '../lib/process-queue'
import { CategorySelect } from '../components/CategorySelect'
import { SeasonPicker } from '../components/SeasonPicker'
import type { ClothingItem, ClothingCategory, Season } from '../types'

type ItemStatus = 'pending' | 'removing-bg' | 'uploading' | 'classifying' | 'done' | 'error'

interface ImportItem {
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

const STATUS_LABELS: Record<ItemStatus, string> = {
  pending: 'Ожидание',
  'removing-bg': 'Удаление фона...',
  uploading: 'Загрузка...',
  classifying: 'Распознавание...',
  done: 'Готово',
  error: 'Ошибка',
}

export function ImportPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addClothingBatch } = useStore()
  const [step, setStep] = useState<'select' | 'process' | 'review'>('select')
  const [items, setItems] = useState<ImportItem[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    preloadModel().catch(() => {})
  }, [])

  function addLocalFiles(files: FileList | File[]) {
    const newItems: ImportItem[] = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .map((f, i) => ({
        id: `local-${Date.now()}-${i}`,
        file: f,
        status: 'pending' as const,
        name: '',
        category: 'tops' as ClothingCategory,
        color: '',
        seasons: [],
        excluded: false,
        thumbnailUrl: URL.createObjectURL(f),
      }))
    setItems((prev) => [...prev, ...newItems])
  }

  function updateItem(id: string, patch: Partial<ImportItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  async function processAll() {
    setStep('process')

    await processQueue(items, async (item) => {
      if (!user) return
      try {
        // Remove background
        updateItem(item.id, { status: 'removing-bg' })
        const processed = await removeBackground(item.file)

        // Upload processed image
        updateItem(item.id, { status: 'uploading' })
        const url = await uploadPhoto(processed, user.uid)

        // Classify
        updateItem(item.id, { status: 'classifying' })
        const classification = await classifyPhoto(item.file, item.file.name)

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
    }, 2)

    setStep('review')
  }

  async function saveAll() {
    const toSave = items.filter((i) => !i.excluded && i.status === 'done' && i.processedImageUrl)
    if (toSave.length === 0) return

    setSaving(true)
    setSaveError(null)
    try {
      const clothing: Omit<ClothingItem, 'id'>[] = toSave.map((item) => ({
        name: item.name,
        category: item.category,
        color: item.color,
        seasons: item.seasons,
        imageUrl: item.processedImageUrl,
      }))

      await addClothingBatch(clothing)
      navigate('/')
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  const doneCount = items.filter((i) => i.status === 'done').length
  const activeCount = items.filter((i) => !i.excluded && i.status === 'done').length

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/')}
          className="rounded-full p-2 hover:bg-zinc-100 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-semibold">Импорт гардероба</h1>
      </div>

      {step === 'select' && (
        <SelectStep
          items={items}
          fileRef={fileRef}
          onAddFiles={addLocalFiles}
          onRemove={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
          onProcess={processAll}
        />
      )}

      {step === 'process' && (
        <ProcessStep items={items} doneCount={doneCount} total={items.length} />
      )}

      {step === 'review' && (
        <ReviewStep
          items={items}
          onUpdate={updateItem}
          onSave={saveAll}
          saving={saving}
          saveError={saveError}
          activeCount={activeCount}
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addLocalFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/* ---------- Step 1: Select ---------- */

function SelectStep({
  items,
  fileRef,
  onAddFiles,
  onRemove,
  onProcess,
}: {
  items: ImportItem[]
  fileRef: React.RefObject<HTMLInputElement | null>
  onAddFiles: (files: FileList | File[]) => void
  onRemove: (id: string) => void
  onProcess: () => void
}) {
  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className="w-full min-h-[160px] rounded-xl border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center gap-3 bg-zinc-50/50 cursor-pointer transition-colors hover:border-zinc-300 p-6"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (e.dataTransfer.files.length) onAddFiles(e.dataTransfer.files)
        }}
      >
        <Upload size={24} className="text-zinc-300" />
        <span className="text-xs text-zinc-400 text-center">
          Нажмите или перетащите фото
        </span>
      </div>

      {/* Preview grid */}
      {items.length > 0 && (
        <>
          <p className="text-sm text-zinc-500">
            Выбрано: <strong>{items.length}</strong> фото
          </p>
          <div className="grid grid-cols-4 gap-2">
            {items.map((item) => (
              <div key={item.id} className="relative aspect-square rounded-lg overflow-hidden bg-zinc-100">
                <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(item.id) }}
                  className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-0.5"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={onProcess}
            className="w-full py-3 rounded-full bg-black text-white text-sm font-medium transition-opacity"
          >
            <span className="flex items-center justify-center gap-2">
              <Wand2 size={16} />
              Начать обработку
            </span>
          </button>
        </>
      )}
    </div>
  )
}

/* ---------- Step 2: Process ---------- */

function ProcessStep({
  items,
  doneCount,
  total,
}: {
  items: ImportItem[]
  doneCount: number
  total: number
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          Обработано: <strong>{doneCount}</strong> из <strong>{total}</strong>
        </p>
        <Loader2 size={16} className="animate-spin text-zinc-400" />
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-black rounded-full transition-all duration-300"
          style={{ width: `${total > 0 ? (doneCount / total) * 100 : 0}%` }}
        />
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg bg-zinc-50">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-200 flex-shrink-0">
              <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-600 truncate">{item.file.name}</p>
              <p className="text-[10px] text-zinc-400">{STATUS_LABELS[item.status]}</p>
            </div>
            <div className="flex-shrink-0">
              {item.status === 'done' && <Check size={14} className="text-green-500" />}
              {item.status === 'error' && <AlertCircle size={14} className="text-red-400" />}
              {!['done', 'error', 'pending'].includes(item.status) && (
                <Loader2 size={14} className="animate-spin text-zinc-400" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Step 3: Review ---------- */

function ReviewStep({
  items,
  onUpdate,
  onSave,
  saving,
  saveError,
  activeCount,
}: {
  items: ImportItem[]
  onUpdate: (id: string, patch: Partial<ImportItem>) => void
  onSave: () => void
  saving: boolean
  saveError: string | null
  activeCount: number
}) {
  const reviewable = items.filter((i) => i.status === 'done')
  const errored = items.filter((i) => i.status === 'error')

  return (
    <div className="space-y-4">
      {saveError && (
        <div className="p-3 rounded-xl bg-red-50 text-xs text-red-600">
          Ошибка сохранения: {saveError}
        </div>
      )}
      {errored.length > 0 && (
        <div className="p-3 rounded-xl bg-red-50 text-xs text-red-600">
          {errored.length} фото не удалось обработать
        </div>
      )}

      <p className="text-sm text-zinc-500">
        Проверьте и отредактируйте данные перед сохранением
      </p>

      <div className="space-y-4">
        {reviewable.map((item) => (
          <ReviewCard key={item.id} item={item} onUpdate={onUpdate} />
        ))}
      </div>

      {activeCount > 0 && (
        <button
          onClick={onSave}
          disabled={saving}
          className="w-full py-3 rounded-full bg-black text-white text-sm font-medium disabled:opacity-30 transition-opacity"
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              Сохраняю...
            </span>
          ) : (
            `Добавить в гардероб (${activeCount})`
          )}
        </button>
      )}
    </div>
  )
}

function ReviewCard({
  item,
  onUpdate,
}: {
  item: ImportItem
  onUpdate: (id: string, patch: Partial<ImportItem>) => void
}) {
  return (
    <div className={`rounded-2xl border p-3 space-y-3 transition-opacity ${item.excluded ? 'opacity-40' : ''}`}>
      <div className="flex gap-3">
        {/* Photo preview */}
        <div className="w-20 h-24 rounded-xl overflow-hidden bg-zinc-100 flex-shrink-0">
          {item.processedImageUrl ? (
            <img src={item.processedImageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
          )}
        </div>

        <div className="flex-1 space-y-2 min-w-0">
          {/* Name */}
          <input
            value={item.name}
            onChange={(e) => onUpdate(item.id, { name: e.target.value })}
            placeholder="Название"
            className="w-full px-3 py-1.5 rounded-lg bg-zinc-50 text-sm border border-zinc-100"
          />

          {/* Category */}
          <CategorySelect
            value={item.category}
            onChange={(category) => onUpdate(item.id, { category })}
          />

          {/* Color */}
          <input
            value={item.color}
            onChange={(e) => onUpdate(item.id, { color: e.target.value })}
            placeholder="Цвет"
            className="w-full px-3 py-1.5 rounded-lg bg-zinc-50 text-sm border border-zinc-100"
          />
        </div>
      </div>

      {/* Seasons */}
      <SeasonPicker
        selected={item.seasons}
        onChange={(seasons) => onUpdate(item.id, { seasons })}
      />

      {/* Confidence + Exclude */}
      <div className="flex items-center justify-between">
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
          item.classification?.confidence === 'vision'
            ? 'bg-green-50 text-green-600'
            : item.classification?.confidence === 'filename'
              ? 'bg-yellow-50 text-yellow-600'
              : 'bg-zinc-100 text-zinc-400'
        }`}>
          {item.classification?.confidence === 'vision' ? 'AI-распознавание' :
            item.classification?.confidence === 'filename' ? 'По имени файла' : 'По умолчанию'}
        </span>
        <button
          onClick={() => onUpdate(item.id, { excluded: !item.excluded })}
          className="text-[11px] text-zinc-400 underline underline-offset-2"
        >
          {item.excluded ? 'Включить' : 'Исключить'}
        </button>
      </div>
    </div>
  )
}
