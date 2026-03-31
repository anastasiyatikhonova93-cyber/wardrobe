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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
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

async function classifyWithVision(file: File): Promise<ClassificationResult | null> {
  try {
    const base64 = await fileToBase64(file)

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
              {
                type: 'image_url',
                image_url: { url: base64 },
              },
              {
                type: 'text',
                text: `Определи предмет одежды на фото.

Ответь ТОЛЬКО JSON:
{
  "name": "краткое название на русском (например: Белая рубашка оверсайз)",
  "category": "одна из: tops, bottoms, dresses, outerwear, knitwear, shoes, bags, accessories",
  "color": "цвет на русском одним-двумя словами",
  "seasons": ["подходящие сезоны из: spring, summer, autumn, winter"]
}`,
              },
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
      name: parsed.name ?? cleanFilename(file.name),
      category: validateCategory(parsed.category),
      color: parsed.color ?? '',
      seasons: validateSeasons(parsed.seasons),
      confidence: 'vision',
    }
  } catch {
    return null
  }
}

async function classifyWithFilename(filename: string): Promise<ClassificationResult> {
  const cleanName = cleanFilename(filename)
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
    return {
      name: cleanName,
      category: 'tops',
      color: '',
      seasons: [],
      confidence: 'default',
    }
  }
}

export async function classifyPhoto(
  file: File,
  filename?: string,
): Promise<ClassificationResult> {
  const visionResult = await classifyWithVision(file)
  if (visionResult) return visionResult
  return classifyWithFilename(filename ?? file.name)
}
