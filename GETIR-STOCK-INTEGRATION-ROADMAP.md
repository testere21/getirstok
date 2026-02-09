# Getir Stok Entegrasyonu — Detaylı Yol Haritası

Bu belge, Getir panelindeki orijinal stok miktarını panelimizde göstermek için gerekli tüm adımları içerir. Her görevi tamamladıkça `[ ]` işaretini `[x]` yaparak ilerleyeceğiz.

**Amaç:** Getir Bayi panelinden (franchise.getir.com) otomatik token yakalama ve bu token ile Getir API'sinden gerçek zamanlı stok bilgisi çekme.

**Sistem Mimarisi:**
1. **Chrome Eklentisi:** franchise.getir.com'da network isteklerini dinler, Authorization Bearer token'ı yakalar
2. **Token Kaydetme API:** Yakalanan token Next.js API endpoint'ine gönderilir ve Firebase Firestore'a kaydedilir
3. **Getir API Entegrasyonu:** Panelde "Stok Getir" butonuna basıldığında, Firebase'den token alınır ve Getir API'sine sorgu atılır
4. **UI Gösterimi:** Getir'den gelen stok miktarı ürün kartında gösterilir

---

## Faz 1 — Chrome Eklentisi Geliştirme (Token Yakalama)

**Amaç:** Chrome eklentisi oluşturup franchise.getir.com'da Authorization Bearer token'ını yakalamak.

### 1.1 Eklenti Proje Yapısı

- [x] Proje kökünde `chrome-extension/` klasörü oluştur
- [x] `chrome-extension/manifest.json` dosyası oluştur (Manifest V3 formatında)
- [x] `chrome-extension/background.js` veya `background.ts` dosyası oluştur (service worker)
- [x] `chrome-extension/content.js` veya `content.ts` dosyası oluştur (content script)
- [x] `chrome-extension/popup.html` ve `popup.js` dosyaları oluştur (opsiyonel, token durumunu göstermek için)

### 1.2 Manifest.json Yapılandırması

- [x] `manifest_version: 3` kullan
- [x] `name`, `version`, `description` alanlarını doldur
- [x] `permissions` array'ine `"webRequest"` ve `"storage"` ekle
- [x] `host_permissions` array'ine `"https://franchise.getir.com/*"` ve `"https://franchise-api-gateway.getirapi.com/*"` ekle
- [x] `background` service worker tanımla
- [x] `content_scripts` tanımla: `franchise.getir.com` için content script ekle
- [x] `action` (popup) tanımla (opsiyonel)

### 1.3 Network Request İzleme (Background Service Worker)

- [x] `chrome.webRequest.onBeforeSendHeaders` event listener ekle
- [x] Sadece `franchise-api-gateway.getirapi.com/stocks` endpoint'ine giden istekleri filtrele
- [x] Request headers'dan `Authorization` header'ını yakala
- [x] Bearer token'ı parse et (format: `Bearer eyJ...`)
- [x] Token'ı `chrome.storage.local` veya `chrome.storage.sync`'e kaydet
- [x] Token yakalandığında console'a log yaz (debug için)

### 1.4 Content Script (Opsiyonel — UI İyileştirme)

- [x] Content script'i `franchise.getir.com` sayfasına inject et
- [x] Token yakalandığında kullanıcıya görsel geri bildirim göster (badge, notification vb.)
- [x] Token durumunu gösteren bir UI elementi ekle (opsiyonel)

### 1.5 Token Gönderme (API'ye POST)

