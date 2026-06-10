import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
// ignoreUndefinedProperties: пустые поля уходят как undefined — без этого
//   addDoc/updateDoc падают с ошибкой.
// experimentalForceLongPolling: принудительный надёжный транспорт. На сетях, где
//   потоковый канал Firestore не проходит, запись зависала без ответа и не
//   доходила до сервера; long-polling это лечит.
// persistentLocalCache: записи сохраняются локально сразу и переживают
//   перезагрузку, синхронизируясь с сервером в фоне — добавленные вещи больше
//   не теряются.
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})
