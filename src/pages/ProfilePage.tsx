import { useState } from 'react'
import { Plus, LogOut } from 'lucide-react'
import { useStore } from '../store'
import { useAuth } from '../lib/auth'
import type { BodyType, FeaturePreference } from '../types'
import { BODY_TYPE_LABELS } from '../types'
import { BodyFeatureRow } from '../components/BodyFeatureRow'
import { Modal } from '../components/Modal'

const BODY_TYPES = Object.keys(BODY_TYPE_LABELS) as BodyType[]

export function ProfilePage() {
  const { signOut } = useAuth()
  const { profile, addBodyFeature, removeBodyFeature } = useStore()
  const [showFeatureForm, setShowFeatureForm] = useState(false)

  return (
    <div>
      <HeaderSection onSignOut={signOut} />
      <BodyParams />
      <BodyTypeSection />
      <FeaturesSection
        features={profile.features}
        onAdd={() => setShowFeatureForm(true)}
        onRemove={removeBodyFeature}
      />
      <StylesSection />
      <Modal open={showFeatureForm} onClose={() => setShowFeatureForm(false)} title="Новая особенность">
        <AddFeatureForm onAdd={addBodyFeature} onClose={() => setShowFeatureForm(false)} />
      </Modal>
    </div>
  )
}

function HeaderSection({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-xl font-semibold">Профиль</h1>
      <button onClick={onSignOut} className="rounded-full p-2 hover:bg-zinc-100 transition-colors">
        <LogOut size={18} />
      </button>
    </div>
  )
}

function BodyParams() {
  const { profile, updateProfile } = useStore()
  return (
    <section className="mb-6">
      <h2 className="text-sm font-medium text-zinc-400 mb-3">Параметры</h2>
      <div className="grid grid-cols-2 gap-3">
        <NumInput label="Рост (см)" value={profile.height} onChange={(v) => updateProfile({ height: v })} />
        <NumInput label="Вес (кг)" value={profile.weight} onChange={(v) => updateProfile({ weight: v })} />
      </div>
    </section>
  )
}

function NumInput({ label, value, onChange }: { label: string; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <div>
      <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 text-sm border border-zinc-100"
      />
    </div>
  )
}

function BodyTypeSection() {
  const { profile, updateProfile } = useStore()
  return (
    <section className="mb-6">
      <h2 className="text-sm font-medium text-zinc-400 mb-3">Тип фигуры</h2>
      <div className="flex flex-wrap gap-2">
        {BODY_TYPES.map((bt) => (
          <button
            key={bt}
            onClick={() => updateProfile({ bodyType: bt })}
            className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
              profile.bodyType === bt ? 'bg-black text-white' : 'bg-zinc-100 text-zinc-500'
            }`}
          >
            {BODY_TYPE_LABELS[bt]}
          </button>
        ))}
      </div>
    </section>
  )
}

function FeaturesSection({ features, onAdd, onRemove }: {
  features: { id: string; area: string; preference: string; note?: string }[]
  onAdd: () => void
  onRemove: (id: string) => void
}) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-zinc-400">Особенности фигуры</h2>
        <button onClick={onAdd} className="rounded-full bg-zinc-100 p-1.5 hover:bg-zinc-200 transition-colors">
          <Plus size={14} />
        </button>
      </div>
      {features.length === 0 ? (
        <p className="text-xs text-zinc-300">Добавьте что скрыть или подчеркнуть</p>
      ) : (
        features.map((f) => <BodyFeatureRow key={f.id} feature={f as any} onRemove={onRemove} />)
      )}
    </section>
  )
}

function StylesSection() {
  const { profile, updateProfile } = useStore()
  const [input, setInput] = useState('')

  function addStyle() {
    if (!input.trim()) return
    updateProfile({ preferredStyles: [...profile.preferredStyles, input.trim()] })
    setInput('')
  }

  function removeStyle(idx: number) {
    updateProfile({ preferredStyles: profile.preferredStyles.filter((_, i) => i !== idx) })
  }

  return (
    <section className="mb-6">
      <h2 className="text-sm font-medium text-zinc-400 mb-3">Предпочитаемые стили</h2>
      <div className="flex gap-2 mb-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addStyle()}
          placeholder="минимализм, casual..."
          className="flex-1 px-4 py-2 rounded-xl bg-zinc-50 text-sm border border-zinc-100"
        />
        <button onClick={addStyle} className="rounded-full bg-black text-white px-4 py-2 text-sm">+</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {profile.preferredStyles.map((s, i) => (
          <button key={i} onClick={() => removeStyle(i)} className="px-3 py-1 rounded-full bg-zinc-100 text-xs text-zinc-600 hover:bg-zinc-200 transition-colors">
            {s} ×
          </button>
        ))}
      </div>
    </section>
  )
}

function AddFeatureForm({ onAdd, onClose }: { onAdd: (f: { area: string; preference: FeaturePreference; note?: string }) => void; onClose: () => void }) {
  const [area, setArea] = useState('')
  const [preference, setPreference] = useState<FeaturePreference>('hide')
  const [note, setNote] = useState('')

  function handleSubmit() {
    if (!area.trim()) return
    onAdd({ area: area.trim(), preference, note: note.trim() || undefined })
    onClose()
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Зона тела</label>
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Предплечья, талия, ноги..." className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 text-sm border border-zinc-100" />
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1.5 block">Предпочтение</label>
        <div className="flex gap-2">
          <button
            onClick={() => setPreference('hide')}
            className={`flex-1 py-2 rounded-full text-xs transition-colors ${preference === 'hide' ? 'bg-black text-white' : 'bg-zinc-100 text-zinc-500'}`}
          >
            Скрыть
          </button>
          <button
            onClick={() => setPreference('highlight')}
            className={`flex-1 py-2 rounded-full text-xs transition-colors ${preference === 'highlight' ? 'bg-black text-white' : 'bg-zinc-100 text-zinc-500'}`}
          >
            Подчеркнуть
          </button>
        </div>
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Комментарий</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="необязательно" className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 text-sm border border-zinc-100" />
      </div>
      <button
        onClick={handleSubmit}
        disabled={!area.trim()}
        className="w-full py-3 rounded-full bg-black text-white text-sm font-medium disabled:opacity-30 transition-opacity"
      >
        Добавить
      </button>
    </div>
  )
}
