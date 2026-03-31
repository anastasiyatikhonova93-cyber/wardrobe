import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Check, AlertCircle } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useStore } from '../store'
import type { ClothingItem, ClothingCategory, Season } from '../types'

interface SeedItem {
  file: string
  name: string
  category: ClothingCategory
  color: string
  seasons: Season[]
}

const ITEMS: SeedItem[] = [
  { file: "IMG_9106.jpg", name: "Чёрный узкий галстук", category: "accessories", color: "чёрный", seasons: ["spring", "summer", "autumn", "winter"] },
  { file: "IMG_9107.jpg", name: "Шёлковые платки с цветочным принтом", category: "accessories", color: "розово-голубой", seasons: ["spring", "summer", "autumn"] },
  { file: "IMG_9109.jpg", name: "Белый шёлковый платок", category: "accessories", color: "белый", seasons: ["spring", "summer", "autumn"] },
  { file: "IMG_9111.jpg", name: "Вязаная повязка на голову", category: "accessories", color: "молочный", seasons: ["spring", "summer"] },
  { file: "IMG_9115.jpg", name: "Кожаный тонкий ремень", category: "accessories", color: "чёрный", seasons: ["spring", "summer", "autumn", "winter"] },
  { file: "IMG_9116.jpg", name: "Ремень со змеиным принтом", category: "accessories", color: "бежево-чёрный", seasons: ["spring", "summer", "autumn", "winter"] },
  { file: "photo-2633_singular_display_fullPicture.jpg", name: "Бежевый корсет на косточках", category: "tops", color: "бежевый", seasons: ["spring", "summer"] },
  { file: "photo-2914_singular_display_fullPicture.jpg", name: "Чёрная оверсайз футболка с бахромой", category: "tops", color: "чёрный", seasons: ["spring", "summer", "autumn"] },
  { file: "photo-2958_singular_display_fullPicture.jpg", name: "Чёрный прозрачный корсет на шнуровке", category: "tops", color: "чёрный", seasons: ["spring", "summer"] },
  { file: "photo-2715_singular_display_fullPicture.jpg", name: "Белая рубашка оверсайз", category: "tops", color: "белый", seasons: ["spring", "summer", "autumn"] },
  { file: "photo-2786_singular_display_fullPicture.jpg", name: "Розовая рубашка оверсайз", category: "tops", color: "розовый", seasons: ["spring", "summer", "autumn"] },
  { file: "photo-2829_singular_display_fullPicture.jpg", name: "Голубая рубашка оверсайз", category: "tops", color: "голубой", seasons: ["spring", "summer", "autumn"] },
  { file: "photo-2871_singular_display_fullPicture.jpg", name: "Бежевая рубашка в полоску", category: "tops", color: "бежевый в белую полоску", seasons: ["spring", "summer", "autumn"] },
  { file: "photo-2908_singular_display_fullPicture.jpg", name: "Чёрный лонгслив с принтом леопарда", category: "tops", color: "чёрный", seasons: ["spring", "autumn", "winter"] },
  { file: "photo-2910_singular_display_fullPicture.jpg", name: "Бежевое худи оверсайз с принтом", category: "tops", color: "бежевый", seasons: ["spring", "autumn", "winter"] },
  { file: "photo-2919_singular_display_fullPicture.jpg", name: "Белый вязаный свитер в полоску", category: "knitwear", color: "белый в тёмно-синюю полоску", seasons: ["spring", "autumn", "winter"] },
  { file: "photo-2923_singular_display_fullPicture.jpg", name: "Полосатый лонгслив бретонский", category: "tops", color: "белый в чёрную полоску", seasons: ["spring", "autumn"] },
  { file: "photo-2926_singular_display_fullPicture.jpg", name: "Розовый вязаный джемпер", category: "knitwear", color: "ярко-розовый", seasons: ["spring", "autumn", "winter"] },
  { file: "photo-2967_singular_display_fullPicture.jpg", name: "Белый базовый лонгслив", category: "tops", color: "белый", seasons: ["spring", "autumn", "winter"] },
  { file: "photo-2970_singular_display_fullPicture.jpg", name: "Чёрный базовый лонгслив", category: "tops", color: "чёрный", seasons: ["spring", "autumn", "winter"] },
  { file: "photo-3046_singular_display_fullPicture.jpg", name: "Тёмно-серый лонгслив с воротником-стойкой", category: "tops", color: "тёмно-серый", seasons: ["autumn", "winter"] },
  { file: "photo-2709_singular_display_fullPicture.jpg", name: "Белая базовая футболка", category: "tops", color: "белый", seasons: ["spring", "summer"] },
  { file: "photo-2712_singular_display_fullPicture.jpg", name: "Белая футболка с принтом Микки Мауса", category: "tops", color: "белый", seasons: ["spring", "summer"] },
  { file: "photo-2952_singular_display_fullPicture.jpg", name: "Чёрный топ-бюстье с баской", category: "tops", color: "чёрный", seasons: ["spring", "summer"] },
  { file: "photo-2976_singular_display_fullPicture.jpg", name: "Оверсайз футболка хаки с логотипом", category: "tops", color: "хаки", seasons: ["spring", "summer", "autumn"] },
  { file: "photo-2982_singular_display_fullPicture.jpg", name: "Жёлтый кардиган с коротким рукавом", category: "tops", color: "жёлтый", seasons: ["spring", "summer"] },
  { file: "photo-3042_singular_display_fullPicture.jpg", name: "Белый кроп-топ бралетт", category: "tops", color: "белый", seasons: ["summer"] },
  { file: "photo-3049_singular_display_fullPicture.jpg", name: "Белая майка на тонких бретелях", category: "tops", color: "белый", seasons: ["spring", "summer"] },
  { file: "photo-3052_singular_display_fullPicture.jpg", name: "Белая майка-борцовка", category: "tops", color: "белый", seasons: ["spring", "summer"] },
  { file: "photo-3054_singular_display_fullPicture.jpg", name: "Серый кроп-топ борцовка", category: "tops", color: "серый меланж", seasons: ["spring", "summer"] },
  { file: "photo-3058_singular_display_fullPicture.jpg", name: "Ярко-розовый кроп-топ перекрёстный", category: "tops", color: "ярко-розовый", seasons: ["summer"] },
  { file: "photo-3060_singular_display_fullPicture.jpg", name: "Ярко-розовая майка-борцовка в рубчик", category: "tops", color: "ярко-розовый", seasons: ["spring", "summer"] },
  { file: "photo-3063_singular_display_fullPicture.jpg", name: "Белый укороченный топ-борцовка", category: "tops", color: "белый", seasons: ["spring", "summer"] },
  { file: "photo-3095_singular_display_fullPicture.jpg", name: "Бежевый тренч классический", category: "outerwear", color: "бежевый", seasons: ["spring", "autumn"] },
  { file: "photo-3098_singular_display_fullPicture.jpg", name: "Бежевая стёганая куртка с поясом", category: "outerwear", color: "бежевый", seasons: ["spring", "autumn"] },
  { file: "photo-3104_singular_display_fullPicture.jpg", name: "Короткий дутый пуховик с капюшоном", category: "outerwear", color: "тёмно-бежевый", seasons: ["autumn", "winter"] },
  { file: "IMG_9105.jpg", name: "Голубые джинсы прямого кроя", category: "bottoms", color: "голубой", seasons: ["spring", "summer", "autumn"] },
  { file: "photo-2636_singular_display_fullPicture.jpg", name: "Чёрная джинсовая мини-юбка", category: "bottoms", color: "чёрный", seasons: ["spring", "summer", "autumn"] },
  { file: "photo-2667_singular_display_fullPicture.jpg", name: "Красная юбка миди в клетку виши", category: "bottoms", color: "красно-белый", seasons: ["spring", "summer"] },
  { file: "photo-2676_singular_display_fullPicture.jpg", name: "Тёмно-синие джинсы широкого кроя", category: "bottoms", color: "тёмно-синий", seasons: ["spring", "summer", "autumn", "winter"] },
  { file: "photo-2688_singular_display_fullPicture.jpg", name: "Серые спортивные джоггеры", category: "bottoms", color: "серый меланж", seasons: ["spring", "autumn", "winter"] },
  { file: "photo-2928_singular_display_fullPicture.jpg", name: "Белая мини-юбка с воланом", category: "bottoms", color: "белый", seasons: ["spring", "summer"] },
  { file: "photo-2932_singular_display_fullPicture.jpg", name: "Джинсовые шорты светло-голубые", category: "bottoms", color: "голубой", seasons: ["summer"] },
  { file: "photo-2935_singular_display_fullPicture.jpg", name: "Льняные бежевые шорты", category: "bottoms", color: "бежевый", seasons: ["summer"] },
  { file: "photo-2940_singular_display_fullPicture.jpg", name: "Белые джинсовые шорты", category: "bottoms", color: "белый", seasons: ["summer"] },
  { file: "photo-2943_singular_display_fullPicture.jpg", name: "Белые льняные брюки-кюлоты", category: "bottoms", color: "белый", seasons: ["spring", "summer"] },
  { file: "photo-2946_singular_display_fullPicture.jpg", name: "Белая лёгкая мини-юбка", category: "bottoms", color: "белый", seasons: ["spring", "summer"] },
  { file: "photo-2949_singular_display_fullPicture.jpg", name: "Розовые лёгкие шорты на завязках", category: "bottoms", color: "пудрово-розовый", seasons: ["summer"] },
  { file: "photo-2961_singular_display_fullPicture.jpg", name: "Светлые трикотажные широкие брюки", category: "bottoms", color: "светло-серый меланж", seasons: ["spring", "summer", "autumn"] },
  { file: "photo-2979_singular_display_fullPicture.jpg", name: "Мятные спортивные шорты", category: "bottoms", color: "мятный", seasons: ["summer"] },
  { file: "IMG_9081.jpg", name: "Кроссовки New Balance", category: "shoes", color: "бежево-серый", seasons: ["spring", "summer", "autumn"] },
  { file: "IMG_9082.jpg", name: "Клоги Birkenstock Boston замшевые", category: "shoes", color: "бежевый", seasons: ["spring", "summer", "autumn"] },
  { file: "IMG_9086.jpg", name: "Замшевые лоферы на платформе", category: "shoes", color: "бежевый", seasons: ["spring", "summer", "autumn"] },
  { file: "IMG_9095.jpg", name: "Чёрные босоножки на платформе Rio Fiore", category: "shoes", color: "чёрный", seasons: ["spring", "summer"] },
  { file: "IMG_9096.jpg", name: "Шлёпанцы Birkenstock с двумя ремешками", category: "shoes", color: "тёмно-зелёный", seasons: ["summer"] },
  { file: "IMG_9097.jpg", name: "Коричневые кожаные сандалии на ремешках", category: "shoes", color: "коричневый", seasons: ["spring", "summer"] },
  { file: "IMG_9101.jpg", name: "Белые Crocs с джибитсами", category: "shoes", color: "белый", seasons: ["spring", "summer"] },
  { file: "IMG_9102.jpg", name: "Чёрные кроссовки Adidas", category: "shoes", color: "чёрный", seasons: ["spring", "summer", "autumn", "winter"] },
  // Сумки
  { file: "IMG_9089.jpg", name: "Чёрный кожаный рюкзак Michael Kors с цепочкой", category: "bags", color: "чёрный", seasons: ["spring", "summer", "autumn", "winter"] },
  { file: "IMG_9090.jpg", name: "Розовая мини-сумка The Tote Bag Marc Jacobs", category: "bags", color: "ярко-розовый", seasons: ["spring", "summer"] },
  { file: "IMG_9091.jpg", name: "Голубая кожаная сумка кросс-боди Furla", category: "bags", color: "голубой", seasons: ["spring", "summer"] },
  { file: "IMG_9092.jpg", name: "Розово-белая полосатая сумка кросс-боди", category: "bags", color: "розово-белый", seasons: ["spring", "summer"] },
  { file: "IMG_9093.jpg", name: "Большая сумка-тоут с леопардовым принтом", category: "bags", color: "бежево-коричневый", seasons: ["spring", "summer", "autumn"] },
  { file: "IMG_9103.jpg", name: "Чёрная сумка кросс-боди Marc Jacobs Snapshot", category: "bags", color: "чёрный", seasons: ["spring", "summer", "autumn", "winter"] },
  // Платья
  { file: "photo-2964_singular_display_fullPicture.jpg", name: "Чёрное платье-кимоно с V-вырезом", category: "dresses", color: "чёрный", seasons: ["spring", "summer", "autumn"] },
  { file: "photo-2973_singular_display_fullPicture.jpg", name: "Голубое платье-комбинация на бретелях", category: "dresses", color: "голубой", seasons: ["spring", "summer"] },
]

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Try processed PNG first, fall back to original JPG */
async function loadBestImg(file: string): Promise<HTMLImageElement> {
  const pngFile = file.replace('.jpg', '.png')
  try {
    return await loadImg(`/seed-processed/${pngFile}`)
  } catch {
    return await loadImg(`/seed/${file}`)
  }
}

