# Barkod Oluşturucu — Ana Ekran Butonu ve Panel Yol Haritası

Bu doküman, ana ekrandaki **"Eksik Ürün Ekle"** ve **"Fazla Ürün Ekle"** butonlarının kaldırılıp yerine tek bir **"Barkod Oluşturucu"** butonu konması ve tıklanınca barkod yazılabilecek bir alan açılıp, sayı yazıldıkça otomatik barkod görselinin oluşturulması için adımları içerir.

---

## Mevcut Durum

- **Konum:** `app/page.tsx` — "Ekleme ve arama" bölümünde `grid grid-cols-1 sm:grid-cols-2` ile iki buton:
  - **Eksik Ürün Ekle** (kırmızı, `setModalType("missing")`)
  - **Fazla Ürün Ekle** (yeşil, `setModalType("extra")`)
- **Mevcut bileşen:** `app/components/BarcodeImage.tsx` — JsBarcode ile barkod değerinden görsel üretiyor (EAN13, EAN8, CODE128 vb.).
- **İstenen:** Bu iki buton kaldırılacak; yerine **Barkod Oluşturucu** butonu gelecek. Tıklanınca barkod yazılacak bir alan açılacak; kullanıcı sayı yazmaya başladıkça otomatik olarak barkod görseli oluşturulacak.

---

## Not: Eksik / Fazla Ürün Ekleme Erişimi

Eksik/Fazla ürün ekleme akışı (`AddProductModal`) şu an bu butonlarla açılıyor. Butonlar kaldırıldıktan sonra bu akışa erişim için seçenekler:

- **A)** Arama çubuğuna barkod/ürün yazıp katalogdan ürün seçince modal zaten açılıyor; liste boşken "Ürün Yok Bildir" vb. akışlar mevcut. Yani eksik/fazla ekleme büyük ölçüde **arama → ürün seçimi** ile yapılabilir.
- **B)** Barkod Oluşturucu panelinde oluşturulan barkodun altına "Eksik Ekle" / "Fazla Ekle" gibi ikincil aksiyonlar eklenebilir (ileride).
- **C)** Başka bir giriş noktası (menü, alt sayfa) tanımlanabilir.

Bu roadmap, **sadece Barkod Oluşturucu butonu ve paneli** ile sınırlıdır; eksik/fazla ekleme erişimi ayrı bir karar olarak bırakılmıştır.

---

## Hedef Akış

1. Kullanıcı ana ekranda tek bir **"Barkod Oluşturucu"** butonu görür.
2. Butona tıklar → Barkod yazma alanının (ve önizlemenin) bulunduğu bir **panel veya modal** açılır.
3. Kullanıcı sayı (ve gerekirse diğer karakterler) yazar; yazdıkça **otomatik olarak** barkod görseli güncellenir (mevcut `BarcodeImage` / JsBarcode ile).
4. İsteğe bağlı: Oluşan barkodu kopyalama, indirme veya arama alanına gönderme.

---

## Faz 1 — Ana Ekran Buton Değişikliği

**Amaç:** "Eksik Ürün Ekle" ve "Fazla Ürün Ekle" butonlarını kaldırıp yerine tek "Barkod Oluşturucu" butonu koymak.

- [x] **1.1** `app/page.tsx` içinde ilgili butonların bulunduğu `grid` bloğunu bul (örn. "Eksik Ürün Ekle" / "Fazla Ürün Ekle" metinleriyle).
- [x] **1.2** İki butonu kaldır; aynı yerde (grid’i tek sütun veya tek buton olacak şekilde) tek bir **"Barkod Oluşturucu"** butonu render et. Buton metni: **Barkod Oluşturucu**. İkon: barkod ile ilgili bir ikon (örn. `Barcode` veya mevcut bir ikon).
- [x] **1.3** Tıklanınca barkod oluşturucu panelini/modalını açacak state’i ekle (örn. `barkodOlusturucuOpen: boolean`). Butonun `onClick`’inde bu state’i `true` yap.
- [x] **1.4** Eksik/Fazla modal açımı bu butonlardan kalktığı için, `AddProductModal`’ın açılması yalnızca mevcut yollarla kalsın: `editingItem`, `selectedCatalogProduct` veya ileride eklenebilecek başka tetikleyiciler. (Gerekirse menüden veya arama akışından "Eksik/Fazla Ekle" girişi eklenebilir.)

