# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Capsule — приложение «капсульный гардероб»: пользователь добавляет вещи (с фото),
а AI помогает докупать недостающее, собирать образы и раскладывать весь гардероб
на одну доску-картинку. SPA на Vite + React 19 + TypeScript, данные в Firebase,
деплой на Vercel. Весь UI на русском.

## Commands

```bash
npm run dev       # Vite dev server (HTTPS через basic-ssl)
npm run build     # tsc -b && vite build — ОБЯЗАН быть зелёным, иначе деплой молча застревает
npm run lint      # eslint
npm run preview   # предпросмотр прод-сборки

npm run test      # Vitest (юнит-тесты: стор, чистые хелперы, серверная авторизация)
npm run test:watch

node e2e-smoke.mjs   # Playwright smoke-тест против прода (wardrobe-build.vercel.app), без авторизации
```

Проверка изменений — `npm run build` (зелёный `tsc -b`) + `npm test` + ручной прогон.
Юнит-тесты на Vitest есть для стора и логики мульти-гардеробов; остальное (UI, пайплайн
фото) — ручной прогон.

### Деплой

Прод — Vercel-проект (домены `wardrobe-build` / `wardrobe-app`), деплой **ручной**:
`npx vercel --prod`. GitHub-автодеплоя нет. Держи `tsc -b` зелёным, иначе сборка на
Vercel тихо падает. Параллельный поздний деплой может молча перезаписать прод —
сверяйся через `vercel inspect`.

## Архитектура

Ниже — «большая картина». Подробности по подсистемам — в папке [`docs/`](docs/)
(см. раздел «Документация» внизу): архитектура, модель данных, AI, пайплайн фото,
деплой.

### Поток данных: всё через `/api/db`, НЕ через клиентский Firestore

Ключевой и неочевидный момент. Клиентский Firestore НЕ используется
(`src/lib/firebase.ts` экспортирует только `auth`). Все данные приложения идут через
serverless-функцию `/api/db` (Firebase **admin** SDK):

- Причина: на части пользовательских сетей домен `firestore.googleapis.com`
  заблокирован, а собственный сервер до базы достучаться может.
- `src/lib/api.ts` → `callDb(op, args)` шлёт POST на `/api/db` с Firebase `idToken`;
  стор подмешивает активный `wardrobeId`. Сервер (`api/db.ts`) верифицирует токен,
  **проверяет членство** (`loadWorkspace`/`assertMember`, чистые хелперы в
  `api/_authz.ts`) и работает с Firestore от имени админа в `capsule/{wardrobeId}`.
- Операции `db.ts`: данные (`load`/`add`/`update`/`delete`/`batchAdd`/`clear`/`replace`/
  `setProfile`) + гардеробы/шеринг (`listWardrobes`/`createWardrobe`/`renameWardrobe`/
  `deleteWardrobe`/`leaveWardrobe`/`listMembers`/`removeMember`/`createInvite`/
  `inviteInfo`/`acceptInvite`). Подколлекции захардкожены в `COLLECTIONS`.

### Модель данных Firestore

Документ `capsule/{wardrobeId}` — гардероб-пространство. Хранит поля профиля
(`height`, `weight`, `bodyType`, `preferredStyles`, `outfitCategories`), служебные поля
workspace (`ownerUid`, `name`, `memberUids`, `members`) и вложенные сущности в
подколлекциях: `wardrobe`, `shopping`, `outfits`, `boards`, `features`. `wardrobeId`
= `uid` для личного/legacy-гардероба (обратная совместимость) либо сгенерированный id.
Типы — в `src/types.ts`. Подробнее: [docs/data-model.md](docs/data-model.md).

- Картинки хранятся **инлайн как data-URL в самих документах** (отдельного Storage-бакета нет).
  `src/lib/storage.ts` сжимает фото так, чтобы уложиться в лимит документа Firestore
  (~1 MiB; целевой предел `MAX_DATA_URL` ≈ 900 КБ), при необходимости понижая размер.
