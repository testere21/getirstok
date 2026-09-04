# Yaklaşan SKT — Depo takvimi kontrolü

**Ne:** Ürün kartından **Yaklaşan SKT olarak işaretle** → Kaydet. Getir Depo Paneli **Ürün Son Kullanma Tarihleri** listesinde, hesaplanan **tedarikçi iade tarihi** (satıştan kaldırılma günü) için bu ürün **zaten varsa** kaydetme.

**Nasıl değil:** Depo ekranına tıklatma / iframe yok. Mevcut **depo paneli token** + bilinen `get-expiring-products` isteği.

Tamamlanan adımları `[ ]` → `[x]` yapın. Faz bitmeden sonrakine geçmeyin.

Mevcut yaklaşan SKT (Firestore, modal, bildirim) **YAKLASAN-SKT-ROADMAP.md** — bozulmasın. Bu belge yalnızca **Kaydet öncesi depo takvimi kontrolü**.

---

## Hedef davranış (kullanıcı gözü)

| Durum | Ne olur |
|--------|--------|
| SKT 27.09.2026, kural 18 gün | Tedarikçi iade tarihi **09.09.2026** (bugünkü modal gibi) |
| Depo takviminde o günde bu ürün **var** | Kayıt **yok**. Modal: **Bu ürün zaten skt takviminde var!** |
| Depo takviminde o günde bu ürün **yok** | Eski gibi yaklaşan SKT’ye eklenir (Telegram varsa aynı) |
| Token yok / Getir hata | Faz 0.3 — öneri: kaydetme, kısa kırmızı metin |

Kontrol edilen gün **SKT değil**, modaldeki **tedarikçi iade tarihi** (`removalDate`). Depo tablosundaki **Satıştan Kaldırılma Tarihi** ile aynı.

---

## Doğrulanmış API (Network, 2026-09-04)

**İstek**

```
POST https://warehouse-panel-api-gateway.getirapi.com/warehouse/{warehouseId}/get-expiring-products
```

Örnek depo id (Soğukkuyu): `6113e59fbb8549d0f20e65f5` — canlıda aktif warehouse token / `getActiveWarehouseId` ile aynı kaynak.

**Gövde** (09.09.2026 İstanbul günü = UTC 08.09 21:00 → 09.09 20:59:59.999):

```json
{
  "removeFromSaleDateRange": {
    "startDate": "2026-09-08T21:00:00.000Z",
    "endDate": "2026-09-09T20:59:59.999Z"
  }
}
```

**Cevap:** `{ data: [ ... ] }`

Satır alanları (yakalanan): `id` (Getir ürün id), `fullName`, `picURL`, `location.id`, `location.barcode` (**raf** kodu, ürün barkodu değil), `storageType`, `expiryDate`, `removeFromSaleDate`, `count`.

**Eşleşme:** Katalog `productId` ↔ `data[].id` (küçük/büyük harf duyarsız, trim). Barkod bu listede yok. `location.barcode` kullanılmaz.

Aynı ürün birden fazla rafta → birden fazla satır, aynı `id`; biri yeter, “var” sayılır.

---

## Mevcut durum (kodda var)

| Parça | Durum |
|--------|--------|
| Yaklaşan SKT modal + Kaydet | Var (`ExpiringProductModal` → `POST /api/expiring-products`) |
| `removalDate` hesabı | Var (SKT − `supplierReturnDays`) |
| Depo token | Var (`getGetirWarehouseToken`) |
| `get-expiring-products` | **Yok** — Kaydet doğrudan Firestore |

---

## Faz 0 — Kararlar

**Amaç:** Kod yazmadan netleştir.

