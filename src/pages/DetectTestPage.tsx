import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Upload, AlertCircle, X, Check } from 'lucide-react'
import { detectItems, cropItem } from '../lib/detect-items'
import type { DetectedItem } from '../lib/detect-items'
import { useAuth } from '../lib/auth'
import { useStore } from '../store'
import { cleanupBest, cleanupPhoto } from '../lib/photo-cleanup'
import { uploadPhoto } from '../lib/storage'
import { CategorySelect } from '../components/CategorySelect'
import { SeasonPicker } from '../components/SeasonPicker'
import type { ClothingCategory, ClothingItem, Season } from '../types'

// Мульти-распознавание: одно фото (зеркальное селфи / фото образа) → несколько
// отдельных вещей. Сначала Gemini находит рамки (см. api/detect.ts), вырезаем
// каждую вещь, СРАЗУ приводим её к «гардеробному» виду (вырезаем фон —
// cleanupBest, фолбэк cleanupPhoto), показываем готовые карточки, затем —
// сохранение в гардероб. Роут /detect-test.

const CATEGORY_RU: Record<string, string> = {
  tops: 'Верх',
  bottoms: 'Низ',
  dresses: 'Платья',
  outerwear: 'Верхняя одежда',
  knitwear: 'Трикотаж',
  shoes: 'Обувь',
  bags: 'Сумки',
  accessories: 'Аксессуары',
}

// Одна найденная вещь: сырой кроп + обработанная картинка + редактируемые поля.
interface ReviewRow {
  id: number
  box: DetectedItem['box']
  crop: string // сырой прямоугольный вырез из фото
  processedUrl: string | null // вещь на прозрачном фоне (после cleanup)
  processing: boolean // идёт обработка фона
  procError: boolean // обработка не удалась — останется сырой кроп
  useRaw: boolean // показать/сохранить сырой кроп вместо вырезанного (если автокроп кривой)
  name: string
  category: ClothingCategory
  color: string
  seasons: Season[]
  excluded: boolean
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Не удалось декодировать изображение'))
    img.src = src
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(new Error('Не удалось прочитать изображение'))
    fr.readAsDataURL(blob)
  })
}

