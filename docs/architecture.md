# Архитектура

SPA на Vite + React 19 + TypeScript. Состояние — zustand. Авторизация и данные —
Firebase. Серверная логика — Vercel serverless-функции в `api/`. Весь UI на русском.

## Поток данных: всё через `/api/db`, НЕ через клиентский Firestore

Самый важный и неочевидный момент архитектуры.

В `src/lib/firebase.ts` создаётся клиентский Firestore `db`, но он **почти не
используется** — только страницей приглашений (которая сейчас отключена). Все
данные приложения ходят через serverless-функцию `/api/db`, работающую с Firebase
**admin** SDK.

**Почему так:** на части пользовательских сетей домен `firestore.googleapis.com`
заблокирован. Браузер до Firestore не достучится, а собственный сервер на Vercel —
может. Поэтому весь CRUD проксируется через свой эндпоинт.

**Как это работает:**

1. `src/store.ts` → `callDb(op, args)` берёт у текущего пользователя Firebase
   `idToken` (`auth.currentUser.getIdToken()`) и шлёт `POST /api/db` с телом
   `{ op, idToken, ...args }`.
2. `api/db.ts` верифицирует токен через admin `auth.verifyIdToken(idToken)`,
   достаёт `uid` и работает с Firestore от имени админа в пространстве
   `capsule/{uid}`.
3. Ответ — JSON; при ошибке `callDb` бросает `Error` с русским сообщением.

**Операции `api/db.ts`** (поле `op` в теле запроса):

| op | Назначение |
| --- | --- |
| `load` | Грузит профиль + все 4 подколлекции одним вызовом (`Promise.all`) |
| `add` | Добавляет документ в подколлекцию, возвращает `{ id }` |
| `update` | `set(..., { merge: true })` по `id` |
| `delete` | Удаляет документ по `id` |
| `batchAdd` | Пакетная вставка (чанки по 400 в батч на сервере; клиент шлёт чанками по 25) |
| `clear` | Удаляет все документы подколлекции |
| `replace` | `clear` + `batchAdd` (используется `setOutfits`) |
| `setProfile` | `set(..., { merge: true })` на сам документ `capsule/{uid}` |

**Безопасность:** разрешённые подколлекции захардкожены в `COLLECTIONS`
(`wardrobe`, `shopping`, `outfits`, `features`); `checkCol` отбивает произвольные
пути. Тело читается вручную через `readJsonBody` с лимитом 6 МБ. `undefined`-поля
отсеиваются (`clean` + `ignoreUndefinedProperties`).

## Состояние (`src/store.ts`)

Zustand-стор — единственный источник правды на клиенте.

- **Паттерн мутации:** сперва `await callDb(...)`, затем оптимистичное `set(...)`.
  Если сервер вернул ошибку — `set` не выполняется, UI остаётся согласованным.
- `subscribe(uid)` делает **разовый** `load` — это НЕ realtime-подписка на
  Firestore. Перезагрузка данных — повторный `load` (например, `viewOwnWardrobe`).
- **Ошибка загрузки видима, не тихая.** Если `load` падает, `loadData` пишет
  сообщение в `loadError` (а не оставляет пустой гардероб). `App.tsx` при `loadError`
  показывает экран ошибки с кнопкой «Повторить» (`retryLoad`) — иначе сбой загрузки
  (заблокированная сеть, истёкший токен) выглядел бы как «все вещи пропали».
- Чтение нормализуется адаптерами `asClothing` / `asShopping` / `asOutfit` —
  проставляют дефолты отсутствующих полей и применяют миграции (см.
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
`/profile`, `/import`, `/seed`, `/fix-photos`, `/shared`, `/invite/:token`.
`/invite/:token` обрабатывается отдельной веткой `AppShell` (своя логика
auth/loading). SPA-роутинг на проде обеспечивает `vercel.json` (рерайт всех
не-`/api/` путей на `/`).

## Совместный доступ — отключён

Invite / collaborators / shared wardrobes сейчас **выключены**: методы стора
(`createInvite`, `acceptInvite`, `removeCollaborator`, `viewSharedWardrobe`) кидают
«временно недоступно» или ничего не делают. Типы (`Invite`, `Collaborator`,
`SharedWardrobe`) и UI-страницы остались на месте. Клиентский Firestore `db` нужен
именно этой (отключённой) подсистеме.

## Serverless-функции (`api/`)

Vercel-функции на «голых» Node `http`-хендлерах (`IncomingMessage`/`ServerResponse`).

| Файл | Назначение | Подробнее |
| --- | --- | --- |
| `db.ts` | CRUD-прокси к Firestore (admin SDK) | этот файл |
| `classify.ts` | Распознавание вещи по фото/URL (Gemini vision) | [ai.md](ai.md) |
| `clean-image.ts` | AI-ретушь фото на чистый фон (Gemini image-gen) | [photo-pipeline.md](photo-pipeline.md) |
| `og-image.ts` | Извлечение картинки товара по ссылке (microlink / og:image) | [ai.md](ai.md) |

Все читают тело вручную через локальный `readJsonBody` с лимитом размера.
