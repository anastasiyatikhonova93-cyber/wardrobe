export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

/** Пользовательская категория образа (погода, повод и т.п.) — задаётся в профиле. */
export interface Category {
  id: string
  name: string
}

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

/**
 * Состояние (вариация) вещи: один и тот же предмет в разном виде — напр. футболка
 * расправленная / завязанная спереди, рубашка расстёгнутая / застёгнутая. Картинка
 * генерируется AI-командой от базового фото. Хранится инлайн data-url, как `imageUrl`.
 */
export interface ItemState {
  id: string
  label: string
  imageUrl: string
  /** Команда-описание, которой сгенерили состояние (для истории/повтора). */
  prompt?: string
}

export interface ClothingItem {
  id: string
  name: string
  category: ClothingCategory
  color: string
  style?: string
  seasons: Season[]
  imageUrl?: string
  /**
   * Состояния вещи (включая основное). Пусто/отсутствует = у вещи одно фото (`imageUrl`),
   * как раньше. При наличии — `imageUrl` дублирует картинку основного состояния
   * (`defaultStateId`), чтобы весь существующий код читал её без изменений.
   */
  states?: ItemState[]
  defaultStateId?: string
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
  /** @deprecated старый ширина-масштаб по категории — хранил производное
   *  CATEGORY_SCALE[category] (категориальный размер), а НЕ ручной множитель.
   *  Раскладка теперь задаётся шириной по категории (CATEGORY_WIDTH) × реальным
   *  соотношением сторон фото; в userScale не мигрируется (см. docs/data-model.md).
   *  Поле осталось в старых документах, но больше не читается. */
  scale?: number
  /** Ручной множитель размера поверх авто-размера по категории (по умолчанию 1). */
  userScale?: number
}

export interface Outfit {
  id: string
  name: string
  wardrobeItemIds: string[]
  shoppingItemIds: string[]
  season: Season
  /** Категории образа для фильтрации (id из Profile.outfitCategories). */
  categories?: string[]
  itemPositions: OutfitItemPosition[]
}

/** Доска — кураторская подборка из нескольких образов (создаётся через фильтр). */
export interface Board {
  id: string
  name: string
  /** Отобранные образы (ручной отбор после фильтра). */
  outfitIds: string[]
  /** Запомненный фильтр для повторного редактирования. `null` — фильтр снят
   *  (нужно явное значение, а не undefined: merge-обновление в /api/db не удаляет undefined-поля). */
  filterCategory?: string | null
  filterItemId?: string | null
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
  /** Пользовательские категории образов. Если не заданы — используются DEFAULT_OUTFIT_CATEGORIES. */
  outfitCategories?: Category[]
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

/** Категории образов по умолчанию. id погодных совпадают со старым полем `weather`,
 *  чтобы у ранее созданных образов сохранились метки после миграции. */
export const DEFAULT_OUTFIT_CATEGORIES: Category[] = [
  { id: 'hot', name: 'Жара' },
  { id: 'warm', name: 'Тепло' },
  { id: 'cool', name: 'Прохладно' },
  { id: 'cold', name: 'Холод' },
  { id: 'evening', name: 'Вечернее' },
]

export const BODY_TYPE_LABELS: Record<BodyType, string> = {
  hourglass: 'Песочные часы',
  pear: 'Груша',
  apple: 'Яблоко',
  rectangle: 'Прямоугольник',
  'inverted-triangle': 'Перевёрнутый треугольник',
}

/** Роль пользователя в гардеробе. Права owner и member идентичны (полный доступ,
 *  включая профиль); роль влияет только на управление (удаление/передача/отзыв). */
export type WardrobeRole = 'owner' | 'member'

/** Гардероб-пространство в списке доступных текущему пользователю. */
export interface WardrobeMeta {
  id: string
  name: string
  ownerUid: string
  /** Роль ТЕКУЩЕГО пользователя в этом гардеробе. */
  role: WardrobeRole
  /** Личный гардероб (id === uid) — его нельзя удалить/покинуть. */
  isPersonal: boolean
  memberCount?: number
}

/** Участник гардероба (для экрана управления доступом). */
export interface WardrobeMember {
  uid: string
  displayName: string
  email: string
  role: WardrobeRole
}

/** Статус приглашения при превью (ответ серверной операции inviteInfo). */
export type InviteStatus = 'ready' | 'used' | 'revoked' | 'not_found'

export interface InviteInfo {
  status: InviteStatus
  ownerName: string
  wardrobeName: string
  role: WardrobeRole
}
