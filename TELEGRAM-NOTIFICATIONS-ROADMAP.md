## Telegram Bildirimleri — Ürün Ekle / Sil / Düzenle Yol Haritası

Bu belge, panelde yapılan stok işlemlerinde (ürün ekleme, silme, düzenleme) Telegram bot'una bildirim göndermek için izlenecek adımları listeler. Her görevi tamamladıkça `[ ]` işaretini `[x]` yaparak ilerleyeceğiz.

---

## Faz 1 — İhtiyaçların Netleştirilmesi ve Tasarım

**Amaç:** Hangi işlemlerde, hangi bilgilerin, hangi formda ve nereye (hangi Telegram chat'ine) gönderileceğini netleştirmek.

- [x] Bildirim gerektiren işlemleri netleştir
  - [x] Ürün ekleme (Firestore: `addStockItem`)
  - [x] Ürün silme (Firestore: `deleteStockItem`)
  - [x] Ürün düzenleme (Firestore: `updateStockItem`)
- [x] Her işlem tipi için gönderilecek alanları tanımla
  - [x] Ortak alanlar:
    - [x] Ürün adı (`name`)
    - [x] Barkod (`barcode`)
    - [x] Miktar (`quantity`)
    - [x] Tip (`type` — eksik/fazla)
  - [x] Ekleme için ek bilgiler:
    - [x] Notlar (`notes`)
  - [x] Düzenleme için ek bilgiler:
    - [x] Miktar değişimi (eski / yeni `quantity`)
    - [x] İsim veya barkod değiştiyse bunları da isteğe bağlı ekle
  - [x] Silme için ek bilgiler:
    - [x] Silinmeden önce son kayıt bilgisi mesajda gösterilecek (ad, barkod, miktar, tip, not)
- [x] Mesaj formatını tasarla (örnek metinler)
  - [x] Ekleme örneği:
    - [x] `🟢 ÜRÜN EKLENDİ\nAd: {name}\nBarkod: {barcode}\nMiktar: {quantity}\nTip: {type}\nNot: {notes}`
  - [x] Silme örneği:
    - [x] `🔴 ÜRÜN SİLİNDİ\nAd: {name}\nBarkod: {barcode}\nMiktar: {quantity}\nTip: {type}\nNot: {notes}`
  - [x] Güncelleme örneği:
    - [x] `🟡 ÜRÜN GÜNCELLENDİ\nAd: {name}\nBarkod: {barcode}\nEski miktar: {oldQuantity}\nYeni miktar: {newQuantity}`
    - [x] (Opsiyonel) İsim veya barkod değiştiyse ek satırlar: `Eski ad: ... / Yeni ad: ...`, `Eski barkod: ... / Yeni barkod: ...`
- [x] Bildirimlerin gönderileceği hedefi netleştir
  - [x] Tüm işlemler için tek bir Telegram grup/chat kullanılacak (örn. `stok-log-grubu`)
  - [x] İleride farklı şubeler için ayrı chat ID desteği eklenebilir, şimdilik tek chat yeterli

---

## Faz 2 — Telegram Bot ve Chat Bilgilerinin Hazırlanması

**Amaç:** Telegram tarafında gerekli bot ve chat bilgilerini hazırlamak, projede environment değişkenleri ile güvenli şekilde saklamak.

- [x] Telegram bot oluştur
  - [x] `@BotFather` ile yeni bir bot oluştur (kullanıcı adı: `@getirstokbot`)
  - [x] Bot token'ını al (`TELEGRAM_BOT_TOKEN`)
- [x] Chat ID'yi öğren
  - [x] Bot'u bildirim almak istediğin (şimdilik özel sohbet) chat'e ekle / yaz
  - [x] Basit bir test mesajı için bot'a bir şey yaz
  - [x] Chat ID'yi almak için:
  - [x] `getUpdates` endpoint'i ile güncel chat ID'yi öğren
  - [x] Chat ID'yi not et (`TELEGRAM_CHAT_ID=1121237975`)
- [x] Environment değişkenlerini projeye ekle
  - [ ] `netlify` / deploy ortamında:
    - [ ] `TELEGRAM_BOT_TOKEN`
    - [ ] `TELEGRAM_CHAT_ID`
  - [x] Lokal `.env.local` için aynı değişkenleri ekle (gerekirse test amaçlı)
- [x] Güvenlik ve gizlilik notu
  - [x] Token ve chat ID kesinlikle git'e commit edilmeyecek, sadece env üzerinden okunacak (sadece env üzerinden okunacak şekilde planlandı)

---

## Faz 3 — Backend'de Telegram Servis Katmanı

**Amaç:** Telegram'a mesaj göndermeyi tek bir yerde toplayan, tekrar kullanılabilir bir servis fonksiyonu yazmak.

- [x] Yeni bir servis dosyası oluştur
  - [x] Önerilen dosya: `app/lib/telegramService.ts`
- [x] Temel Telegram gönderim fonksiyonunu yaz
  - [x] `sendTelegramMessage(message: string): Promise<void>` fonksiyonu
  - [x] Telegram Bot API endpoint'i:
    - [x] `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage`
  - [x] Gövde (body):
    - [x] `chat_id`: env'den okunan `TELEGRAM_CHAT_ID`
    - [x] `text`: parametre olarak gelen `message`
    - [x] (opsiyonel) `parse_mode`: `"Markdown"` veya `"HTML"` (mesaj formatına göre) — şimdilik kapalı, gerekirse açılacak
- [x] Hata yönetimi ve loglama
  - [x] HTTP hatalarında anlamlı log'lar yaz
  - [x] Telegram API'den dönen hata mesajını consola veya server log'una aktar
  - [x] Belirli hataları swallow et (örneğin Telegram o an kapalıysa panel çalışmaya devam edebilsin)
- [x] Mesaj oluşturma helper'ları ekle
  - [x] `buildAddItemMessage(item: AddStockItemParams): string`
  - [x] `buildDeleteItemMessage(item: StockItemWithId): string`
  - [x] `buildUpdateItemMessage(before: StockItemWithId, after: StockItemWithId): string`

---

## Faz 4 — Firestore İşlemlerine Telegram Entegrasyonu

**Amaç:** Panelde yapılan stok işlemlerine, güvenilir ve tekrarlanabilir şekilde Telegram bildirimleri eklemek.

- [x] Ürün ekleme işlemine bildirim ekle
  - [x] Dosya: `app/lib/stockService.ts`
  - [x] Fonksiyon: `addStockItem`
  - [x] Ekleme başarılı olduktan sonra:
    - [x] `buildAddItemMessage` ile mesajı oluştur
    - [x] `sendTelegramMessage` ile gönder (await etmeden, fire-and-forget)
  - [x] Hata durumunda:
    - [x] Telegram hatasında Firestore eklemeyi iptal etme — sadece logla
- [x] Ürün silme işlemine bildirim ekle
  - [x] Dosya: `app/lib/stockService.ts`
  - [x] Fonksiyon: `deleteStockItem`
  - [x] Silmeden önce son doküman verisini almak gerekirse:
    - [x] `getDoc` çağrısıyla silinecek dokümanın bilgilerini çek (ad, barkod, miktar vb.)
    - [x] `buildDeleteItemMessage` ile mesajı oluştur
    - [x] Ardından `deleteDoc` çağrısı yap
  - [x] Telegram hatasında silme işlemini durdurma — sadece logla
- [x] Ürün güncelleme işlemine bildirim ekle
  - [x] Dosya: `app/lib/stockService.ts`
  - [x] Fonksiyon: `updateStockItem`
  - [x] Güncellemeden önce ve sonra değerleri kıyaslamak için:
    - [x] Güncelleme öncesi dokümanı `getDoc` ile çek
    - [x] Güncellemeyi uygula (`updateDoc`)
    - [x] `buildUpdateItemMessage(before, after)` ile mesajı oluştur (önceki + güncellenen alanları birleştirerek)
  - [x] Sadece gerçekten değişen alanları mesaja eklemeyi değerlendir (isim/barkod değiştiyse opsiyonel satırlar gösterilir)

---

## Faz 5 — Test Senaryoları ve İnce Ayar

**Amaç:** Tüm işlemler için Telegram bildirimlerinin doğru ve tutarlı çalıştığını doğrulamak.

- [ ] Lokal / test ortamında Telegram bildirimlerini dene
  - [ ] Yeni ürün ekle:
    - [ ] Telegram'da doğru formatta “EKLENDİ” mesajı geliyor mu kontrol et
  - [ ] Mevcut ürünü düzenle:
    - [ ] Değişen alanlar doğru gösteriliyor mu kontrol et
  - [ ] Ürünü sil:
    - [ ] Silinen ürüne ait bilgiler mesajda görünüyor mu kontrol et
- [ ] Hata ve edge-case senaryolarını test et
  - [ ] Telegram token yanlışsa ya da chat ID hatalıysa:
    - [ ] Panel tarafında işlem devam ediyor mu (kullanıcıyı Telegram hatasıyla boğmamak için)
    - [ ] Loglarda hata net şekilde görünüyor mu
  - [ ] Aynı anda birden fazla hızlı işlem yapıldığında (örneğin çok sayıda ürün ekleme):
    - [ ] Telegram rate-limit problemi yaşanıyor mu, not et
- [ ] Mesaj formatlarını ince ayar yap
  - [ ] Çok uzun mesajlar için satır başlarını ve emojileri düzenle
  - [ ] Gereksiz bilgileri çıkar, en kritik alanları öne çıkar (isim, barkod, miktar, tip)

---

## Faz 6 — Production Hazırlığı ve Dokümantasyon

**Amaç:** Entegrasyonu production için güvenli ve sürdürülebilir hale getirmek.

- [ ] Production ortamında env değişkenlerini kontrol et
  - [ ] `TELEGRAM_BOT_TOKEN` doğru bot'a ait mi?
  - [ ] `TELEGRAM_CHAT_ID` doğru grup / kullanıcıya mı işaret ediyor?
- [ ] Kod içi kısa yorumlar ekle
  - [ ] `telegramService` içinde: sıradan bir HTTP isteği olmadığını (Bot API) kısaca belirt
  - [ ] `stockService` içindeki bildirim noktalarında:
    - [ ] Hangi durumda hangi tip mesaj gönderildiğini kısaca açıkla
- [ ] Bu dosyadaki tamamlanan maddeleri `[x]` ile güncel tut
  - [ ] Hangi fazların production'a alındığını netleştir


