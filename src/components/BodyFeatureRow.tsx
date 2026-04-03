import { Trash2, EyeOff, Sparkles } from 'lucide-react'
import type { BodyFeature } from '../types'

interface Props {
  feature: BodyFeature
  onRemove?: (id: string) => void
}

export function BodyFeatureRow({ feature, onRemove }: Props) {
  const Icon = feature.preference === 'hide' ? EyeOff : Sparkles
  const label = feature.preference === 'hide' ? 'Скрыть' : 'Подчеркнуть'

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex items-center gap-2 flex-1">
        <Icon size={14} className="text-zinc-400 shrink-0" />
        <span className="text-sm">{feature.area}</span>
        <span className="text-xs text-zinc-400">({label})</span>
        {feature.note && <span className="text-xs text-zinc-300 truncate">— {feature.note}</span>}
      </div>
      {onRemove && (
        <button onClick={() => onRemove(feature.id)} className="rounded-full p-1 hover:bg-zinc-100 transition-colors">
          <Trash2 size={14} className="text-zinc-400" />
        </button>
      )}
    </div>
  )
}
