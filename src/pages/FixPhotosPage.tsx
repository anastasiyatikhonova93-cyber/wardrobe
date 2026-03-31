import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Check, AlertCircle } from 'lucide-react'
import { useStore } from '../store'

/** Map wardrobe item name → seed file name */
const NAME_TO_FILE: Record<string, string> = {
  "Чёрный узкий галстук": "IMG_9106.jpg",
  "Шёлковые платки с цветочным принтом": "IMG_9107.jpg",
  "Белый шёлковый платок": "IMG_9109.jpg",
  "Вязаная повязка на голову": "IMG_9111.jpg",
  "Кожаный тонкий ремень": "IMG_9115.jpg",
  "Ремень со змеиным принтом": "IMG_9116.jpg",
  "Бежевый корсет на косточках": "photo-2633_singular_display_fullPicture.jpg",
  "Чёрная оверсайз футболка с бахромой": "photo-2914_singular_display_fullPicture.jpg",
  "Чёрный прозрачный корсет на шнуровке": "photo-2958_singular_display_fullPicture.jpg",
  "Белая рубашка оверсайз": "photo-2715_singular_display_fullPicture.jpg",
  "Розовая рубашка оверсайз": "photo-2786_singular_display_fullPicture.jpg",
  "Голубая рубашка оверсайз": "photo-2829_singular_display_fullPicture.jpg",
  "Бежевая рубашка в полоску": "photo-2871_singular_display_fullPicture.jpg",
  "Чёрный лонгслив с принтом леопарда": "photo-2908_singular_display_fullPicture.jpg",
  "Бежевое худи оверсайз с принтом": "photo-2910_singular_display_fullPicture.jpg",
  "Белый вязаный свитер в полоску": "photo-2919_singular_display_fullPicture.jpg",
  "Полосатый лонгслив бретонский": "photo-2923_singular_display_fullPicture.jpg",
  "Розовый вязаный джемпер": "photo-2926_singular_display_fullPicture.jpg",
  "Белый базовый лонгслив": "photo-2967_singular_display_fullPicture.jpg",
  "Чёрный базовый лонгслив": "photo-2970_singular_display_fullPicture.jpg",
  "Тёмно-серый лонгслив с воротником-стойкой": "photo-3046_singular_display_fullPicture.jpg",
  "Белая базовая футболка": "photo-2709_singular_display_fullPicture.jpg",
  "Белая футболка с принтом Микки Мауса": "photo-2712_singular_display_fullPicture.jpg",
  "Чёрный топ-бюстье с баской": "photo-2952_singular_display_fullPicture.jpg",
  "Оверсайз футболка хаки с логотипом": "photo-2976_singular_display_fullPicture.jpg",
  "Жёлтый кардиган с коротким рукавом": "photo-2982_singular_display_fullPicture.jpg",
  "Белый кроп-топ бралетт": "photo-3042_singular_display_fullPicture.jpg",
  "Белая майка на тонких бретелях": "photo-3049_singular_display_fullPicture.jpg",
  "Белая майка-борцовка": "photo-3052_singular_display_fullPicture.jpg",
  "Серый кроп-топ борцовка": "photo-3054_singular_display_fullPicture.jpg",
  "Ярко-розовый кроп-топ перекрёстный": "photo-3058_singular_display_fullPicture.jpg",
  "Ярко-розовая майка-борцовка в рубчик": "photo-3060_singular_display_fullPicture.jpg",
  "Белый укороченный топ-борцовка": "photo-3063_singular_display_fullPicture.jpg",
  "Бежевый тренч классический": "photo-3095_singular_display_fullPicture.jpg",
  "Бежевая стёганая куртка с поясом": "photo-3098_singular_display_fullPicture.jpg",
  "Короткий дутый пуховик с капюшоном": "photo-3104_singular_display_fullPicture.jpg",
  "Голубые джинсы прямого кроя": "IMG_9105.jpg",
  "Чёрная джинсовая мини-юбка": "photo-2636_singular_display_fullPicture.jpg",
  "Красная юбка миди в клетку виши": "photo-2667_singular_display_fullPicture.jpg",
  "Тёмно-синие джинсы широкого кроя": "photo-2676_singular_display_fullPicture.jpg",
  "Серые спортивные джоггеры": "photo-2688_singular_display_fullPicture.jpg",
  "Белая мини-юбка с воланом": "photo-2928_singular_display_fullPicture.jpg",
  "Джинсовые шорты светло-голубые": "photo-2932_singular_display_fullPicture.jpg",
  "Льняные бежевые шорты": "photo-2935_singular_display_fullPicture.jpg",
  "Белые джинсовые шорты": "photo-2940_singular_display_fullPicture.jpg",
  "Белые льняные брюки-кюлоты": "photo-2943_singular_display_fullPicture.jpg",
  "Белая лёгкая мини-юбка": "photo-2946_singular_display_fullPicture.jpg",
  "Розовые лёгкие шорты на завязках": "photo-2949_singular_display_fullPicture.jpg",
  "Светлые трикотажные широкие брюки": "photo-2961_singular_display_fullPicture.jpg",
  "Мятные спортивные шорты": "photo-2979_singular_display_fullPicture.jpg",
  "Кроссовки New Balance": "IMG_9081.jpg",
  "Клоги Birkenstock Boston замшевые": "IMG_9082.jpg",
  "Замшевые лоферы на платформе": "IMG_9086.jpg",
  "Чёрные босоножки на платформе Rio Fiore": "IMG_9095.jpg",
  "Шлёпанцы Birkenstock с двумя ремешками": "IMG_9096.jpg",
  "Коричневые кожаные сандалии на ремешках": "IMG_9097.jpg",
  "Белые Crocs с джибитсами": "IMG_9101.jpg",
  "Чёрные кроссовки Adidas": "IMG_9102.jpg",
  "Чёрный кожаный рюкзак Michael Kors с цепочкой": "IMG_9089.jpg",
  "Розовая мини-сумка The Tote Bag Marc Jacobs": "IMG_9090.jpg",
  "Голубая кожаная сумка кросс-боди Furla": "IMG_9091.jpg",
  "Розово-белая полосатая сумка кросс-боди": "IMG_9092.jpg",
  "Большая сумка-тоут с леопардовым принтом": "IMG_9093.jpg",
  "Чёрная сумка кросс-боди Marc Jacobs Snapshot": "IMG_9103.jpg",
  "Чёрное платье-кимоно с V-вырезом": "photo-2964_singular_display_fullPicture.jpg",
  "Голубое платье-комбинация на бретелях": "photo-2973_singular_display_fullPicture.jpg",
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function loadProcessedImg(file: string): Promise<HTMLImageElement | null> {
  const pngFile = file.replace('.jpg', '.png')
  try {
    return await loadImg(`/seed-processed/${pngFile}`)
  } catch {
    return null
  }
}

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

export function FixPhotosPage() {
  const { wardrobe, updateClothing } = useStore()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'running' | 'done'>('running')
  const [progress, setProgress] = useState(0)
  const [updated, setUpdated] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const started = useRef(false)

  const total = wardrobe.length

  useEffect(() => {
    if (started.current || wardrobe.length === 0) return
    started.current = true

    async function fixAll() {
      let upd = 0
      let skip = 0
      const errs: string[] = []

      for (let i = 0; i < wardrobe.length; i++) {
        const item = wardrobe[i]
        const file = NAME_TO_FILE[item.name]

        if (!file) {
          skip++
          setProgress(i + 1)
          setSkipped(skip)
          continue
        }

        try {
          const img = await loadProcessedImg(file)
          if (!img) {
            skip++
            setSkipped(skip)
            setProgress(i + 1)
            continue
          }

          const newUrl = compressWithWhiteBg(img)
          await updateClothing(item.id, { imageUrl: newUrl })
          upd++
          setUpdated(upd)
        } catch (e) {
          errs.push(`${item.name}: ${e instanceof Error ? e.message : 'Ошибка'}`)
          setErrors([...errs])
        }

        setProgress(i + 1)
      }

      setStatus('done')
    }

    fixAll()
  }, [wardrobe, updateClothing])

  return (
    <div className="max-w-md mx-auto py-10 px-4">
      <h1 className="text-xl font-semibold mb-4">Коррекция всех фото</h1>

      {status === 'running' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin text-zinc-400" />
            <span className="text-sm text-zinc-600">
              {progress} / {total} — обновлено {updated}, пропущено {skipped}
            </span>
          </div>
          <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-black rounded-full transition-all"
              style={{ width: `${total ? (progress / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-600">
            <Check size={18} />
            <span className="text-sm font-medium">
              Обновлено {updated} из {total} (пропущено {skipped})
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