- [x] **0.1** **Eşleşme anahtarı:** Yalnız **Getir `productId`**. Barkod / isim ile depo satırı eşleştirme **yok** (yanlış pozitif riski). `productId` katalogda yoksa: kaydetme + “Bu ürünün Getir id’si yok, katalogu güncelleyin.”
- [x] **0.2** **Aynı gün birden fazla raf satırı:** Ürün id’si listede bir kez bile varsa **engelle**.
- [x] **0.3** **Token yok / 401 / Getir 5xx:** **Kaydetme.** Modal kırmızı: depo token’ını yenile / warehouse.getir.com açık tut. Sessiz kaydetme yok (takvimde varken eklemeyi kaçırmayalım).
- [x] **0.4** **Düzenleme (PUT):** Mevcut yaklaşan SKT kaydının tarihini değiştirince **aynı kontrol**. Eski kayıt silinip yenisi ekleniyor gibi düşün; takvimde varsa güncelleme de reddedilsin.
- [x] **0.5** **Bizim listedeki mükerrer:** Depo takvimi boş olsa bile aynı barkod zaten yaklaşan SKT’de varsa mevcut davranış (varsa bırak, yoksa “zaten ekli” ayrı mesaj). Bu fazın asıl konusu depo takvimi; panel içi çift kayıt ayrıca 0.5’te: **aynı barkod ikinci kez eklenmesin** (GET barcode zaten var — Kaydet’te kullanılıyor mu kontrol et, yoksa ekle).
- [x] **0.6** **Netlify pause:** Geliştirme **local** + warehouse token. Canlı, kredi açılınca.

**Çıktı:** 0.1–0.6 yazılı; itiraz yoksa `[x]`.

---

## Faz 1 — İstanbul günü → `removeFromSaleDateRange`

**Amaç:** 09.09.2026 seçilince Getir’in beklediği UTC aralığı. Sihirbaz/modal henüz bağlanmasın.

- [x] **1.1** Yardımcı: `removalDateYmd` → `{ startDate, endDate }` ISO UTC. `app/lib/istanbulDayBounds.ts`.
- [x] **1.2** `2026-09-09` → `2026-09-08T21:00:00.000Z` / `2026-09-09T20:59:59.999Z` (`npm run test:istanbul-day`).
- [x] **1.3** Geçersiz tarih: `IstanbulDayBoundsError`; boş aralık yok.

**Çıktı:** `istanbulDayToUtcIsoRange` / `buildRemoveFromSaleDateRange`. Getir henüz çağrılmıyor.

---

## Faz 2 — Depo takvimi servisi (sunucu)

**Amaç:** Panel Kaydet’i bozmadan Getir’e sorabilmek.

- [x] **2.1** `app/lib/getirWarehouseExpiringProductsService.ts` — `fetchExpiringProductsForRemovalDate`.
- [x] **2.2** `POST .../get-expiring-products` + Faz 1 gövdesi + warehouse header’lar.
- [x] **2.3** `data` yok/boş → `[]` (sahte satır yok).
- [x] **2.4** `isProductOnWarehouseExpiryCalendar(productId, ymd)` — `id` trim + lower.
- [x] **2.5** `GetirWarehouseApiError`: NO_TOKEN, UNAUTHORIZED, TIMEOUT, API_ERROR.

**Çıktı:** Servis hazır. Panel Kaydet henüz bağlamaz. Parse test: `npm run test:warehouse-expiry-parse`.

---

## Faz 3 — Kaydet / güncelle API’ye bağla

**Amaç:** Asıl kapı. Firestore **yalnızca** depo takviminde yoksa.

- [x] **3.1** `POST /api/expiring-products`: validasyondan sonra, `addExpiringProduct` **önce**:
  1. Barkoddan `productId` (katalog / mapping, mevcut barkod→id yolları).
  2. `productId` yok → 400, kayıt yok (0.1).
  3. `isProductOnWarehouseExpiryCalendar(productId, removalDate)` true → **400**, `error: "Bu ürün zaten skt takviminde var!"`, `code: "ALREADY_ON_WAREHOUSE_CALENDAR"`, `id: null`.
  4. false → mevcut ekleme + Telegram.
