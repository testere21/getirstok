# Tedarikçi İade Tarihi Özelliği - Detaylı Yol Haritası

Bu belge, Getir Depo Paneli'nden "Tedarikçi İade Tarihi" bilgisini çekme özelliğinin implementasyon planını içerir.

**Amaç:** Panelimizde ürün kartı açıldığında "Kaç Gün Önceden Çıkılacak" butonuna tıklayınca, Getir Depo Paneli API'sinden tedarikçi iade tarihi bilgisini çekip göstermek.

---

## Faz 1 — Chrome Extension Güncellemesi (Token Yakalama)

**Amaç:** Chrome extension'ı güncelleyerek hem Getir Bayi Paneli hem de Getir Depo Paneli token'larını yakalamak.

### Faz 1.1: Background Script Güncellemesi
- [x] `chrome-extension/background.js` dosyasını aç
- [x] `warehouse-panel-api-gateway.getirapi.com` domain'ini de dinle
- [x] Depo paneli isteklerinden `Authorization: Bearer` header'ını yakala
- [x] Yakalanan token'ı `type: "warehouse"` ile işaretle
- [x] Token'ı Firestore'a kaydet (mevcut bayi paneli token'ı gibi)
- [x] `manifest.json`'a depo paneli domain'lerini ekle
- [x] API endpoint'ini `type` parametresini destekleyecek şekilde güncelle
- [x] `getirTokenService.ts`'yi güncelle (her iki token tipi için ayrı fonksiyonlar)

**Çıktı:** Extension hem bayi hem depo paneli token'larını yakalayabilir.

---

### Faz 1.2: Token Service Güncellemesi
- [x] `app/lib/getirTokenService.ts` dosyasını aç
- [x] `getGetirWarehouseToken()` fonksiyonu ekle (depo paneli token'ı için)
- [x] Firestore'da `getir_tokens` collection'ında `ACTIVE_WAREHOUSE_TOKEN_DOC_ID` ile token arama
- [x] Token yoksa `null` döndür (hata yönetimi için yeterli)
- [x] `getGetirFranchiseToken()` fonksiyonu eklendi (ayrım için)

**Çıktı:** Backend'den depo paneli token'ı çekilebilir.

---

### Faz 1.3: Firestore Rules Güncellemesi
- [x] `firestore.rules` dosyasını kontrol et
- [x] `getir_tokens` collection'ında mevcut kurallar yeterli (her doküman için aynı kurallar geçerli)
- [x] Ayrı doküman ID'leri kullanıldığı için (`active_franchise`, `active_warehouse`) ekstra kural gerekmiyor

**Çıktı:** Depo paneli token'ı güvenli şekilde saklanabilir.

---

## Faz 2 — Backend API Servisleri

**Amaç:** Getir Depo Paneli API'sinden tedarikçi iade tarihi bilgisini çekmek için servis fonksiyonları oluşturmak.

### Faz 2.1: Depo Paneli API Servisi Oluşturma
- [x] `app/lib/getirWarehouseApiService.ts` dosyası oluştur
- [x] `getGetirWarehouseToken()` fonksiyonunu import et
- [x] `searchProductByBarcode(barcode: string)` fonksiyonu:
  - `filter` endpoint'ine POST request at
  - Payload: `{ keyword: barcode, searchFilterOptions: { barcodes: true, ... }, ... }`
  - Response'dan ürün ID'lerini çıkar
  - İlk ürün ID'sini döndür
- [x] `getProductSupplierReturnDate(productId: string)` fonksiyonu:
  - `products` endpoint'ine POST request at
  - Payload: `{ productIds: [productId] }`
  - Response'dan `expDays.dead` değerini çıkar
  - Gün sayısını döndür (örn: `3`)
- [x] `GetirWarehouseApiError` custom error class'ı eklendi
- [x] Hata yönetimi eklendi (token yok, 401, 403, timeout, vb.)

**Çıktı:** Depo paneli API'sinden tedarikçi iade tarihi çekilebilir.

---

### Faz 2.2: Ana Servis Fonksiyonu
- [x] `getGetirSupplierReturnDate(barcode: string)` fonksiyonu:
  - Önce `searchProductByBarcode(barcode)` ile ürün ID'sini bul
  - Sonra `getProductSupplierReturnDate(productId)` ile tedarikçi iade tarihini çek
  - Hata durumlarını yönet (ürün bulunamadı, token geçersiz, vb.)
  - Gün sayısını döndür
- [x] Custom error kodları eklendi (`PRODUCT_NOT_FOUND`, `SUPPLIER_RETURN_DATE_NOT_FOUND`)

**Çıktı:** Tek bir fonksiyon ile barkod'dan tedarikçi iade tarihi çekilebilir.

---

### Faz 2.3: API Endpoint Oluşturma
- [x] `app/api/getir-supplier-return-date/route.ts` dosyası oluştur
- [x] `GET` method handler:
  - Query param: `barcode`
  - `getGetirSupplierReturnDate(barcode)` fonksiyonunu çağır
  - Response: `{ days: 3, success: true }` veya `{ error: "...", success: false }`
  - CORS headers ekle
- [x] `OPTIONS` handler eklendi (preflight requests için)
- [x] Hata yönetimi eklendi (`GetirWarehouseApiError` handling)

**Çıktı:** Frontend'den API endpoint üzerinden tedarikçi iade tarihi çekilebilir.

---

## Faz 3 — Frontend UI Entegrasyonu

**Amaç:** "Getir Stokunu Getir" butonunun altına "Kaç Gün Önceden Çıkılacak" butonu eklemek ve sonucu göstermek.

### Faz 3.1: AddProductModal State Güncellemesi
- [x] `app/components/AddProductModal.tsx` dosyasını aç
- [x] Yeni state'ler ekle:
  - `supplierReturnDate: number | null` (gün sayısı)
  - `supplierReturnDateLoading: boolean`
  - `supplierReturnDateError: string | null`
- [x] Modal kapandığında state'leri temizleme eklendi (useEffect)

**Çıktı:** Tedarikçi iade tarihi için state yönetimi hazır.

---

### Faz 3.2: API Çağrı Fonksiyonu
- [x] `handleGetSupplierReturnDate` async fonksiyonu ekle:
  - Barkod kontrolü yap
  - Loading state'ini aktif et
  - `/api/getir-supplier-return-date?barcode=...` endpoint'ine istek at
  - Başarılıysa `supplierReturnDate` state'ini güncelle
  - Hata durumunda `supplierReturnDateError` state'ini güncelle
  - Loading state'ini kapat
- [x] `handleGetGetirStock` fonksiyonunu referans alarak benzer yapı oluşturuldu

**Çıktı:** API'den tedarikçi iade tarihi çekilebilir.

---

### Faz 3.3: UI Butonu Ekleme
- [x] "Getir Stokunu Getir" butonunun altına yeni buton ekle:
  - Buton metni: "Kaç Gün Önceden Çıkılacak"
  - Loading durumunda: "Yükleniyor..." ve spinner
  - `onClick={handleGetSupplierReturnDate}`
  - Stil: Mevcut "Getir Stokunu Getir" butonu ile tutarlı
- [x] İki yerde eklendi: Catalog view modu ve Edit mode

**Çıktı:** Kullanıcı butona tıklayabilir.

---

### Faz 3.4: Sonuç Gösterimi
- [x] Butonun altına sonuç gösterim alanı ekle:
  - `supplierReturnDate` varsa: "X gün önceden çıkılacak" mesajı
  - `supplierReturnDateError` varsa: Hata mesajı
  - Stil: Mevcut stok gösterimi ile tutarlı (yeşil kutu, hata için kırmızı kutu)
- [x] İki yerde eklendi: Catalog view modu ve Edit mode
- [x] Token hatası için özel mesaj eklendi (warehouse.getir.com)

**Çıktı:** Tedarikçi iade tarihi bilgisi kullanıcıya gösterilir.

---

### Faz 3.5: Düzenleme Modu Entegrasyonu
- [ ] Düzenleme modunda da aynı butonu ve sonuç gösterimini ekle
- [ ] `initialItem?.barcode` kullanarak barkod al
- [ ] Aynı `handleGetSupplierReturnDate` fonksiyonunu kullan

**Çıktı:** Düzenleme modunda da tedarikçi iade tarihi çekilebilir.

---

## Faz 4 — Hata Yönetimi ve İyileştirmeler

**Amaç:** Hata durumlarını yönetmek ve kullanıcı deneyimini iyileştirmek.

### Faz 4.1: Hata Mesajları
- [ ] Token yoksa: "Depo paneli token'ı bulunamadı. Lütfen Chrome extension'ını kullanarak token ekleyin."
- [ ] Ürün bulunamadıysa: "Bu barkod için ürün bulunamadı."
- [ ] API hatası: "Tedarikçi iade tarihi bilgisi çekilemedi. Lütfen tekrar deneyin."
- [ ] Network hatası: "Bağlantı hatası. Lütfen internet bağlantınızı kontrol edin."

**Çıktı:** Kullanıcıya anlamlı hata mesajları gösterilir.

---

### Faz 4.2: Loading State İyileştirmeleri
- [ ] Buton loading durumunda disable et
- [ ] Loading animasyonu ekle (spinner)
- [ ] Kullanıcıya "Yükleniyor..." mesajı göster

**Çıktı:** Kullanıcı işlemin devam ettiğini anlar.

---

### Faz 4.3: Token Yenileme
- [ ] Token geçersizse veya süresi dolmuşsa kullanıcıya bilgi ver
- [ ] Chrome extension ile yeni token eklemesi için yönlendir
- [ ] Token test endpoint'i ekle (isteğe bağlı)

**Çıktı:** Token sorunları kullanıcıya bildirilir.

---

## Faz 5 — Test ve Dokümantasyon

**Amaç:** Özelliği test etmek ve dokümantasyon oluşturmak.

### Faz 5.1: Test Senaryoları
- [ ] Chrome extension ile depo paneli token'ı yakalama testi
- [ ] Barkod ile ürün arama testi
- [ ] Tedarikçi iade tarihi çekme testi
- [ ] Hata durumları testi (token yok, ürün bulunamadı, vb.)
- [ ] UI butonu ve sonuç gösterimi testi

**Çıktı:** Özellik çalışır durumda.

---

### Faz 5.2: Dokümantasyon
- [ ] Chrome extension kullanım kılavuzu güncelle (depo paneli token'ı için)
- [ ] API endpoint dokümantasyonu
- [ ] Kullanıcı kılavuzu (nasıl kullanılır)

**Çıktı:** Kullanıcılar özelliği kolayca kullanabilir.

---

## Teknik Detaylar

### API Endpoint'leri

**Filter Request:**
- URL: `https://warehouse-panel-api-gateway.getirapi.com/warehouse/5dc32d8b734a192200caddf8/products?offset=0&limit=10`
- Method: `POST`
- Headers:
  - `Authorization: Bearer {warehouse_token}`
  - `Content-Type: application/json`
  - `countrycode: TR`
  - `language: tr`
  - `x-requester-client: warehouse-panel-frontend`
- Body:
  ```json
  {
    "fields": "_id barcodes picURL fullName",
    "includeDefaultFields": false,
    "keyword": "{barcode}",
    "language": "tr",
    "searchFilterOptions": {
      "fullName": true,
      "barcodes": true,
      "id": true
    },
    "status": [0, 1, 2, 3, 4],
    "warehouseId": "5dc32d8b734a192200caddf8"
  }
  ```

**Products Request:**
- URL: `https://warehouse-panel-api-gateway.getirapi.com/warehouse/5dc32d8b734a192200caddf8/products?offset=0&limit=20`
- Method: `POST`
- Headers: Aynı
- Body:
  ```json
  {
    "productIds": ["{productId}"]
  }
  ```
- Response:
  ```json
  {
    "data": {
      "data": {
        "products": [
          {
            "id": "...",
            "expDays": {
              "dead": 3  // ← Tedarikçi İade Tarihi (gün)
            }
          }
        ]
      }
    }
  }
  ```

### Firestore Yapısı

**getir_tokens Collection:**
```typescript
{
  id: "active",
  token: "eyJ...",
  type: "warehouse", // veya "franchise"
  createdAt: "2026-02-09T...",
  updatedAt: "2026-02-09T...",
  isValid?: boolean
}
```

---

## İlerleme Takibi

Her fazı tamamladıkça `[ ]` işaretini `[x]` yaparak ilerleyeceğiz.

**Başlangıç:** Faz 1.1 ile başlayacağız.

