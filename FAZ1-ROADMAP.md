# Faz 1 — Proje ve Ortam Kurulumu (Detaylı Yol Haritası)

Bu belge, Faz 1'in tüm adımlarını tek tek listeler. Her görevi tamamladıkça `[ ]` işaretini `[x]` yaparak ilerleyeceğiz.

**Amaç:** Next.js projesi oluşturmak, gerekli bağımlılıkları eklemek ve Netlify'a uyumlu yapıyı hazırlamak.

---

## 1. Next.js Projesi Oluşturma

- [x] Proje dizininde terminal aç (getirstok klasöründe)
- [x] `npx create-next-app@latest .` komutunu çalıştır (mevcut klasöre kurulum)
- [x] Sorulduğunda **TypeScript** kullan (Yes)
- [x] Sorulduğunda **ESLint** kullan (Yes)
- [x] Sorulduğunda **Tailwind CSS** kullan (Yes)
- [x] Sorulduğunda **`src/` directory** kullanıp kullanmama tercihini yap (tutarlı kalsın diye not al)
- [x] Sorulduğunda **App Router** kullan (Yes)
- [x] Sorulduğunda **turbopack** ile `next dev` için isteğe bağlı ayarı yap (isteğe bağlı)
- [x] Kurulum bitince `npm run dev` ile uygulamanın ayağa kalktığını kontrol et
- [x] Tarayıcıda `http://localhost:3000` açıldığını ve varsayılan Next.js sayfasının göründüğünü doğrula

---

## 2. Tailwind CSS Kurulumu ve Yapılandırma

- [x] Tailwind'in create-next-app ile zaten kurulu olduğunu kontrol et (`package.json` içinde `tailwindcss` var mı bak)
- [x] `tailwind.config.ts` veya `tailwind.config.js` dosyasının proje kökünde olduğunu doğrula (Tailwind v4: yapılandırma `globals.css` içinde `@theme` ile yapılıyor, ayrı config dosyası yok)
- [x] `tailwind.config` içinde `content` (veya `sources`) alanının doğru klasörleri taradığını kontrol et (v4: otomatik içerik tespiti, `app/` taranıyor)
- [x] `app/globals.css` (veya `src/app/globals.css`) dosyasında `@tailwind base;`, `@tailwind components;`, `@tailwind utilities;` direktiflerinin bulunduğunu doğrula (v4: `@import "tailwindcss"` kullanılıyor)
- [x] İstersen `tailwind.config` içinde tema genişletmesi (renk, font) ekle — proje için tutarlı bir palet kullanılacaksa not al (`@theme inline` içinde primary, missing, extra renkleri eklendi)

---

## 3. Tailwind — Responsive / Mobil Uyumlu Temel Ayarlar

- [x] `globals.css` içinde varsayılan bir `body` stili ekle (font-family, margin sıfır, box-sizing)
- [x] Gerekirse root container için max-width ve mx-auto kullanımına karar ver (sayfa genişliği sınırı)
- [x] Tailwind breakpoints'lerini (sm, md, lg, xl) kullanacağını not al; ekstra config gerekmeden varsayılanlar yeterli
- [x] Mobil öncelikli (mobile-first) class yazımına uygun çalışacağını hatırda tut

---

## 4. Firebase Paketini Kurma

- [x] Proje kökünde `npm install firebase` komutunu çalıştır
- [x] `package.json` içinde `firebase` bağımlılığının eklendiğini kontrol et
- [x] Firebase dokümantasyonuna göre sadece Firestore kullanacağımız için ekstra modül (auth vb.) kurmaya gerek olmadığını doğrula

---

## 5. Environment Variables ve Firebase Config

