import '@testing-library/jest-dom/vitest'

// jsdom в этой версии vitest не отдаёт localStorage — простая ин-мемори реализация.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  const mock: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => void store.delete(k),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
  }
  globalThis.localStorage = mock
}

// jsdom в некоторых версиях не даёт crypto.randomUUID — стор и адаптеры на него
// рассчитывают. Подкладываем простой фолбэк, если его нет.
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  let counter = 0
  const cryptoObj = (globalThis.crypto ?? ({} as Crypto)) as Crypto & { randomUUID: () => `${string}-${string}-${string}-${string}-${string}` }
  cryptoObj.randomUUID = () => `test-uuid-${counter++}` as `${string}-${string}-${string}-${string}-${string}`
  globalThis.crypto = cryptoObj
}
