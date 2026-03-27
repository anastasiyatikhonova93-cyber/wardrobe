import type {
  ClothingItem,
  ShoppingItem,
  Outfit,
  Profile,
  Season,
} from './types'
import { CATEGORY_LABELS, SEASON_LABELS, BODY_TYPE_LABELS } from './types'

const LLM_BASE_URL = 'https://api.llm7.io/v1'
const LLM_API_KEY = import.meta.env.VITE_LLM_API_KEY || 'unused'
const LLM_MODEL = 'default'

function describeItem(item: ClothingItem | ShoppingItem): string {
  const seasons = (item.seasons ?? []).map((s) => SEASON_LABELS[s]).join(', ')
  return `${item.name ?? '?'} (${CATEGORY_LABELS[item.category] ?? item.category}, ${item.color}, ${seasons})`
}

function buildProfileContext(profile: Profile): string {
  const lines: string[] = []
  if (profile.bodyType)
    lines.push(`Тип фигуры: ${BODY_TYPE_LABELS[profile.bodyType]}`)
  if (profile.height) lines.push(`Рост: ${profile.height} см`)
  for (const f of profile.features) {
    const verb = f.preference === 'hide' ? 'Скрыть' : 'Подчеркнуть'
    lines.push(`${verb}: ${f.area}${f.note ? ` (${f.note})` : ''}`)
  }
  if (profile.preferredStyles.length)
    lines.push(`Предпочитаемые стили: ${profile.preferredStyles.join(', ')}`)
  return lines.join('\n')
}

function buildPrompt(
  wardrobe: ClothingItem[],
  shopping: ShoppingItem[],
  profile: Profile,
  targetSeason?: Season
): string {
  const wardrobeList = wardrobe.map((i) => `- ${describeItem(i)}`).join('\n')
  const shoppingList = shopping
    .filter((i) => i.isConfirmed || !i.isAiSuggested)
    .map((i) => `- ${describeItem(i)}`)
    .join('\n')
  const profileCtx = buildProfileContext(profile)
  const seasonNote = targetSeason
    ? `\nЦелевой сезон: ${SEASON_LABELS[targetSeason]}`
    : ''

  return `Ты — стилист-консультант. Проанализируй гардероб и список покупок.
${profileCtx}${seasonNote}

Имеющийся гардероб:
${wardrobeList || '(пусто)'}

Планируемые покупки:
${shoppingList || '(пусто)'}

Задачи:
1. Предложи 3-5 вещей для докупки, чтобы каждая максимально сочеталась с имеющимися. Учитывай особенности фигуры.
2. Для каждой укажи: название, категорию (tops/bottoms/dresses/outerwear/knitwear/shoes/bags/accessories), цвет, сезоны, обоснование.
3. Составь 5-8 образов из всех вещей (имеющихся + планируемых + рекомендованных).

Ответь ТОЛЬКО валидным JSON без markdown, без комментариев:
{"suggestions":[{"name":"...","category":"...","color":"...","seasons":["..."],"reason":"..."}],"outfits":[{"name":"...","items":["название вещи"],"season":"...","occasion":"..."}]}`
}

interface AiResponse {
  suggestions: {
    name: string
    category: string
    color: string
    seasons: string[]
    reason: string
  }[]
  outfits: {
    name: string
    items: string[]
    season: string
    occasion: string
  }[]
}

function extractJson(text: string): AiResponse {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('LLM не вернул JSON')
  try {
    const parsed = JSON.parse(jsonMatch[0])
    return {
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      outfits: Array.isArray(parsed.outfits) ? parsed.outfits : [],
    }
  } catch {
    throw new Error('LLM вернул невалидный JSON')
  }
}

async function callLLM(prompt: string): Promise<AiResponse> {
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: 'Ты стилист. Отвечай только валидным JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`LLM API error ${res.status}: ${body}`)
  }
  let data: Record<string, unknown>
  try { data = await res.json() } catch {
    throw new Error('LLM вернул не-JSON ответ')
  }
  const content = (data as any)?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('LLM вернул пустой ответ')
  return extractJson(content)
}

