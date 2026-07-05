import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, ChevronDown, ChevronUp, Check, LogOut, Trash2, Loader2, Pencil } from 'lucide-react'
import { useStore } from '../store'
import { WardrobeSharePanel } from '../components/WardrobeSharePanel'
import type { WardrobeMeta } from '../types'

export function WardrobesPage() {
  const navigate = useNavigate()
  const wardrobes = useStore((s) => s.wardrobes)
  const createWardrobe = useStore((s) => s.createWardrobe)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  // Раскрыт только один гардероб за раз: панель участников использует общий слот
  // стора members, два открытых показали бы чужих участников.
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function create() {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await createWardrobe(trimmed)
      setName('')
      setCreating(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/profile')} className="rounded-full p-2 hover:bg-zinc-100 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-semibold">Гардеробы</h1>
      </div>

      <div className="mb-4">
        {creating ? (
          <div className="flex gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder="Название гардероба клиента"
              className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-50 text-sm border border-zinc-100"
            />
            <button onClick={create} disabled={busy} className="rounded-xl bg-black text-white px-4 text-sm disabled:opacity-40">
              {busy ? <Loader2 size={14} className="animate-spin" /> : 'Создать'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-zinc-100 text-sm text-zinc-600 hover:bg-zinc-200 transition-colors"
          >
            <Plus size={16} />
            Создать пространство
          </button>
        )}
      </div>

      <div className="space-y-2">
        {wardrobes.map((w) => (
          <WardrobeCard
            key={w.id}
            wardrobe={w}
            expanded={expandedId === w.id}
            onToggle={() => setExpandedId((cur) => (cur === w.id ? null : w.id))}
          />
        ))}
      </div>
    </div>
  )
}

function WardrobeCard({ wardrobe, expanded, onToggle }: { wardrobe: WardrobeMeta; expanded: boolean; onToggle: () => void }) {
  const navigate = useNavigate()
  const activeId = useStore((s) => s.activeWardrobeId)
  const switchWardrobe = useStore((s) => s.switchWardrobe)
  const renameWardrobe = useStore((s) => s.renameWardrobe)
  const deleteWardrobe = useStore((s) => s.deleteWardrobe)
  const leaveWardrobe = useStore((s) => s.leaveWardrobe)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(wardrobe.name)
  const [error, setError] = useState<string | null>(null)

  const isActive = wardrobe.id === activeId
  const isOwner = wardrobe.role === 'owner'

  async function commitRename() {
    setEditing(false)
    const trimmed = name.trim()
    if (!trimmed || trimmed === wardrobe.name) {
      setName(wardrobe.name)
      return
    }
    try {
      await renameWardrobe(wardrobe.id, trimmed)
    } catch {
      setName(wardrobe.name)
    }
  }

  async function open() {
    await switchWardrobe(wardrobe.id)
    navigate('/wardrobe')
  }

  async function remove() {
    setError(null)
    try {
      if (isOwner) await deleteWardrobe(wardrobe.id)
      else await leaveWardrobe(wardrobe.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-100">
      <div className="flex items-center gap-2 p-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className="w-full px-2 py-1 rounded-lg bg-zinc-50 text-sm border border-zinc-200"
            />
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium truncate">{wardrobe.name}</span>
              {isActive && <Check size={14} className="text-green-500 shrink-0" />}
              {!wardrobe.isPersonal && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 shrink-0">
                  {isOwner ? 'владелец' : 'участник'}
                </span>
              )}
            </div>
          )}
        </div>
        {isOwner && !editing && (
          <button onClick={() => setEditing(true)} className="rounded-full p-1.5 hover:bg-zinc-100 transition-colors" title="Переименовать">
            <Pencil size={14} className="text-zinc-400" />
          </button>
        )}
        <button onClick={onToggle} className="rounded-full p-1.5 hover:bg-zinc-100 transition-colors">
          {expanded ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-zinc-100">
          {!isActive && (
            <button onClick={open} className="w-full mt-3 py-2.5 rounded-xl bg-zinc-900 text-white text-sm">
              Открыть гардероб
            </button>
          )}

          <WardrobeSharePanel wardrobe={wardrobe} />

          {!wardrobe.isPersonal && (
            <div className="pt-3 mt-3 border-t border-zinc-100">
              <button
                onClick={remove}
                className="flex items-center gap-2 text-xs text-red-500 hover:text-red-600 transition-colors"
              >
                {isOwner ? <Trash2 size={14} /> : <LogOut size={14} />}
                {isOwner ? 'Удалить гардероб' : 'Покинуть гардероб'}
              </button>
              {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
