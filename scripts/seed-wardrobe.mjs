/**
 * Скрипт для загрузки гардероба Насти в Firebase
 * Требуются FIREBASE_SEED_EMAIL и FIREBASE_SEED_PASSWORD в .env
 * Запуск: node --env-file=.env scripts/seed-wardrobe.mjs [USER_UID]
 */

import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, collection, doc, writeBatch } from 'firebase/firestore'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)
const storage = getStorage(app)

// All 52 wardrobe items with classifications
const ITEMS = [
  { file: "Аксессуары /IMG_9106.jpg", name: "Чёрный узкий галстук", category: "accessories", color: "чёрный", seasons: ["spring", "summer", "autumn", "winter"] },
  { file: "Аксессуары /IMG_9107.jpg", name: "Шёлковые платки с цветочным принтом", category: "accessories", color: "розово-голубой", seasons: ["spring", "summer", "autumn"] },
  { file: "Аксессуары /IMG_9109.jpg", name: "Белый шёлковый платок", category: "accessories", color: "белый", seasons: ["spring", "summer", "autumn"] },
  { file: "Аксессуары /IMG_9111.jpg", name: "Вязаная повязка на голову", category: "accessories", color: "молочный", seasons: ["spring", "summer"] },
  { file: "Аксессуары /IMG_9115.jpg", name: "Кожаный тонкий ремень", category: "accessories", color: "чёрный", seasons: ["spring", "summer", "autumn", "winter"] },
  { file: "Аксессуары /IMG_9116.jpg", name: "Ремень со змеиным принтом", category: "accessories", color: "бежево-чёрный", seasons: ["spring", "summer", "autumn", "winter"] },
  { file: "Верх/photo-2633_singular_display_fullPicture.jpg", name: "Бежевый корсет на косточках", category: "tops", color: "бежевый", seasons: ["spring", "summer"] },
  { file: "Верх/photo-2914_singular_display_fullPicture.jpg", name: "Чёрная оверсайз футболка с бахромой", category: "tops", color: "чёрный", seasons: ["spring", "summer", "autumn"] },
  { file: "Верх/photo-2958_singular_display_fullPicture.jpg", name: "Чёрный прозрачный корсет на шнуровке", category: "tops", color: "чёрный", seasons: ["spring", "summer"] },
  { file: "Верх/Длинный рукав/photo-2715_singular_display_fullPicture.jpg", name: "Белая рубашка оверсайз", category: "tops", color: "белый", seasons: ["spring", "summer", "autumn"] },
  { file: "Верх/Длинный рукав/photo-2786_singular_display_fullPicture.jpg", name: "Розовая рубашка оверсайз", category: "tops", color: "розовый", seasons: ["spring", "summer", "autumn"] },
  { file: "Верх/Длинный рукав/photo-2829_singular_display_fullPicture.jpg", name: "Голубая рубашка оверсайз", category: "tops", color: "голубой", seasons: ["spring", "summer", "autumn"] },
  { file: "Верх/Длинный рукав/photo-2871_singular_display_fullPicture.jpg", name: "Бежевая рубашка в полоску", category: "tops", color: "бежевый в белую полоску", seasons: ["spring", "summer", "autumn"] },
  { file: "Верх/Длинный рукав/photo-2908_singular_display_fullPicture.jpg", name: "Чёрный лонгслив с принтом леопарда", category: "tops", color: "чёрный", seasons: ["spring", "autumn", "winter"] },
  { file: "Верх/Длинный рукав/photo-2910_singular_display_fullPicture.jpg", name: "Бежевое худи оверсайз с принтом", category: "tops", color: "бежевый", seasons: ["spring", "autumn", "winter"] },
  { file: "Верх/Длинный рукав/photo-2919_singular_display_fullPicture.jpg", name: "Белый вязаный свитер в полоску", category: "knitwear", color: "белый в тёмно-синюю полоску", seasons: ["spring", "autumn", "winter"] },
  { file: "Верх/Длинный рукав/photo-2923_singular_display_fullPicture.jpg", name: "Полосатый лонгслив бретонский", category: "tops", color: "белый в чёрную полоску", seasons: ["spring", "autumn"] },
  { file: "Верх/Длинный рукав/photo-2926_singular_display_fullPicture.jpg", name: "Розовый вязаный джемпер", category: "knitwear", color: "ярко-розовый", seasons: ["spring", "autumn", "winter"] },
  { file: "Верх/Длинный рукав/photo-2967_singular_display_fullPicture.jpg", name: "Белый базовый лонгслив", category: "tops", color: "белый", seasons: ["spring", "autumn", "winter"] },
  { file: "Верх/Длинный рукав/photo-2970_singular_display_fullPicture.jpg", name: "Чёрный базовый лонгслив", category: "tops", color: "чёрный", seasons: ["spring", "autumn", "winter"] },
  { file: "Верх/Длинный рукав/photo-3046_singular_display_fullPicture.jpg", name: "Тёмно-серый лонгслив с воротником-стойкой", category: "tops", color: "тёмно-серый", seasons: ["autumn", "winter"] },
  { file: "Верх/Короткий рукав, топы/photo-2709_singular_display_fullPicture.jpg", name: "Белая базовая футболка", category: "tops", color: "белый", seasons: ["spring", "summer"] },
  { file: "Верх/Короткий рукав, топы/photo-2712_singular_display_fullPicture.jpg", name: "Белая футболка с принтом Микки Мауса", category: "tops", color: "белый", seasons: ["spring", "summer"] },
  { file: "Верх/Короткий рукав, топы/photo-2952_singular_display_fullPicture.jpg", name: "Чёрный топ-бюстье с баской", category: "tops", color: "чёрный", seasons: ["spring", "summer"] },
  { file: "Верх/Короткий рукав, топы/photo-2976_singular_display_fullPicture.jpg", name: "Оверсайз футболка хаки с логотипом", category: "tops", color: "хаки", seasons: ["spring", "summer", "autumn"] },
  { file: "Верх/Короткий рукав, топы/photo-2982_singular_display_fullPicture.jpg", name: "Жёлтый кардиган с коротким рукавом", category: "tops", color: "жёлтый", seasons: ["spring", "summer"] },
  { file: "Верх/Короткий рукав, топы/photo-3042_singular_display_fullPicture.jpg", name: "Белый кроп-топ бралетт", category: "tops", color: "белый", seasons: ["summer"] },
  { file: "Верх/Короткий рукав, топы/photo-3049_singular_display_fullPicture.jpg", name: "Белая майка на тонких бретелях", category: "tops", color: "белый", seasons: ["spring", "summer"] },
  { file: "Верх/Короткий рукав, топы/photo-3052_singular_display_fullPicture.jpg", name: "Белая майка-борцовка", category: "tops", color: "белый", seasons: ["spring", "summer"] },
  { file: "Верх/Короткий рукав, топы/photo-3054_singular_display_fullPicture.jpg", name: "Серый кроп-топ борцовка", category: "tops", color: "серый меланж", seasons: ["spring", "summer"] },
  { file: "Верх/Короткий рукав, топы/photo-3058_singular_display_fullPicture.jpg", name: "Ярко-розовый кроп-топ перекрёстный", category: "tops", color: "ярко-розовый", seasons: ["summer"] },
  { file: "Верх/Короткий рукав, топы/photo-3060_singular_display_fullPicture.jpg", name: "Ярко-розовая майка-борцовка в рубчик", category: "tops", color: "ярко-розовый", seasons: ["spring", "summer"] },
  { file: "Верх/Короткий рукав, топы/photo-3063_singular_display_fullPicture.jpg", name: "Белый укороченный топ-борцовка", category: "tops", color: "белый", seasons: ["spring", "summer"] },
  { file: "Верхняя одежда/photo-3095_singular_display_fullPicture.jpg", name: "Бежевый тренч классический", category: "outerwear", color: "бежевый", seasons: ["spring", "autumn"] },
  { file: "Верхняя одежда/photo-3098_singular_display_fullPicture.jpg", name: "Бежевая стёганая куртка с поясом", category: "outerwear", color: "бежевый", seasons: ["spring", "autumn"] },
  { file: "Верхняя одежда/photo-3104_singular_display_fullPicture.jpg", name: "Короткий дутый пуховик с капюшоном", category: "outerwear", color: "тёмно-бежевый", seasons: ["autumn", "winter"] },
  { file: "Низ/IMG_9105.jpg", name: "Голубые джинсы прямого кроя", category: "bottoms", color: "голубой", seasons: ["spring", "summer", "autumn"] },
  { file: "Низ/photo-2636_singular_display_fullPicture.jpg", name: "Чёрная джинсовая мини-юбка", category: "bottoms", color: "чёрный", seasons: ["spring", "summer", "autumn"] },
  { file: "Низ/photo-2667_singular_display_fullPicture.jpg", name: "Красная юбка миди в клетку виши", category: "bottoms", color: "красно-белый", seasons: ["spring", "summer"] },
  { file: "Низ/photo-2676_singular_display_fullPicture.jpg", name: "Тёмно-синие джинсы широкого кроя", category: "bottoms", color: "тёмно-синий", seasons: ["spring", "summer", "autumn", "winter"] },
  { file: "Низ/photo-2688_singular_display_fullPicture.jpg", name: "Серые спортивные джоггеры", category: "bottoms", color: "серый меланж", seasons: ["spring", "autumn", "winter"] },
  { file: "Низ/photo-2928_singular_display_fullPicture.jpg", name: "Белая мини-юбка с воланом", category: "bottoms", color: "белый", seasons: ["spring", "summer"] },
  { file: "Низ/photo-2932_singular_display_fullPicture.jpg", name: "Джинсовые шорты светло-голубые", category: "bottoms", color: "голубой", seasons: ["summer"] },
  { file: "Низ/photo-2935_singular_display_fullPicture.jpg", name: "Льняные бежевые шорты", category: "bottoms", color: "бежевый", seasons: ["summer"] },
  { file: "Низ/photo-2940_singular_display_fullPicture.jpg", name: "Белые джинсовые шорты", category: "bottoms", color: "белый", seasons: ["summer"] },
  { file: "Низ/photo-2943_singular_display_fullPicture.jpg", name: "Белые льняные брюки-кюлоты", category: "bottoms", color: "белый", seasons: ["spring", "summer"] },
  { file: "Низ/photo-2946_singular_display_fullPicture.jpg", name: "Белая лёгкая мини-юбка", category: "bottoms", color: "белый", seasons: ["spring", "summer"] },
  { file: "Низ/photo-2949_singular_display_fullPicture.jpg", name: "Розовые лёгкие шорты на завязках", category: "bottoms", color: "пудрово-розовый", seasons: ["summer"] },
  { file: "Низ/photo-2961_singular_display_fullPicture.jpg", name: "Светлые трикотажные широкие брюки", category: "bottoms", color: "светло-серый меланж", seasons: ["spring", "summer", "autumn"] },
  { file: "Низ/photo-2979_singular_display_fullPicture.jpg", name: "Мятные спортивные шорты", category: "bottoms", color: "мятный", seasons: ["summer"] },
  { file: "Обувь/IMG_9081.jpg", name: "Кроссовки New Balance", category: "shoes", color: "бежево-серый", seasons: ["spring", "summer", "autumn"] },
]

