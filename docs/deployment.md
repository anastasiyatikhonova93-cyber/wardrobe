# Деплой и окружение

## Деплой на Vercel — ручной

Прод — Vercel-проект (домены `wardrobe-build` / `wardrobe-app`). **GitHub-автодеплоя
нет.** Деплой запускается руками:

```bash
npx vercel --prod
```

Подводные камни:

- **Держи `tsc -b` зелёным.** `npm run build` = `tsc -b && vite build`. Если
  типы красные, сборка на Vercel **тихо падает** — деплой «застревает» без явной
  ошибки в UI.
- **Параллельный поздний деплой может молча перезаписать прод.** Если запускал
  несколько деплоев — сверяйся, какой реально активен: `vercel inspect`.

`vercel.json` рерайтит все не-`/api/` пути на `/` — это SPA-роутинг (иначе прямой
заход на `/wardrobe` дал бы 404).

## Переменные окружения

### Клиентские (`VITE_*`) — публичны по дизайну

Лежат в `.env`, который **закоммичен в git** (см. `.gitignore` — `.env` намеренно не
игнорируется). Firebase client-ключи безопасно публиковать: доступ ограничивается
Firebase Security Rules и проверкой `idToken` на сервере, а не секретностью ключа.

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_LLM_API_KEY        # опционально, llm7.io ключ фиктивный — можно не задавать
```

Шаблон — в `.env.example`.

### Серверные секреты — только в Vercel env

**Никогда не коммить.** Задаются в настройках Vercel-проекта:

| Секрет | Используется в | Назначение |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | `api/db.ts` | JSON сервис-аккаунта admin SDK (доступ к Firestore от имени админа) |
| `GEMINI_API_KEY` | `api/classify.ts`, `api/clean-image.ts` | Gemini vision + image-gen |

Если секрет не задан, функция отвечает `501` (`... is not configured`) — фронт это
переживает и откатывается на фолбэки.

## Проверка изменений

Юнит-тестов нет. Перед деплоем:

```bash
npm run build         # обязан быть зелёным
npm run lint          # eslint
node e2e-smoke.mjs    # Playwright smoke против прода (без авторизации):
                      # проверяет, что грузится AuthPage с кнопкой «Войти через Google»
```

`e2e-smoke.mjs` бьёт по `https://wardrobe-build.vercel.app`, делает скриншот
(`e2e-auth-page.png`) и проверяет видимость кнопки входа и заголовка. Это smoke
**против прода**, а не локальный тест — гоняй после деплоя.

## Прочая инфраструктура

- `firebase.json` / `.firebaserc` — конфиг Firebase Hosting (проект
  `wardrobe-dc0d3`); основной деплой идёт через Vercel, не Hosting.
- `scripts/seed-wardrobe.mjs` — наполнение демо-данными (см. также `/seed` в UI).
