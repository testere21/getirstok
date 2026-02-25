# Yaklaşan SKT Bildirimi Özelliği — Detaylı Yol Haritası

Bu belge, ürünlerin Son Kullanma Tarihi (SKT) bilgisini takip edip, çıkılması gereken tarih geldiğinde kullanıcıya bildirim gösteren özelliğin implementasyon planını içerir.

**Amaç:** Bir ürünü "yaklaşan SKT" olarak işaretleyip, SKT tarihi ve çıkılması gereken tarih bilgilerini kaydetmek. Çıkılması gereken tarih geldiğinde panel açık olduğu sürece sağ üstten uyarı kartı göstermek.

---

## Faz 1 — Firestore Modeli ve Servis Katmanı

**Amaç:** Yaklaşan SKT kayıtları için Firestore yapısını ve servis fonksiyonlarını oluşturmak.

- [x] Tip tanımlarını ekle
  - [x] Dosya: `app/lib/types.ts`
  - [x] Yeni interface: `ExpiringProduct`:
    - [x] `barcode: string` (ürün barkodu)
    - [x] `productName: string` (ürün adı, cache için)
    - [x] `expiryDate: string` (SKT tarihi - ISO format: YYYY-MM-DD)
    - [x] `removalDate: string` (çıkılması gereken tarih - ISO format: YYYY-MM-DD)
    - [x] `createdAt: string` (ISO string - oluşturulma zamanı)
    - [x] `updatedAt?: string` (ISO string - son güncelleme zamanı)
    - [x] `isNotified?: boolean` (opsiyonel: bildirim gösterildi mi?)
  - [x] ID ile birlikte tip: `ExpiringProductWithId`
  - [x] Yeni koleksiyon sabiti: `EXPIRING_PRODUCTS_COLLECTION = "expiring_products"`
- [x] Servis fonksiyonları oluştur
  - [x] Dosya: `app/lib/expiringProductService.ts` (yeni)
  - [x] `addExpiringProduct(params: AddExpiringProductParams): Promise<string>`
    - [x] Firestore'a yeni yaklaşan SKT kaydı ekle
    - [x] `createdAt` ve `updatedAt` alanlarını set et
    - [x] Doküman ID'sini döndür
  - [x] `updateExpiringProduct(id: string, fields: UpdateExpiringProductParams): Promise<void>`
    - [x] Mevcut kaydı güncelle
    - [x] `updatedAt` alanını güncelle
  - [x] `deleteExpiringProduct(id: string): Promise<void>`
    - [x] Kaydı sil
  - [x] `getExpiringProducts(): Promise<ExpiringProductWithId[]>`
    - [x] Tüm yaklaşan SKT kayıtlarını getir
  - [x] `getExpiringProductsByRemovalDate(date: string): Promise<ExpiringProductWithId[]>`
    - [x] Belirli bir tarihte çıkılması gereken ürünleri getir (bugün için kullanılacak)
  - [x] `getExpiringProductByBarcode(barcode: string): Promise<ExpiringProductWithId | null>`
    - [x] Belirli bir barkod için yaklaşan SKT kaydı var mı kontrol et

---

## Faz 2 — Backend API Endpoints

**Amaç:** Frontend'den yaklaşan SKT kayıtlarını yönetmek için API endpoint'leri oluşturmak.

- [x] Yaklaşan SKT ekleme endpoint'i
  - [x] Dosya: `app/api/expiring-products/route.ts` (yeni)
  - [x] `POST` method handler:
    - [x] Request body: `{ barcode, productName, expiryDate, removalDate }`
    - [x] Validasyon: tüm alanlar gerekli, tarih formatı kontrolü (YYYY-MM-DD)
    - [x] Tarih mantıksal kontrolü: çıkılması gereken tarih, SKT tarihinden sonra olamaz
    - [x] `addExpiringProduct` çağır
    - [x] Response: `{ id, success: true }` veya `{ error, success: false }`
    - [x] CORS headers eklendi
- [x] Yaklaşan SKT güncelleme endpoint'i
  - [x] Dosya: `app/api/expiring-products/[id]/route.ts` (yeni)
  - [x] `PUT` method handler:
    - [x] URL param: `id`
    - [x] Request body: `{ productName?, expiryDate?, removalDate?, isNotified? }` (opsiyonel alanlar)
    - [x] Validasyon: en az bir alan gerekli, tarih formatı kontrolü
    - [x] Tarih mantıksal kontrolü (eğer her iki tarih de gönderilmişse)
    - [x] `updateExpiringProduct` çağır
    - [x] Response: `{ success: true }` veya `{ error, success: false }`
    - [x] CORS headers eklendi
