# Deployment Yol Haritası — Netlify Production Deploy

Bu belge, GetirStok projesini Netlify'a deploy edip production'da yayınlamak için gereken tüm adımları içerir.

---

## Genel Bakış

- **Platform:** Netlify
- **Build Tool:** Next.js (App Router)
- **Database:** Firebase Firestore
- **Erişim:** Public (Auth yok, herkes erişebilir)

---

## Faz 1 — Netlify Hesabı ve Proje Hazırlığı

### 1.1 Netlify Hesabı Oluşturma

- [ ] [Netlify](https://www.netlify.com/) sitesine gidin
- [ ] "Sign up" butonuna tıklayın
- [ ] GitHub, GitLab veya Email ile hesap oluşturun (GitHub önerilir)
- [ ] Email doğrulamasını tamamlayın

### 1.2 Git Repository Hazırlığı

- [ ] Projeyi Git repository'ye push edin (GitHub, GitLab veya Bitbucket)
- [ ] `.env.local` dosyasının **push edilmediğinden** emin olun (`.gitignore`'da olmalı)
- [ ] `README.md` dosyasını güncelleyin (opsiyonel ama önerilir)
- [ ] Commit ve push yapın:
  ```bash
  git add .
  git commit -m "Production deployment hazırlığı"
  git push origin main
  ```

**Önemli:** `.env.local` dosyası **asla** Git'e commit edilmemeli! Bu dosya sadece local development için kullanılır.

---

## Faz 2 — Netlify Proje Bağlantısı

### 2.1 Yeni Site Oluşturma

- [ ] Netlify Dashboard'a gidin
- [ ] "Add new site" → "Import an existing project" seçin
- [ ] Git provider'ınızı seçin (GitHub, GitLab, Bitbucket)
- [ ] Repository'nizi seçin (`getirstok`)
- [ ] "Import" butonuna tıklayın

### 2.2 Build Ayarları

Netlify otomatik olarak Next.js projesini algılamalı, ama kontrol edin:

- [ ] **Build command:** `npm run build` (veya `next build`)
- [ ] **Publish directory:** `.next` (Next.js otomatik algılar, genelde boş bırakılabilir)
- [ ] **Node version:** `18.x` veya `20.x` (Netlify otomatik algılar)

**Not:** `netlify.toml` dosyası varsa bu ayarlar oradan okunur.

---

## Faz 3 — Environment Variables (Firebase Config)

### 3.1 Firebase Config Değerlerini Netlify'a Ekleme

- [ ] Netlify Dashboard → Site Settings → Environment Variables
- [ ] "Add a variable" butonuna tıklayın
- [ ] Şu değişkenleri tek tek ekleyin:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyB-Zo876v_-NocjRPkouXlQsI_z0lUjFbQ
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=getirstok-75621.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=getirstok-75621
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=getirstok-75621.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=831395541570
NEXT_PUBLIC_FIREBASE_APP_ID=1:831395541570:web:1303624e67fd965f1cb3db
```

**Önemli:** 
- Her değişkeni ayrı ayrı ekleyin
- `NEXT_PUBLIC_` prefix'i olan değişkenler client-side'da kullanılabilir
- Değerleri `.env.local` dosyanızdan kopyalayın

### 3.2 Environment Variables Kontrolü

- [ ] Tüm 6 değişkenin eklendiğini kontrol edin
- [ ] Değerlerin doğru olduğundan emin olun (typo yok)
- [ ] "Save" butonuna tıklayın

---

## Faz 4 — Netlify Build Konfigürasyonu

### 4.1 netlify.toml Kontrolü

`netlify.toml` dosyası zaten mevcut olmalı. İçeriğini kontrol edin:

```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

### 4.2 Next.js Netlify Plugin

- [ ] `@netlify/plugin-nextjs` paketinin kurulu olduğundan emin olun:
  ```bash
  npm install --save-dev @netlify/plugin-nextjs
  ```
- [ ] `package.json`'da `devDependencies` içinde olduğunu kontrol edin

**Not:** Next.js 13+ için Netlify plugin gerekli değil, ama önerilir.

---

## Faz 5 — İlk Deploy

### 5.1 Deploy Başlatma

- [ ] Netlify Dashboard → "Deploy site" butonuna tıklayın
- [ ] Veya Git repository'ye push yapın (otomatik deploy tetiklenir)
- [ ] Build loglarını izleyin

### 5.2 Build Log Kontrolü

Build sırasında şunları kontrol edin:

- [ ] Build başarıyla tamamlanıyor mu?
- [ ] Firebase config değerleri yükleniyor mu? (log'larda görünmemeli, ama hata da olmamalı)
- [ ] Next.js build hatası var mı?
- [ ] TypeScript/ESLint hataları var mı?

**Sorun varsa:**
- Build loglarını kontrol edin
- Environment variables'ların doğru olduğundan emin olun
- Local'de `npm run build` çalışıyor mu kontrol edin

---

## Faz 6 — Firebase Firestore Security Rules (Production)

### 6.1 Security Rules Kontrolü

Firebase Console'da Security Rules'u kontrol edin:

- [ ] Firebase Console → Firestore Database → Rules
- [ ] Şu kuralların aktif olduğundan emin olun:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /stock_items/{itemId} {
      allow read: if true;
      allow create: if true;
      allow update: if true;
      allow delete: if true;
    }
    
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**Önemli:** Bu kurallar herkesin erişimine izin verir. Production'da daha güvenli kurallar kullanılabilir (rate limiting, domain kontrolü vb.).

### 6.2 Firestore Index Kontrolü

- [ ] Firebase Console → Firestore Database → Indexes
- [ ] Herhangi bir index hatası var mı kontrol edin
- [ ] Gerekirse index'leri oluşturun (şu an için gerekli değil)

---

## Faz 7 — Production Test

### 7.1 Site Erişimi

- [ ] Netlify Dashboard → Site Overview → "Open production deploy" butonuna tıklayın
- [ ] Site açılıyor mu kontrol edin
- [ ] Console'u açın (F12) ve hata var mı kontrol edin

### 7.2 Firebase Bağlantı Testi

- [ ] Tarayıcı konsolunda `✅ Firebase config yüklendi` mesajını görün
- [ ] `📡 Firestore subscription başlatılıyor...` mesajını görün
- [ ] `📦 Firestore'dan X kayıt alındı` mesajını görün
- [ ] Hata mesajı yoksa Firebase bağlantısı başarılı

### 7.3 Fonksiyonellik Testi

- [ ] **Ürün Ekleme:** Bir eksik/fazla ürün ekleyin
- [ ] **Ürün Listeleme:** Eklenen ürünün listede göründüğünü kontrol edin
- [ ] **Ürün Düzenleme:** Bir ürünü düzenleyin
- [ ] **Ürün Silme:** Bir ürünü silin
- [ ] **Arama:** Arama fonksiyonunu test edin
- [ ] **Sayfa Yenileme:** Sayfayı yenileyin (F5) → Veriler kalıcı mı?

### 7.4 Mobil Test

- [ ] Mobil cihazdan siteyi açın
- [ ] Responsive tasarımın çalıştığını kontrol edin
- [ ] Tüm butonların çalıştığını test edin

---

## Faz 8 — Domain ve URL Ayarları

### 8.1 Netlify Domain

Netlify otomatik olarak bir domain verir:
- Format: `getirstok-xxxxx.netlify.app`
- Bu domain'i kullanabilirsiniz veya özel domain ekleyebilirsiniz

### 8.2 Özel Domain Ekleme (Opsiyonel)

- [ ] Netlify Dashboard → Domain settings
- [ ] "Add custom domain" butonuna tıklayın
- [ ] Domain'inizi girin (örn: `getirstok.com`)
- [ ] DNS ayarlarını yapın (Netlify size talimat verecek)

---

## Faz 9 — Production Optimizasyonları

### 9.1 Build Optimizasyonu

- [ ] `next.config.ts` dosyasını kontrol edin
- [ ] Gerekirse optimizasyon ayarları ekleyin:

```typescript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Production optimizasyonları
  compress: true,
  poweredByHeader: false,
  // ...
};

export default nextConfig;
```

### 9.2 Analytics ve Monitoring (Opsiyonel)

- [ ] Netlify Analytics'i etkinleştirin (ücretli plan gerekebilir)
- [ ] Firebase Analytics ekleyin (opsiyonel)
- [ ] Error tracking ekleyin (Sentry, LogRocket vb.)

---

## Faz 10 — Dokümantasyon ve Paylaşım

### 10.1 README Güncelleme

`README.md` dosyasını güncelleyin:

```markdown
# GetirStok - Stok Takip Paneli

Public stok takip paneli. Eksik ve fazla ürünleri takip edin.

## 🚀 Canlı Site

[Netlify URL'i buraya]

## 🛠️ Teknolojiler

- Next.js 16
- Firebase Firestore
- Tailwind CSS
- TypeScript

## 📝 Kullanım

1. Siteyi açın
2. "Eksik Ürün Ekle" veya "Fazla Ürün Ekle" butonuna tıklayın
3. Ürün bilgilerini girin
4. Kaydedin

## 🔧 Development

\`\`\`bash
npm install
npm run dev
\`\`\`
```

### 10.2 Link Paylaşımı

- [ ] Netlify URL'ini kopyalayın
- [ ] İhtiyacı olanlarla paylaşın
- [ ] Bookmark ekleyin

---

## Sorun Giderme

### Build Hatası

**Sorun:** Build başarısız oluyor

**Çözüm:**
1. Local'de `npm run build` çalıştırın ve hataları kontrol edin
2. Environment variables'ların doğru olduğundan emin olun
3. Node version'ı kontrol edin (Netlify → Site Settings → Build & Deploy → Environment)
4. Build loglarını detaylı inceleyin

### Firebase Bağlantı Hatası

**Sorun:** Production'da Firebase bağlantısı çalışmıyor

**Çözüm:**
1. Environment variables'ların Netlify'da tanımlı olduğundan emin olun
2. Firebase Console'da Firestore'un aktif olduğunu kontrol edin
3. Security Rules'un doğru olduğunu kontrol edin
4. Tarayıcı konsolunda hata mesajlarını kontrol edin

### Veriler Görünmüyor

**Sorun:** Production'da veriler görünmüyor

**Çözüm:**
1. Firestore'da verilerin olduğunu kontrol edin (Firebase Console)
2. Security Rules'un read izni verdiğinden emin olun
3. Tarayıcı konsolunda Firestore subscription hatalarını kontrol edin

### Sayfa Yenilendiğinde Veriler Kayboluyor

**Sorun:** Production'da sayfa yenilendiğinde veriler kayboluyor

**Çözüm:**
1. Firestore'da verilerin gerçekten kaydedildiğini kontrol edin
2. Security Rules'un doğru olduğundan emin olun
3. Environment variables'ların production'da doğru olduğunu kontrol edin

---

## Özet Checklist

### Pre-Deployment
- [ ] Git repository'ye push edildi
- [ ] `.env.local` Git'e commit edilmedi
- [ ] Local'de `npm run build` başarılı
- [ ] Tüm testler geçiyor

### Deployment
- [ ] Netlify hesabı oluşturuldu
- [ ] Git repository Netlify'a bağlandı
- [ ] Environment variables eklendi (6 adet)
- [ ] Build ayarları kontrol edildi
- [ ] İlk deploy başarılı

### Post-Deployment
- [ ] Site açılıyor
- [ ] Firebase bağlantısı çalışıyor
- [ ] Ürün ekleme çalışıyor
- [ ] Ürün listeleme çalışıyor
- [ ] Ürün düzenleme çalışıyor
- [ ] Ürün silme çalışıyor
- [ ] Arama çalışıyor
- [ ] Sayfa yenileme sonrası veriler kalıcı
- [ ] Mobil responsive çalışıyor

---

## Sonraki Adımlar (Opsiyonel)

- [ ] Özel domain ekleme
- [ ] SSL sertifikası (Netlify otomatik sağlar)
- [ ] Analytics ekleme
- [ ] Error tracking ekleme
- [ ] Rate limiting ekleme (Firestore Security Rules)
- [ ] Backup stratejisi (Firestore export)
- [ ] Monitoring ve alerting

---

## Destek ve Kaynaklar

- [Netlify Dokümantasyonu](https://docs.netlify.com/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Firebase Firestore](https://firebase.google.com/docs/firestore)
- [Firebase Security Rules](https://firebase.google.com/docs/rules)

---

**Deployment tamamlandıktan sonra bu checklist'i işaretleyin ve Netlify URL'ini paylaşın! 🚀**

