export async function processQueue<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  concurrency = 2,
): Promise<void> {
  let current = 0

  async function next(): Promise<void> {
    while (current < items.length) {
      const idx = current++
      await worker(items[idx], idx)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => next())
  await Promise.all(workers)
}
