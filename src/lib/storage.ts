import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from './firebase'

export async function uploadPhoto(file: File, uid: string): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `photos/${uid}/${Date.now()}.${ext}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}
