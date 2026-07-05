import type { ClothingItem, ShoppingItem, Outfit, Board } from '../types'

// Адаптеры миграции документов Firestore → типы приложения. Читают старые поля как
// фолбэк (обратная совместимость), проставляют дефолты для отсутствующих массивов.

type AnyDoc = Record<string, any>

export const asClothing = (d: AnyDoc): ClothingItem =>
  ({ seasons: [], ...d } as unknown as ClothingItem)

export const asShopping = (d: AnyDoc): ShoppingItem =>
  ({ seasons: [], isAiSuggested: false, isConfirmed: true, ...d } as unknown as ShoppingItem)

export const asOutfit = (d: AnyDoc): Outfit => {
  // Миграция: старое поле `weather` читается как категории, если новое не задано.
  const categories = (d.categories ?? d.weather ?? []) as string[]
  return { wardrobeItemIds: [], shoppingItemIds: [], itemPositions: [], ...d, categories } as unknown as Outfit
}

export const asBoard = (d: AnyDoc): Board =>
  ({ outfitIds: [], ...d } as unknown as Board)
