# Ürün Yok Bildir → Depo Raf Etiketi ile Kataloga Alma Yol Haritası

Bu doküman, katalogda **barkod aranıp sonuç çıkmadığında** kullanıcının **"Ürün Yok Bildir"** ile tetiklediği akışta; ürün bilgisinin **Getir depo paneli / raf etiketi** kaynağından çekilip **panel kataloğunda kalıcı** tutulması ve **sonraki aramalarda** bu ürünün **yerel veritabanından** gelmesi için fazları içerir.

**Referans tarayıcı adresi (örnek):**  
`https://warehouse.getir.com/r/5dc32d8b734a192200caddf8/stock/stock-management/shelf-label/list?limit=100&offset=1`  

Bu adres **tarayıcıda açılan SPA rotasıdır**; keşifle doğrulanan gerçek veri çağrıları **`warehouse-panel-api-gateway.getirapi.com`** üzerinden yapılır — projede benzer kullanım: `app/lib/getirWarehouseApiService.ts` (`searchProductByBarcode`, depo Bearer token).

Tamamlanan adımları `[ ]` → `[x]` yaparak işaretleyin. **Faz 0 tamamlandı** (2026); sıradaki çalışma **Faz 1–5**.

---

## Mevcut Durum Özeti

| Alan | Durum |
|------|--------|
| Arama sonucu yok + barkod | `app/page.tsx` içinde **Ürün Yok Bildir** → `POST /api/telegram/product-issue` (Telegram + Firestore bildirim kaydı) |
| Statik katalog | `data/products.json` → `GET /api/products` |
| Depo token | Firestore üzerinden `getGetirWarehouseToken()` — Chrome eklentisi ile `warehouse.getir.com` token yakalama |
| Depo API örneği | Barkod → ürün: `searchProductByBarcode` (POST `.../warehouse/{id}/products?...` + `barcodes: [barcode]`) |
| **Faz 0 keşif** | Raf etiketi: `POST .../warehouse-product-shelves/filter?offset=&limit=` + gövde `{ warehouseId, productIds[] }`; akış **barkod → productId → filter**; yeni ürünler **Firestore**; çakışmada **Firestore öncelikli** |

**Henüz yapılmadı (kod):** Keşfedilen API’ler **Ürün Yok** akışına bağlı değil; ürün **otomatik kataloga yazılmıyor** — **Faz 1–4**.

---

## Faz 0 — Kararlar ve keşif (zorunlu ön çalışma) ✅ Tamamlandı

**Amaç:** Üretimde kalıcı kayıt ve doğru API seçimi.

### Faz 0.1 — Basit özet (senin yaptığın keşif)

- Ekranda gördüğün **uzun warehouse.getir.com adresi** sadece **sayfa**; veri asıl **başka bir sunucudan** geliyor: **`warehouse-panel-api-gateway.getirapi.com`**.
- **Raf etiketi** tablosunu dolduran istek: adresin sonu **`.../warehouse-product-shelves/filter`**, **`offset` ve `limit`** adres satırında; gönderilen bilgi ise **`warehouseId`** (depo kodun) ve **`productIds`** (ürün kodları listesi). **Barkod burada yok** — önce barkoddan ürün kodunu bulmak gerekecek (bunu yazılımcı mevcut depo aramasıyla bağlayacak).
- **Authorization:** Yine **Bearer token** (panelde Chrome eklentisiyle yakalanan depo token’ı); projede zaten benzer kullanım var.

Bu bilgiler **Faz 0.1 için yeterli** kabul edildi.

- [x] **0.1** **Sayfa URL vs API:** Network’ten gerçek API: `POST .../warehouse-product-shelves/filter?offset=0&limit=100`, gövde `{ warehouseId, productIds[] }`; tarayıcı adresi ile gateway ayrımı net.

- [x] **0.2** **Akış:** Raf etiketi filtresi barkod kabul etmiyor (`productIds` istiyor). **Karar:** Önce barkoddan ürün kodu (`productId`) bulunacak — mevcut depo **ürün/barkod** araması ile — sonra `warehouse-product-shelves/filter` çağrılacak. Büyük listeyi çekip barkoda süzmek **tercih edilmiyor** (iki adımlı net yol).

