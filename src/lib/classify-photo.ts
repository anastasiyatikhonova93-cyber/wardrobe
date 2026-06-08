import type { ClothingCategory, Season } from '../types'
import { inferItemDetails } from '../ai'

const LLM_BASE_URL = 'https://api.llm7.io/v1'
const LLM_API_KEY = import.meta.env.VITE_LLM_API_KEY || 'unused'
const LLM_MODEL = 'default'

export interface ClassificationResult {
  name: string
  category: ClothingCategory
  color: string
  seasons: Season[]
  confidence: 'vision' | 'filename' | 'default'
}

/**
 * Уменьшает фото до компактного JPEG перед отправкой на распознавание.
 * Полное разрешение для классификации не нужно, а у serverless-функции Vercel
 * лимит тела запроса ~4.5 МБ — оригинал с телефона его легко превышает.
 */
function fileToCompactDataUrl(file: File, maxDim = 1024, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width
        let height = img.naturalHeight || img.height
        if (width > maxDim || height > maxDim) {
          const r = Math.min(maxDim / width, maxDim / height)
          width = Math.round(width * r)
          height = Math.round(height * r)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#ffffff' // подложка на случай прозрачности
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch (e) {
        reject(e instanceof Error ? e : new Error('encode failed'))
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to read file'))
    }
    img.src = url
  })
}

function cleanFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const VALID_CATEGORIES: ClothingCategory[] = [
  'tops', 'bottoms', 'dresses', 'outerwear', 'knitwear', 'shoes', 'bags', 'accessories',
]
const VALID_SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']

function validateCategory(cat: string): ClothingCategory {
  return VALID_CATEGORIES.includes(cat as ClothingCategory)
    ? (cat as ClothingCategory)
    : 'tops'
}

function validateSeasons(seasons: unknown): Season[] {
  if (!Array.isArray(seasons)) return []
  return seasons.filter((s) => VALID_SEASONS.includes(s as Season)) as Season[]
}

const VISION_PROMPT = `Определи предмет одежды на фото.

Ответь ТОЛЬКО JSON:
{
  "name": "краткое название на русском (например: Белая рубашка оверсайз)",
  "category": "одна из: tops, bottoms, dresses, outerwear, knitwear, shoes, bags, accessories",
  "color": "цвет на русском одним-двумя словами",
  "seasons": ["подходящие сезоны из: spring, summer, autumn, winter"]
}`

async function requestVision(
  imageUrl: string,
  fallbackName: string,
): Promise<ClassificationResult | null> {
  try {
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Ты стилист-эксперт. Определи предмет одежды на фото. Отвечай только валидным JSON.',
          },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageUrl } },
              { type: 'text', text: VISION_PROMPT },
            ],
          },
        ],
        temperature: 0.2,
      }),
    })

    if (!res.ok) return null

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string') return null

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    return {
      name: parsed.name ?? fallbackName,
      category: validateCategory(parsed.category),
      color: parsed.color ?? '',
      seasons: validateSeasons(parsed.seasons),
      confidence: 'vision',
    }
  } catch {
    return null
  }
}

/**
 * Распознавание через нашу serverless-функцию /api/classify (Gemini vision,
 * бесплатный тариф, ключ на сервере). Самый надёжный путь; если ключ не задан
 * или функция недоступна — вернёт null, и сработают запасные варианты.
 */
async function classifyViaServer(
  payload: { image?: string; imageUrl?: string },
  fallbackName: string,
): Promise<ClassificationResult | null> {
  try {
    const res = await fetch('/api/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return null
    const parsed = await res.json()
    if (!parsed || typeof parsed !== 'object' || 'error' in parsed) return null
    return {
      name: typeof parsed.name === 'string' && parsed.name ? parsed.name : fallbackName,
      category: validateCategory(parsed.category),
      color: typeof parsed.color === 'string' ? parsed.color : '',
      seasons: validateSeasons(parsed.seasons),
      confidence: 'vision',
    }
  } catch {
    return null
  }
}

// Имена с камеры (IMG_0452, DSC0001, screenshot…) — не название вещи.
function isCameraFilename(name: string): boolean {
  return /^(img|dsc|dscf|photo|image|screenshot|снимок|untitled)[\s_-]?\d*$/i.test(name.trim())
}

/**
 * Распознаёт вещь по ссылке на изображение. Сначала Gemini (сервер сам тянет
 * картинку — CORS не мешает), затем llm7, иначе пустой результат.
 */
export async function classifyImageUrl(url: string): Promise<ClassificationResult> {
  const viaServer = await classifyViaServer({ imageUrl: url }, '')
  if (viaServer) return viaServer
  const viaLlm = await requestVision(url, '')
  return viaLlm ?? { name: '', category: 'tops', color: '', seasons: [], confidence: 'default' }
}

async function classifyWithFilename(filename: string): Promise<ClassificationResult> {
  const cleanName = cleanFilename(filename)
  if (isCameraFilename(cleanName)) {
    // Имя-заглушка — лучше оставить пустым, чем подставлять «IMG 0452».
    return { name: '', category: 'tops', color: '', seasons: [], confidence: 'default' }
  }
  try {
    const { category, seasons } = await inferItemDetails(cleanName)
    return {
      name: cleanName,
      category: validateCategory(category),
      color: '',
      seasons: validateSeasons(seasons),
      confidence: 'filename',
    }
  } catch {
    return { name: cleanName, category: 'tops', color: '', seasons: [], confidence: 'default' }
  }
}

export async function classifyPhoto(
  file: File,
  filename?: string,
): Promise<ClassificationResult> {
  let base64: string | null = null
  try {
    base64 = await fileToCompactDataUrl(file)
  } catch {
    base64 = null
  }

  if (base64) {
    const viaServer = await classifyViaServer({ image: base64 }, cleanFilename(file.name))
    if (viaServer) return viaServer
    const viaLlm = await requestVision(base64, cleanFilename(file.name))
    if (viaLlm) return viaLlm
  }

  return classifyWithFilename(filename ?? file.name)
}
