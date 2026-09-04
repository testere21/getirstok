# Fırın stok sorgusu — kota tasarrufu yol haritası

**Sıra:** Önce `FIRIN-LISTE-YONETIMI-ROADMAP.md` (local), sonra bu doküman, en sonda canlı.

Fırın raf stoğu bugün panel açıkken **5 dakikada bir, her ürün için ayrı ayrı** Getir’e soruluyor. Netlify bunu her seferinde ayrı iş olarak sayıyor; kotanın büyük kısmı buradan gidiyor.

Bu güncellemede **iki şey** yapılacak:

1. **Toplu sorgu:** 19 ürünü tek seferde sor (5 dakikalık kontrol ve bildirim aynı kalır).
2. **Gece molası:** İstanbul saatiyle **00:00–07:00** arası otomatik stok sorgusu yok (mağaza kapalı).

**Yapılmayacaklar (bilinçli):** Pişirme önerisini her dakika sormayı kesmek yok. Paneli gizleyince / başka sekmedeyken Fırın kontrolünü tamamen durdurmak yok — gece dışında arka plan **açık kalacak**.

Tamamlanan adımları `[ ]` → `[x]` yaparak işaretleyin. Faz bitmeden sonrakine geçmeyin.

---

## Hedef davranış (kullanıcı gözü)

| Saat (İstanbul) | Ne olur |
|-----------------|--------|
| 07:00 – 00:00 | 5 dakikada bir raf stoğu kontrolü + eksik/pişir bildirimi (Telegram) eskisi gibi |
| 00:00 – 07:00 | Otomatik stok sorgusu yok, gece bildirim yağmuru yok |
| İstisna | Fırın’daki **Yenile** butonu gece de basılırsa sorgu atılabilir (Faz 0’da netleştirilecek) |

Netlify beklentisi (aynı kullanım, kabaca): Functions compute 13 günde ~253 krediden **~45–80** bandına. Kesin rakam değil; yön bu.

---

## Faz 0 — Kararlar

**Amaç:** Kod yazmadan netleştir. Hepsi işaretlenince Faz 1.

- [x] **0.1** Saat dilimi: **Türkiye (İstanbul)**. Bilgisayar saati başka ülkedeyse yine İstanbul’a göre 00:00–07:00.
- [x] **0.2** Gece **Yenile** butonu: **Açık kalsın** ( gece gelen biri stoğu elle çekebilsin)
- [x] **0.3** Gece molası **sadece otomatik 5 dakikalık tur** için. Pişirme önerisi listesi (dakikada bir) bu işte **değişmez**.
- [x] **0.4** Donuk stok: gece otomatik turda **çekilmesin**. Gündüz kuralı aynı (Fırın sekmesindeyken).
- [x] **0.5** 07:00 olunca: ilk tur **hemen** atılsın (07:00’ı 5 dakika geçirmesin).

**Çıktı:** 0.2 yazılı; diğerleri `[x]`.

---

## Faz 1 — Tek seferde stok alma (sunucu)

**Amaç:** Getir’e 19 ayrı kapı çalmak yerine bir kapıdan 19 ürünü sormak. Panel henüz eski 19’lu yolu kullanıyor olabilir; bu fazda yeni yol hazır olsun, panel bağlamayın.

- [x] **1.1** Barkod listesinden ürün kimliklerini toplayıp **tek Getir stok isteği** atan servis fonksiyonu (`app/lib/getirApiService.ts` veya yanına küçük bir dosya). Cevap: barkod → raf adedi (yoksa boş).
- [x] **1.2** Ürün kimliği bulunamayan barkod: o satır **boş/stok yok** sayılsın; tüm listeyi yavaş “bütün depo tarama”ya düşürmesin (kota ve süre için kritik).
- [x] **1.3** Yeni API: birden fazla barkodu **tek seferde** alan yol (ör. `POST /api/getir-stock` gövdesinde barkod listesi). Limit: Fırın listesi kadar (şimdilik ~19, üst sınır ~50).
- [x] **1.4** Eski `GET /api/getir-stock?barcode=...` **kalsın** (ürün kartı, başka ekranlar). Sadece Fırın toplu yola geçecek.
- [x] **1.5** Hatalar: token yok / yetkisiz — mevcut Fırın davranışına yakın mesaj; panel çökmesin.

**Çıktı:** Yeni yol elle veya kısa testle 19 barkodu tek cevapta döndürür. Ana ekran henüz değişmemiş olabilir.

---

