let bgRemovalModule: typeof import('@imgly/background-removal') | null = null

async function loadModule() {
  if (!bgRemovalModule) {
    bgRemovalModule = await import('@imgly/background-removal')
  }
  return bgRemovalModule
}

export async function preloadModel(): Promise<void> {
  await loadModule()
}

export async function removeBackground(source: File | Blob): Promise<Blob> {
  const mod = await loadModule()
  const result = await mod.removeBackground(source, {
    output: { format: 'image/png' },
  })
  return result
}
