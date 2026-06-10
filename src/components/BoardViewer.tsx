import { useEffect, useState } from 'react'
import { ArrowLeft, Download, Loader2, Pencil } from 'lucide-react'
import { useStore } from '../store'
import type { Board } from '../types'
import { OutfitPreview } from './OutfitCard'
import { boardColumns, renderOutfitBoardToPng } from '../lib/outfit-board'

interface Props {
  board: Board
  onClose: () => void
  onEdit: () => void
}

export function BoardViewer({ board, onClose, onEdit }: Props) {
  const { wardrobe, shopping, outfits } = useStore()
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Образы доски в исходном порядке; пропускаем удалённые.
  const boardOutfits = board.outfitIds
    .map((id) => outfits.find((o) => o.id === id))
    .filter((o): o is NonNullable<typeof o> => !!o)

  const cols = boardColumns(boardOutfits.length)
  const hasContent = boardOutfits.some((o) => (o.itemPositions ?? []).length > 0)

  async function handleDownload() {
    if (downloading || !boardOutfits.length) return
    setDownloading(true)
    try {
      const png = await renderOutfitBoardToPng({
        title: board.name,
        outfits: boardOutfits,
        wardrobe,
        shopping,
      })
      // Чистим имя файла от символов, ломающих download (слэши, двоеточия и т.п.).
      const safeName = (board.name || 'doska').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'doska'
      const a = document.createElement('a')
      a.href = png
      a.download = `${safeName}.png`
      a.click()
    } catch (e) {
      console.error('Не удалось собрать картинку доски:', e)
      alert('Не удалось сохранить картинку. Попробуйте ещё раз.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-zinc-100 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-base font-medium truncate px-2">{board.name}</h2>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="p-2 rounded-full hover:bg-zinc-100 transition-colors" title="Редактировать">
            <Pencil size={18} />
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading || !hasContent}
            className="bg-black text-white rounded-full p-2 transition-transform active:scale-95 disabled:opacity-30"
            title={hasContent ? 'Скачать картинкой' : 'Нет образов с фото'}
          >
            {downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {boardOutfits.length === 0 ? (
          <p className="text-center text-sm text-zinc-300 mt-16">В этой доске нет образов</p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {boardOutfits.map((o) => (
              <div key={o.id} className="rounded-xl overflow-hidden bg-zinc-50">
                <OutfitPreview outfit={o} wardrobeItems={wardrobe} shoppingItems={shopping} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