## Faz 2 — Fırın ekranını toplu yola bağla

**Amaç:** 5 dakikalık otomatik kontrol ve elle Yenile, 19 ayrı istek yerine **bir** istek atsın. Gece molası **bu fazda yok**.

- [x] **2.1** `app/page.tsx` içinde Fırın raf stoğu çeken yer (`fetchBakeryStockEntries` / `refreshBakeryLiveStocks`) yeni toplu API’yi kullansın.
- [x] **2.2** Ekrandaki raf sayıları, sıralama, rozet, ses ve Telegram **aynı kalsın** (sadece veri geliş yolu değişir).
- [x] **2.3** Donuk stok isteği **ayrı kalsın** (zaten tek istek); onu 19’a bölmeyin, birleştirmeyin.
- [x] **2.4** Kontrol: panel açık, Fırın veya başka sekme — 5 dakikada ağda **19 adet** `/api/getir-stock?barcode=` yerine **1 adet** toplu istek.

**Çıktı:** Kota düşüşünün asıl kısmı burada. Bildirim gündüz eskisi gibi.

---

## Faz 3 — Gece 00:00–07:00 otomatik sorgu yok

**Amaç:** Faz 2 bozulmadan gece molası.

- [x] **3.1** “Şu an gece molası mı?” diye İstanbul saatine bakan küçük bir kontrol (tek yerde, sihirli sayı dağılmasın: `00:00` dahil, `07:00` hariç — yani 07:00’de sorgu **açık**).
- [x] **3.2** 5 dakikalık otomatik tur: geceyse **raf + donuk stok isteği atmasın**.
- [x] **3.3** Faz 0.2’ye göre Yenile: gece izinliyse buton çalışsın; değilse buton disabled veya “Gece sorgusu kapalı” kısa uyarı.
- [x] **3.4** 07:00’e geçince bir sonraki turu beklemeden **bir kez** stok çekilsin (Faz 0.5).
- [x] **3.5** Gece boyunca eski “pişir” Telegram’ı **tekrar tekrar** gitmesin. Stoğu gece güncellemediğimiz için yeni yanlış alarm üretilmez; 07:00’deki ilk tur gerçek duruma göre bildirir.

**Çıktı:** Gece ağda Fırın otomatik stok yok; sabah 7’den sonra 5 dakika + bildirim yeniden.

---

## Faz 4 — Kullanıcı kontrolü (kısa)

**Amaç:** Yanlış sessizlik veya yanlış alarm yok.

- [ ] **4.1** Gündüz: raf 0 + pişirme önerisi olan üründe bildirim / rozet eskisi gibi.
- [ ] **4.2** Gece: otomatik stok isteği yok (geliştirici araçları Ağ sekmesi, 10–15 dk panel açık).
- [ ] **4.3** Saat 07:00 civarı (veya testi için saati geçici değiştirmeden: molayı kısa bir test aralığıyla doğrulayıp geri alın): ilk sorgu + gerekirse bildirim.
- [ ] **4.4** Fırın listesi, donuk sütun, Yenile, ürün kartı — görünen bozulma yok.
- [ ] **4.5** Netlify’ye alınınca 1–2 gün Functions compute’a bakın; 19’lu eski yol kalmamalı.

**Çıktı:** Canlıya alınabilir.

---

## Dosyalar (tahmini)

| Dosya | Ne işe yarar |
|--------|----------------|
| `app/lib/getirApiService.ts` | Tek Getir isteğinde birden fazla ürün stoğu |
| `app/api/getir-stock/route.ts` veya `app/api/getir-stock/batch/route.ts` | Panelin çağıracağı toplu kapı |
| `app/page.tsx` | Fırın 5 dk turu + gece molası + Yenile |
| `app/lib/bakeryQuietHours.ts` (öneri) | 00:00–07:00 İstanbul kuralı tek yerde |
| `app/lib/bakeryProductBarcodes.ts` | Barkod listesi; değişmesi gerekmez |

---

## Faz sırası (kısa)

```
Faz 0  kararlar
  → Faz 1  toplu stok (sunucu)
    → Faz 2  paneli bağla          ← asıl kota kazancı
      → Faz 3  gece molası
        → Faz 4  kontrol + canlı
```

---

## İlerleme

| Faz | Durum |
|-----|--------|
| 0 Kararlar | [x] |
| 1 Toplu sorgu (sunucu) | [x] |
| 2 Panele bağla | [x] |
| 3 Gece molası | [x] |
| 4 Kontrol | [ ] |
