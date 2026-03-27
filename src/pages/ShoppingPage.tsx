import { useState, useEffect, useRef } from 'react'
import { Plus, Sparkles, Loader2 } from 'lucide-react'
import { useStore } from '../store'
import type { Season } from '../types'
import { SEASON_LABELS } from '../types'
import { ShoppingItemCard } from '../components/ShoppingItemCard'
import { Modal } from '../components/Modal'
import { AddShoppingForm } from '../components/AddShoppingForm'
import { analyzeWardrobe, suggestColor } from '../ai'

const ALL_SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']

export function ShoppingPage() {
  const store = useStore()
  const { shopping, addShoppingItem, removeShoppingItem, confirmShoppingItem, updateShoppingItem, moveToWardrobe } = store
  const [showAdd, setShowAdd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [targetSeason, setTargetSeason] = useState<Season>('spring')
  const [colorLoadingId, setColorLoadingId] = useState<string | null>(null)
  const processingRef = useRef<Set<string>>(new Set())

  const userItems = shopping.filter((i) => !i.isAiSuggested || i.isConfirmed)
  const aiItems = shopping.filter((i) => i.isAiSuggested && !i.isConfirmed)

  useEffect(() => {
    const pending = shopping.filter(
      (i) => i.needColorAdvice && i.color === 'подобрать' && !processingRef.current.has(i.id)
    )
    for (const item of pending) {
      processingRef.current.add(item.id)
      handleSuggestColor(item.id)
    }
  }, [shopping])

  async function handleAnalyze() {
    setLoading(true)
    setError('')
    try {
      const { suggestions, outfits } = await analyzeWardrobe(
        store.wardrobe, store.shopping, store.profile, targetSeason
      )
      await store.addAiSuggestions(suggestions)
      await store.setOutfits(outfits)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка анализа')
    } finally {
      setLoading(false)
    }
  }

  async function handleSuggestColor(id: string) {
    const item = shopping.find((i) => i.id === id)
    if (!item) return
    setColorLoadingId(id)
    try {
      const color = await suggestColor(
        item.name, item.category, store.wardrobe, store.shopping, store.profile
      )
      await updateShoppingItem(id, { color, needColorAdvice: false })
    } catch {
      setError('Не удалось подобрать цвет')
    } finally {
      setColorLoadingId(null)
      processingRef.current.delete(id)
    }
  }

  return (
    <div>
      <Header onAdd={() => setShowAdd(true)} />
      <AiSection
        targetSeason={targetSeason}
        onSeasonChange={setTargetSeason}
        onAnalyze={handleAnalyze}
        loading={loading}
        error={error}
      />
      {userItems.length > 0 && (
        <Section title="Хочу купить">
          {userItems.map((item) => (
            <ShoppingItemCard
              key={item.id}
              item={item}
              onConfirm={confirmShoppingItem}
              onRemove={removeShoppingItem}
              onMoveToWardrobe={moveToWardrobe}
              onUpdateImage={(id, url) => updateShoppingItem(id, { imageUrl: url })}
              onSuggestColor={handleSuggestColor}
              suggestingColor={colorLoadingId === item.id}
            />
          ))}
        </Section>
      )}
      {aiItems.length > 0 && (
        <Section title="Рекомендации AI">
          {aiItems.map((item) => (
            <ShoppingItemCard
              key={item.id}
              item={item}
              onConfirm={confirmShoppingItem}
              onRemove={removeShoppingItem}
              onUpdateImage={(id, url) => updateShoppingItem(id, { imageUrl: url })}
            />
          ))}
        </Section>
      )}
      {shopping.length === 0 && <EmptyState />}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Хочу купить">
        <AddShoppingForm onAdd={addShoppingItem} onClose={() => setShowAdd(false)} />
      </Modal>
    </div>
  )
}

function Header({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h1 className="text-xl font-semibold">Хочу купить</h1>
      <button onClick={onAdd} className="rounded-full bg-black text-white p-2.5 transition-transform active:scale-95">
        <Plus size={18} />
      </button>
    </div>
  )
}

function AiSection({ targetSeason, onSeasonChange, onAnalyze, loading, error }: {
  targetSeason: Season; onSeasonChange: (s: Season) => void; onAnalyze: () => void; loading: boolean; error: string
}) {
  return (
    <div className="mb-6 p-4 rounded-2xl bg-zinc-50">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} />
        <span className="text-sm font-medium">AI-анализ капсулы</span>
      </div>
      <div className="flex gap-2 mb-3">
        {ALL_SEASONS.map((s) => (
          <button
            key={s}
            onClick={() => onSeasonChange(s)}
            className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
              targetSeason === s ? 'bg-black text-white' : 'bg-zinc-100 text-zinc-500'
            }`}
          >
            {SEASON_LABELS[s]}
          </button>
        ))}
      </div>
      <button
        onClick={onAnalyze}
        disabled={loading}
        className="w-full py-2.5 rounded-full bg-black text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={14} />}
        {loading ? 'Анализирую...' : 'Проанализировать'}
      </button>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-medium text-zinc-400 mb-2">{title}</h2>
      <div className="divide-y divide-zinc-50">{children}</div>
    </div>
  )
}

function EmptyState() {
  return (
    <p className="text-center text-sm text-zinc-300 mt-20">
      Добавьте вещи, которые хотите купить, или запустите AI-анализ
    </p>
  )
}
