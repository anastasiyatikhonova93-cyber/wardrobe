# Модель данных

Типы — в `src/types.ts`. Хранилище — Firestore, доступ только через `/api/db`
(см. [architecture.md](architecture.md)).

## Структура Firestore

```
capsule/{wardrobeId}               ← документ гардероба-пространства (workspace)
  ├─ ownerUid, name                (служебные поля workspace)
  ├─ memberUids: string[]          инвариант: === Object.keys(members)
  ├─ members: { [uid]: { role:'owner'|'member', displayName, email, addedAt } }
  ├─ schemaVersion: 2, deleting?   маркер миграции / мягкое удаление
  ├─ height, weight, bodyType      (поля профиля прямо на документе)
  ├─ preferredStyles: string[]
  ├─ outfitCategories: Category[]
  ├─ wardrobe/{id}                 ← подколлекция: ClothingItem
  ├─ shopping/{id}                 ← подколлекция: ShoppingItem
  ├─ outfits/{id}                  ← подколлекция: Outfit
  ├─ boards/{id}                   ← подколлекция: Board
  └─ features/{id}                 ← подколлекция: BodyFeature
invites/{token}                    ← приглашение-ссылка
  └─ wardrobeId, ownerName, wardrobeName, role, revoked, maxUses, useCount, acceptedBy
```

**`wardrobeId`** — id гардероба-пространства: либо `uid` (личный/legacy-гардероб,
обратная совместимость — документы существующих юзеров остаются на месте), либо
сгенерированный id (новые гардеробы). Один пользователь может состоять в нескольких
гардеробах с ролью `owner`/`member` (поле `members`/`memberUids`). Доступ проверяет
сервер по `memberUids` (см. [architecture.md](architecture.md)).

Профиль (`Profile`) живёт **полями на самом документе**, а сущности — во вложенных
подколлекциях. `features` (особенности фигуры) — отдельная подколлекция, хотя на
клиенте лежит внутри `profile.features`. Служебные поля workspace отделяются от
профиля при чтении (`load`) и не могут быть переписаны клиентским `setProfile`
(`stripWorkspaceFields`).

## Основные сущности (`src/types.ts`)

- **`ClothingItem`** — вещь гардероба: `name`, `category` (`ClothingCategory`),
  `color`, `seasons`, опц. `style`/`imageUrl`/`shopUrl`/`notes`.
- **`ShoppingItem`** — позиция списка покупок: те же базовые поля + `price`,
  `isAiSuggested`, `isConfirmed`, `aiReason`, `needColorAdvice`.
- **`Outfit`** — образ: ссылки `wardrobeItemIds` / `shoppingItemIds`, `season`,
  `categories` (id из `Profile.outfitCategories`), `itemPositions` (раскладка на холсте).
- **`OutfitItemPosition`** — позиция вещи на холсте образа: `x`/`y` (% холста),
  `userScale` (ручной множитель размера, по умолчанию 1). Размер вещи = ширина по
  категории (`CATEGORY_WIDTH`) × `userScale`, а высота выводится из неё и реального
  соотношения сторон фото (в плоской раскладке размер читается по ширине).
  Поле `scale` — устаревшее (старый ширина-масштаб по категории), больше не читается.
- **`Board`** — кураторская подборка образов: `outfitIds`, опц. `filterCategory`/`filterItemId`.
- **`BodyFeature`** — особенность фигуры: `area`, `preference` (`hide`/`highlight`), `note`.
- **`Category`** — пользовательская категория образа (`{ id, name }`).
- **`WardrobeMeta`** — гардероб в списке доступных: `id`, `name`, `ownerUid`,
  `role` (`owner`/`member`), `isPersonal` (id===uid). **`WardrobeMember`** — участник
  (`uid`, `displayName`, `email`, `role`). **`WardrobeRole`** = `'owner' | 'member'`.

**Справочники-константы** (там же): `CATEGORY_LABELS`, `SEASON_LABELS`,
`BODY_TYPE_LABELS` (русские подписи), `DEFAULT_OUTFIT_CATEGORIES`. Геометрия раскладки
образа (`CATEGORY_WIDTH` — целевая ширина вещи по категории и пр.) — в `src/lib/outfit-layout.ts`.

## Картинки хранятся инлайн как data-URL

**Отдельного Storage-бакета нет.** Картинка вещи лежит прямо в документе как
`imageUrl: "data:image/...;base64,..."`.

Документ Firestore ограничен ~1 MiB, поэтому `src/lib/storage.ts` сжимает фото под
запас (`MAX_DATA_URL` ≈ 900 КБ), при необходимости понижая `MAX_DIMENSION`
итеративно (× 0.82), пока результат не уложится:

- **Прозрачные** вещи → WebP с альфой (фолбэк PNG для старого Safari).
- **Непрозрачные** → JPEG (`JPEG_QUALITY = 0.7`) на белой подложке.
- Прозрачность определяется по выборке альфа-канала (`hasTransparency`).

Подробности конвейера обработки фото — в [photo-pipeline.md](photo-pipeline.md).

## Миграции читаются на лету при загрузке

Схема версионируется не через скрипты, а **мягким чтением** в адаптерах
(`src/lib/adapters.ts`). При загрузке каждая запись прогоняется через `asClothing` /
`asShopping` / `asOutfit` / `asBoard`, которые проставляют дефолты и читают старые поля.

**Ленивый backfill workspace.** Существующие документы `capsule/{uid}` (без полей
`ownerUid`/`memberUids`) мигрируются на лету при первом `load`: сервер merge-дописывает
`ownerUid=uid`, `memberUids=[uid]`, `members`, `name='Мой гардероб'`, `schemaVersion:2`
— только аддитивно, профиль и подколлекции не трогаются (см. инцидент потери данных в
памяти). Идемпотентно (`arrayUnion`). Доступ к своему гардеробу **не зависит** от
backfill: в авторизации есть ветка `wardrobeId===uid` (всегда разрешено), поэтому даже
неудавшийся backfill не отрезает пользователя от своих данных. Массовых проходов по
базе нет.

Пример (`asOutfit`): старое поле `weather` читается как `categories`, если новое не
задано. id погодных `DEFAULT_OUTFIT_CATEGORIES` (`hot`/`warm`/`cool`/`cold`)
намеренно совпадают со старыми значениями `weather`, чтобы метки сохранились.

Особый случай — `OutfitItemPosition.scale` (старая «ширина-по-категории»). Его
**намеренно НЕ мигрируют** в `userScale`: старое `scale` хранило производное
значение `CATEGORY_SCALE[category]` (категориальный размер), а не ручной множитель
пользователя — ручного ресайза в старом редакторе не было. В новой модели
категориальный размер задаёт `CATEGORY_WIDTH`, поэтому `userScale` у старых образов
по умолчанию `1` — это семантически верно, а не потеря данных. Сами `x/y` остаются
как есть; раскладка пересчитывается под новую геометрию (ширина-по-категории ×
реальное соотношение сторон), а `computeBounds` ре-центрирует, так что вещи не
улетают за холст — меняются лишь взаимные размеры и наложения.

**Правило:** при переименовании/удалении полей сохраняй обратную совместимость так
же — читай старое поле как фолбэк в соответствующем адаптере, не пиши разовых
миграционных скриптов по базе.
