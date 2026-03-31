declare global {
  interface Window {
    gapi: any
    google: any
  }
}

let pickerApiLoaded = false

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(script)
  })
}

export async function loadPickerApi(): Promise<void> {
  if (pickerApiLoaded) return
  await loadScript('https://apis.google.com/js/api.js')
  await loadScript('https://accounts.google.com/gsi/client')
  await new Promise<void>((resolve) => {
    window.gapi.load('picker', () => {
      pickerApiLoaded = true
      resolve()
    })
  })
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
}

export function openPicker(accessToken: string, apiKey: string): Promise<DriveFile[]> {
  return new Promise((resolve) => {
    const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
    view.setMimeTypes('image/jpeg,image/png,image/webp,image/heic')
    view.setIncludeFolders(true)
    view.setSelectFolderEnabled(true)

    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
      .setTitle('Выберите фото из гардероба')
      .setCallback((data: any) => {
        if (data.action === window.google.picker.Action.PICKED) {
          const files: DriveFile[] = data.docs.map((doc: any) => ({
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
          }))
          resolve(files)
        } else if (data.action === window.google.picker.Action.CANCEL) {
          resolve([])
        }
      })
      .build()

    picker.setVisible(true)
  })
}

export async function downloadDriveFile(fileId: string, accessToken: string): Promise<File> {
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!metaRes.ok) throw new Error(`Failed to get file metadata: ${metaRes.status}`)
  const meta = await metaRes.json()

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) throw new Error(`Failed to download file: ${res.status}`)
  const blob = await res.blob()

  return new File([blob], meta.name, { type: meta.mimeType })
}

export async function listFolderFiles(
  folderId: string,
  accessToken: string,
): Promise<DriveFile[]> {
  const query = `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)&pageSize=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) throw new Error(`Failed to list folder: ${res.status}`)
  const data = await res.json()
  return (data.files ?? []) as DriveFile[]
}