- [x] Yaklaşan SKT silme endpoint'i
  - [x] Dosya: `app/api/expiring-products/[id]/route.ts`
  - [x] `DELETE` method handler:
    - [x] URL param: `id`
    - [x] `deleteExpiringProduct` çağır
    - [x] Response: `{ success: true }` veya `{ error, success: false }`
    - [x] CORS headers eklendi
- [x] Yaklaşan SKT listeleme endpoint'i
  - [x] Dosya: `app/api/expiring-products/route.ts`
  - [x] `GET` method handler:
    - [x] Query param (opsiyonel): `removalDate` (bugün için filtreleme)
    - [x] Query param (opsiyonel): `barcode` (belirli barkod için kayıt kontrolü)
    - [x] `removalDate` varsa: `getExpiringProductsByRemovalDate` çağır
    - [x] `barcode` varsa: `getExpiringProductByBarcode` çağır
    - [x] Yoksa: `getExpiringProducts` çağır
    - [x] Response: `{ products: ExpiringProductWithId[], success: true }` veya `{ product: ExpiringProductWithId | null, success: true }`
    - [x] CORS headers eklendi

---

## Faz 3 — Frontend UI: Yaklaşan SKT Ekleme/Düzenleme

**Amaç:** Ürün kartında "Yaklaşan SKT Olarak İşaretle" butonu ve form modal'ı eklemek.

- [x] AddProductModal'a yeni buton ekle
  - [x] Dosya: `app/components/AddProductModal.tsx`
  - [x] "Kaç Gün Önceden Çıkılacak" butonunun altına yeni buton eklendi
  - [x] Buton metni: "Yaklaşan SKT Olarak İşaretle" (veya "Yaklaşan SKT'yi Düzenle" - mevcut kayıt varsa)
  - [x] `onClick` handler: `setExpiringProductModalOpen(true)` ile modal açılıyor
  - [x] Hem catalog view mode hem de edit mode için buton eklendi
