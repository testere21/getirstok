### ÜRÜN YOK / STOK YOK BİLDİRİMİ – ROADMAP

Bu özellik ile, panelde stok bilgisi görünmeyen veya hiç listede olmayan ürünler **“Ürün yok”** ya da **“Stok yok”** olarak işaretlenebilecek ve bu durum **Telegram’a ayrıntılı bir uyarı mesajı** olarak düşecek.

---

### Faz 1 – İhtiyaç Analizi ve Tasarım

- [x] **Senaryo analizi**
  - [x] Hangi ekranda butonlar görünecek?  
        - **Ürün kartı (AddProductModal)** içinde, tedarikçi iade / yaklaşan SKT butonlarının bulunduğu alanın altında iki ayrı aksiyon:
          - “Ürün Yok Bildir”
          - “Stok Yok Bildir”
        - **Arama yapılıp sonuç bulunamadığında** (ürün kartı hiç açılmıyorsa) “Bu barkod için ürün bulunamadı, Ürün Yok Bildir” şeklinde bir call-to-action.
  - [x] “Ürün yok” ile “Stok yok” arasındaki fark:
        - **Ürün yok**: Panelde katalog kaydı olmayan veya eşleşmeyen barkod; ürün hiç bulunamıyor.
        - **Stok yok**: Getir panelinde ürün var, ancak bizim stok çekme API yanıtında/adet alanında stok gözükmüyor ya da 0, kullanıcı bunu özellikle işaretlemek istiyor.
- [x] **Gönderilecek bilgiler**i belirle:
  - [x] Barkod (zorunlu, 8–13 haneli)
  - [x] Ürün adı (varsa; ürün kartından veya kullanıcıdan gelen isim)
  - [x] Bildirim tipi: `product_missing` (ÜRÜN YOK) / `stock_missing` (STOK YOK)
  - [x] Kaynak ekran: `"missing_tab" | "extra_tab" | "search" | "expiring" | "other"` (opsiyonel ama gönderilecek)
  - [x] Kullanıcı notu (isteğe bağlı kısa açıklama alanı, maks. ~250 karakter)
  - [x] Bildirim zamanı (sunucu tarafında üretilecek `createdAt` – Telegram mesajında tarih/saat gösterilebilir, Firestore’a da yazılabilir)
- [x] **Telegram mesaj formatını** tasarla (Türkçe, okunaklı ve en kritik bilgiler başta olacak şekilde)
  - **Ürün Yok** mesaj şablonu (öneri):
    - `🚫 ÜRÜN YOK BİLDİRİMİ`
    - `Barkod: 8691234567890`
    - `Ürün Adı: Kinder Delice (39 g)` _(varsa)_
    - `Kaynak: Arama ekranı / Eksik Ürün Kartı ...`
    - `Not: {kullanıcının yazdığı açıklama}` _(varsa)_
  - **Stok Yok** mesaj şablonu (öneri):
    - `⚠️ STOK YOK BİLDİRİMİ`
    - `Barkod: 8691234567890`
    - `Ürün Adı: Kinder Delice (39 g)`
    - `Kaynak: Eksik Ürün Kartı / Fazla Ürün Kartı ...`
    - `Not: {kullanıcının yazdığı açıklama}` _(varsa)_
- [x] Gerekirse bu bildirimleri sonradan analiz etmek için Firestore’da ayrı bir koleksiyon tutup tutmayacağına karar ver (`product_issue_reports` gibi).
  - **Karar:** Evet, Telegram’a giden her bildirim aynı zamanda `product_issue_reports` koleksiyonuna kaydedilecek.
    - Alanlar:
      - `barcode: string`
      - `productName?: string`
      - `type: "product_missing" | "stock_missing"`
      - `note?: string`
      - `source?: string`
      - `createdAt: string` (ISO)
      - `telegramSent: boolean`
      - `telegramError?: string` (varsa kısaca hata bilgisi)

---

### Faz 2 – Backend API Tasarımı

- [x] **Yeni API route tasarımı**
  - [x] `POST /api/telegram/product-issue` endpoint'i oluşturuldu.
  - [x] İstek body şeması:
        - `type`: `"product_missing"` | `"stock_missing"`
        - `barcode`: `string`
        - `productName?`: `string`
        - `note?`: `string`
        - `source?`: `"missing_tab" | "extra_tab" | "search" | "expiring" | "other"`
- [x] **Validasyon kuralları**
  - [x] `barcode` zorunlu, string tipinde ve minimum uzunluk kontrolü var.
  - [x] `type` yalnızca tanımlı iki değerden biri olabiliyor.
  - [x] `note` için maksimum 250 karakter sınırı uygulanıyor.
- [x] **Telegram entegrasyonu**
  - [x] Mevcut `app/lib/telegramService.ts` kullanıldı.
  - [x] Yeni helper eklendi:
        - `buildProductIssueMessage(payload)` (ürün yok / stok yok için tek fonksiyon).
  - [x] API route içinde:
        - [x] Body parse + validasyon yapılıyor.
        - [x] Uygun message builder çağrılıyor.
        - [x] `sendTelegramMessage` ile mesaj gönderiliyor, hata yakalanıyor.
        - [x] Başarılı/başarısız durumlar için anlamlı JSON cevap dönülüyor.
- [x] (Opsiyonel) **Firestore loglama**
  - [x] `product_issue_reports` koleksiyonu tanımlandı ve kullanılıyor.
  - [x] Aşağıdaki alanlarla rapor kaydı oluşturuluyor:
        - `barcode`, `productName`, `type`, `note`, `source`, `createdAt`, `telegramSent`, `telegramError`.

---

### Faz 3 – Frontend UI / UX Tasarımı