export async function inferItemDetails(
  name: string
): Promise<{ category: string; seasons: string[] }> {
  const prompt = `По названию вещи определи её категорию и сезоны.
Название: "${name}"

Категории: tops, bottoms, dresses, outerwear, knitwear, shoes, bags, accessories
Сезоны: spring, summer, autumn, winter

Ответь ТОЛЬКО JSON: {"category":"...","seasons":["..."]}`

  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    }),
  })
  if (!res.ok) return { category: 'tops', seasons: [] }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') return { category: 'tops', seasons: [] }
  try {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return { category: 'tops', seasons: [] }
    const parsed = JSON.parse(match[0])
    return {
      category: parsed.category ?? 'tops',
      seasons: Array.isArray(parsed.seasons) ? parsed.seasons : [],
    }
  } catch {
    return { category: 'tops', seasons: [] }
  }
}

export async function suggestColor(
  itemName: string,
  category: string,
  wardrobe: ClothingItem[],
  shopping: ShoppingItem[],
  profile: Profile,
): Promise<string> {
  const wardrobeList = wardrobe.map((i) => describeItem(i)).join('; ')
  const shoppingList = shopping
    .filter((i) => i.isConfirmed || !i.isAiSuggested)
    .map((i) => describeItem(i)).join('; ')
  const profileCtx = buildProfileContext(profile)

  const prompt = `Ты стилист. Подбери оптимальный цвет для вещи "${itemName}" (${CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category}).
${profileCtx}

Гардероб: ${wardrobeList || 'пусто'}
Планируемые покупки: ${shoppingList || 'пусто'}

Подбери цвет, который максимально сочетается с имеющимися вещами и создаёт универсальные комбинации.
Ответь ТОЛЬКО одним словом — название цвета на русском. Без кавычек, без пояснений.`

  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
    }),
  })
  if (!res.ok) throw new Error('Ошибка подбора цвета')
  const data = await res.json()
  const color = data?.choices?.[0]?.message?.content?.trim()
  if (!color) throw new Error('AI не смог подобрать цвет')
  return color.toLowerCase().replace(/[."']/g, '')
}

export async function analyzeWardrobe(
  wardrobe: ClothingItem[],
  shopping: ShoppingItem[],
  profile: Profile,
  targetSeason?: Season
): Promise<{ suggestions: Omit<ShoppingItem, 'id'>[]; outfits: Omit<Outfit, 'id'>[] }> {
  const prompt = buildPrompt(wardrobe, shopping, profile, targetSeason)
  const response = await callLLM(prompt)

  const suggestions: Omit<ShoppingItem, 'id'>[] = response.suggestions.map((s) => ({
    name: s.name ?? '',
    category: (s.category ?? 'tops') as ShoppingItem['category'],
    color: s.color ?? '',
    seasons: (Array.isArray(s.seasons) ? s.seasons : []) as Season[],
    isAiSuggested: true,
    isConfirmed: false,
    aiReason: s.reason ?? '',
  }))

  const allNames = [
    ...wardrobe.map((i) => ({ id: i.id, name: i.name, type: 'w' as const })),
    ...shopping.map((i) => ({ id: i.id, name: i.name, type: 's' as const })),
  ]

  const outfits: Omit<Outfit, 'id'>[] = response.outfits.map((o) => {
    const wardrobeIds: string[] = []
    const shoppingIds: string[] = []
    for (const itemName of o.items) {
      const match = allNames.find((n) => n.name.toLowerCase() === itemName.toLowerCase())
      if (match?.type === 'w') wardrobeIds.push(match.id)
      else if (match?.type === 's') shoppingIds.push(match.id)
    }
    return {
      name: o.name,
      wardrobeItemIds: wardrobeIds,
      shoppingItemIds: shoppingIds,
      season: o.season as Season,
      occasion: o.occasion,
    }
  })

  return { suggestions, outfits }
}
