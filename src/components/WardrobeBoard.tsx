import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
import type { ClothingItem } from '../types'
import {
  prepareItem,
  computeBoardLayout,
  renderBoardToPng,
  type BoardLayout,
} from '../lib/board-layout'

interface Props {
  wardrobe: ClothingItem[]
  onClose: () => void
}

export function WardrobeBoard({ wardrobe, onClose }: Props) {
  const [layout, setLayout] = useState<BoardLayout | null>(null)
  const [ready, setReady] = useState(0) // сколько вещей подготовлено
  const [downloading, setDownloading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  // Блокируем прокрутку фона, пока открыта доска.
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Готовим картинки и считаем раскладку.
  useEffect(() => {
    let cancelled = false
    setReady(0)
    ;(async () => {
      const prepared = []
      for (const item of wardrobe) {
        const p = await prepareItem(item)
        if (cancelled) return
        prepared.push(p)
        setReady((n) => n + 1)
      }
      if (cancelled) return
      setLayout(computeBoardLayout(prepared))
    })()
    return () => { cancelled = true }
  }, [wardrobe])

  // Масштаб под ширину экрана.
  useEffect(() => {
    if (!layout) return
    const update = () => {
      const avail = scrollRef.current?.clientWidth ?? window.innerWidth
      setScale(Math.min(1, avail / layout.width))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [layout])

  async function handleDownload() {
    if (!layout) return
    setDownloading(true)
    try {
      const png = await renderBoardToPng(layout)
      const a = document.createElement('a')
      a.href = png
      a.download = 'gardrob-doska.png'
      a.click()
    } catch (e) {
      console.error('Не удалось собрать картинку доски:', e)
      alert('Не удалось сохранить картинку. Попробуйте ещё раз.')
    } finally {
      setDownloading(false)
    }
  }

  const total = wardrobe.length
  const preparing = !layout
  const hasPhotos = !!layout?.placed.some((p) => p.url)

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Верхняя панель */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-zinc-100 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-base font-medium">Доска гардероба</h2>
        <button
          onClick={handleDownload}
          disabled={preparing || downloading || !hasPhotos}
          className="bg-black text-white rounded-full p-2 transition-transform active:scale-95 disabled:opacity-30"
          title={hasPhotos ? 'Скачать картинкой' : 'Нет фото для скачивания'}
        >
          {downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
        </button>
      </div>

      {/* Доска */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-white">
        {preparing ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-400">
            <Loader2 size={24} className="animate-spin" />
            <p className="text-sm">
              Собираем доску… {total > 0 && `${ready} / ${total}`}
            </p>
          </div>
        ) : layout.placed.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-zinc-300">В гардеробе пока нет вещей</p>
          </div>
        ) : (
          <div
            className="relative mx-auto"
            style={{ width: layout.width * scale, height: layout.height * scale }}
          >
            {layout.placed.map((p) => {
              const box = {
                left: p.x * scale,
                top: p.y * scale,
                width: p.w * scale,
                height: p.h * scale,
              }
              return p.url ? (
                <img
                  key={p.item.id}
                  src={p.url}
                  alt={p.item.name}
                  className="absolute object-contain"
                  style={box}
                  draggable={false}
                />
              ) : (
                <div
                  key={p.item.id}
                  className="absolute flex items-center justify-center rounded-xl bg-zinc-100 text-zinc-300 text-2xl font-light"
                  style={box}
                >
                  {(p.item.name ?? '?')[0]}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