/** Compress with white background (for transparent PNGs) */
function compressWithWhiteBg(img: HTMLImageElement, maxDim = 800, quality = 0.7): string {
  let { width, height } = img
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

export function SeedPage() {
  const { user } = useAuth()
  const { addClothingBatch, clearWardrobe, wardrobe } = useStore()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'idle' | 'running' | 'done'>('idle')
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [results, setResults] = useState<Omit<ClothingItem, 'id'>[]>([])

  const existingNames = new Set(wardrobe.map((w) => w.name))
  const newItems = ITEMS.filter((item) => !existingNames.has(item.name))

  async function seedItems(items: SeedItem[]) {
    setStatus('running')
    setTotal(items.length)
    setProgress(0)
    setErrors([])

    const uploaded: Omit<ClothingItem, 'id'>[] = []
    const errs: string[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      try {
        const img = await loadBestImg(item.file)
        const imageUrl = compressWithWhiteBg(img)

        uploaded.push({
          name: item.name,
          category: item.category,
          color: item.color,
          seasons: item.seasons,
          imageUrl,
        })
      } catch (e) {
        errs.push(`${item.name}: ${e instanceof Error ? e.message : 'Ошибка'}`)
      }
      setProgress(i + 1)
    }

    if (uploaded.length > 0) {
      await addClothingBatch(uploaded)
    }

    setResults(uploaded)
    setErrors(errs)
    setStatus('done')
  }

  async function runNew() {
    if (!user || newItems.length === 0) return
    await seedItems(newItems)
  }

  async function runReset() {
    if (!user) return
    await clearWardrobe()
    await seedItems(ITEMS)
  }

  return (
    <div className="max-w-md mx-auto py-10 px-4">
      <h1 className="text-xl font-semibold mb-4">Загрузка гардероба</h1>
      <p className="text-sm text-zinc-500 mb-6">
        {wardrobe.length > 0
          ? `В гардеробе ${wardrobe.length} вещей` + (newItems.length > 0 ? `, ${newItems.length} новых можно добавить` : '')
          : `${ITEMS.length} вещей будут загружены`}
      </p>

      {status === 'idle' && (
        <div className="space-y-3">
          {newItems.length > 0 && (
            <button
              onClick={runNew}
              disabled={!user}
              className="w-full py-3 rounded-full bg-black text-white text-sm font-medium"
            >
              Догрузить {newItems.length} вещей
            </button>
          )}
          {wardrobe.length > 0 && (
            <button
              onClick={runReset}
              disabled={!user}
              className="w-full py-3 rounded-full border border-zinc-300 text-zinc-700 text-sm font-medium"
            >
              Перезагрузить всё ({ITEMS.length} вещей с обработкой фото)
            </button>
          )}
          {wardrobe.length === 0 && (
            <button
              onClick={runReset}
              disabled={!user}
              className="w-full py-3 rounded-full bg-black text-white text-sm font-medium"
            >
              Загрузить {ITEMS.length} вещей
            </button>
          )}
        </div>
      )}

      {status === 'running' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin text-zinc-400" />
            <span className="text-sm text-zinc-600">
              {progress} / {total}
            </span>
          </div>
          <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-black rounded-full transition-all"
              style={{ width: `${(progress / total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-600">
            <Check size={18} />
            <span className="text-sm font-medium">
              Загружено {results.length} вещей
            </span>
          </div>

          {errors.length > 0 && (
            <div className="p-3 rounded-xl bg-red-50 text-xs text-red-600 space-y-1">
              <div className="flex items-center gap-1 font-medium">
                <AlertCircle size={12} />
                Ошибки ({errors.length}):
              </div>
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}

          <button
            onClick={() => navigate('/')}
            className="w-full py-3 rounded-full bg-black text-white text-sm font-medium"
          >
            Перейти в гардероб
          </button>
        </div>
      )}
    </div>
  )
}
