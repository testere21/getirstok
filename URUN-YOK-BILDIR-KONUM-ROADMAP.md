# "Ürün Yok Bildir" Butonunun Konumunu Değiştirme – Yol Haritası

Bu doküman, **"Ürün Yok Bildir"** butonunun mevcut konumundan çıkarılıp **barkod yazıldığında ve hiç ürün listelenmediğinde** gösterilmesi ve tıklanınca Telegram bildirimi gönderilmesi için adımları içerir.

---

## Mevcut Durum

- **Şu anki konum:** `AddProductModal` içinde; ürün kartında SKT / bildirim alanının yanında (ve katalog arama sonucu yoksa modal içinde) "Ürün Yok Bildir" butonu var.
- **İstenen davranış:** Kullanıcı arama kutusuna barkod yazar, **hiçbir ürün listelenmezse** (arama sonucu boş) ana sayfada, sonuç alanında **"Ürün Yok Bildir"** butonu görünsün. Butona tıklanınca mevcut Telegram bildirimi akışı (ürün yok = `product_missing`) tetiklensin.

---

## Hedef Akış

1. Kullanıcı arama çubuğuna barkod girer (veya kamera ile okutur).
2. Arama sonucu listesi **boş** döner (katalogda bu barkoda ait ürün yok).
3. "Sonuç bulunamadı" mesajının **hemen altında veya yanında** **"Ürün Yok Bildir"** butonu görünür.
4. Kullanıcı butona tıklar → **Ürün yok bildirimi** modal’ı açılır (mevcut `ProductIssueReportModal`, tip: `product_missing`).
5. Kullanıcı onaylar / not ekler → Telegram’a bildirim gider (mevcut `/api/telegram/product-issue` + Firestore kaydı).

---

## Faz 1 — Ana Sayfada "Sonuç Yok" Alanına Buton Ekleme

**Amaç:** Barkod arandığında sonuç yoksa ana sayfada "Ürün Yok Bildir" butonunu göstermek.

- [x] **1.1** `app/page.tsx` içinde, arama sonucu boş olduğunda render edilen yeri bul:  
  `searchQuery.trim()` dolu, `!isShortSearchQuery`, `!isLoading && !catalogLoading`, `filteredCatalogProducts.length === 0` iken şu an sadece `<EmptyState title="Arama sonucu bulunamadı" ... />` gösteriliyor.

- [x] **1.2** Bu blokta EmptyState’in altına (veya EmptyState ile aynı blokta, tasarıma göre) bir **"Ürün Yok Bildir"** butonu ekle.  
  - Buton metni: **Ürün Yok Bildir**  
  - Görsel: Mevcut modal’daki gibi uyarı ikonu (örn. `AlertTriangle`) kullanılabilir.  
  - Tıklanınca: Ana sayfada "ürün yok bildir" modal’ını açacak state’i set et (ör. `productIssueReportFromSearch` veya modal açık mı + barcode + tip state’i).

- [x] **1.3** Ana sayfada `ProductIssueReportModal` açık olacak şekilde state ekle:  
  - Örn. `productIssueFromSearch: { barcode: string } | null`  
  - Butona tıklanınca: `setProductIssueFromSearch({ barcode: searchQuery.trim() })`  
  - Modal kapatılınca: `setProductIssueFromSearch(null)`  
  - Modal’a geçirilecek props: `isOpen={!!productIssueFromSearch}`, `onClose={() => setProductIssueFromSearch(null)}`, `type="product_missing"`, `barcode={productIssueFromSearch?.barcode ?? ""}`, `productName` boş (ürün bulunamadı), `source="search_no_results"` (isteğe bağlı, Telegram mesajında kaynak bilgisi için).

- [x] **1.4** Sadece **gerçekten barkod benzeri arama** yapıldığında butonu göster (isteğe bağlı iyileştirme):  
  - Örn. `searchQuery.trim().length >= 6` veya sadece rakam içeriyorsa "Ürün Yok Bildir" göster; kısa veya genel metin aramalarında gösterme.  
  - Bu madde opsiyoneldir; ilk sürümde "sonuç yok + arama dolu" yeterli de olabilir.

**Çıktı:** Ana sayfada, barkod aranıp sonuç çıkmadığında "Ürün Yok Bildir" butonu görünür ve tıklanınca modal açılır.

---

## Faz 2 — ProductIssueReportModal Entegrasyonu