- [x] **0.3** **Kalıcı depolama:** **Karar:** Depodan içe aktarılan **yeni** ürünler **Firestore**’da tutulacak (statik `products.json` canlı ortamda güvenilir şekilde büyütülemez). Önerilen alanlar: `barcode`, `name`, `productId?`, `imageUrl?`, `source: "warehouse_shelf_label"`, `createdAt`. Koleksiyon adı uygularken netleşir (ör. `catalog_supplements`). Mevcut ana katalog okuması şimdilik `products.json`; birleştirme **0.4 / Faz 3**.

- [x] **0.4** **Birleştirme kuralı:** Listeyi oluştururken `products.json` ile Firestore ekleri birleştirilir; **aynı barkod** hem dosyada hem Firestore’da varsa **Firestore’daki kayıt geçerli** (güncel / içe aktarılan veri öncelikli).

**Çıktı:** API keşfi + depolama/birleştirme kararları — **tamam**.

---

## Faz 1 — API sözleşmesi ve test isteği

**Amaç:** Sunucudan tekrarlanabilir çağrı.

- [x] **1.1** Keşfedilen endpoint için örnek **request** + yanıt notları: `docs/warehouse-product-shelves-filter-api.md` (yanıtta örnek gövde; canlı JSON farklıysa mapper güncellenir).

- [x] **1.2** `fetchWarehouseProductShelvesFilter` (`getirWarehouseApiService.ts`): `DEFAULT_WAREHOUSE_ID`, `getGetirWarehouseToken()` — **401/403/NO_TOKEN** mesajları `searchProductByBarcode` ile aynı; tablo `docs/warehouse-product-shelves-filter-api.md`.

- [x] **1.3** **Map:** `warehouseShelfFilterCatalogMapper.ts` — `mapShelfFilterResponseToCatalogProducts` / `mapShelfFilterRowToCatalogProduct`; `CatalogProduct` (`app/api/products/route.ts`). Gerçek JSON ağacı farklı çıkarsa `extractShelfFilterItems` ve alan seçiciler güncellenir.

**Çıktı:** `docs/warehouse-product-shelves-filter-api.md` + `warehouseShelfFilterCatalogMapper.ts` + `fetchWarehouseProductShelvesFilter` — **tamam**.

---

## Faz 2 — Sunucu tarafı: depodan ürün çekme

**Amaç:** Tek barkod için güvenilir sunucu fonksiyonu.

- [x] **2.1** `fetchProductFromShelfLabelSource(barcode)` — `getirWarehouseApiService.ts`: `searchProductByBarcode` → `fetchWarehouseProductShelvesFilter` → `mapShelfFilterResponseToCatalogProducts`; barkoda tam eşleşme veya ilk satır.

- [x] **2.2** `ShelfLabelFetchResult` / `fetchProductFromShelfLabelSourceDetailed`; `reason`: `invalid_barcode` \| `no_product_id` \| `empty_shelf_response`; kısayol `fetchProductFromShelfLabelSource` → `null`. Hata: `GetirWarehouseApiError`.

- [x] **2.3** **Route:** `POST /api/catalog/import-from-warehouse` — body: `{ barcode }` — sadece sunucuda çalışır, token sunucuda kalır (`app/api/catalog/import-from-warehouse/route.ts`).

**Çıktı:** Postman/curl ile test edilebilir endpoint.

---

## Faz 3 — Kalıcı katalog (Firestore) + okuma birleştirmesi

**Amaç:** İlk import sonrası tekrar aramada ürünün listede görünmesi.

- [x] **3.1** Firestore koleksiyonu + güvenlik kuralları (`supplemental_catalog_products`, `firestore.rules`; mevcut panel modeli: Auth yok, `stock_items` ile uyumlu okuma/yazma).

- [x] **3.2** **Yazma:** Faz 2’den dönen ürün → Firestore’a upsert (`barcode` unique; `app/lib/supplementalCatalogProductService.ts`, import route’ta `persisted: true`).

