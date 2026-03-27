import { useState } from 'react'
import { Check, Trash2, Sparkles, Palette, Loader2, Pencil, ShoppingBag } from 'lucide-react'
import type { ShoppingItem } from '../types'
import { CATEGORY_LABELS } from '../types'
import { Modal } from './Modal'
import { PhotoEditor } from './PhotoEditor'

interface Props {
  item: ShoppingItem
  onConfirm: (id: string) => void
  onRemove: (id: string) => void
  onMoveToWardrobe?: (id: string) => void
  onUpdateImage: (id: string, imageUrl: string) => void
  onSuggestColor?: (id: string) => void
  suggestingColor?: boolean
}

export function ShoppingItemCard({ item, onConfirm, onRemove, onMoveToWardrobe, onUpdateImage, onSuggestColor, suggestingColor }: Props) {
  const muted = item.isAiSuggested && !item.isConfirmed
  const wantsColor = item.needColorAdvice && item.color === 'подобрать'
  const [showPhotoModal, setShowPhotoModal] = useState(false)

  return (
    <div className={`flex items-start gap-3 py-3 transition-opacity ${muted ? 'opacity-50' : ''}`}>
      <Thumbnail
        name={item.name}
        imageUrl={item.imageUrl}
        onEdit={() => setShowPhotoModal(true)}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{item.name}</p>
          {item.isAiSuggested && <Sparkles size={12} className="text-zinc-400 shrink-0" />}
        </div>
        <p className="text-xs text-zinc-400">
          {CATEGORY_LABELS[item.category]} · {wantsColor ? 'цвет не выбран' : item.color}
        </p>
        {wantsColor && onSuggestColor && (
          <button
            onClick={() => onSuggestColor(item.id)}
            disabled={suggestingColor}
            className="mt-1.5 flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {suggestingColor ? <Loader2 size={10} className="animate-spin" /> : <Palette size={10} />}
            {suggestingColor ? 'Подбираю...' : 'Подобрать цвет'}
          </button>
        )}
        {item.aiReason && <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{item.aiReason}</p>}
        {item.price && <p className="text-xs font-medium mt-1">{item.price.toLocaleString()} €</p>}
      </div>
      <Actions item={item} muted={muted} onConfirm={onConfirm} onRemove={onRemove} onMoveToWardrobe={onMoveToWardrobe} />
      <Modal open={showPhotoModal} onClose={() => setShowPhotoModal(false)} title="Изменить фото">
        <PhotoEditor
          itemId={item.id}
          currentUrl={item.imageUrl}
          shopUrl={item.shopUrl}
          onUpdateImage={onUpdateImage}
          onClose={() => setShowPhotoModal(false)}
        />
      </Modal>
    </div>
  )
}

function Thumbnail({ name, imageUrl, onEdit }: {
  name?: string; imageUrl?: string; onEdit: () => void
}) {
  const [broken, setBroken] = useState(false)
  const hasImage = imageUrl && !broken

  return (
    <button
      onClick={onEdit}
      className="w-14 h-14 rounded-xl shrink-0 overflow-hidden relative"
    >
      {hasImage ? (
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="w-full h-full bg-zinc-100 flex items-center justify-center text-zinc-300 text-lg font-light">
          {(name ?? '?')[0]}
        </div>
      )}
      <div className="absolute bottom-0 right-0 bg-white rounded-tl-lg p-1">
        <Pencil size={10} className="text-zinc-400" />
      </div>
    </button>
  )
}

function Actions({ item, muted, onConfirm, onRemove, onMoveToWardrobe }: {
  item: ShoppingItem; muted: boolean
  onConfirm: (id: string) => void; onRemove: (id: string) => void
  onMoveToWardrobe?: (id: string) => void
}) {
  return (
    <div className="flex gap-1.5 shrink-0 pt-1">
      {muted && (
        <button onClick={() => onConfirm(item.id)} className="rounded-full p-1.5 bg-zinc-100 hover:bg-zinc-200 transition-colors">
          <Check size={14} />
        </button>
      )}
      {!muted && onMoveToWardrobe && (
        <button
          onClick={() => onMoveToWardrobe(item.id)}
          className="rounded-full p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
          title="Купила — перенести в гардероб"
        >
          <ShoppingBag size={14} />
        </button>
      )}
      <button onClick={() => onRemove(item.id)} className="rounded-full p-1.5 bg-zinc-100 hover:bg-zinc-200 transition-colors">
        <Trash2 size={14} />
      </button>
    </div>
  )
}
