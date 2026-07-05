import { useEffect, useState } from 'react'
import { Link2, Copy, Check, Trash2, UserPlus, Send, Loader2 } from 'lucide-react'
import { useStore } from '../store'
import { useAuth } from '../lib/auth'
import type { WardrobeMeta, WardrobeRole } from '../types'

/** Панель управления доступом к конкретному гардеробу: ссылки-приглашения + участники.
 *  Участники грузятся в общий слот стора, поэтому панель рендерим по одному гардеробу. */
export function WardrobeSharePanel({ wardrobe }: { wardrobe: WardrobeMeta }) {
  const { user } = useAuth()
  const createInvite = useStore((s) => s.createInvite)
  const loadMembers = useStore((s) => s.loadMembers)
  const removeMember = useStore((s) => s.removeMember)
  const members = useStore((s) => s.members)
  const membersLoading = useStore((s) => s.membersLoading)

  const [link, setLink] = useState<string | null>(null)
  const [linkRole, setLinkRole] = useState<WardrobeRole | null>(null)
  const [creating, setCreating] = useState<WardrobeRole | null>(null)
  const [copied, setCopied] = useState(false)

  const isOwner = wardrobe.role === 'owner'

  useEffect(() => {
    if (isOwner) void loadMembers(wardrobe.id)
  }, [wardrobe.id, isOwner, loadMembers])

  async function makeLink(role: WardrobeRole) {
    setCreating(role)
    setCopied(false)
    try {
      const url = await createInvite(wardrobe.id, role)
      setLink(url)
      setLinkRole(role)
    } catch {
      /* игнор — ссылка просто не создастся */
    }
    setCreating(null)
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* буфер обмена недоступен (WebView/нет разрешения) — ссылку можно скопировать вручную */
    }
  }

  return (
    <div className="space-y-4 pt-3">
      <div className="space-y-2">
        <p className="text-xs text-zinc-400">Поделиться доступом</p>
        <div className="flex gap-2">
          <button
            onClick={() => makeLink('member')}
            disabled={creating !== null}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-zinc-100 text-xs text-zinc-600 hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {creating === 'member' ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Соавтор
          </button>
          {isOwner && !wardrobe.isPersonal && (
            <button
              onClick={() => makeLink('owner')}
              disabled={creating !== null}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-zinc-100 text-xs text-zinc-600 hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {creating === 'owner' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Передать клиенту
            </button>
          )}
        </div>

        {link && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-zinc-400">
              {linkRole === 'owner'
                ? 'Одноразовая ссылка: принявший станет владельцем, вы останетесь соавтором.'
                : 'Одноразовая ссылка: принявший получит полный доступ к гардеробу.'}
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                className="flex-1 px-3 py-2 rounded-xl bg-zinc-50 text-xs text-zinc-500 border border-zinc-100 truncate"
              />
              <button onClick={copy} className="rounded-xl bg-black text-white px-3 py-2 text-xs flex items-center gap-1.5 shrink-0">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Готово' : 'Копировать'}
              </button>
            </div>
          </div>
        )}
        {!link && (
          <p className="flex items-center gap-1.5 text-[11px] text-zinc-300">
            <Link2 size={12} />
            Создайте ссылку и отправьте её клиенту или стилисту
          </p>
        )}
      </div>

      {isOwner && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-400">Участники</p>
          {membersLoading ? (
            <Loader2 size={16} className="animate-spin text-zinc-300" />
          ) : (
            <div className="space-y-1.5">
              {members.map((m) => (
                <div key={m.uid} className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{m.displayName || 'Без имени'}</p>
                    <p className="text-[11px] text-zinc-400 truncate">{m.email}</p>
                  </div>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500">
                      {m.role === 'owner' ? 'владелец' : 'участник'}
                    </span>
                    {m.uid !== user?.uid && m.role !== 'owner' && (
                      <button
                        onClick={() => removeMember(m.uid, wardrobe.id)}
                        className="rounded-full p-1.5 hover:bg-zinc-200 transition-colors"
                        title="Убрать участника"
                      >
                        <Trash2 size={14} className="text-zinc-400" />
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