- Прозрачные вещи кодируются в WebP с альфой (фолбэк PNG), непрозрачные — в JPEG.
- Миграции читаются на лету при загрузке (`asOutfit` в store: старое поле `weather`
  читается как `categories`). При переименовании полей сохраняй обратную совместимость так же.

### Состояние

Zustand-стор (`src/store.ts`) — единственный источник правды на клиенте. Каждая
мутация: сперва `callDb(...)`, затем оптимистичное `set(...)`. `subscribe(uid)` грузит
список гардеробов, выбирает активный (localStorage→личный) и делает разовый `load`
(не realtime-подписка). Переключение — `switchWardrobe`; гонки гасит эпоха `_loadEpoch`;
отзыв доступа (`code:'no_access'`) → авто-переключение на личный + тост. Селектор
`useOutfitCategories` отдаёт категории профиля с фолбэком на `DEFAULT_OUTFIT_CATEGORIES`.

Авторизация — `src/lib/auth.tsx`: Google popup через клиентский Firebase Auth.
`App.tsx` гейтит роуты по `user` + `loading`. Роуты: `/` (образы), `/wardrobe`,
`/shopping`, `/profile`, `/import`, `/seed`, `/fix-photos`, `/wardrobes`,
`/invite/:token`, `/detect-test`. Старый `/shared` редиректит на `/wardrobes`;
`/detect-test` — мульти-распознавание вещей на одном фото/селфи: всегда standalone (вне
`Layout`, до auth-гейта и экрана ошибки — детекция не зависит от базы, доступна всегда).
Точка входа — кнопка `ScanSearch` в шапке `/wardrobe`; на странице есть ссылка «В гардероб»
для залогиненного.

> **Мульти-гардеробы и шеринг включены.** Гардероб — пространство с участниками и
> ролями (`owner`/`member`, права равны, полный доступ). Переключатель —
> `WardrobeSwitcher` в `Layout`; управление — страница `/wardrobes`. Два вида
> ссылки-приглашения: «соавтор» (member) и «передать клиенту» (owner-хэндофф).
> Подробнее: [docs/architecture.md](docs/architecture.md).

### AI: два независимых провайдера

1. **llm7.io** (`https://api.llm7.io/v1`, OpenAI-совместимый, бесплатный, ключ
   фиктивный) — вызывается **из браузера** для текстовых задач: подбор докупки и
   образов (`src/ai.ts` `analyzeWardrobe`), имя образа, подбор цвета, определение
   категории/сезона по названию. Везде один паттерн: промт → JSON → `extractJson`
   с регэкспом `/\{[\s\S]*\}/` и мягкими фолбэками (никогда не валим UI).
2. **Gemini** (через serverless, ключ `GEMINI_API_KEY` на сервере) — для картинок:
  - `api/classify.ts` (`gemini-2.5-flash`) — распознавание вещи по фото/URL
     (название, категория, цвет, сезоны). Сервер сам тянет картинку по URL, обходя CORS.
  - `api/clean-image.ts` (Gemini image-gen) — AI-ретушь на чистый фон. **Требует
     биллинга Google**; на бесплатном тарифе отдаёт 429 → код откатывается на локальную обработку.

### Пайплайн фото (`useAutoIngest` → `photo-cleanup` → `classify-photo` → `storage`)

`src/hooks/useAutoIngest.ts` оркестрирует добавление фото:
1. Классификация вещи (`classify-photo.ts`): сначала сервер-Gemini (`/api/classify`),
   фолбэк — vision через llm7, фолбэк — разбор имени файла (камерные имена `IMG_xxxx`
   отбрасываются). Категория нужна заранее, т.к. влияет на промт обработки.
2. Коррекция фото (`photo-cleanup.ts`): `cleanupBest` = Gemini-ретушь + вырезание
   фона; при недоступности AI — `cleanupPhoto` = локальное вырезание фона
   (`@imgly/background-removal`, в браузере, бесплатно) + авто-цветокоррекция по
   перцентилям яркости. См. memory `gemini-photo-cleanup`.
3. Сжатие и сохранение инлайн (`storage.ts`).

