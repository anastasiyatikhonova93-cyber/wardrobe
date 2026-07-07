import { useState } from 'react'
import { Trash2, Pencil, Layers } from 'lucide-react'
import type { ClothingItem } from '../types'
import { CATEGORY_LABELS, SEASON_LABELS } from '../types'
import { Modal } from './Modal'
import { PhotoEditor } from './PhotoEditor'
import { ItemStates } from './ItemStates'

interface Props {
  item: ClothingItem
  onRemove: (id: string) => void
  onUpdateImage: (id: string, imageUrl: string) => void
  onUpdate: (id: string, patch: Partial<ClothingItem>) => void
}

export function ClothingCard({ item, onRemove, onUpdateImage, onUpdate }: Props) {
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [showStatesModal, setShowStatesModal] = useState(false)
  const [imgBroken, setImgBroken] = useState(false)
  const hasImage = item.imageUrl && !imgBroken
  const stateCount = item.states?.length ?? 0

  return (
    <div className="relative rounded-2xl overflow-hidden bg-zinc-50">
      {hasImage ? (
        <img
          src={item.imageUrl}
          alt={item.name}
          className="w-full aspect-[3/4] object-contain"
          onError={() => setImgBroken(true)}
        />
      ) : (
        <div className="w-full aspect-[3/4] flex items-center justify-center text-zinc-300 text-4xl font-light">
          {(item.name ?? '?')[0]}
        </div>
      )}

      <div className="p-3">
        <p className="text-sm font-medium leading-tight">{item.name}</p>
        <p className="text-xs text-zinc-400 mt-0.5">
          {CATEGORY_LABELS[item.category]} · {item.color}
        </p>
        <div className="flex gap-1 mt-1.5 flex-wrap">
          {(item.seasons ?? []).map((s) => (
            <span key={s} className="text-[10px] px-2 py-0.5 bg-zinc-100 rounded-full text-zinc-500">
              {SEASON_LABELS[s]}
            </span>
          ))}
        </div>
      </div>

      <button
        onClick={() => setShowPhotoModal(true)}
        className="absolute top-2 left-2 z-10 bg-white shadow-md rounded-full p-2 active:scale-95 transition-transform"
      >
        <Pencil size={14} className="text-zinc-600" />
      </button>

      <button
        onClick={() => setShowStatesModal(true)}
        className="absolute top-12 left-2 z-10 bg-white shadow-md rounded-full p-2 active:scale-95 transition-transform"
        title="Состояния вещи"
      >
        <Layers size={14} className="text-zinc-600" />
        {stateCount > 1 && (
          <span className="absolute -top-1 -right-1 bg-black text-white text-[9px] leading-none min-w-4 h-4 px-1 rounded-full flex items-center justify-center">
            {stateCount}
          </span>
        )}
      </button>

      <button
        onClick={() => onRemove(item.id)}
        className="absolute top-2 right-2 z-10 bg-white shadow-md rounded-full p-2 active:scale-95 transition-transform"
      >
        <Trash2 size={14} className="text-zinc-600" />
      </button>

      <Modal open={showPhotoModal} onClose={() => setShowPhotoModal(false)} title="Изменить фото">
        <PhotoEditor
          itemId={item.id}
          currentUrl={item.imageUrl}
          shopUrl={item.shopUrl}
          onUpdateImage={onUpdateImage}
          onClose={() => setShowPhotoModal(false)}
        />
      </Modal>

      <Modal open={showStatesModal} onClose={() => setShowStatesModal(false)} title="Состояния вещи">
        <ItemStates item={item} onUpdate={onUpdate} />
      </Modal>
    </div>
  )
}
