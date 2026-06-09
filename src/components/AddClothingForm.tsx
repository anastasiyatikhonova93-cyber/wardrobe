import { useState, useEffect } from 'react'
import type { ClothingItem, ClothingCategory, Season } from '../types'
import { SeasonPicker } from './SeasonPicker'
import { CategorySelect } from './CategorySelect'
import { PhotoPicker } from './PhotoPicker'
import { useAuth } from '../lib/auth'
import { useAutoIngest } from '../hooks/useAutoIngest'
import { preloadModel } from '../lib/background-removal'

interface Props {
  onAdd: (item: Omit<ClothingItem, 'id'>) => void | Promise<void>
  onClose: () => void
}

export function AddClothingForm({ onAdd, onClose }: Props) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ClothingCategory>('tops')
  const [color, setColor] = useState('')
  const [seasons, setSeasons] = useState<Season[]>([])
  const [imageUrl, setImageUrl] = useState('')
  const [shopUrl, setShopUrl] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const { processing, status, error, ingest } = useAutoIngest(user?.uid)
  // Достаточно названия — цвет и сезоны можно дозаполнить, не блокируем добавление.
  const canSubmit = name.trim() && !processing

  // Прогреваем модель удаления фона заранее, чтобы первая обработка шла быстрее.
  useEffect(() => {
    preloadModel().catch(() => {})
  }, [])

  async function handleImageSelected(source: { file?: File; url?: string }) {
    const result = await ingest(source)
    if (!result) return
    setImageUrl(result.imageUrl)
    // Предзаполняем поля, не затирая то, что пользователь уже ввёл вручную.
    const { fields } = result
    if (fields.name) setName((prev) => prev || fields.name)
    if (fields.color) setColor((prev) => prev || fields.color)
    setCategory(fields.category)
    if (fields.seasons.length) setSeasons((prev) => (prev.length ? prev : fields.seasons))
  }

  async function handleSubmit() {
    if (!canSubmit || saving) return
    setSaving(true)
    setSaveError(null)

    const add = Promise.resolve(
      onAdd({
        name: name.trim(),
        category,
        color: color.trim(),
        seasons,
        imageUrl: imageUrl.trim() || undefined,
        shopUrl: shopUrl.trim() || undefined,
      }),
    )
    // Подстраховка от unhandled rejection, если форма закроется по таймауту.
    add.catch(() => {})
    // Не виснем вечно на подтверждении сервера: вещь и так показывается локально
    // сразу, поэтому через несколько секунд закрываем форму оптимистично.
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 6000))

    try {
      await Promise.race([add, timeout])
      onClose()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Не удалось сохранить вещь')
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <PhotoPicker
        value={imageUrl}
        onChange={setImageUrl}
        onImageSelected={handleImageSelected}
        processing={processing}
        processingStatus={status}
      />
      {error && <p className="text-[11px] text-red-400 text-center">{error}</p>}
      <Input label="Название" value={name} onChange={setName} placeholder="Белая рубашка оверсайз" />
      <CategorySelect value={category} onChange={setCategory} />
      <Input label="Цвет" value={color} onChange={setColor} placeholder="белый" />
      <SeasonPicker selected={seasons} onChange={setSeasons} />
      <Input label="Ссылка на магазин" value={shopUrl} onChange={setShopUrl} placeholder="https://..." />
      {saveError && (
        <p className="text-[11px] text-red-500 text-center">{saveError}</p>
      )}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit || saving}
        className="w-full py-3 rounded-full bg-black text-white text-sm font-medium disabled:opacity-30 transition-opacity"
      >
        {saving ? 'Сохраняю…' : 'Добавить'}
      </button>
    </div>
  )
}

function Input({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 text-sm border border-zinc-100"
      />
    </div>
  )
}
