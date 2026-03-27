import { useStore } from '../store'
import { OutfitCard } from '../components/OutfitCard'
import { LayoutGrid } from 'lucide-react'

export function OutfitsPage() {
  const { outfits, wardrobe, shopping, removeOutfit } = useStore()

  return (
    <div>
      <Header count={outfits.length} />
      {outfits.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {outfits.map((outfit) => (
            <OutfitCard
              key={outfit.id}
              outfit={outfit}
              wardrobeItems={wardrobe}
              shoppingItems={shopping}
              onRemove={removeOutfit}
            />
          ))}
        </div>
      )}
      <Stats />
    </div>
  )
}

function Header({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h1 className="text-xl font-semibold">Образы</h1>
      {count > 0 && (
        <span className="text-xs text-zinc-400 bg-zinc-100 px-3 py-1 rounded-full">
          {count} {pluralize(count)}
        </span>
      )}
    </div>
  )
}

function Stats() {
  const { wardrobe, shopping, outfits } = useStore()
  const confirmedShopping = shopping.filter((i) => i.isConfirmed || !i.isAiSuggested)
  const totalItems = wardrobe.length + confirmedShopping.length

  if (totalItems === 0) return null

  return (
    <div className="mt-8 p-4 rounded-2xl bg-zinc-50">
      <div className="flex items-center gap-2 mb-3">
        <LayoutGrid size={16} />
        <span className="text-sm font-medium">Статистика</span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <StatItem label="Вещей" value={wardrobe.length} />
        <StatItem label="Хочу купить" value={confirmedShopping.length} />
        <StatItem label="Образов" value={outfits.length} />
      </div>
    </div>
  )
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-light">{value}</p>
      <p className="text-xs text-zinc-400">{label}</p>
    </div>
  )
}

function EmptyState() {
  return (
    <p className="text-center text-sm text-zinc-300 mt-20">
      Добавьте образы из вещей гардероба
    </p>
  )
}

function pluralize(n: number): string {
  const mod = n % 10
  const mod100 = n % 100
  if (mod === 1 && mod100 !== 11) return 'образ'
  if (mod >= 2 && mod <= 4 && (mod100 < 12 || mod100 > 14)) return 'образа'
  return 'образов'
}