- [x] Content script veya background script'te Next.js API endpoint'ine POST isteği yap
- [x] `fetch('https://getirstok.netlify.app/api/token/save', { method: 'POST', body: JSON.stringify({ token }) })` 
- [x] CORS hatası varsa, API endpoint'inde CORS header'ları ekle (Faz 3'te yapılacak)
- [x] Başarılı/başarısız durumları handle et
- [x] Hata durumunda kullanıcıya bilgi ver (console veya notification)

### 1.6 Eklenti Test ve Paketleme

- [ ] Chrome'da `chrome://extensions/` aç
- [ ] "Developer mode" aktif et
- [ ] "Load unpacked" ile `chrome-extension/` klasörünü yükle
- [ ] `franchise.getir.com`'a git ve stocks sayfasını aç
- [ ] Network tab'de stocks isteğinin yapıldığını kontrol et
- [ ] Eklentinin token'ı yakaladığını doğrula (console log veya storage)
- [ ] Token'ın API'ye gönderildiğini doğrula

**Çıktı:** Çalışan Chrome eklentisi, franchise.getir.com'da token yakalıyor ve Next.js API'ye gönderiyor.

---

## Faz 2 — Firestore Token Storage Yapısı

**Amaç:** Token'ları saklamak için Firestore koleksiyon yapısını oluşturmak.

### 2.1 Token Koleksiyonu ve Şema Tasarımı

- [x] `app/lib/types.ts` dosyasını aç
- [x] `GetirToken` interface'i oluştur:
  ```typescript
  interface GetirToken {
    token: string; // Bearer token (eyJ...)
    createdAt: string; // ISO string
    updatedAt?: string; // ISO string (son güncelleme)
    isValid?: boolean; // Token geçerli mi (opsiyonel, API test sonucu)
    lastUsedAt?: string; // Son kullanım zamanı (opsiyonel)
  }
  ```
- [x] `GETIR_TOKEN_COLLECTION = "getir_tokens"` constant'ı ekle
- [x] Token koleksiyonu için tek bir doküman kullan (singleton pattern) veya her token için ayrı doküman (geçmiş tutmak için)
- [x] **Karar:** Singleton pattern kullan (tek aktif token olsun, eski token'ları override et)

### 2.2 Firestore Security Rules Güncelleme

- [x] `firestore.rules` dosyasını aç
- [x] `getir_tokens` koleksiyonu için kurallar ekle:
  ```javascript
  match /getir_tokens/{tokenId} {
    allow read: if true; // Herkes okuyabilir (public)
    allow create: if true; // Herkes oluşturabilir (Chrome eklentisi)
    allow update: if true; // Herkes güncelleyebilir
    allow delete: if false; // Silme yok (güvenlik)
  }
  ```
- [x] Firebase Console'da rules'u deploy et (opsiyonel, local test için gerekmez)

### 2.3 Token Servis Fonksiyonları

- [x] `app/lib/getirTokenService.ts` dosyası oluştur
- [x] `saveGetirToken(token: string): Promise<void>` fonksiyonu yaz
  - Firestore'da `getir_tokens` koleksiyonunda `active` ID'li doküman oluştur/güncelle
  - `createdAt` ve `updatedAt` timestamp'lerini set et
- [x] `getGetirToken(): Promise<string | null>` fonksiyonu yaz
  - `getir_tokens/active` dokümanını oku
  - `token` field'ını döndür, yoksa `null`
- [x] `checkTokenValidity(token: string): Promise<boolean>` fonksiyonu yaz (opsiyonel)
  - Getir API'sine test isteği at
  - 200 OK dönerse `true`, 401/403 dönerse `false`

**Çıktı:** Token'ları saklamak ve okumak için Firestore yapısı ve servis fonksiyonları hazır.

---

## Faz 3 — Next.js API Endpoint (Token Kaydetme)

**Amaç:** Chrome eklentisinden gelen token'ı alıp Firestore'a kaydetmek.

### 3.1 API Route Oluşturma

- [x] `app/api/token/save/route.ts` dosyası oluştur
- [x] `POST` method handler yaz
- [x] Request body'den `token` field'ını parse et
- [x] Token validasyonu yap (string, boş değil, JWT formatı kontrolü)
- [x] `getirTokenService.saveGetirToken()` fonksiyonunu çağır
- [x] Başarılı durumda `200 OK` ve `{ success: true }` döndür
- [x] Hata durumunda `400/500` ve hata mesajı döndür

### 3.2 CORS Yapılandırması

- [x] API route'unda CORS header'ları ekle:
  ```typescript
  const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*", // veya sadece Chrome extension origin
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  ```
- [x] `OPTIONS` method handler ekle (preflight request için)
- [x] Her response'da CORS header'larını ekle

### 3.3 Güvenlik ve Validasyon

- [x] Token formatını kontrol et (JWT formatı: `eyJ...` ile başlamalı)
- [x] Token uzunluğunu kontrol et (min 50 karakter)
- [x] Rate limiting ekle (opsiyonel, aynı IP'den çok fazla istek gelirse)
- [x] Request logging ekle (console.log ile token'ın ilk 10 karakterini logla, tam token'ı loglama)

### 3.4 Test

- [ ] Postman veya curl ile API'yi test et:
  ```bash
  curl -X POST https://getirstok.netlify.app/api/token/save \
    -H "Content-Type: application/json" \
    -d '{"token": "Bearer eyJ..."}'
  ```
- [ ] Başarılı response'u kontrol et
- [ ] Firestore'da `getir_tokens/active` dokümanının oluştuğunu/güncellendiğini kontrol et

**Çıktı:** Chrome eklentisinden token alıp Firestore'a kaydeden çalışan API endpoint.

---

## Faz 4 — Getir API Entegrasyonu (Token Kullanma)

**Amaç:** Firebase'den token alıp Getir API'sine sorgu atarak stok bilgisi çekmek.

### 4.1 Getir API Servis Fonksiyonu

- [x] `app/lib/getirApiService.ts` dosyası oluştur
- [x] `getGetirStock(barcode: string): Promise<number | null>` fonksiyonu yaz
  - Firebase'den token al (`getGetirToken()`)
  - Token yoksa `GetirApiError` throw et
  - `fetch('https://franchise-api-gateway.getirapi.com/stocks', { headers: { Authorization: token } })`
  - Response'dan stok miktarını parse et
  - Hata durumunda (401, 403, 404) `GetirApiError` throw et
  - Network hatası durumunda `GetirApiError` throw et

### 4.2 API Response Parsing

- [x] Getir API response formatını anla (örnek response'u test et)
- [x] Response'dan `barcode`'a göre stok miktarını bul (array veya object formatını handle eder)
- [x] Stok miktarını number olarak döndür
- [x] Ürün bulunamazsa `null` döndür

### 4.3 Hata Yönetimi

- [x] 401 Unauthorized: Token geçersiz, kullanıcıya "Token geçersiz, lütfen eklentiyi kullanarak yeni token ekleyin" mesajı
- [x] 403 Forbidden: Yetki yok, benzer mesaj
- [x] 404 Not Found: API endpoint bulunamadı mesajı
- [x] Network Error: "Bağlantı hatası, lütfen internet bağlantınızı kontrol edin" mesajı
- [x] Timeout: 10 saniye timeout eklendi (AbortController ile)

### 4.4 API Route (Server-Side)

- [x] `app/api/getir-stock/route.ts` dosyası oluştur
- [x] `GET` method handler yaz
- [x] Query parameter'dan `barcode` al (`?barcode=1234567890123`)
- [x] `getirApiService.getGetirStock(barcode)` çağır
- [x] Response'u JSON olarak döndür: `{ stock: number | null, error?: string, code?: string }`
- [x] CORS header'ları ekle

### 4.5 Test

- [ ] Postman ile API'yi test et:
  ```bash
  curl "https://getirstok.netlify.app/api/getir-stock?barcode=1234567890123"
  ```
- [ ] Geçerli token ile stok bilgisinin geldiğini kontrol et
- [ ] Geçersiz token ile hata mesajının geldiğini kontrol et
- [ ] Olmayan barcode ile `null` döndüğünü kontrol et

**Çıktı:** Getir API'sinden stok bilgisi çeken servis fonksiyonları ve API route.

---

## Faz 5 — UI Entegrasyonu (Stok Getir Butonu ve Gösterimi)

**Amaç:** Ürün kartında "Stok Getir" butonu eklemek ve Getir stok miktarını göstermek.

### 5.1 AddProductModal Component Güncelleme

- [x] `app/components/AddProductModal.tsx` dosyasını aç
- [x] Component state'ine `getirStock` ve `getirStockLoading` ekle:
  ```typescript
  const [getirStock, setGetirStock] = useState<number | null>(null);
  const [getirStockLoading, setGetirStockLoading] = useState(false);
  const [getirStockError, setGetirStockError] = useState<string | null>(null);
  ```
- [x] "Stok Getir" butonu ekle (sadece `catalogProduct` veya `initialItem` varsa göster)
- [x] Buton tıklanınca `handleGetGetirStock()` fonksiyonunu çağır

### 5.2 Stok Çekme Fonksiyonu

- [x] `handleGetGetirStock()` async fonksiyonu yaz
- [x] `getirStockLoading` state'ini `true` yap
- [x] `getirStockError` state'ini `null` yap
- [x] `barcode` değerini al (catalogProduct veya initialItem'den)
- [x] `/api/getir-stock?barcode=${barcode}` endpoint'ine fetch isteği yap
- [x] Response'dan `stock` değerini al
- [x] `setGetirStock(stock)` yap
- [x] Hata durumunda `setGetirStockError(errorMessage)` yap
- [x] `getirStockLoading` state'ini `false` yap

### 5.3 UI Gösterimi

- [x] "Stok Getir" butonunu ekle:
  - Lucide icon: `RefreshCw` veya `Download`
  - Loading state'inde spinner göster
  - Disabled state: loading sırasında buton disabled
- [x] Getir stok miktarını göster:
  - `getirStock !== null` ise bir card/box içinde göster
  - Format: "Getir Stoku: **X** adet" veya benzeri
  - Yeşil renk (başarılı), kırmızı (hata)
- [x] Hata mesajını göster:
  - `getirStockError` varsa ErrorMessage component'i ile göster
  - "Token geçersiz" mesajı için özel bir mesaj göster

### 5.4 Ürün Kartı Konumu

- [x] Butonu ve stok bilgisini nereye yerleştireceğini belirle:
  - Seçenek 1: Ürün bilgilerinin altında, miktar/notlar alanının üstünde ✅ (catalogProduct görünümünde)
  - Seçenek 2: Barkod input'unun altında (düzenleme modunda) ✅
- [x] Responsive tasarım: Mobil ve desktop'ta düzgün görünsün
- [x] Dark mode desteği: Dark mode'da da düzgün görünsün

### 5.5 Kullanıcı Deneyimi İyileştirmeleri

- [ ] İlk yüklemede otomatik stok çekme (opsiyonel): Modal açıldığında otomatik çek
- [ ] Toast notification: Başarılı stok çekme sonrası toast göster
- [ ] Skeleton loading: Loading sırasında skeleton UI göster

**Çıktı:** Ürün kartında "Stok Getir" butonu ve Getir stok miktarının gösterildiği UI.

---

## Faz 6 — Hata Yönetimi ve Güvenlik

**Amaç:** Token geçersizliği, API hataları ve güvenlik konularını ele almak.

### 6.1 Token Geçerlilik Kontrolü

- [ ] Token'ın expire olup olmadığını kontrol et (JWT decode ile, opsiyonel)
- [ ] API'den 401/403 geldiğinde token'ı `isValid: false` olarak işaretle
- [ ] Geçersiz token durumunda kullanıcıya açık mesaj göster:
  - "Token geçersiz. Lütfen Chrome eklentisini kullanarak franchise.getir.com'da yeni token ekleyin."
  - Link veya buton ekle (opsiyonel): "Token Nasıl Eklenir?" sayfasına yönlendir

### 6.2 Rate Limiting

- [ ] API route'larında rate limiting ekle (opsiyonel)
- [ ] Aynı IP'den çok fazla istek gelirse `429 Too Many Requests` döndür
- [ ] Client-side'da: Aynı barcode için 5 saniye içinde tekrar istek atma

### 6.3 Error Handling ve Logging

- [ ] Tüm API hatalarını logla (console.error)
- [ ] Kullanıcıya anlaşılır hata mesajları göster
- [ ] Network hatalarında retry mekanizması ekle (opsiyonel, 3 deneme)
- [ ] Timeout hatalarını handle et

### 6.4 Güvenlik

- [ ] Token'ı client-side'da saklama (sadece server-side'da kullan)
- [ ] API route'larında token'ı loglama (sadece ilk 10 karakterini logla)
- [ ] CORS ayarlarını sınırla (sadece gerekli origin'ler)
- [ ] Token'ı Firestore'da şifreleme (opsiyonel, hassas veri ise)

### 6.5 Token Yenileme Mekanizması (Opsiyonel)

- [ ] Token expire olmadan önce kullanıcıya uyarı göster
- [ ] "Token'ı Yenile" butonu ekle
- [ ] Eklenti ile yeni token eklendiğinde otomatik güncelleme

**Çıktı:** Güvenli, hata yönetimi yapılmış, kullanıcı dostu token ve stok çekme sistemi.

---

## Faz 7 — Test ve Dokümantasyon

**Amaç:** Tüm sistemi test etmek ve kullanıcı dokümantasyonu hazırlamak.

### 7.1 End-to-End Test

- [ ] Chrome eklentisini yükle
- [ ] franchise.getir.com'da token yakala
- [ ] Token'ın API'ye gönderildiğini kontrol et
- [ ] Firestore'da token'ın kaydedildiğini kontrol et
- [ ] Panelde bir ürün kartı aç
- [ ] "Stok Getir" butonuna bas
- [ ] Getir stok miktarının geldiğini kontrol et
- [ ] Hata durumlarını test et (geçersiz token, network hatası vb.)

### 7.2 Kullanıcı Dokümantasyonu

- [ ] Chrome eklentisi kurulum rehberi oluştur
- [ ] Token ekleme adımlarını anlatan görseller/screenshots ekle
- [ ] "Stok Getir" butonunun nasıl kullanılacağını anlat
- [ ] Sık karşılaşılan sorunlar ve çözümleri listele (FAQ)

### 7.3 Developer Dokümantasyonu

- [ ] API endpoint'lerini dokümante et
- [ ] Firestore şemasını dokümante et
- [ ] Chrome eklentisi kod yapısını açıkla
- [ ] Environment variables'ı listele

### 7.4 Son Kontroller

- [ ] Tüm fazların tamamlandığını kontrol et
- [ ] Build hatası olmadığını kontrol et (`npm run build`)
- [ ] TypeScript hataları olmadığını kontrol et
- [ ] ESLint uyarıları olmadığını kontrol et
- [ ] Production deploy test et (Netlify)

**Çıktı:** Test edilmiş, dokümante edilmiş, production'a hazır sistem.

---

## Özet Tablo

| Faz | İçerik | Ana Çıktı |
|-----|--------|-----------|
| 1 | Chrome Eklentisi (Token Yakalama) | Çalışan eklenti, token yakalıyor |
| 2 | Firestore Token Storage | Token saklama yapısı ve servisler |
| 3 | Next.js API (Token Kaydetme) | Token kaydetme endpoint'i |
| 4 | Getir API Entegrasyonu | Getir API'den stok çekme |
| 5 | UI Entegrasyonu | "Stok Getir" butonu ve gösterim |
| 6 | Hata Yönetimi ve Güvenlik | Güvenli, hata yönetimi yapılmış sistem |
| 7 | Test ve Dokümantasyon | Test edilmiş, dokümante edilmiş sistem |

---

*Bu dosya Getir Stok Entegrasyonu özelliğine özeldir. Genel proje yol haritası için `ROADMAP.md` kullanılır.*