**Amaç:** Ana sayfadan açılan modal’ın mevcut Telegram + Firestore akışını kullanması.

- [x] **2.1** `app/page.tsx` içinde `ProductIssueReportModal` import et (zaten varsa sadece kullanımı ekle).

- [x] **2.2** Modal’ı render et:  
  - `productIssueFromSearch !== null` iken göster.  
  - Props: `isOpen`, `onClose`, `type="product_missing"`, `barcode`, `productName={undefined}`, `source="search_no_results"`, `onSuccess` (isteğe bağlı: toast + `setProductIssueFromSearch(null)`).

- [x] **2.3** `onSuccess` callback’inde (veya modal kapandığında) arama alanını temizlememek (kullanıcı aynı barkodu tekrar arayabilir); sadece modal kapatılsın ve istenirse "Bildirim gönderildi" toast’ı gösterilsin.

**Çıktı:** Buton → Modal → Gönder → Telegram’a bildirim gider, Firestore’a kayıt düşer (mevcut API davranışı korunur).

---

## Faz 3 — AddProductModal’daki "Ürün Yok Bildir" Butonları (Opsiyonel)

**Amaç:** Ana konum "sonuç yok" alanı olduğu için modal içindeki butonların rolünü netleştirmek.

- [x] **3.1** Karar: AddProductModal içinde "Ürün Yok Bildir" butonları **kaldırıldı** (ana konum: ana sayfada sonuç yok alanı).  
  - **Seçenek A:** Kalsın. Ürün kartı açıkken (ürün listelenmiş olsa bile) kullanıcı yine "ürün yok" bildirimi yapabilsin.  
  - **Seçenek B:** Sadece "sonuç yok" durumunda göster; modal içindeki "Ürün Yok Bildir" butonlarını kaldır veya sadece belirli yerlerde (örn. katalog arama sonucu boşken açılan modal) göster.

- [x] **3.2** Seçime göre:  
  - A ise: Sadece tasarım/tutarlılık kontrolü (buton metni ve ikon aynı olsun).  
  - B ise: AddProductModal’dan ilgili "Ürün Yok Bildir" butonlarını kaldır veya koşula bağla.

**Çıktı:** "Ürün Yok Bildir" birincil konumu ana sayfada "sonuç yok" alanı; modal davranışı netleşir.

---

## Faz 4 — Görsel ve Erişilebilirlik

**Amaç:** Butonun ana sayfada tutarlı ve erişilebilir olması.

- [x] **4.1** Buton stili: Mevcut modal’daki "Ürün Yok Bildir" ile aynı tonda (örn. kırmızı/uyarı vurgusu) veya `EmptyState` ile uyumlu birincil aksiyon butonu.

- [x] **4.2** Erişilebilirlik: `aria-label="Ürün yok bildir"` veya benzeri; gerekirse kısa açıklama (örn. "Bu barkod için katalogda ürün bulunamadı, bildirim göndermek için tıklayın").

- [x] **4.3** Mobil: Buton dokunmatik alanı yeterli boyutta (min ~44px yükseklik).

**Çıktı:** Ana sayfadaki buton tutarlı ve kullanılabilir.

---

## Faz 5 — Test ve Doğrulama

- [ ] **5.1** Akış testi: Barkod yaz → sonuç boş → "Ürün Yok Bildir" görünür → tıkla → modal açılır → gönder → Telegram’da mesaj ve (varsa) Firestore kaydı kontrolü.

- [ ] **5.2** Kısa arama: 1–2 karakter yazıldığında "sonuç yok" farklı mesajla çıkıyor; "Ürün Yok Bildir" sadece anlamlı barkod aramasında (örn. 6+ karakter veya sadece rakam) çıkıyorsa doğrula.

- [ ] **5.3** Modal kapatma: Modal’ı kapatınca ana sayfa normal; arama metni (veya listeler) değişmeden kalır.

**Çıktı:** Tüm akış doğrulanmış olur.

---

## Özet

| Faz | İçerik |
|-----|--------|
| 1 | Ana sayfada "sonuç bulunamadı" alanına "Ürün Yok Bildir" butonu + state |
| 2 | ProductIssueReportModal ile açılma, Telegram/API entegrasyonu |
| 3 | (Opsiyonel) AddProductModal’daki butonların kalması/kaldırılması |
| 4 | Görsel ve erişilebilirlik |
| 5 | Test |

Tamamlanan maddeler `- [ ]` yerine `- [x]` ile işaretlenebilir.