const PHOTOS_DIR = '/tmp/wardrobe-jpg'

async function main() {
  // We need the user's UID. Since we can't sign in as the user directly,
  // we'll use the Firebase Admin approach or get UID from the auth.
  // For now, let's use the REST API to find the user by email.

  const email = process.env.FIREBASE_SEED_EMAIL
  const password = process.env.FIREBASE_SEED_PASSWORD
  if (!email || !password) {
    console.error('Установите FIREBASE_SEED_EMAIL и FIREBASE_SEED_PASSWORD в .env')
    process.exit(1)
  }

  console.log(`Авторизация как ${email}...`)
  const { user } = await signInWithEmailAndPassword(auth, email, password)
  const uid = process.argv[2] || user.uid

  console.log(`Загрузка гардероба для пользователя: ${uid}`)
  console.log(`Всего вещей: ${ITEMS.length}`)

  // Skip the duplicate (photo-2917 is the same shirt as photo-2914, front view)
  const items = ITEMS

  let uploaded = 0
  const results = []

  for (const item of items) {
    const filePath = join(PHOTOS_DIR, item.file)
    try {
      const fileData = readFileSync(filePath)
      const blob = new Blob([fileData], { type: 'image/jpeg' })

      // Upload to Firebase Storage
      const storagePath = `photos/${uid}/${Date.now()}-${basename(item.file)}`
      const storageRef = ref(storage, storagePath)
      await uploadBytes(storageRef, blob)
      const imageUrl = await getDownloadURL(storageRef)

      results.push({
        name: item.name,
        category: item.category,
        color: item.color,
        seasons: item.seasons,
        imageUrl,
      })

      uploaded++
      console.log(`[${uploaded}/${items.length}] ✓ ${item.name}`)

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200))
    } catch (err) {
      console.error(`[${uploaded + 1}/${items.length}] ✗ ${item.name}: ${err.message}`)
      uploaded++
    }
  }

  // Write all items to Firestore in batches (max 500 per batch)
  console.log(`\nЗапись ${results.length} вещей в Firestore...`)

  const BATCH_SIZE = 400
  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = results.slice(i, i + BATCH_SIZE)

    for (const item of chunk) {
      const docRef = doc(collection(db, 'capsule', uid, 'wardrobe'))
      batch.set(docRef, item)
    }

    await batch.commit()
    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: записано ${chunk.length} вещей`)
  }

  console.log(`\nГотово! Загружено ${results.length} вещей в гардероб.`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Ошибка:', err)
  process.exit(1)
})
