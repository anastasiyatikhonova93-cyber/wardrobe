# Архитектура

SPA на Vite + React 19 + TypeScript. Состояние — zustand. Авторизация и данные —
Firebase. Серверная логика — Vercel serverless-функции в `api/`. Весь UI на русском.

## Поток данных: всё через `/api/db`, НЕ через клиентский Firestore

Самый важный и неочевидный момент архитектуры.

Все данные приложения ходят через serverless-функцию `/api/db`, работающую с
Firebase **admin** SDK. Клиентский Firestore не используется вообще
(`src/lib/firebase.ts` экспортирует только `auth`).

**Почему так:** на части пользовательских сетей домен `firestore.googleapis.com`
заблокирован. Браузер до Firestore не достучится, а собственный сервер на Vercel —
может. Поэтому весь CRUD (включая превью приглашений) проксируется через свой эндпоинт.

**Как это работает:**

1. `src/lib/api.ts` → `callDb(op, args)` берёт у текущего пользователя Firebase
   `idToken` (`auth.currentUser.getIdToken()`) и шлёт `POST /api/db` с телом
   `{ op, idToken, ...args }`. Стор (`src/store.ts`) через обёртку `scoped`
   подмешивает в каждую операцию данных активный `wardrobeId`.
2. `api/db.ts` верифицирует токен через admin `auth.verifyIdToken(idToken)`,
   достаёт `uid`, **проверяет членство** пользователя в запрошенном гардеробе
   (`loadWorkspace` → `assertMember`) и работает с Firestore от имени админа в
   пространстве `capsule/{wardrobeId}`.
3. Ответ — JSON; при ошибке `callDb` бросает `Error` с полями `status`/`code`
   (напр. `code: 'no_access'` — доступ отозван, см. ниже).

**Мульти-гардеробы.** `wardrobeId` — это id гардероба-пространства: либо `uid`
(личный/legacy-гардероб, обратная совместимость), либо сгенерированный id.
Один пользователь может состоять в нескольких гардеробах с ролью `owner`/`member`.
Подробности модели и `members`/`memberUids` — в [data-model.md](data-model.md).

**Авторизация — единственная точка.** `api/db.ts` ни разу не ходит в
`capsule.doc(...)` мимо `loadWorkspace(db, wardrobeId, uid)`: тот читает документ и
вызывает `assertMember` (404, если не член — 404, а не 403, чтобы не палить
существование чужих id). Чистые хелперы — в `api/_authz.ts` (`resolveWardrobeId`,
`assertMember`, `assertOwner`, `roleOf`, `stripWorkspaceFields`, `planInviteAcceptance`),
покрыты юнит-тестами.

**Операции `api/db.ts`** (поле `op` в теле запроса):

| op | Назначение |
| --- | --- |
| `load` | Грузит профиль + 5 подколлекций + `workspace` (мета активного гардероба) |
| `add` / `update` / `delete` | CRUD документа подколлекции |
| `batchAdd` | Пакетная вставка (чанки по 400 на сервере; клиент шлёт по 25) |
| `clear` / `replace` | Очистка / `clear`+`batchAdd` (используется `setOutfits`) |
| `setProfile` | `set(merge)` профиля; служебные поля вырезаются `stripWorkspaceFields` |
| `listWardrobes` | Список доступных гардеробов (`memberUids array-contains uid` + личный) |
| `createWardrobe` / `renameWardrobe` / `deleteWardrobe` | Создание / переименование / мягкое удаление (`deleting:true`) |
| `leaveWardrobe` / `listMembers` / `removeMember` | Выход / список участников / отзыв доступа |
| `createInvite` / `inviteInfo` / `acceptInvite` | Ссылка-приглашение / превью / приём (транзакция) |

**Безопасность:** разрешённые подколлекции захардкожены в `COLLECTIONS`
(`wardrobe`, `shopping`, `outfits`, `features`, `boards`); `checkCol` отбивает
произвольные пути. `setProfile` дополнительно прогоняет patch через
`stripWorkspaceFields` — иначе участник переписал бы `ownerUid`/`memberUids` и
захватил гардероб. Тело читается вручную через `readJsonBody` с лимитом 6 МБ.
`undefined`-поля отсеиваются (`clean` + `ignoreUndefinedProperties`).

## Состояние (`src/store.ts`)

Zustand-стор — единственный источник правды на клиенте.

- **Паттерн мутации:** сперва `await callDb(...)`, затем оптимистичное `set(...)`.
  Если сервер вернул ошибку — `set` не выполняется, UI остаётся согласованным.
- `subscribe(uid)` сперва грузит **список гардеробов** (`listWardrobes`), выбирает
  активный (`wardrobeSelection.ts`: сохранённый в localStorage по uid → личный →
  первый), затем делает **разовый** `load` его данных. Это НЕ realtime-подписка.
- **Мульти-гардеробное состояние:** `wardrobes: WardrobeMeta[]`, `activeWardrobeId`,
  `members`. Переключение — `switchWardrobe(id)` (чистит данные, перезагружает).
  Создание/переименование/удаление/инвайты — соответствующие методы стора.
- **Гонки переключения** гасит монотонная эпоха `_loadEpoch`: поздний ответ
  устаревшего гардероба не затирает активный (`loadData` сверяет эпоху перед `set`).