export function DetectTestPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addClothingBatch } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [ms, setMs] = useState<number | null>(null)

  // Сохранение: индикатор и прогресс «X из N».
  const [saving, setSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Текущий object-URL фото и счётчик запусков: освобождаем прошлый blob при
  // новой загрузке и на unmount (страница прогоняет много фото подряд), а runId
  // отбрасывает результаты устаревшего запуска, если загрузок было несколько.
  const objUrlRef = useRef<string | null>(null)
  const runId = useRef(0)

  useEffect(() => () => {
    if (objUrlRef.current) URL.revokeObjectURL(objUrlRef.current)
  }, [])

  function patchRow(id: number, patch: Partial<ReviewRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  async function onFile(file: File) {
    const myRun = ++runId.current
    setBusy(true)
    setError(null)
    setSaveError(null)
    setRows([])
    setMs(null)

    if (objUrlRef.current) URL.revokeObjectURL(objUrlRef.current)
    const objUrl = URL.createObjectURL(file)
    objUrlRef.current = objUrl
    setPhotoUrl(objUrl)
    try {
      const t0 = performance.now()
      const found = await detectItems(file)
      if (runId.current !== myRun) return
      setMs(Math.round(performance.now() - t0))

      // Кропаем каждую вещь из оригинала (не из ужатой копии — качество выше).
      const img = await loadImg(objUrl)
      if (runId.current !== myRun) return
      const initial: ReviewRow[] = found.map((item, i) => ({
        id: i,
        box: item.box,
        crop: cropItem(img, item.box),
        processedUrl: null,
        processing: true,
        procError: false,
        useRaw: false,
        name: item.label,
        category: item.category,
        color: item.color,
        seasons: item.seasons,
        excluded: false,
      }))
      setRows(initial)
      setBusy(false)

      // Сразу приводим каждую вещь к гардеробному виду: AI-ретушь (Gemini), при
      // сбое/отсутствии биллинга — локальное вырезание фона + цветокоррекция.
      // Последовательно — модель вырезания фона и так сериализована (gate).
      for (const row of initial) {
        if (runId.current !== myRun) return
        try {
          const blob = await dataUrlToBlob(row.crop)
          let processed: Blob
          try {
            processed = await cleanupBest(blob, row.category)
          } catch {
            processed = await cleanupPhoto(blob)
          }
          const url = await blobToDataUrl(processed)
          if (runId.current !== myRun) return
          patchRow(row.id, { processedUrl: url, processing: false })
        } catch {
          if (runId.current !== myRun) return
          patchRow(row.id, { processing: false, procError: true })
        }
      }
    } catch (e) {
      if (runId.current !== myRun) return
      setError(e instanceof Error ? e.message : 'Не удалось распознать')
      setBusy(false)
    }
  }

  const keep = rows.filter((r) => !r.excluded)
  const keepCount = keep.length
  const processingCount = rows.filter((r) => r.processing).length
  const processingActive = processingCount > 0

  async function save() {
    if (!user) {
      setSaveError('Войдите в аккаунт, чтобы сохранить вещи в гардероб.')
      return
    }
    if (keep.length === 0) return
    if (keep.some((r) => r.processing)) {
      setSaveError('Идёт обработка фото — дождитесь её окончания.')
      return
    }

    setSaving(true)
    setSaveError(null)
    setSaveProgress({ done: 0, total: keep.length })
    try {
      const clothing: Omit<ClothingItem, 'id'>[] = []
      for (const r of keep) {
        // Фото уже обработано на этапе review — заливаем то, что выбрано в карточке:
        // вырезанное (по умолчанию) либо сырой кроп с фоном (если автокроп кривой).
        const blob = await dataUrlToBlob(r.useRaw ? r.crop : (r.processedUrl ?? r.crop))
        const imageUrl = await uploadPhoto(blob, user.uid)
        clothing.push({
          name: r.name || CATEGORY_RU[r.category] || r.category,
          category: r.category,
          color: r.color,
          seasons: r.seasons,
          imageUrl,
        })
        setSaveProgress((p) => (p ? { ...p, done: p.done + 1 } : p))
      }
      await addClothingBatch(clothing)
      navigate('/wardrobe')
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Не удалось сохранить')
      setSaving(false)
      setSaveProgress(null)
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Распознать вещи на фото</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Загрузите зеркальное селфи или фото образа — найдём на нём отдельные вещи,
          вырежем фон и подготовим карточки, а вы проверите и добавите нужное в гардероб.
        </p>
      </div>

      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy || saving || processingActive}
          className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {busy ? 'Распознаю…' : 'Выбрать фото'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-sm text-red-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {photoUrl && (
        <div className="space-y-6">
          {/* Оригинал с рамками поверх */}
          <div>
            <div className="text-xs font-medium text-zinc-500 mb-2">
              Фото с рамками{ms !== null && ` · ${ms} мс`}
              {rows.length > 0 && ` · найдено: ${rows.length}`}
            </div>
            <div className="relative inline-block rounded-xl overflow-hidden border border-zinc-200">
              <img src={photoUrl} alt="" className="block max-w-full max-h-[60vh]" />
              {rows.map((r) => (
                <div
                  key={r.id}
                  className={`absolute border-2 rounded-sm ${
                    r.excluded ? 'border-zinc-300/70' : 'border-emerald-400/90'
                  }`}
                  style={{
                    left: `${r.box.left * 100}%`,
                    top: `${r.box.top * 100}%`,
                    width: `${(r.box.right - r.box.left) * 100}%`,
                    height: `${(r.box.bottom - r.box.top) * 100}%`,
                  }}
                >
                  <span
                    className={`absolute -top-0.5 left-0 -translate-y-full text-white text-[10px] leading-tight px-1 py-0.5 rounded-sm whitespace-nowrap ${
                      r.excluded ? 'bg-zinc-400 line-through' : 'bg-emerald-500'
                    }`}
                  >
                    {r.name || CATEGORY_RU[r.category] || r.category}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Карточки найденных вещей — редактируемые перед сохранением */}
          {rows.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-500">
                  Проверьте вещи и уберите лишнее (например, если рамка попала на фон)
                </span>
                {processingActive && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400 shrink-0">
                    <Loader2 size={12} className="animate-spin" />
                    Обрабатываю фото · {rows.length - processingCount} из {rows.length}
                  </span>
                )}
              </div>

              {rows.map((r) => (
                <ReviewCard key={r.id} row={r} onPatch={patchRow} />
              ))}

              {saveError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-sm text-red-600">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              <button
                onClick={save}
                disabled={saving || processingActive || keepCount === 0}
                className="w-full py-3 rounded-full bg-black text-white text-sm font-medium disabled:opacity-30 transition-opacity"
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    {saveProgress
                      ? `Сохраняю ${saveProgress.done} из ${saveProgress.total}…`
                      : 'Сохраняю…'}
                  </span>
                ) : processingActive ? (
                  'Готовлю фото…'
                ) : (
                  `Добавить в гардероб (${keepCount})`
                )}
              </button>

              {!user && (
                <p className="text-center text-xs text-zinc-400">
                  Чтобы сохранить, войдите в аккаунт на главной странице.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ReviewCard({
  row,
  onPatch,
}: {
  row: ReviewRow
  onPatch: (id: number, patch: Partial<ReviewRow>) => void
}) {
  // Пока идёт обработка — показываем сырой кроп с оверлеем-спиннером; как
  // только готово — вещь на прозрачном фоне (или сырой кроп, если выбрано «С фоном»).
  const preview = row.useRaw ? row.crop : (row.processedUrl ?? row.crop)
  const canToggle = !row.processing && !!row.processedUrl
  return (
    <div
      className={`rounded-2xl border p-3 space-y-3 transition-opacity ${
        row.excluded ? 'opacity-40' : ''
      }`}
    >
      <div className="flex gap-3">
        {/* Картинка вещи (обработанная) */}
        <div className="relative w-20 h-24 rounded-xl overflow-hidden bg-zinc-50 flex-shrink-0 flex items-center justify-center">
          <img src={preview} alt="" className="max-w-full max-h-full object-contain" />
          {row.processing && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
              <Loader2 size={18} className="animate-spin text-zinc-500" />
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2 min-w-0">
          <input
            value={row.name}
            onChange={(e) => onPatch(row.id, { name: e.target.value })}
            placeholder="Название"
            className="w-full px-3 py-1.5 rounded-lg bg-zinc-50 text-sm border border-zinc-100"
          />
          <CategorySelect
            value={row.category}
            onChange={(category) => onPatch(row.id, { category })}
          />
          <input
            value={row.color}
            onChange={(e) => onPatch(row.id, { color: e.target.value })}
            placeholder="Цвет"
            className="w-full px-3 py-1.5 rounded-lg bg-zinc-50 text-sm border border-zinc-100"
          />
        </div>
      </div>

      <SeasonPicker
        selected={row.seasons}
        onChange={(seasons) => onPatch(row.id, { seasons })}
      />

      <div className="flex items-center justify-between gap-2">
        {/* Переключатель вырезанного/исходного — спасает кривой автокроп */}
        {canToggle ? (
          <div className="inline-flex rounded-full bg-zinc-100 p-0.5 text-[11px]">
            <button
              onClick={() => onPatch(row.id, { useRaw: false })}
              className={`px-2.5 py-1 rounded-full transition-colors ${
                !row.useRaw ? 'bg-white shadow-sm text-zinc-800' : 'text-zinc-500'
              }`}
            >
              Вырезано
            </button>
            <button
              onClick={() => onPatch(row.id, { useRaw: true })}
              className={`px-2.5 py-1 rounded-full transition-colors ${
                row.useRaw ? 'bg-white shadow-sm text-zinc-800' : 'text-zinc-500'
              }`}
            >
              С фоном
            </button>
          </div>
        ) : row.procError ? (
          <span className="text-[11px] text-amber-600">Фон не обработан — фото как есть</span>
        ) : (
          <span />
        )}
        <button
          onClick={() => onPatch(row.id, { excluded: !row.excluded })}
          className="inline-flex items-center gap-1 text-[11px] text-zinc-400 underline underline-offset-2 shrink-0"
        >
          {row.excluded ? <Check size={12} /> : <X size={12} />}
          {row.excluded ? 'Вернуть' : 'Убрать'}
        </button>
      </div>
    </div>
  )
}
