let bgRemovalModule: typeof import('@imgly/background-removal') | null = null

async function loadModule() {
  if (!bgRemovalModule) {
    bgRemovalModule = await import('@imgly/background-removal')
  }
  return bgRemovalModule
}

export async function preloadModel(): Promise<void> {
  await loadModule()
}

const MAX_INPUT_DIM = 1280

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Не удалось загрузить изображение'))
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // JPEG, а не PNG: вход в модель — всегда непрозрачное фото (оригинал с камеры
    // либо непрозрачный результат Gemini), альфа тут не нужна. На мобильных, ради
    // которых правка и делалась, JPEG кодируется легче и быстрее, а на маску
    // вырезания фона едва заметные артефакты не влияют.
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Не удалось сформировать изображение'))),
      'image/jpeg',
      0.9,
    )
  })
}

/**
 * Уменьшает фото до MAX_INPUT_DIM перед тяжёлой моделью вырезания фона. Оригинал
 * с телефона (≈12 Мп) раздувает память браузера, и на мобильном при массовой
 * загрузке вырезание начинает валиться каскадом. Итоговое качество это не трогает:
 * при сохранении фото и так ужимается до 800px (см. storage.ts), а 1280px — лишь
 * промежуточный размер для модели. Если фото уже в пределах — отдаём как есть.
 */
async function downscaleForModel(source: File | Blob): Promise<File | Blob> {
  const url = URL.createObjectURL(source)
  try {
    const img = await loadImage(url)
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    if (w <= MAX_INPUT_DIM && h <= MAX_INPUT_DIM) return source
    const r = Math.min(MAX_INPUT_DIM / w, MAX_INPUT_DIM / h)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * r)
    canvas.height = Math.round(h * r)
    const ctx = canvas.getContext('2d')!
    // Белая подложка под JPEG — на случай прозрачного входа фон не станет чёрным.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await canvasToBlob(canvas)
  } catch {
    // Не смогли уменьшить (битый файл и т.п.) — пусть модель попробует оригинал.
    return source
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Тяжёлую модель гоняем строго по одному вызову за раз: при массовой загрузке два
// параллельных вырезания фона на мобильном переполняют память и роняют всё
// каскадом. Конвейер импорта при этом остаётся параллельным (concurrency в
// importStore не трогаем) — сериализуется только сам ресурсоёмкий шаг.
let gate: Promise<unknown> = Promise.resolve()
function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const result = gate.then(fn, fn)
  gate = result.catch(() => {})
  return result
}

export async function removeBackground(source: File | Blob): Promise<Blob> {
  const mod = await loadModule()
  return runExclusive(async () => {
    const input = await downscaleForModel(source)
    return mod.removeBackground(input, {
      output: { format: 'image/png' },
    })
  })
}
