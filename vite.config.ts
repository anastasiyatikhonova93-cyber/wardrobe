/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // `vite dev` не запускает serverless-функции из `api/`, поэтому `/api/db` локально
    // даёт 404. Проксируем `/api/*` на прод (та же Firebase, idToken подходит), чтобы
    // локально работать с реальными данными. Только для разработки.
    proxy: {
      '/api': {
        target: 'https://wardrobe-build.vercel.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  test: {
    // jsdom — дефолт для стора/компонентов (нужны localStorage, crypto, DOM).
    // Чистые серверные тесты помечают себя `// @vitest-environment node` в шапке файла.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // api/ компилит Vercel отдельно; гоняем оттуда только чистые хелперы.
    include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.ts'],
  },
})