- **Отзыв доступа в полёте:** если сервер вернул `code:'no_access'`, стор не показывает
  экран ошибки, а убирает гардероб из списка, переключается на личный и выставляет
  `accessRevokedNotice` (тост в `Layout`).
- **Ошибка загрузки видима, не тихая.** Если `load` падает (не из-за отзыва), `loadData`
  пишет сообщение в `loadError` (а не оставляет пустой гардероб). `App.tsx` при
  `loadError` показывает экран ошибки с кнопкой «Повторить» (`retryLoad`) — иначе сбой
  загрузки (заблокированная сеть, истёкший токен) выглядел бы как «все вещи пропали».
- Чтение нормализуется адаптерами `asClothing` / `asShopping` / `asOutfit` / `asBoard`
  (`src/lib/adapters.ts`) — проставляют дефолты и применяют миграции (см.
  [data-model.md](data-model.md)).
- Селектор `useOutfitCategories` (и helper `catsOf`) отдаёт `profile.outfitCategories`
  с фолбэком на `DEFAULT_OUTFIT_CATEGORIES`. Это единый источник категорий для UI и
  мутаций — не дублируй фолбэк в компонентах.

## Авторизация (`src/lib/auth.tsx`)

Google popup через клиентский Firebase Auth (`signInWithPopup`, `GoogleAuthProvider`).
`AuthProvider` подписывается на `onAuthStateChanged` и отдаёт `{ user, loading,
signIn, signOut }` через контекст (`useAuth`).

`App.tsx` (`AppShell`) гейтит роуты: пока `authLoading` или (есть `user`, но
`dataLoading`) — экран загрузки; нет `user` — `AuthPage`; иначе — `Layout` с роутами.

## Роутинг

`react-router-dom` (BrowserRouter). Роуты: `/` (образы), `/wardrobe`, `/shopping`,
`/profile`, `/import`, `/seed`, `/fix-photos`, `/wardrobes` (управление гардеробами),
`/invite/:token`, `/detect-test`. Старый `/shared` редиректит на `/wardrobes`.
`/invite/:token` обрабатывается отдельной веткой `AppShell` (своя логика auth/loading);
`/detect-test` рендерится **до auth-гейта** (публичная страница мульти-распознавания,
см. [photo-pipeline.md](photo-pipeline.md); сохранение в гардероб требует входа).
SPA-роутинг на проде обеспечивает `vercel.json` (рерайт всех не-`/api/` путей на `/`).

## Мульти-гардеробы и шеринг

Гардероб — самостоятельное пространство (workspace) с участниками и ролями. Любой
пользователь может создавать гардеробы и приглашать в них.

- **Переключатель** (`WardrobeSwitcher`) — хедер над контентом в `Layout`: имя
  активного гардероба + bottom-sheet со списком, созданием и ссылкой на `/wardrobes`.
- **Страница `/wardrobes`** (`WardrobesPage`) — управление: переименование (owner),
  участники, ссылки-приглашения (`WardrobeSharePanel`), выход/удаление.
- **Роли** `owner`/`member` равноправны по правам (полный доступ, включая профиль);
  роль влияет только на управление (удаление/передача/отзыв).
- **Два вида ссылки:** «Поделиться (соавтор)» → принявший становится `member`;
  «Передать клиенту» → принявший становится `owner`, прежний владелец → `member`
  (хэндофф, UC2). Ссылка одноразовая. Приём — транзакция `acceptInvite` (идемпотентна).
- **Превью** приглашения грузится с сервера (`inviteInfo`), не из клиентского
  Firestore — поэтому работает и на сетях с заблокированным Firestore.

## Тесты

Vitest (`npm test`). Окружение jsdom (серверные чистые тесты — per-file
`// @vitest-environment node`). Конфиг — блок `test` в `vite.config.ts`, setup —
`src/test/setup.ts`. Что покрыто: чистые хелперы выбора активного гардероба
(`wardrobeSelection.test.ts`), адаптеры (`adapters.test.ts`), серверная авторизация
(`api/_authz.test.ts`), логика стора с замоканным `callDb` по трём юзкейсам и
edge-кейсам (`store.test.ts`), переключатель (`WardrobeSwitcher.test.tsx`).

## Serverless-функции (`api/`)

Vercel-функции на «голых» Node `http`-хендлерах (`IncomingMessage`/`ServerResponse`).

| Файл | Назначение | Подробнее |
| --- | --- | --- |
| `db.ts` | CRUD-прокси к Firestore (admin SDK) | этот файл |
| `classify.ts` | Распознавание вещи по фото/URL (Gemini vision) | [ai.md](ai.md) |
| `detect.ts` | Мульти-распознавание: список вещей с рамками на одном фото (Gemini vision) | [photo-pipeline.md](photo-pipeline.md) |
| `clean-image.ts` | AI-ретушь фото на чистый фон (Gemini image-gen) | [photo-pipeline.md](photo-pipeline.md) |
| `og-image.ts` | Извлечение картинки товара по ссылке (microlink / og:image) | [ai.md](ai.md) |

Все читают тело вручную через локальный `readJsonBody` с лимитом размера.
