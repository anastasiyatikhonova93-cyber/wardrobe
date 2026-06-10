import type { Category } from '../types'

export function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs transition-colors ${
        active ? 'bg-black text-white' : 'bg-zinc-100 text-zinc-500'
      }`}
    >
      {label}
    </button>
  )
}

/** Фильтр образов по поводу (категория) и по вещи. Используется в списке образов и в редакторе доски. */
export function OutfitFilterBar({
  categories,
  selected,
  onSelect,
  itemFilter,
  onItem,
  wardrobe,
}: {
  categories: Category[]
  selected: string | 'all'
  onSelect: (id: string | 'all') => void
  itemFilter: string | null
  onItem: (id: string | null) => void
  wardrobe: { id: string; name: string; imageUrl?: string }[]
}) {
  const withImage = wardrobe.filter((i) => i.imageUrl)
  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        <Chip label="Все" active={selected === 'all'} onClick={() => onSelect('all')} />
        {categories.map((c) => (
          <Chip key={c.id} label={c.name} active={selected === c.id} onClick={() => onSelect(c.id)} />
        ))}
      </div>
      {withImage.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none items-center">
          <span className="text-[11px] text-zinc-400 shrink-0 pr-1">По вещи:</span>
          {withImage.map((i) => (
            <button
              key={i.id}
              onClick={() => onItem(itemFilter === i.id ? null : i.id)}
              title={i.name}
              className={`shrink-0 w-9 h-9 rounded-lg overflow-hidden border-2 transition-colors ${
                itemFilter === i.id ? 'border-black' : 'border-transparent opacity-70'
              }`}
            >
              <img src={i.imageUrl} alt={i.name} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