### Доска гардероба (`src/lib/board-layout.ts`)

Раскладывает все вещи на один холст: группировка по категориям рядами в заданном
порядке (`ORDER`), упаковка слева-направо с центрированием ряда, размер по высоте
ряда категории и реальному соотношению сторон. `renderBoardToPng` рендерит в PNG,
аккуратно понижая масштаб под лимиты canvas в iOS Safari.

### Serverless-функции (`api/`, Vercel, Node `http`-хендлеры)

`db.ts` (данные), `classify.ts` (Gemini vision), `detect.ts` (Gemini vision:
мульти-распознавание вещей с рамками), `clean-image.ts` (Gemini image-gen),
`og-image.ts` (OG-картинка для шеринга). Все читают тело вручную через `readJsonBody`
с лимитом размера. `vercel.json` рерайтит все не-`/api/` пути на `/` (SPA-роутинг).

## Конвенции

- Комментарии и UI-текст — на русском; код/идентификаторы — английские.
- Строгий TS (`tsconfig.app.json`: `strict`, `noUnusedLocals/Parameters`,
  `verbatimModuleSyntax`). Импорт типов — через `import type`.
- Tailwind v4 (через `@tailwindcss/vite`), без отдельного конфиг-файла.
- Firebase client-ключи (`VITE_FIREBASE_*`) **публичны по дизайну** и закоммичены в `.env`.
  Серверные секреты (`FIREBASE_SERVICE_ACCOUNT`, `GEMINI_API_KEY`) — только в Vercel env.

## Память

Активно пользуйся нативной памятью Claude Code (каталог `memory/`, индекс `MEMORY.md`).

- **Читай память в начале работы** и сверяйся с ней — там хранятся неочевидные «почему»
  из прошлых сессий (особенности деплоя, причины архитектурных решений, тупики).
- **Пиши часто.** Как только всплыл нетривиальный факт, договорённость или вывод,
  который пригодится позже и не виден из кода/доков/git — сразу фиксируй в память.
  Лучше записать, чем потерять контекст между сессиями.
- **Упорядочивай при каждой записи:** сперва проверь, нет ли уже записи на эту тему —
  обновляй существующую, а не плоди дубли; неверные/устаревшие удаляй; относительные
  даты переводи в абсолютные; добавляй строку-указатель в `MEMORY.md` и связывай
  записи ссылками `[[name]]`.
- Не дублируй в память то, что уже зафиксировано в коде, `CLAUDE.md`, `docs/` или
  истории git, — память для того, что иначе негде хранить.

## Документация

Подробная документация — в [`docs/`](docs/). Этот `CLAUDE.md` — краткая карта;
детали (с именами функций, констант, путей) живут в тематических файлах:

| Файл | О чём |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Поток данных `/api/db`, стор, авторизация, роутинг, serverless |
| [docs/data-model.md](docs/data-model.md) | Модель Firestore, типы, инлайн-картинки, миграции |
| [docs/ai.md](docs/ai.md) | llm7.io + Gemini, промты, фолбэки, извлечение картинки по URL |
| [docs/photo-pipeline.md](docs/photo-pipeline.md) | Пайплайн добавления фото и доска гардероба |
| [docs/deployment.md](docs/deployment.md) | Деплой на Vercel, переменные окружения, e2e |

**Правило: документацию держим актуальной.** Меняешь подсистему — обнови
соответствующий файл в `docs/` (и при необходимости этот `CLAUDE.md`) **в том же
изменении**. Конкретно:

- меняешь операции/контракт `/api/db`, стор, роутинг → `docs/architecture.md`;
- меняешь типы, структуру Firestore, хранение картинок, добавляешь миграцию → `docs/data-model.md`;
- меняешь промты/провайдеров/модели AI → `docs/ai.md`;
- меняешь обработку фото или раскладку доски → `docs/photo-pipeline.md`;
- меняешь процесс деплоя, env-переменные, секреты → `docs/deployment.md`.

Документация устаревшей быть не должна — расхождение с кодом считается багом.