- [x] **Buton konumları**
  - [x] Ürün kartı (`AddProductModal`) içinde:
        - [x] Sağ taraftaki aksiyon bloğunda (Tedarikçi İade / Yaklaşan SKT butonlarının altında) iki buton tasarlanacak:
              - “Ürün Yok Bildir” (tip: `product_missing`)
              - “Stok Yok Bildir” (tip: `stock_missing`)
        - [x] Mobilde bu butonlar alt alta (full width), masaüstünde yan yana kompakt şekilde görünecek.
  - [x] Arama yapılıp **hiç sonuç bulunamazsa**:
        - [x] “Bu barkod için ürün bulunamadı” mesajı ile birlikte tek bir call-to-action:
              - “Ürün Yok Bildir” (tip: `product_missing`, kaynak: `search`).
- [x] **Bildirim formu (modal veya küçük sheet)**
  - [x] Yeni bir modal bileşeni kullanılacak (`ProductIssueReportModal`):
        - Barkod (readonly label / input)
        - Ürün adı (readonly, varsa)
        - Seçilen bildirim türü (başlıkta veya renkli bir etiketle vurgulanan Ürün yok / Stok yok)
  - [x] Kullanıcıdan istenecek ek bilgi:
        - Kısa açıklama textarea (opsiyonel, placeholder: “İsterseniz kısa bir not ekleyin…”).
  - [x] Aksiyon butonları:
        - Sol: “Vazgeç” (ikincil, gri/outline)
        - Sağ: “Telegram’a Gönder” (birincil, turuncu; loading state ile)
- [x] **Toast & hata durumları**
  - [x] Başarılı gönderimde yeşil/mavi toast: “Bildirim Telegram’a gönderildi.”
  - [x] Hata durumunda kırmızı toast: “Bildirim gönderilemedi, lütfen tekrar deneyin.”
  - [x] Aynı ürün için çok kısa sürede tekrar bildirim gönderilirse, frontend’de sade bir uyarı metni gösterilecek (örneğin: “Bu ürün için az önce bildirim gönderdiniz.”).

---

### Faz 4 – Frontend Uygulama (Entegrasyon)

- [x] **Yeni bileşenler**
  - [x] `ProductIssueReportModal.tsx` oluşturuldu:
        - Props: `isOpen`, `onClose`, `type`, `barcode`, `productName`, `source`, `onSuccess`.
        - İçinde textarea + submit butonu ile `POST /api/telegram/product-issue` çağrısı yapıyor.
  - [x] Bu modal entegre edildi:
        - [x] `AddProductModal.tsx` içine (ürün kartından Ürün Yok / Stok Yok bildir).
        - [x] Katalog arama alanında “Eşleşen ürün yok” durumuna (arama barkoduna göre Ürün Yok bildir).
- [x] **API çağrısı**
  - [x] `fetch` ile `POST` isteği atılıyor:
        - Body: `{ type, barcode, productName, note, source }`.
        - Başarılı / hatalı durumlarda uygun mesajlar gösteriliyor (`onSuccess` + modal içi hata alanı).
- [x] **Buton durumları**
  - [x] İstek atılırken butonlar disabled ve “Gönderiliyor…” metni ile gösteriliyor.
  - [x] Aynı ürün için çok kısa sürede (örneğin 5 sn) tekrar bildirim gönderilmesini engellemek için modal içinde basit throttle uygulanıyor.

---

### Faz 5 – Telegram Mesaj Şablonu ve Testler

- [x] **Mesaj tasarımı**
  - [x] `buildProductIssueMessage(payload)` fonksiyonu ile:
    - `product_missing` için: başlık `🚫 ÜRÜN YOK BİLDİRİMİ`, altında Barkod / Ürün Adı (varsa) / Kaynak (varsa) / Not (varsa) satırları.
    - `stock_missing` için: başlık `⚠️ STOK YOK BİLDİRİMİ`, aynı formatta satırlar.
- [x] **Test senaryoları (manuel)**
  - [x] Ürün kartından:
        - [x] “Ürün Yok Bildir” → Telegram’da doğru başlık ve içerik kontrol edildi.
        - [x] “Stok Yok Bildir” → Telegram’da doğru başlık ve içerik kontrol edildi.
  - [x] Katalog aramasında sonuç çıkmayan barkod için “Ürün Yok Bildir” akışı test edildi (arama input’undaki barkod kullanılıyor).
  - [x] Yanlış/eksik barkod ile istek atıldığında API’nin validasyon hatası (400) döndürdüğü ve modalda hata mesajı gösterildiği doğrulandı.
  - [x] Firestore `product_issue_reports` koleksiyonunda her çağrı için ilgili alanlarla (barcode, type, note, source, telegramSent, telegramError) rapor dokümanlarının oluştuğu kontrol edildi.

---

### Faz 6 – UX İyileştirmeleri ve Güvenlik

- [x] **UI iyileştirmeleri**
  - [x] Ürün kartındaki “Ürün Yok Bildir” / “Stok Yok Bildir” butonlarına `AlertTriangle` ikonu ve durum renkleri (kırmızı / amber tonları) eklendi.
  - [x] Mobilde butonlar tek sütunda, masaüstünde `sm:grid-cols-2` ile yana yana olacak şekilde responsive yapıldı.
  - [x] `ProductIssueReportModal` tasarımı panelin mevcut koyu/aydınlık stiline uygun şekilde (rounded-xl, gölgeler, renk paleti) finalize edildi.
- [x] **Dokümantasyon**
  - [x] Bu dosyada (URUN-YOK-STOK-YOK-ROADMAP.md) özelliğin amacı, akışı ve entegrasyon noktaları detaylı olarak yazıldı; ayrıca Telegram mesaj formatı ve test senaryoları da burada belgelendi.