- [x] ExpiringProductModal component'i oluştur
  - [x] Dosya: `app/components/ExpiringProductModal.tsx` (yeni)
  - [x] Props:
    - [x] `isOpen: boolean`
    - [x] `onClose: () => void`
    - [x] `product: { barcode: string, name: string }` (mevcut ürün bilgisi)
    - [x] `existingProduct?: ExpiringProductWithId` (düzenleme modu için)
    - [x] `onSuccess?: (message: string) => void` (başarılı işlem callback'i)
  - [x] Form alanları:
    - [x] Ürün adı (read-only, gösterim için)
    - [x] Barkod (read-only, gösterim için)
    - [x] SKT Tarihi (date input, required)
    - [x] Çıkılması Gereken Tarih (date input, required)
  - [x] Validasyon:
    - [x] Her iki tarih de gerekli
    - [x] Tarih formatı kontrolü (YYYY-MM-DD)
    - [x] Çıkılması gereken tarih, SKT tarihinden sonra olamaz (mantıksal kontrol)
  - [x] Submit handler:
    - [x] Düzenleme modu: `PUT /api/expiring-products/[id]` çağır
    - [x] Yeni kayıt: `POST /api/expiring-products` çağır
    - [x] Başarılıysa modal'ı kapat ve parent component'e bildir
- [x] AddProductModal'da mevcut kayıt kontrolü
  - [x] Ürün kartı açıldığında `GET /api/expiring-products?barcode=...` çağır (useEffect ile)
  - [x] Eğer kayıt varsa: buton metnini "Yaklaşan SKT'yi Düzenle" yap
  - [x] Mevcut kayıt varsa: SKT ve çıkılması gereken tarih bilgilerini göster (turuncu kutu)
  - [x] Modal açıldığında mevcut değerleri doldur (existingProduct prop'u ile)
  - [x] Başarılı kayıt/güncelleme sonrası mevcut kaydı yeniden yükle

---

## Faz 4 — Bildirim Sistemi (Notification Card)

**Amaç:** Çıkılması gereken tarih geldiğinde sağ üstten uyarı kartı göstermek.

- [x] Bildirim component'i oluştur
  - [x] Dosya: `app/components/ExpiringProductNotification.tsx` (yeni)
  - [x] Sağ üstte sabit konum (fixed position: `right-4 top-4`)
  - [x] Kart tasarımı:
    - [x] Başlık: "Yaklaşan SKT Uyarısı" (tek ürün) veya "{n} Ürün - Yaklaşan SKT Uyarısı" (çoklu ürün)
    - [x] İçerik: Tek ürün için detaylı gösterim, çoklu ürün için liste
    - [x] Her ürün için: "Ürün: {productName}, Barkod: {barcode}, SKT: {expiryDate}, Çıkılması Gereken: {removalDate} - Bugün çıkınız!"
    - [x] Kapatma butonu (X) - header'da
    - [x] "Tamam" butonu (bildirimi kapatır) - footer'da
  - [x] Stil: Dikkat çekici (turuncu arka plan, border, dark mode desteği)
  - [x] Animasyon: Slide-in ve fade-in efekti (Tailwind animate-in)
  - [x] Scroll edilebilir içerik (max-h-96, overflow-y-auto)
- [x] Ana sayfada bildirim kontrolü
  - [x] Dosya: `app/page.tsx`
  - [x] `useEffect` ekle: component mount olduğunda ve belirli aralıklarla kontrol et
  - [x] `GET /api/expiring-products?removalDate={bugünün tarihi}` çağır
  - [x] Bugünün tarihini al: `new Date().toISOString().split('T')[0]` (YYYY-MM-DD formatında)
  - [x] Bugün çıkılması gereken ürünler varsa: `ExpiringProductNotification` göster
  - [x] State: `expiringProductsToday: ExpiringProductWithId[]`
  - [x] State: `showExpiringNotification: boolean`
- [x] Bildirim güncelleme stratejisi
  - [x] İlk yüklemede kontrol et (component mount olduğunda)
  - [x] Her 5 dakikada bir otomatik kontrol et (setInterval - 300000 ms)
  - [x] Kullanıcı bildirimi kapattığında: `showExpiringNotification = false` (ama `expiringProductsToday` state'te tutuluyor, sayfa yenilenince tekrar gösterilecek)
  - [x] Cleanup: interval temizleme (useEffect return)

---

## Faz 4.1 — Bildirim Davranışı ve Mobil Uyumluluk İyileştirmeleri

**Amaç:** Bildirim kartının davranışını iyileştirmek ve mobil cihazlarda daha iyi görünmesini sağlamak.

- [x] Bildirim davranışı değişikliği
  - [x] localStorage kontrolünü kaldır: Bildirim kapatıldığında localStorage'a kaydetme işlemini kaldır
  - [x] Bildirim mantığı: Ürün silinene kadar her sayfa yenilendiğinde bildirim gösterilsin
  - [x] `handleCloseExpiringNotification` fonksiyonunu güncelle: Sadece `showExpiringNotification = false` yapsın, localStorage işlemi olmasın
  - [x] `useEffect` içindeki localStorage kontrolünü kaldır: `wasNotificationShown` kontrolünü kaldır
  - [x] Ürün yoksa bildirimi otomatik kapat: `data.products.length === 0` ise `setShowExpiringNotification(false)`
- [x] Mobil uyumluluk iyileştirmeleri
  - [x] Dosya: `app/components/ExpiringProductNotification.tsx`
  - [x] Fixed position'ı mobil için optimize et:
    - [x] Desktop: `sm:right-4 sm:top-4` (mevcut)
    - [x] Mobil: `left-2 right-2 top-2` (kenarlardan boşluk, tam genişlik değil)
  - [x] Genişlik ayarları:
    - [x] Desktop: `sm:w-full sm:max-w-md` (mevcut)
    - [x] Mobil: `left-2 right-2` ile otomatik genişlik (ekran genişliğine göre)
  - [x] Font boyutları: Mobilde daha küçük fontlar kullan
    - [x] Başlık: `text-xs sm:text-sm`
    - [x] İçerik: `text-xs sm:text-sm` ve `text-[10px] sm:text-xs` (çoklu ürün için)
  - [x] Padding ayarları: Mobilde daha kompakt padding
    - [x] Header: `p-2 sm:p-3`
    - [x] Content: `p-2 sm:p-3`
    - [x] Footer: `p-2 sm:p-3`
    - [x] Liste öğeleri: `p-1.5 sm:p-2`
  - [x] Scroll edilebilir içerik: Mobilde max-height'ı azalt
    - [x] `max-h-64 sm:max-h-80` (mobilde daha küçük)
  - [x] Responsive spacing: `space-y-1.5 sm:space-y-2` ve `space-y-2 sm:space-y-3`
  - [x] Icon boyutları: `size-4 sm:size-5` (mobilde daha küçük)
  - [x] Text break: `break-words` eklendi (uzun ürün adları için)

---

## Faz 5 — Bildirim İyileştirmeleri ve UX

**Amaç:** Bildirim sistemini daha kullanıcı dostu hale getirmek.

- [x] Çoklu ürün bildirimi
  - [x] Eğer birden fazla ürün bugün çıkılacaksa: liste halinde göster (zaten Faz 4'te yapıldı)
  - [x] Her ürün için tek kart içinde liste (zaten Faz 4'te yapıldı)
  - [x] Scroll edilebilir liste (max-h-96, overflow-y-auto - zaten Faz 4'te yapıldı)
- [x] Bildirim geçmişi
  - [x] Kullanıcı bildirimi kapattığında: localStorage'a bugünün tarihi ile kaydet
  - [x] Aynı gün içinde tekrar gösterme: localStorage'dan kontrol et (`expiring_notification_${today}`)
  - [x] `handleCloseExpiringNotification` fonksiyonu: localStorage'a kaydet ve bildirimi kapat
  - [x] Bildirim kontrolü: localStorage kontrolü eklendi, bugün gösterilmişse tekrar gösterme
- [x] Bildirim animasyonu
  - [x] Slide-in animasyonu (sağdan sola) - `animate-in slide-in-from-right-5` (zaten Faz 4'te yapıldı)
  - [x] Fade-in efekti - `fade-in-0` (zaten Faz 4'te yapıldı)
  - [x] Animasyon süresi iyileştirildi: `duration-500` eklendi
  - [x] Shadow iyileştirildi: `shadow-xl` (daha belirgin)
- [ ] Bildirim sesi (opsiyonel - şimdilik atlanıyor)
  - [ ] Kullanıcı tercihine göre bildirim sesi çal
  - [ ] Varsayılan olarak kapalı

---

## Faz 6 — Yaklaşan SKT Listesi ve Yönetim

**Amaç:** Tüm yaklaşan SKT kayıtlarını görüntüleme ve yönetme sayfası.

- [x] Yaklaşan SKT listesi sayfası
  - [x] Dosya: `app/expiring-products/page.tsx` (yeni)
  - [x] Tüm yaklaşan SKT kayıtlarını listele (`GET /api/expiring-products`)
  - [x] Tablo görünümü:
    - [x] Ürün Adı (tıklanabilir sıralama)
    - [x] Barkod
    - [x] SKT Tarihi (tıklanabilir sıralama)
    - [x] Çıkılması Gereken Tarih (tıklanabilir sıralama, varsayılan sıralama)
    - [x] Durum (bugün, geçmiş, gelecek) - renkli gösterim
    - [x] İşlemler (Düzenle, Sil)
  - [x] İstatistik kartları: Toplam, Bugün, Geçmiş, Gelecek
  - [x] Filtreleme butonları:
    - [x] Tümü
    - [x] Bugün çıkılacaklar
    - [x] Geçmiş tarihler
    - [x] Gelecek tarihler
  - [x] Loading state: Spinner gösterimi
  - [x] Empty state: Kayıt yoksa bilgilendirici mesaj
  - [x] Hata yönetimi: Hata mesajı gösterimi
- [x] Sıralama
  - [x] Çıkılması gereken tarihe göre sırala (varsayılan: en yakın önce - `removalDate` asc)
  - [x] Ürün adına göre sırala (`productName`)
  - [x] SKT tarihine göre sırala (`expiryDate`)
  - [x] Tıklanabilir sıralama: Sütun başlıklarına tıklayınca sıralama değişir
  - [x] Sıralama yönü göstergesi: Ok ikonları (ArrowUp/ArrowDown)
- [x] Düzenleme ve silme
  - [x] Düzenleme: `ExpiringProductModal` ile mevcut kayıt düzenlenebilir
  - [x] Silme: Onay dialog'u ile kayıt silinebilir
  - [x] Başarılı işlem sonrası liste otomatik yenilenir
  - [x] Toast bildirimi: Başarılı/hata mesajları
- [ ] Toplu işlemler (opsiyonel - şimdilik atlanıyor)
  - [ ] Seçili ürünleri sil
  - [ ] Seçili ürünlerin tarihlerini güncelle

---

## Faz 7 — Test Senaryoları

**Amaç:** Yaklaşan SKT özelliğinin beklendiği gibi çalıştığını doğrulamak.

- [ ] Yaklaşan SKT ekleme testi
  - [ ] Ürün ara → kartı aç → "Yaklaşan SKT Olarak İşaretle" butonuna tıkla
  - [ ] SKT tarihi ve çıkılması gereken tarih gir
  - [ ] Kaydet
  - [ ] Firestore'da kayıt oluştuğunu kontrol et
- [ ] Bildirim testi
  - [ ] Çıkılması gereken tarihi bugün olarak ayarla
  - [ ] Sayfayı yenile
  - [ ] Sağ ının göründüğünü doğrula
  - [ ] Bildirim içeriğinin doğru olduğunu kontrol et
- [ ] Çoklu ürün bildirimi testi
  - [ ] Birden fazla ürün için bugün çıkılması gereken tarih ayarla
  - [ ] Tüm ürünlerin bildirimde göründüğünü doğrula
- [ ] Düzenleme ve silme testi
  - [ ] Mevcut kaydı düzenle
  - [ ] Kaydı sil
  - [ ] Firestore'da değişikliklerin yansıdığını kontrol et
- [ ] Edge case'ler
  - [ ] Geçmiş tarihli kayıt: bildirim gösterilmeli mi? (opsiyonel: sadece bugün ve gelecek)
  - [ ] Aynı barkod için birden fazla kayıt: engelle veya izin ver?
  - [ ] Tarih formatı hataları: validasyon çalışıyor mu?

---

## Faz 8 — Dokümantasyon ve Temizlik

**Amaç:** Yeni özelliği dokümante etmek ve kodu temiz tutmak.

- [ ] Kod içine yorumlar ekle
  - [ ] `expiringProductService.ts` fonksiyonları yanına açıklamalar
  - [ ] `ExpiringProductModal` component'inde form validasyon mantığını açıkla
  - [ ] Bildirim kontrolü mantığını açıkla
- [ ] README veya dokümantasyon dosyası güncelle
  - [ ] Yaklaşan SKT özelliğinin nasıl kullanılacağını anlat
  - [ ] Bildirim sisteminin çalışma mantığını açıkla
- [ ] Bu roadmap dosyasındaki tamamlanan maddeleri `[x]` ile güncelle

---

## Teknik Detaylar

### Firestore Yapısı

**expiring_products Collection:**
```typescript
{
  id: "auto-generated",
  barcode: "1234567890123",
  productName: "Ürün Adı",
  expiryDate: "2024-12-31", // ISO format: YYYY-MM-DD
  removalDate: "2024-12-25", // ISO format: YYYY-MM-DD
  createdAt: "2024-01-15T10:00:00.000Z",
  updatedAt: "2024-01-15T10:00:00.000Z",
  isNotified?: boolean // Opsiyonel
}
```

### API Endpoint'leri

- `POST /api/expiring-products` - Yeni kayıt ekle
- `GET /api/expiring-products` - Tüm kayıtları listele (query: `?removalDate=2024-01-15`)
- `GET /api/expiring-products?barcode=1234567890123` - Belirli barkod için kayıt
- `PUT /api/expiring-products/[id]` - Kayıt güncelle
- `DELETE /api/expiring-products/[id]` - Kayıt sil

### Bildirim Kontrolü

- **Tarih formatı:** ISO 8601 (YYYY-MM-DD)
- **Bugünün tarihi:** `new Date().toISOString().split('T')[0]`
- **Kontrol sıklığı:** İlk yüklemede + her 5 dakikada bir (veya real-time listener)
- **Bildirim konumu:** Sağ üst (fixed position: `top: 20px, right: 20px`)

---

*Her fazı tamamladıkça `[ ]` işaretini `[x]` yaparak ilerleyeceğiz. "Faz X ile devam kanka" dediğinde bu özellik için ilgili fazın kod adımlarına geçeceğiz.*