- [x] **3.3** **Okuma:** **Faz 0.4 ile karar:** Seçenek **A** — `GET /api/products` içinde `products.json` + Firestore ekleri birleştirilir; aynı barkodda **Firestore kaydı öncelikli** (`mergeProductsJsonWithSupplemental`, `normalizeCatalogBarcodeKey`).

- [x] **3.4** `app/page.tsx` katalog yükleme: `refreshCatalogProducts` — `GET /api/products?_=` cache bust + `cache: "no-store"`; import sonrası için aynı fonksiyonla refetch (Faz 4).

**Çıktı:** Yeni barkod bir kez içe aktarıldıktan sonra aynı oturumda ve sonraki ziyaretlerde arama sonucunda görünür.

---

## Faz 4 — "Ürün Yok Bildir" UI akışına bağlama

**Amaç:** Buton = önce içe aktarma denemesi, sonra mevcut bildirim (veya çakışmayı önleyen sıra).

- [x] **4.1** Tıklanınca sıra: `POST /api/catalog/import-from-warehouse` + `productIssuePhase` (`warehouse` / `telegram`); başarıda `refreshCatalogProducts` + **Ürün depodan bulundu ve kataloga eklendi.**; ürün bulunduysa **Telegram atlanır**.

- [x] **4.2** Depoda yok (`found: false`): `warehouseMissReasonDetail(reason)` ile başarı penceresinde özet + **Telegram** `product_missing` / `search_no_results`. Depo API hatası (token vb.): sadece toast; otomatik Telegram yok.

- [x] **4.3** İstek süresince buton kapalı; Firestore upsert sunucuda idempotent (`supplemental_catalog_products`).

**Çıktı:** Tek butonla uçtan uca akış.

---

## Faz 5 — Kalite, güvenlik ve test

**Amaç:** Üretim güvenliği.

- [ ] **5.1** Sunucu tarafında **barkod validasyonu** (minimum uzunluk, format) — mevcut `product-issue` ile tutarlı.

- [ ] **5.2** **Rate limiting** veya kullanıcı başına throttle (istenmeyen API suistimali).

- [ ] **5.3** Loglama: başarısız depo çağrıları (token, 404) — PII içermeden.

- [ ] **5.4** Manuel test senaryoları: token yok / token süresi dolmuş / depoda ürün var / depoda yok / Firestore’a yazıldıktan sonra arama.

**Çıktı:** Üretime hazır kontrol listesi.

---

## Özet Tablo

| Faz | Konu | Durum |
|-----|------|--------|
| 0 | API keşfi, akış (barkod→productId→raf filtresi), Firestore ile ek katalog, çakışmada Firestore önceliği | ✅ Tamam |
| 1 | Request/response şeması, CatalogProduct mapping | ✅ Tamam |
| 2 | Sunucu fonksiyonu + import endpoint | ✅ Tamam (2.1–2.3) |
| 3 | Firestore yaz + GET ile birleşik katalog | ✅ Tamam (3.1–3.4) |
| 4 | Ürün Yok Bildir ↔ import + Telegram sırası | ✅ Tamam (4.1–4.3) |
| 5 | Validasyon, throttle, test | Bekliyor |

**Dosya odakları (tahmini):** `docs/warehouse-product-shelves-filter-api.md`, `app/page.tsx`, `app/lib/getirWarehouseApiService.ts`, `app/api/products/route.ts`, yeni `app/api/catalog/import-from-warehouse/route.ts` (veya benzeri), `app/lib/firebase` / Firestore servisleri, `GETIR-PANEL-SCRAPER-KULLANIM.md`.

---

## İlgili bağlantılar (referans)

- Depo paneli raf etiketi kullanım notları: `GETIR-PANEL-SCRAPER-KULLANIM.md` (shelf-label list path).
- Mevcut scraper akışı: `scripts/getir-panel-scraper-console.js`.

---

*Güncelleme: **Faz 0** tamamlandı (keşif + kararlar). **Faz 1–5** uygulama aşamasında.*
