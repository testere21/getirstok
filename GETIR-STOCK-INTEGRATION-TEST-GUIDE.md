# Getir Stok Entegrasyonu — Test Rehberi

Bu belge, Getir Stok Entegrasyonu özelliğini test etmek için gerekli tüm adımları içerir. Her adımı sırayla takip ederek sistemi test edebilirsiniz.

---

## Ön Hazırlık

### 1. Projeyi Çalıştırma

- [ ] Proje kökünde `npm install` komutunu çalıştır (gerekirse)
- [ ] `npm run dev` komutu ile development server'ı başlat
- [ ] Tarayıcıda `http://localhost:3000` adresini aç
- [ ] Sayfanın düzgün yüklendiğini kontrol et

### 2. Firebase Firestore Kontrolü

- [ ] Firebase Console'da `getir_tokens` koleksiyonunun oluşturulduğunu kontrol et
- [ ] Firestore Security Rules'un güncel olduğunu kontrol et (`firestore.rules` dosyasındaki kurallar)

---

## Faz 1: Chrome Eklentisi Testi

### 1.1 Eklentiyi Yükleme

- [ ] Chrome'da `chrome://extensions/` adresine git
- [ ] Sağ üstteki **"Developer mode"** toggle'ını aktif et
- [ ] **"Load unpacked"** butonuna tıkla
- [ ] Proje klasöründeki `chrome-extension` klasörünü seç
- [ ] Eklentinin yüklendiğini kontrol et (eklenti listesinde görünmeli)

### 1.2 Eklenti Popup Testi

- [ ] Chrome toolbar'da eklenti ikonuna tıkla
- [ ] Popup'ın açıldığını kontrol et
- [ ] "Token bekleniyor..." mesajının göründüğünü kontrol et (henüz token yakalanmadığı için)

### 1.3 Token Yakalama Testi

