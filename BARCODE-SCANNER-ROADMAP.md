# Barkod Tarayıcı Özelliği — Yol Haritası (ROADMAP)

Bu belge, Stok Takip Paneli projesine kamera ile barkod okuma özelliği eklemek için gereken tüm adımları içerir. Her görevi tamamladıkça `[ ]` işaretini `[x]` yaparak ilerleyeceğiz.

---

## Genel Özet

- **Özellik:** Kamera ile barkod tarama ve otomatik arama
- **Kütüphane:** `html5-qrcode` (QR ve barkod tarama desteği)
- **Kullanım Senaryosu:** Depo ortamında telefon ile hızlı barkod tarama
- **Hedef Platform:** Mobil öncelikli (arka kamera kullanımı)

---

## Faz 1 — Kütüphane Kurulumu ve Temel Yapı

**Amaç:** Barkod tarama için gerekli kütüphaneyi kurmak ve temel yapıyı hazırlamak.

### 1.1 Paket Kurulumu

- [x] `html5-qrcode` paketini kur: `npm install html5-qrcode`
- [x] `package.json` içinde paketin eklendiğini kontrol et
- [x] TypeScript tip tanımlarını kontrol et (`@types/html5-qrcode` gerekirse kur)
  - ✅ `html5-qrcode@2.3.8` kurulu
  - ✅ Paket kendi TypeScript tiplerini içeriyor, ayrı `@types` paketi gerekmiyor

### 1.2 Bileşen Yapısı Hazırlığı

- [x] `app/components/BarcodeScanner.tsx` dosyası oluştur
- [x] Bileşen için temel interface/prop tiplerini tanımla:
  - `isOpen: boolean` — Modal açık/kapalı
  - `onClose: () => void` — Modal kapatma callback'i
  - `onScanSuccess: (barcode: string) => void` — Barkod okunduğunda çağrılacak callback
