import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { ClothingItem, ItemState } from '../types'
import { generateState } from '../lib/photo-cleanup'
import { uploadStatePhoto } from '../lib/storage'

const MAX_STATES = 4

interface Props {
  item: ClothingItem
  onUpdate: (id: string, patch: Partial<ClothingItem>) => Promise<void> | void
}

// «застегни» → «Застегни». Точную форму («Застёгнутая») пусть правит пользователь.
function labelFromCommand(cmd: string): string {
  const t = cmd.trim()
  if (!t) return 'Вариация'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Если у вещи ещё нет состояний — синтезируем «Основное» из текущего фото (пока не
// персистим, только для показа; реальный id получит при первой генерации).
function initStates(item: ClothingItem): ItemState[] {
  if (item.states && item.states.length > 0) return item.states
  if (item.imageUrl) return [{ id: 'default', label: 'Основное', imageUrl: item.imageUrl }]
  return []
}

export function ItemStates({ item, onUpdate }: Props) {
  const initial = initStates(item)
  const [states, setStates] = useState<ItemState[]>(initial)
  const [defaultId, setDefaultId] = useState<string>(item.defaultStateId || initial[0]?.id || '')
  const [selectedId, setSelectedId] = useState<string>(item.defaultStateId || initial[0]?.id || '')
  const [label, setLabel] = useState('')
  const [command, setCommand] = useState('')
  const [generating, setGenerating] = useState(false)
  // Общий замок на любую мутацию (генерация/смена основного/удаление): сериализует
  // записи, чтобы параллельные операции не переплелись и не потеряли изменения.
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = states.find((s) => s.id === selectedId) ?? states[0]

  // Персист: ≥2 состояний — храним полностью (imageUrl дублирует основное); иначе
  // вырождаем обратно в одиночную картинку (states пусто).
  async function persist(nextStates: ItemState[], nextDefaultId: string) {
    const def = nextStates.find((s) => s.id === nextDefaultId) ?? nextStates[0]
    if (nextStates.length >= 2 && def) {
      await onUpdate(item.id, { states: nextStates, defaultStateId: def.id, imageUrl: def.imageUrl })
    } else {
      await onUpdate(item.id, {
        states: [],
        defaultStateId: '',
        imageUrl: def?.imageUrl ?? item.imageUrl,
      })
    }
  }

  async function handleGenerate() {
    const cmd = command.trim()
    if (!cmd || busy) return
    const base = states.find((s) => s.id === defaultId) ?? states[0]
    if (!base?.imageUrl) {
      setError('Нет базовой картинки, чтобы сгенерировать состояние')
      return
    }
    setBusy(true)
    setGenerating(true)
    setError(null)
    try {
      const baseBlob = await fetch(base.imageUrl).then((r) => r.blob())
      const cutout = await generateState(baseBlob, cmd)
      const imageUrl = await uploadStatePhoto(cutout)
      const newState: ItemState = {
        id: crypto.randomUUID(),
        label: label.trim() || labelFromCommand(cmd),
        imageUrl,
        prompt: cmd,
      }
      // При первой генерации синтетическое «Основное» (id 'default') фиксируем реальным
      // id и пережимаем его картинку под лимит документа (≤512): иначе полноразмерное
      // фото хранилось бы и в imageUrl, и в states — документ Firestore вышел бы за ~1 MiB.
      const baseFixed: ItemState =
        base.id === 'default'
          ? { ...base, id: crypto.randomUUID(), imageUrl: await uploadStatePhoto(baseBlob) }
          : base
      const nextStates = states.map((s) => (s.id === base.id ? baseFixed : s)).concat(newState)
      const nextDefaultId = defaultId === 'default' ? baseFixed.id : defaultId
      // Сначала сохраняем на сервере, потом обновляем локально — чтобы при ошибке записи
      // (напр. превышение лимита) не показывать фантомно «созданное» состояние.
      await persist(nextStates, nextDefaultId)
      setStates(nextStates)
      setDefaultId(nextDefaultId)
      setSelectedId(newState.id)
      setLabel('')
      setCommand('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать состояние')
    } finally {
      setGenerating(false)
      setBusy(false)
    }
  }

  async function makeDefault(id: string) {
    if (busy) return
    setBusy(true)
    try {
      await persist(states, id)
      setDefaultId(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сменить основное состояние')
    } finally {
      setBusy(false)
    }
  }

  async function removeState(id: string) {
    if (busy) return
    setBusy(true)
    const nextStates = states.filter((s) => s.id !== id)
    const nextDefaultId = id === defaultId ? nextStates[0]?.id ?? '' : defaultId
    try {
      await persist(nextStates, nextDefaultId)
      setStates(nextStates)
      setDefaultId(nextDefaultId)
      if (selectedId === id) setSelectedId(nextDefaultId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить состояние')
    } finally {
      setBusy(false)
    }
  }

  const canAdd = states.length < MAX_STATES
  const multi = states.length >= 2

  return (
    <div>
      <div className="relative rounded-xl bg-zinc-50 h-56 flex items-center justify-center overflow-hidden mb-3">
        {selected?.imageUrl ? (
          <img src={selected.imageUrl} alt={selected.label} className="w-full h-full object-contain" />
        ) : (
          <span className="text-zinc-300 text-sm">нет фото</span>
        )}
        {selected && (
          <span className="absolute top-2 left-2 bg-black text-white text-[11px] px-2.5 py-1 rounded-full">
            {selected.id === defaultId ? `★ ${selected.label}` : selected.label}
          </span>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {states.map((s) => (
          <button key={s.id} onClick={() => setSelectedId(s.id)} className="flex-none w-20 text-left">
            <div
              className={`relative rounded-lg bg-zinc-50 h-24 flex items-center justify-center overflow-hidden border-2 ${
                s.id === selectedId ? 'border-black' : 'border-transparent'
              }`}
            >
              {s.id === defaultId && (
                <span className="absolute top-1 left-1 bg-black text-white text-[8px] px-1.5 py-0.5 rounded-full leading-none">
                  ★
                </span>
              )}
              <img src={s.imageUrl} alt={s.label} className="w-full h-full object-contain" />
            </div>
            <div className="text-[11px] text-zinc-600 mt-1 truncate">{s.label}</div>
          </button>
        ))}
      </div>

      {selected && multi && (
        <div className="flex gap-2 mt-2">
          {selected.id !== defaultId && (
            <button
              onClick={() => makeDefault(selected.id)}
              disabled={busy}
              className="text-[11px] px-3 py-1.5 rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors disabled:opacity-40"
            >
              Сделать основным
            </button>
          )}
          <button
            onClick={() => removeState(selected.id)}
            disabled={busy}
            className="text-[11px] px-3 py-1.5 rounded-full text-zinc-400 hover:bg-zinc-100 transition-colors disabled:opacity-40"
          >
            Удалить состояние
          </button>
        </div>
      )}

      {error && <p className="text-[11px] text-red-500 mt-3">{error}</p>}

      <div className="mt-4 border-t border-zinc-100 pt-4">
        {canAdd ? (
          <>
            <label className="text-xs text-zinc-400 mb-1 block">Что сделать с вещью</label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="напр. «застегни» или «завяжи концы спереди»"
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 text-sm border border-zinc-100 resize-none"
            />
            <label className="text-xs text-zinc-400 mb-1 mt-3 block">Название (необязательно)</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={command.trim() ? labelFromCommand(command) : 'Напр. «Застёгнутая»'}
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 text-sm border border-zinc-100"
            />
            <p className="text-[11px] text-zinc-400 mt-2">
              AI переснимет вещь по описанию от текущего основного фото, сохранив её цвет и принт.
            </p>
            <button
              onClick={handleGenerate}
              disabled={!command.trim() || busy}
              className="w-full mt-3 py-3 rounded-full bg-black text-white text-sm font-medium disabled:opacity-30 transition-opacity flex items-center justify-center gap-2"
            >
              {generating ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Генерирую…
                </>
              ) : (
                'Создать состояние'
              )}
            </button>
          </>
        ) : (
          <p className="text-xs text-zinc-400">Достигнут лимит состояний ({MAX_STATES}).</p>
        )}
      </div>
    </div>
  )
}