- [ ] Yeni bir sekmede `franchise.getir.com` adresine git
- [ ] Getir Bayi paneline giriş yap (gerekli kredensiyellerle)
- [ ] Stocks sayfasını aç (veya stocks API'sine istek yapan herhangi bir sayfa)
- [ ] Browser Developer Tools'u aç (F12)
- [ ] **Network** tab'ine git
- [ ] `franchise-api-gateway.getirapi.com/stocks` endpoint'ine giden bir istek olduğunu kontrol et
- [ ] Eklenti popup'ını tekrar aç
- [ ] Token'ın yakalandığını kontrol et:
  - Popup'ta "✓ Token yakalandı!" mesajı görünmeli
  - Token'ın ilk 30 karakteri görünmeli
  - "Yakalanma" tarihi görünmeli
- [ ] Eklenti ikonunda yeşil "✓" işareti görünmeli (3 saniye sonra kaybolur)
- [ ] `franchise.getir.com` sayfasında sağ üstte yeşil bir bildirim görünmeli ("✓ Token yakalandı ve kaydedildi!")

### 1.4 Console Log Kontrolü

- [ ] Browser Developer Tools'da **Console** tab'ine git
- [ ] `[Getir Token Yakalayıcı]` ile başlayan log mesajlarını kontrol et:
  - "Background service worker başlatıldı" mesajı görünmeli
  - "Token yakalandı: eyJ..." mesajı görünmeli (ilk 20 karakter)
  - "Token başarıyla kaydedildi" mesajı görünmeli

---

## Faz 2: API Endpoint Testleri

### 2.1 Token Kaydetme API Testi

#### Postman veya curl ile test:

- [ ] Terminal'de şu komutu çalıştır:
  ```bash
  curl -X POST http://localhost:3000/api/token/save \
    -H "Content-Type: application/json" \
    -d '{"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"}'
  ```
- [ ] Başarılı response'u kontrol et:
  ```json
  {
    "success": true,
    "message": "Token başarıyla kaydedildi"
  }
  ```

#### Hata durumları testi:

- [ ] Token olmadan istek at:
  ```bash
  curl -X POST http://localhost:3000/api/token/save \
    -H "Content-Type: application/json" \
    -d '{}'
  ```
  - `400 Bad Request` ve hata mesajı dönmeli

- [ ] Geçersiz token formatı ile istek at:
  ```bash
  curl -X POST http://localhost:3000/api/token/save \
    -H "Content-Type: application/json" \
    -d '{"token": "invalid-token"}'
  ```
  - `400 Bad Request` ve "Geçersiz token formatı" mesajı dönmeli

### 2.2 Firestore Token Kontrolü

- [ ] Firebase Console'da `getir_tokens` koleksiyonuna git
- [ ] `active` ID'li dokümanın oluştuğunu/güncellendiğini kontrol et
- [ ] Doküman içeriğini kontrol et:
  - `token` field'ı olmalı
  - `createdAt` field'ı olmalı
  - `updatedAt` field'ı olmalı

### 2.3 Getir Stok API Testi

**Not:** Bu test için geçerli bir Getir token'ı gereklidir. Chrome eklentisi ile token yakaladıktan sonra test edin.

- [ ] Terminal'de şu komutu çalıştır (gerçek bir barkod ile):
  ```bash
  curl "http://localhost:3000/api/getir-stock?barcode=1234567890123"
  ```
- [ ] Başarılı response'u kontrol et:
  ```json
  {
    "stock": 10,
    "success": true
  }
  ```
  veya ürün bulunamazsa:
  ```json
  {
    "stock": null,
    "success": true
  }
  ```

#### Hata durumları testi:

- [ ] Barkod parametresi olmadan istek at:
  ```bash
  curl "http://localhost:3000/api/getir-stock"
  ```
  - `400 Bad Request` ve "Barkod parametresi gerekli" mesajı dönmeli

- [ ] Token yoksa (Firestore'da token yok):
  - `500 Internal Server Error` ve "Token bulunamadı" mesajı dönmeli

- [ ] Geçersiz token ile (401 Unauthorized):
  - `401 Unauthorized` ve "Token geçersiz" mesajı dönmeli

---

## Faz 3: UI Testleri

### 3.1 Ürün Kartı Açma

- [ ] Ana sayfada arama çubuğuna bir ürün barkodu veya ismi yaz
- [ ] Arama sonuçlarından bir ürün kartına tıkla
- [ ] Ürün detay modal'ının açıldığını kontrol et
- [ ] Ürün bilgilerinin göründüğünü kontrol et (isim, barkod, görsel, barkod görseli)

### 3.2 "Getir Stokunu Getir" Butonu Testi

- [ ] Ürün detay modal'ında **"Getir Stokunu Getir"** butonunu bul
- [ ] Butonun görünür olduğunu kontrol et
- [ ] Butona tıkla
- [ ] Butonun disabled olduğunu kontrol et (loading sırasında)
- [ ] "Stok Getiriliyor..." mesajının göründüğünü kontrol et
- [ ] Spinner icon'unun döndüğünü kontrol et

### 3.3 Başarılı Stok Çekme Testi

**Önkoşul:** Geçerli bir Getir token'ı Firestore'da olmalı ve ürün Getir panelinde bulunmalı.

- [ ] "Getir Stokunu Getir" butonuna tıkla
- [ ] Loading state'inin göründüğünü kontrol et
- [ ] Başarılı response geldiğinde:
  - Yeşil bir card görünmeli
  - "Getir Stoku: **X** adet" mesajı görünmeli (X gerçek stok miktarı)
  - Buton tekrar aktif olmalı

### 3.4 Hata Durumları Testi

#### Token Yok Hatası:

- [ ] Firestore'dan `getir_tokens/active` dokümanını sil (veya token field'ını boşalt)
- [ ] "Getir Stokunu Getir" butonuna tıkla
- [ ] Kırmızı bir hata card'ı görünmeli
- [ ] "Token bulunamadı. Lütfen Chrome eklentisini kullanarak token ekleyin." mesajı görünmeli

#### Token Geçersiz Hatası:

- [ ] Firestore'da token'ı geçersiz bir değerle güncelle (örn: "invalid-token")
- [ ] "Getir Stokunu Getir" butonuna tıkla
- [ ] Kırmızı bir hata card'ı görünmeli
- [ ] "Token geçersiz. Lütfen Chrome eklentisini kullanarak yeni token ekleyin." mesajı görünmeli
- [ ] Altında "Lütfen Chrome eklentisini kullanarak franchise.getir.com'da yeni token ekleyin." açıklaması görünmeli

#### Ürün Bulunamadı:

- [ ] Var olmayan bir barkod ile test et
- [ ] "Getir Stokunu Getir" butonuna tıkla
- [ ] Stok bilgisi gösterilmemeli (null döndüğü için)
- [ ] Hata mesajı da görünmemeli (başarılı response, sadece stock: null)

### 3.5 Düzenleme Modu Testi

- [ ] Ana sayfada eksik/fazla ürünler listesinden bir ürünün **"Düzenle"** butonuna tıkla
- [ ] Düzenleme modal'ının açıldığını kontrol et
- [ ] Barkod input'unun altında **"Getir Stokunu Getir"** butonunun göründüğünü kontrol et
- [ ] Butona tıkla ve stok bilgisinin geldiğini kontrol et

---

## Faz 4: End-to-End Test

### 4.1 Tam Akış Testi

1. **Token Yakalama:**
   - [ ] Chrome eklentisini yükle
   - [ ] `franchise.getir.com`'da stocks sayfasını aç
   - [ ] Token'ın yakalandığını ve API'ye gönderildiğini kontrol et

2. **Firestore Kontrolü:**
   - [ ] Firebase Console'da `getir_tokens/active` dokümanının oluştuğunu kontrol et
   - [ ] Token'ın doğru kaydedildiğini kontrol et

3. **UI Testi:**
   - [ ] Ana sayfada bir ürün ara
   - [ ] Ürün kartını aç
   - [ ] "Getir Stokunu Getir" butonuna tıkla
   - [ ] Getir stok miktarının geldiğini kontrol et

4. **Token Yenileme:**
   - [ ] `franchise.getir.com`'da yeni bir token yakala (sayfayı yenile veya başka bir istek yap)
   - [ ] Eklentinin yeni token'ı yakaladığını kontrol et
   - [ ] Firebase Console'da `updatedAt` field'ının güncellendiğini kontrol et
   - [ ] UI'da tekrar stok çekmeyi test et (yeni token ile çalışmalı)

---

## Faz 5: Sorun Giderme

### 5.1 Eklenti Token Yakalamıyor

**Kontrol Listesi:**
- [ ] Eklenti yüklü mü? (`chrome://extensions/`)
- [ ] Developer mode aktif mi?
- [ ] `franchise.getir.com`'da giriş yapıldı mı?
- [ ] Stocks sayfası açıldı mı veya stocks API'sine istek yapıldı mı?
- [ ] Browser Console'da hata var mı? (F12 > Console)
- [ ] Network tab'de `franchise-api-gateway.getirapi.com/stocks` isteği görünüyor mu?

**Çözüm:**
- Eklentiyi yeniden yükle (Remove > Load unpacked)
- Browser'ı yeniden başlat
- Eklenti permissions'larını kontrol et

### 5.2 Token API'ye Gönderilmiyor

**Kontrol Listesi:**
- [ ] Browser Console'da `[Getir Token Yakalayıcı]` log mesajları var mı?
- [ ] Network tab'de `getirstok.netlify.app/api/token/save` isteği görünüyor mu?
- [ ] CORS hatası var mı?

**Çözüm:**
- API endpoint'in çalıştığını kontrol et (`http://localhost:3000/api/token/save`)
- CORS header'larının doğru olduğunu kontrol et
- Development server'ın çalıştığını kontrol et

### 5.3 Stok Bilgisi Gelmiyor

**Kontrol Listesi:**
- [ ] Firestore'da token var mı? (`getir_tokens/active`)
- [ ] Token geçerli mi? (Getir API'sine test isteği at)
- [ ] Barkod doğru mu?
- [ ] Ürün Getir panelinde var mı?

**Çözüm:**
- Token'ı yeniden yakala (Chrome eklentisi ile)
- Getir API'sine direkt istek at ve response'u kontrol et
- Browser Console'da hata mesajlarını kontrol et

### 5.4 UI'da Buton Görünmüyor

**Kontrol Listesi:**
- [ ] Ürün kartı açıldı mı? (`catalogProduct` veya `initialItem` var mı?)
- [ ] Browser Console'da React hataları var mı?
- [ ] Component doğru render ediliyor mu?

**Çözüm:**
- Browser Console'u kontrol et
- React DevTools ile component state'ini kontrol et
- Sayfayı yenile

---

## Faz 6: Production Testi

### 6.1 Netlify Deploy

- [ ] Projeyi Netlify'a deploy et
- [ ] Environment variables'ı kontrol et (Firebase config)
- [ ] Build'in başarılı olduğunu kontrol et

### 6.2 Production API Testleri

- [ ] Chrome eklentisindeki API endpoint'ini production URL'ine güncelle:
  ```javascript
  const API_ENDPOINT = "https://getirstok.netlify.app/api/token/save";
  ```
- [ ] Eklentiyi yeniden yükle
- [ ] Token yakalama testini production'da yap
- [ ] UI'da stok çekme testini production'da yap

### 6.3 Firestore Security Rules

- [ ] Firebase Console'da Security Rules'u deploy et
- [ ] Public read/write kurallarının çalıştığını kontrol et
- [ ] Token silme işleminin engellendiğini kontrol et

---

## Test Senaryoları Özeti

| Senaryo | Beklenen Sonuç | Durum |
|---------|----------------|-------|
| Eklenti yükleme | Eklenti yüklenir, popup açılır | ⬜ |
| Token yakalama | Token yakalanır, API'ye gönderilir | ⬜ |
| Firestore kayıt | Token Firestore'a kaydedilir | ⬜ |
| UI buton görünümü | "Getir Stokunu Getir" butonu görünür | ⬜ |
| Başarılı stok çekme | Stok miktarı yeşil card'da gösterilir | ⬜ |
| Token yok hatası | Kırmızı hata mesajı gösterilir | ⬜ |
| Token geçersiz hatası | Kırmızı hata mesajı + açıklama gösterilir | ⬜ |
| Ürün bulunamadı | Stok bilgisi gösterilmez (null) | ⬜ |
| Düzenleme modu | Buton düzenleme modal'ında görünür | ⬜ |
| Production test | Tüm özellikler production'da çalışır | ⬜ |

---

## Notlar

- **Token Formatı:** Getir token'ları JWT formatındadır ve `eyJ` ile başlar
- **Token Süresi:** Token'lar belirli bir süre sonra expire olabilir, bu durumda yeniden yakalanmalıdır
- **CORS:** Chrome eklentisi farklı origin'den istek yaptığı için CORS header'ları gereklidir
- **Rate Limiting:** Getir API'sine çok fazla istek atılırsa rate limit'e takılabilir
- **Network Hataları:** İnternet bağlantısı olmadığında veya Getir API'si down olduğunda hata mesajları gösterilir

---

**Test tamamlandığında:** Her senaryoyu `⬜` işaretini `✅` yaparak işaretleyin.

