import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Check, Plus, Settings2, Loader2 } from 'lucide-react'
import { useStore, useActiveWardrobe } from '../store'
import type { WardrobeRole } from '../types'

/** Кнопка активного гардероба в шапке + выпадающий список под ней (switcher). */
export function WardrobeSwitcher() {
  const active = useActiveWardrobe()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative px-3 py-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-zinc-200 hover:bg-zinc-50 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-wide text-zinc-400 shrink-0">Гардероб</span>
          <span className="text-sm font-medium truncate">{active?.name ?? 'Мой гардероб'}</span>
          {active && !active.isPersonal && <RoleBadge role={active.role} />}
        </span>
        <ChevronDown size={16} className={`text-zinc-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && <SwitcherDropdown onClose={() => setOpen(false)} />}
    </div>
  )
}

function RoleBadge({ role }: { role: WardrobeRole }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-500 shrink-0">
      {role === 'owner' ? 'владелец' : 'участник'}
    </span>
  )
}

function SwitcherDropdown({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const wardrobes = useStore((s) => s.wardrobes)
  const activeId = useStore((s) => s.activeWardrobeId)
  const switchWardrobe = useStore((s) => s.switchWardrobe)
  const createWardrobe = useStore((s) => s.createWardrobe)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function pick(id: string) {
    if (id !== activeId) await switchWardrobe(id)
    onClose()
  }

  async function create() {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await createWardrobe(trimmed)
      onClose()
    } catch {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Клик мимо — закрыть. Хедер больше не имеет backdrop-filter, поэтому fixed
          позиционируется относительно окна корректно. */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-2xl border border-zinc-200 bg-white shadow-xl overflow-hidden">
        <div className="max-h-[70vh] overflow-y-auto p-1.5">
          <p className="text-[11px] text-zinc-400 px-2.5 pt-1.5 pb-1">Мои гардеробы</p>
          {wardrobes.map((w) => (
            <button
              key={w.id}
              onClick={() => pick(w.id)}
              className="w-full flex items-center justify-between px-2.5 py-2.5 rounded-xl hover:bg-zinc-50 transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-sm truncate">{w.name}</span>
                {!w.isPersonal && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 shrink-0">
                    {w.role === 'owner' ? 'владелец' : 'участник'}
                  </span>
                )}
              </span>
              {w.id === activeId && <Check size={16} className="text-black shrink-0" />}
            </button>
          ))}

          <div className="my-1.5 border-t border-zinc-100" />

          {creating ? (
            <div className="flex gap-2 px-1.5 py-1">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder="Имя клиента / название"
                className="flex-1 px-3 py-2 rounded-xl bg-zinc-50 text-sm border border-zinc-100"
              />
              <button onClick={create} disabled={busy} className="rounded-xl bg-black text-white px-4 text-sm disabled:opacity-40">
                {busy ? <Loader2 size={14} className="animate-spin" /> : 'Создать'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-2.5 py-2.5 rounded-xl text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              <Plus size={16} />
              Новый гардероб клиента
            </button>
          )}
          <button
            onClick={() => { onClose(); navigate('/wardrobes') }}
            className="w-full flex items-center gap-2 px-2.5 py-2.5 rounded-xl text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            <Settings2 size={16} />
            Управление и доступ
          </button>
        </div>
      </div>
    </>
  )
}
