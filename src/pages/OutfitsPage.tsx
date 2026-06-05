import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useStore } from '../store'
import type { Outfit, Weather } from '../types'
import { WEATHER_LABELS, ALL_WEATHER, SEASON_WEATHER } from '../types'
import { OutfitCard } from '../components/OutfitCard'
import { OutfitEditor } from '../components/OutfitEditor'

/** Погода образа: явная, иначе выводим из сезона — чтобы фильтр по погоде не прятал старые образы. */
function effectiveWeather(o: Outfit): Weather[] {
  return o.weather?.length ? o.weather : SEASON_WEATHER[o.season]
}

export function OutfitsPage() {
  const { wardrobe, shopping, outfits, removeOutfit } = useStore()
  const [outfitWeather, setOutfitWeather] = useState<Weather | 'all'>('all')
  const [outfitItem, setOutfitItem] = useState<string | null>(null)
  // undefined = закрыто, null = новый, Outfit = редактирование
  const [editingOutfit, setEditingOutfit] = useState<Outfit | null | undefined>(undefined)

  const filteredOutfits = outfits.filter((o) => {
    const okWeather = outfitWeather === 'all' || effectiveWeather(o).includes(outfitWeather)
    const okItem = !outfitItem || (o.wardrobeItemIds ?? []).includes(outfitItem)
    return okWeather && okItem
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Образы</h1>
        <button
          onClick={() => setEditingOutfit(null)}
          className="rounded-full bg-black text-white p-2.5 transition-transform active:scale-95"
        >
          <Plus size={18} />
        </button>
      </div>

      {outfits.length === 0 ? (
        <EmptyOutfits onAdd={() => setEditingOutfit(null)} />
      ) : (
        <>
          <OutfitFilterBar
            weather={outfitWeather}
            onWeather={setOutfitWeather}
            itemFilter={outfitItem}
            onItem={setOutfitItem}
            wardrobe={wardrobe}
          />
          {filteredOutfits.length === 0 ? (
            <p className="text-center text-sm text-zinc-300 mt-16">Нет образов под этот фильтр</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 mt-3">
              {filteredOutfits.map((outfit) => (
                <OutfitCard
                  key={outfit.id}
                  outfit={outfit}
                  wardrobeItems={wardrobe}
                  shoppingItems={shopping}
                  onRemove={removeOutfit}
                  onEdit={(o) => setEditingOutfit(o)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {editingOutfit !== undefined && (
        <OutfitEditor outfit={editingOutfit} onClose={() => setEditingOutfit(undefined)} />
      )}
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

function OutfitFilterBar({
  weather,
  onWeather,
  itemFilter,
  onItem,
  wardrobe,
}: {
  weather: Weather | 'all'
  onWeather: (w: Weather | 'all') => void
  itemFilter: string | null
  onItem: (id: string | null) => void
  wardrobe: { id: string; name: string; imageUrl?: string }[]
}) {
  const withImage = wardrobe.filter((i) => i.imageUrl)
  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        <Chip label="Любая погода" active={weather === 'all'} onClick={() => onWeather('all')} />
        {ALL_WEATHER.map((w) => (
          <Chip key={w} label={WEATHER_LABELS[w]} active={weather === w} onClick={() => onWeather(w)} />
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

function EmptyOutfits({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center mt-20">
      <p className="text-sm text-zinc-300 mb-3">Создайте свой первый образ</p>
      <button onClick={onAdd} className="text-sm text-zinc-500 underline underline-offset-2">
        Добавить образ
      </button>
    </div>
  )
}