**Çıktı:** Ana ekranda yalnızca "Barkod Oluşturucu" butonu görünür; tıklanınca ilgili state true olur (panel/modal henüz UI’da bağlanabilir veya basit bir placeholder ile test edilebilir).

---

## Faz 2 — Barkod Yazma Alanı ve Panel / Modal

**Amaç:** Barkod Oluşturucu tıklanınca açılan bir alanda barkod metnini yazmak ve bu metni state’te tutmak.

- [x] **2.1** Barkod oluşturucu için bir **panel** veya **modal** bileşeni tanımla (örn. `BarkodOlusturucuModal` veya sayfa içi açılır panel). Açık/kapalı durumu `barkodOlusturucuOpen` (veya eşdeğer) state’e bağlı olsun.
- [x] **2.2** Panel/modal içinde:
  - Bir **başlık** (örn. "Barkod Oluşturucu").
  - **Input** (veya textarea): Kullanıcının barkod değerini yazacağı alan. Varsayılan olarak sadece **sayı** kabul edilecek şekilde kısıtlanabilir (`inputMode="numeric"`, `pattern="[0-9]*"` ve/veya `onChange`’de sadece rakamları kabul etme). İsteğe bağlı: CODE128 için alfanumerik de bırakılabilir.
  - **Kapat** butonu veya overlay’e tıklayınca paneli kapat (`barkodOlusturucuOpen = false`).
- [x] **2.3** Input’un değerini state’te tut (örn. `barkodOlusturucuValue: string`). Yazıldıkça state güncellenir.

**Çıktı:** Kullanıcı butona tıklayınca panel açılır; içinde barkod yazılabilecek bir alan vardır ve yazılan değer state’te saklanır.

---

## Faz 3 — Yazarken Otomatik Barkod Görseli

**Amaç:** Sayı (veya izin verilen karakterler) yazıldıkça otomatik olarak barkod görselinin oluşması.

- [x] **3.1** Mevcut **`BarcodeImage`** bileşenini kullan. Panel/modal içinde, input’un altında (veya yanında) `<BarcodeImage barcode={barkodOlusturucuValue} />` render et. State `barkodOlusturucuValue` input ile senkron olduğu için, yazdıkça barkod görseli otomatik güncellenir.
- [x] **3.2** Boş veya geçersiz değerde `BarcodeImage` zaten "Barkod bulunamadı" vb. gösteriyorsa, ekstra bir kısa bilgi metni (örn. "En az 6–8 rakam girin") isteğe bağlı eklenebilir. JsBarcode’un bazı formatları için minimum uzunluk vardır; gerekirse input’a `minLength` veya placeholder ile rehberlik verilebilir.
- [x] **3.3** Uzun barkodlarda görsel taşmasın diye container’a `max-width` ve `overflow-auto` veya responsive sınıflar verilebilir.

**Çıktı:** Kullanıcı sayı yazmaya başladığı anda barkod görseli oluşur ve güncellenir; mevcut `BarcodeImage` davranışı korunur.

---

## Faz 4 — İsteğe Bağlı İyileştirmeler

**Amaç:** Kullanılabilirlik ve erişilebilirlik.

- [x] **4.1** Oluşturulan barkodu **kopyala** (clipboard) veya **arama alanına gönder** butonu eklenebilir.
- [ ] **4.2** Görseli **PNG/SVG indir** (JsBarcode canvas üretiyor; gerekirse export edilebilir).
- [ ] **4.3** Panel/modal için klavye ile kapatma (Escape), `aria-label`, `role="dialog"` gibi erişilebilirlik özellikleri eklenebilir.

---

## Özet

| Faz | İçerik |
|-----|--------|
| 1   | Eksik/Fazla Ekle butonlarını kaldır; tek "Barkod Oluşturucu" butonu ve açılım state’i |
| 2   | Barkod oluşturucu paneli/modalı, input (barkod yazma alanı), state |
| 3   | Yazarken otomatik barkod: `BarcodeImage` ile görsel oluşturma |
| 4   | Opsiyonel: Kopyala, indir, arama alanına gönder, a11y |

**Dosya odakları:** `app/page.tsx` (butonlar, state, panel/modal tetikleme), yeni bileşen veya sayfa içi blok (barkod yazma alanı + `BarcodeImage`).

**Bağımlılık:** Mevcut `BarcodeImage` (JsBarcode) kullanılacak; ek kütüphane gerekmez.
