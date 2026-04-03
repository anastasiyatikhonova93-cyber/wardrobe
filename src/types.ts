export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

export type ClothingCategory =
  | 'tops'
  | 'bottoms'
  | 'dresses'
  | 'outerwear'
  | 'knitwear'
  | 'shoes'
  | 'bags'
  | 'accessories'

export type BodyType =
  | 'hourglass'
  | 'pear'
  | 'apple'
  | 'rectangle'
  | 'inverted-triangle'

export type FeaturePreference = 'hide' | 'highlight'

export interface ClothingItem {
  id: string
  name: string
  category: ClothingCategory
  color: string
  style?: string
  seasons: Season[]
  imageUrl?: string
  shopUrl?: string
  notes?: string
}

export interface ShoppingItem {
  id: string
  name: string
  category: ClothingCategory
  color: string
  seasons: Season[]
  imageUrl?: string
  shopUrl?: string
  price?: number
  isAiSuggested: boolean
  isConfirmed: boolean
  aiReason?: string
  needColorAdvice?: boolean
}

export interface OutfitItemPosition {
  itemId: string
  x: number
  y: number
  scale: number
}

export interface Outfit {
  id: string
  name: string
  wardrobeItemIds: string[]
  shoppingItemIds: string[]
  season: Season
  occasion?: string
  itemPositions: OutfitItemPosition[]
}

export interface BodyFeature {
  id: string
  area: string
  preference: FeaturePreference
  note?: string
}

export interface Profile {
  height?: number
  weight?: number
  bodyType?: BodyType
  features: BodyFeature[]
  preferredStyles: string[]
}

export const CATEGORY_LABELS: Record<ClothingCategory, string> = {
  tops: 'Верх',
  bottoms: 'Низ',
  dresses: 'Платья',
  outerwear: 'Верхняя одежда',
  knitwear: 'Трикотаж',
  shoes: 'Обувь',
  bags: 'Сумки',
  accessories: 'Аксессуары',
}

export const SEASON_LABELS: Record<Season, string> = {
  spring: 'Весна',
  summer: 'Лето',
  autumn: 'Осень',
  winter: 'Зима',
}

export const CATEGORY_SCALE: Record<ClothingCategory, number> = {
  tops: 1.0,
  bottoms: 1.4,
  dresses: 1.8,
  outerwear: 1.7,
  knitwear: 1.0,
  shoes: 0.45,
  bags: 0.7,
  accessories: 0.35,
}

export const BODY_TYPE_LABELS: Record<BodyType, string> = {
  hourglass: 'Песочные часы',
  pear: 'Груша',
  apple: 'Яблоко',
  rectangle: 'Прямоугольник',
  'inverted-triangle': 'Перевёрнутый треугольник',
}

export interface Invite {
  token: string
  ownerUid: string
  ownerName: string
  createdAt: Date
  used: boolean
  acceptedBy?: string
}

export interface Collaborator {
  uid: string
  role: 'stylist'
  displayName: string
  email: string
  addedAt: Date
}

export interface SharedWardrobe {
  ownerUid: string
  ownerName: string
}
