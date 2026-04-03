import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { ArrowLeft, ExternalLink } from 'lucide-react'

export function SharedWardrobesPage() {
  const { sharedWardrobes, viewSharedWardrobe, isSharedView, viewOwnWardrobe } = useStore()
  const navigate = useNavigate()

  function openWardrobe(ownerUid: string, ownerName: string) {
    viewSharedWardrobe(ownerUid, ownerName)
    navigate('/')
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/profile')} className="rounded-full p-2 hover:bg-zinc-100 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-semibold">Общие гардеробы</h1>
      </div>

      {isSharedView && (
        <button
          onClick={() => { viewOwnWardrobe(); navigate('/') }}
          className="w-full mb-4 py-3 rounded-2xl bg-zinc-50 text-sm text-zinc-600 hover:bg-zinc-100 transition-colors"
        >
          Вернуться к своему гардеробу
        </button>
      )}

      {sharedWardrobes.length === 0 ? (
        <p className="text-center text-sm text-zinc-300 mt-20">
          У вас пока нет доступа к чужим гардеробам
        </p>
      ) : (
        <div className="space-y-2">
          {sharedWardrobes.map((sw) => (
            <button
              key={sw.ownerUid}
              onClick={() => openWardrobe(sw.ownerUid, sw.ownerName)}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-zinc-50 hover:bg-zinc-100 transition-colors"
            >
              <span className="text-sm font-medium">{sw.ownerName || 'Пользователь'}</span>
              <ExternalLink size={16} className="text-zinc-400" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