- [x] **3.2** Token/Getir hatası: 400 veya 401, `success: false`, Türkçe `error`; Firestore yazılmaz (0.3).
- [x] **3.3** `PUT /api/expiring-products/[id]`: `removalDate` değişiyorsa aynı kontrol (0.4). Takvimde varsa güncelleme yok.
- [x] **3.4** Modal: `error` metnini olduğu gibi göster (zaten `setError`). Yeni cümle uydurma. Kayıt olmaz, modal kapanmaz.
- [x] **3.5** (0.5) Panelde aynı barkod zaten yaklaşan SKT’de ise Kaydet reddedilsin; mesaj depo takviminden **ayrı** olsun (karışmasın).

**Çıktı:** Nilky + 09.09.2026 takvimde varsa Kaydet kırmızı uyarı; yoksa eklenir.

---

## Faz 4 — Kenar durumlar

- [x] **4.1** Getir `data` çok uzun: yine de tüm `id` taranır (sayfalama yoksa tek POST). Sayfalama çıkarsa (limit/offset) yakalanan URL’ye göre genişlet; şimdilik tek sayfa varsay.
- [x] **4.2** `id` formatı: 24 hex, karşılaştırırken `toLowerCase`.
- [x] **4.3** Timeout: diğer warehouse istekleri gibi (~10–20 sn); aşımda kaydetme + “Depo takvimi alınamadı”.
- [x] **4.4** Modal çift tık: `isSubmitting` zaten var; ikinci POST gitmesin.
- [x] **4.5** Yaklaşan SKT listesi / bildirim kartı: yalnızca **başarılı kayıt** sonrası; reddedilen Kaydet bildirim atmasın.

**Çıktı:** Token, boş gün, takvimde var — panik yok, ne yapılacağı yazılı.

---

## Faz 5 — Kullanıcı kontrolü

- [ ] **5.1** Depo’da 09.09.2026 listesinde **görünen** bir ürünü (id not et) panelde aynı `productId` ile Kaydet → uyarı, Firestore’da yeni satır yok.
- [ ] **5.2** O listede **olmayan** ürün (Nilky o gün yoksa) → yaklaşan SKT’ye eklenir.
- [ ] **5.3** SKT değiştirince iade tarihi başka güne kayarsa: o güne göre yeniden sorulur (27.09 → 09.09; SKT 28.09 → 10.09).
- [ ] **5.4** Mobil + masaüstü: hata metni okunur, Kaydet disabled değil (hata sonrası tekrar denenebilsin).
- [ ] **5.5** Canlı (Netlify açık olunca): warehouse token eklenti ile.

**Çıktı:** Depoda bir gün + bir ürün ile işaretli; canlıya alınabilir.

---

## Dosyalar (tahmini)

| Dosya | Ne işe yarar |
|--------|----------------|
| `app/lib/istanbulDayBounds.ts` veya mevcut sevkiyat gün sınırı | `removeFromSaleDateRange` (ortak kullanılabilir) |
| `app/lib/getirWarehouseExpiringProductsService.ts` | Getir POST + id eşleşmesi |
| `app/api/expiring-products/route.ts` | Kaydet öncesi kontrol |
| `app/api/expiring-products/[id]/route.ts` | Güncellemede kontrol |
| `app/components/ExpiringProductModal.tsx` | Hata metnini göstermek (küçük/hiç) |
| Barkod → `productId` | Mevcut katalog / `getProductIdByBarcode` |

Eklenti **zorunlu yeni capture değil** — URL şablonu sabit. Token yine eklentiden.

---

## Faz sırası (kısa)

```
Faz 0  kararlar
  → Faz 1  İstanbul günü UTC aralığı
    → Faz 2  get-expiring-products servisi
      → Faz 3  Kaydet / PUT bağla
        → Faz 4  kenar durum
          → Faz 5  depoda kontrol
```

---

## Bilinçli yapılmayanlar (ilk teslim)

- Depo paneline ürün **yazmak** (takvime Getir’e kayıt atmak yok).
- İsimle / barkodla takvim satırı eşleştirme (yanlış ürün).
- SKT tarihine göre Getir sorgusu (`expiryDate` filtresi yok; filtre `removeFromSaleDateRange`).
- Bu kontrolü Telegram’dan bağımsız “sadece bildir, kaydetme” yolu.
