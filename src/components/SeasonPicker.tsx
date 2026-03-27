import type { Season } from '../types'
import { SEASON_LABELS } from '../types'

const ALL_SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']

interface Props {
  selected: Season[]
  onChange: (s: Season[]) => void
}

export function SeasonPicker({ selected, onChange }: Props) {
  function toggle(s: Season) {
    onChange(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s])
  }

  return (
    <div>
      <label className="text-xs text-zinc-400 mb-1.5 block">Сезон</label>
      <div className="flex gap-2">
        {ALL_SEASONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggle(s)}
            className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
              selected.includes(s) ? 'bg-black text-white' : 'bg-zinc-100 text-zinc-500'
            }`}
          >
            {SEASON_LABELS[s]}
          </button>
        ))}
      </div>
    </div>
  )
}