- [x] Proje kökünde `.env.local` dosyası oluştur
- [x] `.env.local` içine `NEXT_PUBLIC_FIREBASE_API_KEY=` ekle (değeri Firebase Console'dan alınacak)
- [x] `.env.local` içine `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=` ekle
- [x] `.env.local` içine `NEXT_PUBLIC_FIREBASE_PROJECT_ID=` ekle
- [x] `.env.local` içine `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=` ekle
- [x] `.env.local` içine `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=` ekle
- [x] `.env.local` içine `NEXT_PUBLIC_FIREBASE_APP_ID=` ekle
- [x] `.gitignore` dosyasında `.env*.local` veya `.env.local`'in ignore edildiğini kontrol et (Next.js varsayılanında vardır)
- [x] Firebase Console'da proje oluşturulduysa bu değerleri oradan kopyalayacağını not al; henüz yoksa placeholder bırak

---

## 6. Firebase Initialize ve Firestore Modül Dosyası (İskelet)

- [x] `lib` klasörü oluştur: `app/lib` veya `src/lib` (proje yapına göre)
- [x] `lib/firebase.ts` (veya `lib/firebase.js`) dosyası oluştur
- [x] Dosyanın içinde `initializeApp` ve `getFirestore` import satırlarını ekle (şimdilik gerçek config Faz 2'de yazılacak)
- [x] Dosyada `const app = initializeApp(...)` ve `export const db = getFirestore(app)` benzeri iskelet yapıyı yorum satırı veya placeholder ile bırak (Faz 2'de env'den okuyacak şekilde dolduracağız)
- [x] Bu dosyanın hiçbir yerde henüz import edilmediğini bil; Faz 2'de kullanılacak

---

## 7. Lucide-React Paketini Kurma

- [x] Proje kökünde `npm install lucide-react` komutunu çalıştır
- [x] `package.json` içinde `lucide-react` bağımlılığının eklendiğini kontrol et
- [x] Test amaçlı bir sayfada veya layout'ta bir ikon import edip render et (örn. `import { Search } from 'lucide-react'`) — isteğe bağlı, kurulumun çalıştığını doğrulamak için
- [x] Test ikonunu sonra kaldırabilirsin; Faz 3+ ile gerçek kullanım gelecek

---

## 8. Netlify Yapılandırma Dosyası

- [x] Proje kökünde `netlify.toml` dosyası oluştur
- [x] `netlify.toml` içinde `[build]` bölümü ekle
- [x] `[build]` altında `command` tanımla: Next.js için genelde `npm run build` veya `npx next build`
- [x] `[build]` altında `publish` (veya `publish_directory`) tanımla: Next.js Netlify eklentisi kullanılıyorsa genelde `.next` veya eklentinin önerdiği çıktı; Netlify'ın “Next.js” tespiti otomatik publish ayarı yapabilir — dokümantasyona göre `publish = ".next"` veya eklentiye bırak
- [x] Gerekirse `[build.environment]` ile Node sürümü belirle (örn. `NODE_VERSION = "18"`)

---

## 9. Netlify — Build ve Publish Ayarlarını Netleştirme

- [x] Netlify'da Next.js projeleri için “Netlify Next.js plugin” veya built-in desteğin kullanıldığını dokümantasyondan kontrol et
- [x] `netlify.toml` içinde `publish` değerinin doğru olduğundan emin ol (Next.js için çoğu zaman otomatik)
- [x] Build komutunun `npm run build` olduğunu netleştir

---

## 10. Projenin Hatasız Build Edilmesi

- [x] Proje kökünde `npm run build` komutunu çalıştır
- [x] Build'in hata vermeden tamamlandığını kontrol et
- [x] Çıktıda `.next` (veya yapılandırmaya göre `out`) klasörünün oluştuğunu doğrula
- [x] Varsa ESLint uyarılarını not al; kritik hata yoksa Faz 1 tamamlanmış sayılır

---

## Faz 1 Tamamlandığında

- [x] Tüm yukarıdaki maddeleri `[x]` yaptıktan sonra ana `ROADMAP.md` içindeki Faz 1 görevlerini de işaretle
- [x] Faz 2'ye geçmeye hazır olduğunu doğrula

---

*Bu dosya sadece Faz 1'e özeldir. Genel proje yol haritası için `ROADMAP.md` kullanılır.*
