# Getir stoku: Buton kaldırma + ürün açılınca otomatik gösterim

## Amaç

- **Bugün:** Kullanıcı "Getir Stoğunu Getir"e basıyor; istek o zaman gidiyor.
- **Hedef:** Yalnızca **katalog ürün detayı** (modal, düzenleme dışı) açıldığında stok **otomatik** istenip alanda gösterilsin; bu modda ayrı "Getir Stoğunu Getir" butonu olmasın. Düzenleme modu kapsam dışı (isteğe bağlı manuel buton ayrı karar).

Kapsam dosyası: `app/components/AddProductModal.tsx` (Getir stok UI’si hâlâ katalog + düzenleme olmak üzere iki bölgede; **bu yol haritasındaki otomatik stok yalnızca katalog detay bölümü** için geçerli).

**Sabit kapsam (Faz 0):**

- Otomatik stok: **Sadece katalog ürün detayı** (`catalogProduct` ile açılan, düzenleme dışı görünüm) — yani `isCatalogViewMode` (veya eşdeğer koşul).
- **Düzenleme modunda (`initialItem` ile açılan)** bu otomatik `useEffect` **çalışmayacak**; o mod için ayrı karar (varsa sadece manuel buton veya alanı göstermeme).
- Yalnızca **modal** içi; `app/page.tsx` ana listesinde ayrı kart/önizleme yok, başka ekran kapsam dışı.

---

## Faz 1 — İstek mantığını tek yerde topla

- `handleGetGetirStock` içindeki `fetch` + `setGetirStock` / `setGetirStockError` + `setGetirStockLoading` akışı **yeni bir fonksiyon**a çıkarılabilir: örn. `loadGetirStockForBarcode(barcode: string)` (aynı component içinde veya `useGetirStock(barcode, enabled)` gibi ince bir hook).
- Amaç: Otomatik (katalog) ve gerekiyorsa düzenleme modundaki manuel akış aynı fonksiyonu paylaşsın; `enabled` / koşul ile sadece katalogda otomatik tetik.
- `AbortController` ile: Modal hızlı kapanırsa veya barkod değişirse **önceki isteği iptal** et; yarış sonucu yanlış stok gösterimini engelle (isteğe bağlı ama önerilir).

---

## Faz 2 — Açılışta otomatik çalıştır (useEffect)

- Tetikleyici: `isOpen === true`, **katalog detay modu** (`isCatalogViewMode` ve benzeri) ve `catalogProduct?.barcode` dolu iken. **`initialItem` (düzenleme) bu `useEffect`’e girmesin** — orada istek yok.
- Mevcut **tedarikçi iade tarihi** yüklemesi gibi (`loadCachedSupplierReturnDate` deseni, ~254+ satırlar): ayrı bir `useEffect` ile katalog açılışında `loadGetirStockForBarcode` çağrılsın.
- **Bağımlılıklar:** `isOpen`, katalog detayı için anlamlı alanlar (`catalogProduct?.barcode`, gerekirse `isCatalogViewMode` / `showFormFromCatalog`) — düzenleme alanları bu listenin dışında kalmalı.

- Modal kapanınca zaten stok state’i sıfırlanıyor (mevcut `setGetirStock` blokları, ~242–246); buna devam.

---

## Faz 3 — Arayüz: katalogda buton kalkar, yükleniyor / hata / boş durum

- **Katalog bölümünde** "Getir Stoğunu Getir" butonu kaldırılır; yükleniyor / hata / `stock === null` mesajı burada uygulanır.
- **Düzenleme bölümü** bu yol haritası kapsamı dışında: istersen mevcut manuel buton aynen kalabilir veya ayrı UX kararı; otomatik istek yok.
- Stok bölgesi daima görünsün veya açık alan kalsın:
  - `getirStockLoading === true` → kısa metin veya iskelet: **"Stok yükleniyor…"** (spinner re-use: mevcut `RefreshCw` ile uyumlu).
  - `getirStockError` → kırmızı kutu (mevcut).
  - `getirStock !== null` → yeşil kutu, **"Getir stoku: X"** (mevcut).
  - `!loading && !error && stock === null` → bilgilendirici ama sakin bir satır: **"Getir stoku şu an gösterilemiyor"** veya (ileride) API’den sebep kodu gelirse kısa açıklama.
- **Erişilebilirlik:** Sadece metin renk + ikon; kontrast mevcut tema ile uyumlu kalsın.

---

## Faz 4 — Performans (isteğe bağlı, sonraki iterasyon)

- Aynı oturumda aynı ürüne tekrar tıklanırsa **tekrar isteği** at: genelde sürpriz faydalı; istemezsen `sessionStorage` / bellekte `{ barcode, stock, ts }` ile 1–2 dk **cache** ve sadece "Yenile" ile zorunlu refresh (Faz 3’te sadece yenile butonu kalırsa).

---

## Faz 5 — Test listesi

- [ ] Katalog ürünü tıkla → modal açılır açılmaz (sadece katalog detay) yükleniyor → stok veya hata/placeholder.
- [ ] Düzenleme modu (`initialItem` ile) aç → Getir stok için **otomatik** istek **gönderilmemeli** (Network’te yalnız katalog detayda `getir-stock` beklenir).
- [ ] Barkod yok senaryosu (katalogda nadir) → hata/placeholder, sonsuz yüklenme yok.
- [ ] Token hatası (katalogda) → mevcut kırmızı mesaj + eklenti uyarısı.
- [ ] Modal kapat aç → state temiz, yeni istek (katalog).
- [ ] `showFormFromCatalog` / form geçişi: Otomatik stok sadece **katalog detay** açıkken; forma geçince (istersen) istek yok veya ayrı ürün barkodu kuralı net.

---

## Riskler / notlar

- Otomatik istek sayısı artar; çoğu hızlı yol (`productId` mapping + katalog) ile ucuz. Çok hızlı ürün değiştiren kullanıcıda Faz 1’de `Abort` önerilir.
- `GETIR-STOCK-INTEGRATION-ROADMAP.md` ve backend `getirApiService` zaten gününü geçmiyor; sadece **istemci davranışı** değişir.

---

## Uygulama sırası (kısa)

1. `loadGetirStockForBarcode` (veya hook) + isteğe `AbortController`.
2. Yalnızca **katalog detay** koşulunda `useEffect` ile açılışta çağır; katalogda butonu kaldır, UI’da yükleme/boş/hata. Düzenleme moduna bu effect bağlanmasın.
3. Manuel test listesi; gerekirse ince `sessionStorage` cache (opsiyonel).

### Uygulama durumu

- [x] **Faz 1–3:** `app/components/AddProductModal.tsx` — `loadGetirStockForBarcode` + `getirStockFetchAbortRef` + katalogda yalnızca `isOpen && isCatalogViewMode` iken `useEffect` ile otomatik istek; katalogda buton kaldırıldı; `getirStockFetchComplete` ile yükleniyor / stok / “gösterilemiyor” / hata; düzenleme modunda manuel buton + aynı null mesajı.
- [ ] **Faz 4:** `sessionStorage` / yenile (opsiyonel) — uygulanmadı.
- [ ] **Faz 5:** Aşağıdaki test maddeleri manuel doğrulanacak.

---

*Oluşturulma: yalnızca modal + katalog ürün detayında Getir stok otomasyonu; düzenleme modu ve ana sayfa dışı.*
