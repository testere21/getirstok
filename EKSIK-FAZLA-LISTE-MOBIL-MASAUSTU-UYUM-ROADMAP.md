# Eksik / Fazla Ürünler Listesi — Mobil / Masaüstü Sıra Uyumu Yol Haritası

Bu doküman, **Eksik Ürünler** ve **Fazla Ürünler** sekmelerindeki listede masaüstünde kullanılan **İsim (Ürün) → Barkod → Miktar** sıralamasının mobil görünümde de aynı mantık ve tutarlı yapıda gösterilmesi için adımları içerir.

---

## Mevcut Durum

### Masaüstü (sm ve üzeri)

- **Konum:** `app/page.tsx` — Eksik Ürünler / Fazla Ürünler listesi, `hidden sm:grid` ile tablo benzeri grid.
- **Başlık satırı (sticky):** Boş (resim) | **Ürün** | **Barkod** | **Miktar** | Notlar | İşlem.
- **Veri satırı sırası:** Resim | Ürün adı | Barkod | Miktar | Notlar | Düzenle/Sil.
- **Grid kolonları:** `3rem minmax(0,1fr) minmax(8rem,10rem) minmax(3rem,4rem) minmax(0,1fr) minmax(5rem,6rem)`.

### Mobil (sm altı)

- **Konum:** Aynı liste, `sm:hidden` ile kart layout.
- **Yapı:** Solda ürün resmi (size-16), sağda dikey blok:
  - Ürün adı (font-medium)
  - "Barkod:" + değer
  - "Miktar:" + değer (ve aynı satırda "Not:" varsa)
  - Eklenme/Son güncelleme tarihi
  - Düzenle / Sil butonları
- **Sıra:** İsim → Barkod → Miktar zaten var; ancak etiketler ("Barkod:", "Miktar:") ve görsel hiyerarşi masaüstü başlıklarıyla birebir uyumlu değil. Notlar ve tarih konumu farklı.

---

## Hedef

- Masaüstünde kullanılan **sütun sırası ve anlamı** (Ürün → Barkod → Miktar → Notlar → İşlem) mobilde de **aynı sıra** ve mümkün olduğunca **tutarlı etiketleme** ile kullanılsın.
- Mobilde de kullanıcı, masaüstündeki tabloyu “küçültülmüş kart” gibi aynı bilgi sırasında görsün; farklı ekranda geçişte kafa karışıklığı olmasın.

---

## Faz 1 — Mobil Kart İçeriğinin Sırasını Sabitleme

**Amaç:** Mobil kartta bilgi bloklarının sırasını masaüstü başlık sırasıyla birebir eşleştirmek.

- [x] **1.1** Mobil satır şablonunu netleştir:  
  Sıra: **1) Ürün adı** → **2) Barkod** → **3) Miktar** → **4) Notlar (varsa)** → **5) Tarih (Eklenme/Son güncelleme)** → **6) İşlem (Düzenle / Sil)**.  
  Mevcut kodda bu sıra büyük ölçüde var; notlar şu an miktar ile aynı satırda olabilir. Notları miktardan sonra, ayrı ve sabit sırada göster.

- [x] **1.2** Etiketleri masaüstü başlıklarıyla uyumlu yap (opsiyonel ama önerilen):  
  - "Ürün" / ürün adı (zaten başlık yok, doğrudan isim)  
  - "Barkod:" → "Barkod:" (mevcut)  
  - "Miktar:" → "Miktar:" (mevcut)  
  - "Not:" / "Notlar:" → "Notlar:" (masaüstü "Notlar" sütunu ile aynı terim)

- [x] **1.3** Mobilde notlar alanını miktarın altında, tek başına bir satır olarak göster; uzun notlar için `line-clamp` veya `truncate` kullan (masaüstündeki "Notlar" sütunu gibi).

**Çıktı:** Mobil kartta bilgi sırası masaüstüyle aynı: Ürün → Barkod → Miktar → Notlar → Tarih → İşlem.

---

## Faz 2 — Görsel Tutarlılık ve Erişilebilirlik

**Amaç:** Mobil ve masaüstü arasında görsel hiyerarşi ve erişilebilir etiketlerin uyumunu artırmak.

- [x] **2.1** Mobil kartta her alanı (Ürün, Barkod, Miktar, Notlar) masaüstü sütunlarıyla eşleşecek şekilde semantik olarak işaretle (ör. `aria-label` veya uygun başlık/role). Gerekirse kısa, görünmez etiketler ekle (screen reader uyumu).

- [x] **2.2** Masaüstü başlık satırında sıralanabilir alanlar (Ürün, Barkod, Miktar) var; mobilde sıralama yok. Mobilde de "Bu liste masaüstünde Ürün/Barkod/Miktar’a göre sıralanabilir" bilgisini taşımak istersen, liste üstünde kısa bir bilgi metni veya aynı sıralama kontrollerini mobilde de (ör. dropdown veya chip) sunmayı değerlendir. Bu madde opsiyoneldir.

- [x] **2.3** Mobil kart satırında font boyutu ve ağırlıkları, masaüstü satırındaki önem sırasıyla uyumlu olsun (örn. ürün adı vurgulu, barkod/miktar ikincil).

**Çıktı:** Mobil ve masaüstü arasında hem sıra hem terminoloji hem görsel hiyerarşi tutarlı; erişilebilirlik iyileşmiş.

---

## Faz 3 — Tekil Kaynak ve Bakım Kolaylığı (Opsiyonel)

**Amaç:** Sütun sırası ve etiketlerin tek yerden yönetilmesi; ileride sütun ekleme/çıkarma kolaylığı.

- [x] **3.1** Sütun tanımlarını (sıra, key, başlık, mobil etiket) tek bir sabit veya hook’tan türetmeyi düşün (örn. `LIST_COLUMNS = [{ key: 'name', title: 'Ürün', mobileLabel: 'Ürün' }, { key: 'barcode', ... }, ...]`). Hem masaüstü header hem satır hem mobil kart bu tanıma göre render edilsin.

- [ ] **3.2** Bu yapıyı sadece Eksik/Fazla listesi için uygula; Yaklaşan SKT listesi farklı sütunlara sahip olduğu için ayrı kalabilir veya ileride benzer bir şablona taşınabilir.

**Çıktı:** Sütun sırası veya etiket değişikliği tek noktadan yapılır; mobil/masaüstü her zaman senkron kalır.

---

## Özet

| Faz | İçerik |
|-----|--------|
| 1   | Mobil kartta sıra: Ürün → Barkod → Miktar → Notlar → Tarih → İşlem; etiket uyumu |
| 2   | Görsel hiyerarşi, erişilebilirlik; isteğe bağlı mobil sıralama |
| 3   | Opsiyonel: Tekil sütun tanımı, bakım kolaylığı |

**Dosya odakları:** `app/page.tsx` — Eksik Ürünler / Fazla Ürünler listesi (mobil kart bloku `sm:hidden`, masaüstü grid `hidden sm:grid`).