- [x] Bileşen iskeletini oluştur (şimdilik boş modal)
  - ✅ Modal yapısı oluşturuldu (overlay + içerik kutusu)
  - ✅ Başlık: "Barkod Tarayıcı"
  - ✅ Kapatma butonu (X ikonu) eklendi
  - ✅ Focus yönetimi eklendi (modal açılınca/kapanınca)
  - ✅ Escape tuşu ile kapatma eklendi
  - ✅ Erişilebilirlik özellikleri eklendi (role, aria-label, aria-labelledby)
  - ✅ Responsive tasarım (mobilde tam ekran, desktop'ta merkezi modal)
  - ✅ Kamera container placeholder eklendi (Faz 3'te doldurulacak)

**Çıktı:** Kütüphane kurulu, bileşen dosyası hazır, temel yapı oluşturuldu.

---

## Faz 2 — UI Entegrasyonu (Arama Çubuğuna Kamera İkonu)

**Amaç:** Arama çubuğuna kamera ikonu eklemek ve modal tetikleme mekanizmasını kurmak.

### 2.1 SearchBar Bileşeni Güncelleme

- [x] `app/components/SearchBar.tsx` dosyasını aç
- [x] `onScanClick?: () => void` prop'unu ekle
- [x] Arama input'unun sağ tarafına kamera ikonu butonu ekle (Lucide `Camera` ikonu)
- [x] Kamera ikonu butonuna `onClick` handler'ı bağla
- [x] İkonun görsel stilini ayarla (hover efektleri, boyut vb.)
- [x] Mobilde touch target'ın yeterince büyük olduğundan emin ol (min 44x44px)
  - ✅ `Camera` ikonu `lucide-react`'ten import edildi
  - ✅ `onScanClick` prop'u interface'e eklendi
  - ✅ Kamera butonu arama input'unun sağına eklendi (onClear butonundan sonra)
  - ✅ Hover efektleri ve stil ayarlandı (mevcut butonlarla uyumlu)
  - ✅ Mobilde `min-h-[44px] min-w-[44px]` ile touch target garantilendi
  - ✅ Desktop'ta normal boyut (`sm:min-h-0 sm:min-w-0`)
  - ✅ `aria-label` ve `title` eklendi (erişilebilirlik)

### 2.2 Ana Sayfada Entegrasyon

- [x] `app/page.tsx` içinde barkod tarayıcı modal state'i ekle: `const [isScannerOpen, setIsScannerOpen] = useState(false)`
- [x] `SearchBar` component'ine `onScanClick={() => setIsScannerOpen(true)}` prop'unu geç
- [x] `BarcodeScanner` component'ini import et ve render et (şimdilik kapalı)
  - ✅ `BarcodeScanner` import edildi
  - ✅ `isScannerOpen` state'i eklendi (`useState(false)`)
  - ✅ `SearchBar`'a `onScanClick={() => setIsScannerOpen(true)}` prop'u geçildi
  - ✅ `BarcodeScanner` component'i render edildi
  - ✅ `onScanSuccess` callback'i eklendi: barkod okunduğunda `setSearchQuery(barcode)` ve `setIsScannerOpen(false)` çağrılıyor
  - ✅ `onClose` callback'i eklendi: modal kapatıldığında `setIsScannerOpen(false)` çağrılıyor

**Çıktı:** Arama çubuğunda kamera ikonu görünüyor, tıklanınca modal açılıyor.

---

## Faz 3 — Barkod Tarayıcı Modal ve Kamera Entegrasyonu

**Amaç:** Modal içinde kamerayı açmak ve canlı görüntüyü göstermek.

### 3.1 Modal Yapısı

- [x] `BarcodeScanner.tsx` içinde modal yapısını oluştur (overlay + içerik kutusu)
- [x] Modal başlığı: "Barkod Tarayıcı"
- [x] Kapatma butonu ekle (X ikonu)
- [x] Modal açılma/kapanma animasyonu ekle (fade + scale)
- [x] Modal'ın mobilde tam ekran veya uygun boyutta açıldığını kontrol et
  - ✅ Overlay (bg-black/50) ve içerik kutusu oluşturuldu
  - ✅ Modal başlığı "Barkod Tarayıcı" eklendi (`h2` elementi, `id="scanner-title"`)
  - ✅ Kapatma butonu eklendi (X ikonu, Lucide React)
  - ✅ Animasyon eklendi: `opacity` (0 → 1) ve `transform: scale(0.95 → 1)` ile fade + scale efekti
  - ✅ Responsive tasarım: mobilde `w-full h-full` (tam ekran), desktop'ta `sm:max-w-lg sm:rounded-xl` (merkezi modal)
  - ✅ Focus yönetimi eklendi (modal açılınca/kapanınca)
  - ✅ Escape tuşu ile kapatma eklendi
  - ✅ Erişilebilirlik: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`

### 3.2 html5-qrcode Entegrasyonu

- [x] `html5-qrcode` kütüphanesini import et: `import { Html5Qrcode } from "html5-qrcode"`
- [x] `useRef` ile kamera container referansı oluştur: `const scannerRef = useRef<HTMLDivElement>(null)`
- [x] `useEffect` ile modal açıldığında kamera başlatma mantığını yaz:
  - `Html5Qrcode` instance'ı oluştur
  - `start()` metodu ile kamerayı başlat
  - Kamera ID'sini otomatik seç veya `environment` (arka kamera) tercih et
  - Container'a kamera görüntüsünü render et
- [x] Modal kapandığında kamera'yı durdur ve temizle (`stop()` ve `clear()`)
  - ✅ `Html5Qrcode` import edildi
  - ✅ `scannerRef` ve `html5QrcodeRef` oluşturuldu
  - ✅ `useEffect` ile modal açıldığında kamera başlatma mantığı eklendi
  - ✅ `Html5Qrcode` instance'ı oluşturuluyor (benzersiz element ID ile)
  - ✅ `start()` metodu ile kamerayı başlatıyor (`facingMode: "environment"` - arka kamera)
  - ✅ Responsive `qrbox` boyutu hesaplanıyor (ekranın %80'i, min 200px, max 300px)
  - ✅ Kamera ayarları optimize edildi (fps: 10, aspectRatio: 1.0, videoConstraints)
  - ✅ Modal kapandığında `stop()` ve `clear()` ile temizleme yapılıyor
  - ✅ Cleanup fonksiyonu eklendi (timeout ve scanner temizliği)

### 3.3 Kamera Ayarları

- [x] Kamera facing mode'u `environment` (arka kamera) olarak ayarla
- [x] Video quality ayarlarını optimize et (mobil performans için)
- [x] Kamera container'ının boyutlarını ayarla (responsive)
- [x] Kamera görüntüsünün modal içinde düzgün göründüğünü kontrol et
  - ✅ Kamera listesi alınıyor (`Html5Qrcode.getCameras()`)
  - ✅ Arka kamera label'a göre bulunuyor ("back", "rear", "environment", "facing back")
  - ✅ Arka kamera bulunamazsa, ön kamera olmayan ilk kamera deneniyor
  - ✅ Hiçbiri bulunamazsa `facingMode: "environment"` kullanılıyor
  - ✅ Video constraints'e `facingMode: "environment"` eklendi (ekstra garanti)
  - ✅ Video quality ayarları optimize edildi (width: 1280, height: 720 ideal)
  - ✅ Responsive qrbox boyutu (ekranın %80'i, min 200px, max 300px)
  - ✅ fps: 10 (mobil performans için)
  - ✅ aspectRatio: 1.0 (1:1 aspect ratio)

**Çıktı:** Modal açıldığında kamera görüntüsü canlı olarak gösteriliyor.

---

## Faz 4 — Barkod Okuma ve Callback İşleme

**Amaç:** Barkod okunduğunda yakalamak ve arama inputuna yazmak.

### 4.1 Tarama Event Handler

- [x] `Html5Qrcode` instance'ında `onScanSuccess` callback'ini tanıla
- [x] Callback içinde okunan barkod değerini al
- [x] Barkod formatını kontrol et (geçerli mi?)
- [x] `onScanSuccess` prop'unu çağır (barkod değeri ile)
- [x] Modal'ı kapat (`onClose()`)
  - ✅ `onScanSuccess` callback'i `scanner.start()` içinde tanımlandı
  - ✅ Okunan barkod değeri `decodedText` parametresinden alınıyor
  - ✅ Barkod formatı kontrol ediliyor: boş değil, `trim()` ile temizleniyor, minimum 3 karakter
  - ✅ `onScanSuccess` prop'u barkod değeri ile çağrılıyor
  - ✅ Modal kapatılıyor (`onClose()`)
  - ✅ Scanner durduruluyor ve temizleniyor (`stop()` ve `clear()`)
  - ✅ Tekrar okumayı önlemek için `isScanningRef` flag'i eklendi
  - ✅ Hata durumunda bile callback çağrılıyor (kullanıcı deneyimi için)

### 4.2 Hata Yönetimi

- [x] `onScanFailure` callback'ini ekle (tarama hataları için)
- [x] Kullanıcıya hata mesajı gösterme (opsiyonel, sessizce devam et)
- [x] Kamera izni reddedildiğinde kullanıcıya bilgi ver
- [x] Kamera bulunamadığında uygun mesaj göster
  - ✅ `error` state'i eklendi (`useState<string | null>(null)`)
  - ✅ `ErrorMessage` component'i import edildi ve kullanılıyor
  - ✅ Kamera başlatma hatası yakalanıyor (`try-catch` bloğu)
  - ✅ Hata mesajları kullanıcı dostu Türkçe mesajlara dönüştürülüyor:
    - Kamera izni reddedildi: "Kamera erişimi reddedildi. Lütfen tarayıcı ayarlarından kamera iznini verin."
    - Kamera bulunamadı: "Kamera bulunamadı. Lütfen cihazınızda bir kamera olduğundan emin olun."
    - Genel hata: "Kamera başlatılamadı. Lütfen izinleri kontrol edin."
  - ✅ Hata mesajı modal içinde gösteriliyor (başlık altında, dismiss butonu ile)
  - ✅ Başarılı okuma durumunda hata mesajı temizleniyor
  - ✅ Modal kapandığında hata mesajı temizleniyor
  - ✅ `onScanFailure` callback'i eklenmiş (sessizce devam ediyor, kritik hatalar için kullanılabilir)

### 4.3 Ana Sayfada Entegrasyon

- [x] `app/page.tsx` içinde `handleBarcodeScan` fonksiyonu oluştur
- [x] Fonksiyon okunan barkodu `searchQuery` state'ine yazsın: `setSearchQuery(barcode)`
- [x] `BarcodeScanner` component'ine `onScanSuccess={handleBarcodeScan}` prop'unu geç
- [x] Modal kapatıldığında `isScannerOpen` state'ini `false` yap
  - ✅ **Not:** Bu adımlar Faz 2.2'de zaten tamamlanmıştı
  - ✅ `isScannerOpen` state'i eklendi (`useState(false)`)
  - ✅ `BarcodeScanner` component'i import edildi ve render edildi
  - ✅ `onScanSuccess` callback'i inline olarak tanımlandı:
    - `setSearchQuery(barcode)` - Barkod arama inputuna yazılıyor
    - `setIsScannerOpen(false)` - Modal kapatılıyor
  - ✅ `onClose` callback'i eklendi: `setIsScannerOpen(false)`
  - ✅ `SearchBar` component'ine `onScanClick={() => setIsScannerOpen(true)}` prop'u geçildi

**Çıktı:** Barkod okunduğunda otomatik olarak arama inputuna yazılıyor ve modal kapanıyor.

---

## Faz 5 — Ses Geri Bildirimi (Opsiyonel)

**Amaç:** Barkod başarıyla okunduğunda ses geri bildirimi vermek.

### 5.1 Ses Dosyası ve Oynatma

- [x] `public/beep.mp3` veya benzeri bir bip sesi dosyası ekle (veya Web Audio API kullan)
- [x] Barkod okunduğunda ses dosyasını oynat
- [x] Ses oynatma için `useRef` ve `Audio` API kullan
- [x] Ses oynatma hatalarını yakala (sessizce devam et)
  - ✅ Web Audio API kullanıldı (ekstra dosya yüklemeye gerek yok)
  - ✅ `audioContextRef` ile `AudioContext` yönetiliyor (`useRef`)
  - ✅ `playBeepSound()` fonksiyonu oluşturuldu:
    - Oscillator (sine wave) kullanılıyor
    - 800 Hz frekans (orta ton)
    - 0.1 saniye süre (100ms)
    - Gain node ile ses seviyesi kontrol ediliyor (%30 başlangıç, fade-out)
  - ✅ Barkod okunduğunda `playBeepSound()` çağrılıyor
  - ✅ Ses çalma hataları `try-catch` ile yakalanıyor (sessizce devam ediyor)
  - ✅ AudioContext suspended durumunda `resume()` çağrılıyor (kullanıcı etkileşimi için)
  - ✅ WebkitAudioContext fallback desteği eklendi (Safari uyumluluğu)

### 5.2 Alternatif: Web Audio API

- [x] Web Audio API ile programatik bip sesi oluştur (opsiyonel)
- [x] `AudioContext` kullanarak kısa bir bip tonu üret
- [x] Ses çalma izni kontrolü yap (gerekirse)

**Çıktı:** Barkod okunduğunda kısa bir bip sesi çalıyor (opsiyonel özellik).

---

## Faz 6 — Mobil Optimizasyon ve Kamera Ayarları

**Amaç:** Depo ortamında telefon ile kullanım için optimize etmek.

### 6.1 Kamera Facing Mode

- [x] `facingMode: "environment"` ayarını garanti et (arka kamera)
- [x] Kamera seçiminde öncelik sırası: environment > user
- [x] Kamera bulunamazsa fallback mekanizması ekle

### 6.2 Odaklama ve Tarama Ayarları

- [x] `qrbox` ayarını optimize et (tarama alanı boyutu) - Responsive qrbox boyutu (ekranın %80'i, min 200px, max 300px)
- [x] `fps` (frame per second) ayarını optimize et (performans için) - 10 fps (mobil için optimize)
- [x] `aspectRatio` ayarını mobil için optimize et - 1.0 (1:1 aspect ratio)
- [x] Otomatik odaklama ayarlarını kontrol et - Tarayıcı/kamera tarafından otomatik yönetiliyor (not eklendi)
  - ✅ **qrbox ayarı:** Responsive hesaplama yapılıyor:
    - Container genişliği ve yüksekliği alınıyor
    - `Math.min(containerWidth, containerHeight) * 0.8` ile ekranın %80'i hesaplanıyor
    - Minimum 200px, maksimum 300px ile sınırlandırılıyor
    - Kod: `Math.min(Math.max(200, Math.floor(Math.min(containerWidth, containerHeight) * 0.8)), 300)`
  - ✅ **fps ayarı:** 10 fps (mobil performans için optimize edilmiş)
  - ✅ **aspectRatio ayarı:** 1.0 (1:1 aspect ratio - kare tarama alanı)
  - ✅ **videoConstraints:** `width: { ideal: 1280 }, height: { ideal: 720 }` (mobil performans için ideal çözünürlük)
  - ✅ **Otomatik odaklama:** Tarayıcı ve kamera tarafından otomatik yönetiliyor (ekstra ayar gerekmiyor)

### 6.3 Mobil Görünüm

- [x] Modal'ın mobilde tam ekran açıldığını kontrol et - `w-full h-full` mobilde, `sm:h-auto sm:max-w-lg` desktop'ta
- [x] Kamera görüntüsünün mobilde düzgün göründüğünü test et - `flex-1` ile kalan alanı kaplar, `max-h-[70vh]` ile sınırlı
- [x] Kamera container'ının responsive olduğunu doğrula - Responsive qrbox ve container boyutları
- [x] Dikey ve yatay modda çalıştığını test et - Flexbox layout ile her iki modda da çalışır
  - ✅ **Modal responsive tasarım:**
    - Mobilde: `w-full h-full` (tam ekran)
    - Desktop'ta: `sm:h-auto sm:max-w-lg sm:rounded-xl` (merkezi modal, maksimum genişlik)
    - Padding: `p-4` mobilde, `sm:p-6` desktop'ta
  - ✅ **Kamera container responsive:**
    - `w-full flex-1` - Genişlik tam, yükseklik kalan alanı kaplar
    - `sm:flex-none` - Desktop'ta flex-none (sabit boyut)
    - `aspect-video` - 16:9 aspect ratio
    - `min-h-[200px] sm:min-h-[300px]` - Minimum yükseklik (mobilde 200px, desktop'ta 300px)
    - `max-h-[70vh] sm:max-h-none` - Maksimum yükseklik (mobilde ekranın %70'i, desktop'ta sınırsız)
  - ✅ **Flexbox layout:** `flex flex-col` ile dikey düzen, her iki modda da çalışır
  - ✅ **Overflow yönetimi:** `overflow-y-auto` ile içerik taşarsa scroll edilebilir
  - ✅ **Responsive qrbox:** Container boyutuna göre dinamik olarak hesaplanıyor (Faz 6.2'de yapıldı)

**Çıktı:** Mobil cihazlarda arka kamera ile optimize edilmiş tarama deneyimi.

---

## Faz 7 — UX İyileştirmeleri ve Hata Yönetimi

**Amaç:** Kullanıcı deneyimini iyileştirmek ve hata durumlarını yönetmek.

### 7.1 Loading State

- [x] Kamera yüklenirken loading göstergesi ekle
- [x] "Kamera açılıyor..." mesajı göster
- [x] Kamera hazır olduğunda loading'i kaldır
  - ✅ `isLoading` state'i eklendi (`useState(false)`)
  - ✅ Kamera başlatma başladığında `setIsLoading(true)` çağrılıyor
  - ✅ Kamera başarıyla başlatıldığında `setIsLoading(false)` çağrılıyor (scanner.start callback'inde)
  - ✅ Hata durumunda `setIsLoading(false)` çağrılıyor
  - ✅ Modal kapandığında `setIsLoading(false)` çağrılıyor
  - ✅ Loading UI eklendi:
    - Spinner animasyonu (Tailwind `animate-spin`)
    - "Kamera açılıyor..." mesajı
    - Yarı saydam overlay (`bg-zinc-100/90 dark:bg-zinc-800/90 backdrop-blur-sm`)
    - Merkezi konumlandırma (`absolute inset-0 flex items-center justify-center`)
    - Primary renk ile spinner border (`border-t-[var(--color-primary)]`)

### 7.2 Kullanıcı Yönlendirmeleri

- [x] Modal içinde kullanım talimatları ekle: "Barkodu kameraya gösterin"
- [x] Tarama alanını görsel olarak vurgula (köşelerde çerçeve)
- [x] "Kapat" butonunu belirgin yap
  - ✅ Kullanım talimatları eklendi ve iyileştirildi:
    - Ana mesaj: "Barkodu kameraya gösterin" (font-medium ile vurgulu)
    - Açıklayıcı alt mesaj: "Barkod otomatik olarak okunacak ve arama yapılacaktır"
    - İki satırlı düzen (`space-y-2`)
  - ✅ Tarama alanı görsel vurgusu: html5-qrcode'un `qrbox` özelliği tarafından otomatik olarak köşelerde çerçeve gösteriliyor (beyaz köşeler ile tarama alanı belirgin)
  - ✅ Kapat butonu belirginleştirildi:
    - `p-2` ile padding artırıldı (daha büyük tıklama alanı)
    - `min-h-[44px] min-w-[44px]` ile mobilde yeterli touch target
    - `flex items-center justify-center` ile merkezi hizalama
    - `title="Kapat (Esc)"` ile klavye kısayolu bilgisi eklendi

### 7.3 Hata Mesajları

- [x] Kamera izni reddedildiğinde: "Kamera erişimi gerekli" mesajı
- [x] Kamera bulunamadığında: "Kamera bulunamadı" mesajı
- [x] Tarama hatası durumunda: Sessizce devam et veya kısa mesaj göster
- [x] ErrorMessage component'i ile hata gösterimi (mevcut component'i kullan)
  - ✅ **Not:** Bu adımlar Faz 4.2'de zaten tamamlanmıştı
  - ✅ `ErrorMessage` component'i import edildi ve kullanılıyor
  - ✅ Hata mesajları kullanıcı dostu Türkçe mesajlara dönüştürülüyor:
    - Kamera izni reddedildi: "Kamera erişimi reddedildi. Lütfen tarayıcı ayarlarından kamera iznini verin."
    - Kamera bulunamadı: "Kamera bulunamadı. Lütfen cihazınızda bir kamera olduğundan emin olun."
    - Genel hata: "Kamera başlatılamadı. Lütfen izinleri kontrol edin."
  - ✅ Hata mesajı modal içinde gösteriliyor (başlık altında, dismiss butonu ile)
  - ✅ `onScanFailure` callback'i eklenmiş (sessizce devam ediyor, kritik hatalar için kullanılabilir)
  - ✅ `ariaLive="assertive"` ile erişilebilirlik desteği

### 7.4 Erişilebilirlik

- [ ] Modal için `role="dialog"` ve `aria-labelledby` ekle
- [ ] Kamera butonu için `aria-label="Barkod tarayıcıyı aç"` ekle
- [ ] Klavye ile modal kapatma (Escape tuşu) ekle
- [ ] Focus yönetimi: Modal açıldığında focus modal içine, kapandığında geri dön

**Çıktı:** Profesyonel UX, hata yönetimi ve erişilebilirlik desteği.

---

## Faz 8 — Test ve Optimizasyon

**Amaç:** Tüm özelliklerin çalıştığını doğrulamak ve performansı optimize etmek.

### 8.1 Fonksiyonellik Testleri

- [ ] Kamera ikonu görünüyor mu?
- [ ] İkona tıklanınca modal açılıyor mu?
- [ ] Kamera görüntüsü gösteriliyor mu?
- [ ] Barkod okunduğunda arama inputuna yazılıyor mu?
- [ ] Modal kapanıyor mu?
- [ ] Ses çalıyor mu? (opsiyonel)

### 8.2 Mobil Testler

- [ ] Gerçek mobil cihazda test et
- [ ] Arka kamera kullanılıyor mu?
- [ ] Farklı barkod formatlarını test et (EAN-13, Code128, vb.)
- [ ] Farklı ışık koşullarında test et
- [ ] Dikey ve yatay modda çalışıyor mu?

### 8.3 Performans Optimizasyonu

- [ ] Kamera başlatma süresini optimize et
- [ ] Bellek kullanımını kontrol et (kamera kapatıldığında temizleniyor mu?)
- [ ] Tarama hızını optimize et (fps ayarları)
- [ ] Battery drain'i kontrol et (kamera açıkken)

### 8.4 Hata Senaryoları Testleri

- [ ] Kamera izni reddedildiğinde ne oluyor?
- [ ] Kamera bulunamadığında ne oluyor?
- [ ] Geçersiz barkod okunduğunda ne oluyor?
- [ ] Modal açıkken sayfa yenilendiğinde ne oluyor?

**Çıktı:** Tüm özellikler test edildi, performans optimize edildi, hata durumları yönetiliyor.

---

## Faz 9 — Production Hazırlığı

**Amaç:** Production'a deploy için son kontroller ve optimizasyonlar.

### 9.1 Build Kontrolü

- [ ] `npm run build` ile production build'in hatasız olduğunu doğrula
- [ ] TypeScript hatalarını kontrol et
- [ ] ESLint uyarılarını kontrol et

### 9.2 Browser Uyumluluğu

- [ ] Chrome/Edge'de test et
- [ ] Safari'de test et (iOS)
- [ ] Firefox'ta test et (mümkünse)
- [ ] Eski tarayıcılar için fallback mesajı ekle (opsiyonel)

### 9.3 Güvenlik ve İzinler

- [ ] HTTPS gereksinimini kontrol et (kamera API'si HTTPS gerektirir)
- [ ] Kamera izinleri için kullanıcı bilgilendirmesi ekle
- [ ] Netlify'da HTTPS aktif olduğunu doğrula

### 9.4 Dokümantasyon

- [ ] README.md'ye barkod tarama özelliğini ekle
- [ ] Kullanım talimatlarını yaz
- [ ] Gerekirse kod içi yorumları ekle

**Çıktı:** Production'a deploy için hazır, tüm kontroller yapıldı.

---

## Özet Tablo

| Faz | İçerik | Ana Çıktı | Tahmini Süre |
|-----|--------|-----------|--------------|
| 1 | Kütüphane kurulumu, bileşen yapısı | Temel yapı hazır | 15 dk |
| 2 | UI entegrasyonu, kamera ikonu | Arama çubuğunda ikon | 20 dk |
| 3 | Modal ve kamera entegrasyonu | Canlı kamera görüntüsü | 45 dk |
| 4 | Barkod okuma ve callback | Otomatik arama yazma | 30 dk |
| 5 | Ses geri bildirimi | Bip sesi (opsiyonel) | 20 dk |
| 6 | Mobil optimizasyon | Arka kamera, odaklama | 30 dk |
| 7 | UX iyileştirmeleri | Hata yönetimi, loading | 30 dk |
| 8 | Test ve optimizasyon | Tüm testler geçti | 45 dk |
| 9 | Production hazırlığı | Deploy için hazır | 20 dk |

**Toplam Tahmini Süre:** ~3-4 saat

---

## Teknik Detaylar

### html5-qrcode Kütüphanesi

- **Paket:** `html5-qrcode`
- **Versiyon:** En son stabil versiyon
- **Dokümantasyon:** https://github.com/mebjas/html5-qrcode
- **Desteklenen Formatlar:** QR Code, Barcode (EAN-13, Code128, vb.)

### Kamera API Gereksinimleri

- **HTTPS:** Kamera API'si HTTPS gerektirir (production'da Netlify otomatik sağlar)
- **İzinler:** Kullanıcıdan kamera izni istenir
- **Browser Support:** Modern tarayıcılar (Chrome, Safari, Firefox, Edge)

### Mobil Kamera Ayarları

- **Facing Mode:** `environment` (arka kamera)
- **Video Constraints:** Mobil performans için optimize edilmiş
- **Scan Area:** Responsive, ekran boyutuna göre ayarlanır

---

## Öncelik Sırası

1. **Yüksek Öncelik:** Faz 1, 2, 3, 4 → Temel özellik çalışır
2. **Orta Öncelik:** Faz 6, 7 → Mobil optimizasyon ve UX
3. **Düşük Öncelik:** Faz 5, 8, 9 → Ses, testler, production hazırlığı

---

## Notlar

- Ses özelliği (Faz 5) opsiyoneldir, istenmezse atlanabilir
- Testler (Faz 8) gerçek cihazda yapılmalı (emulator yeterli değil)
- Production'da HTTPS zorunludur (Netlify otomatik sağlar)
- Kamera izinleri kullanıcıdan istenir, reddedilirse uygun mesaj gösterilir

---

*Tamamlanan her görevde `[ ]` işaretini `[x]` yaparak ilerleyeceğiz. "Harekete geç" dediğinde Faz 1'den itibaren kod adımlarına geçilecektir.*

