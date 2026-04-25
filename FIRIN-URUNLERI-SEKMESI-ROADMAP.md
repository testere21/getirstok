# Fırın Ürünleri Sekmesi — Yol Haritası

Bu doküman, ana ekranda **Eksik Ürünler**, **Fazla Ürünler**, **Yaklaşan SKT** sekmelerinin yanına **Fırın ürünleri** sekmesinin eklenmesi; sekmede **sabit barkod sırasıyla** ürünlerin listelenmesi ve satıra tıklanınca **mevcut katalog ürün kartı** (`AddProductModal` + `selectedCatalogProduct`) davranışının aynen kullanılması için fazları içerir.

**Referans davranış:** Katalog araması sonrası ürün satırına tıklama → `setSelectedCatalogProduct` → modal “ürün kartı” görünümü (`app/page.tsx`). **Veri kaynağı:** `GET /api/products` ile yüklenen `catalogProducts` ( `products.json` + Firestore ekleri).

Tamamlanan adımları `[ ]` → `[x]` yaparak işaretleyin.

---

## Mevcut Durum Özeti

| Alan | Dosya / not |
|------|----------------|
| Sekme tipi | `TabType` = `"missing" \| "extra" \| "expiring"` — `app/page.tsx` |
| Sekme UI | Tablist ~satır 991+; `aria-selected`, alt çizgi göstergesi |
| Yaklaşan SKT paneli | `activeTab === "expiring"` dalında ayrı liste + `EmptyState` |
| Katalog listesi | `catalogProducts`, `filteredCatalogProducts`, tıklama → `setSelectedCatalogProduct` |
| Sabit barkod listesi örneği | `app/lib/referenceWaterProducts.ts` (`REFERENCE_WATER_BARCODES`, `resolveReferenceWaterProducts`) — **aynı kalıp** fırın için uyarlanabilir |

---

## Faz 0 — Kararlar

**Amaç:** Veri modeli ve kapsam netliği.

- [ ] **0.1** **Barkod listesi nerede?** Öneri: `app/lib/bakeryProductBarcodes.ts` (veya `firinUrunleri.ts`) içinde `BAKERY_PRODUCT_BARCODES` sabit `as const` sırası + isteğe bağlı `BAKERY_SHORT_LABEL_BY_BARCODE` (katalogda yoksa satırda gösterilecek yedek kısa ad).
- [ ] **0.2** Katalogda olmayan barkod: **Boş / “katalogda yok”** satırı mı, yoksa satır hiç gösterilmesin mi? — Öneri: satır göster + gri uyarı + tıklanınca modal açılmaz veya “kataloga ekleyin” mesajı (ürün kartı yalnızca `CatalogProduct` bulunduğunda).
- [ ] **0.3** **Arama çubuğu:** Fırın sekmesinde üst arama kutusu bu listeyi süzsün mü? — Öneri: **Faz 1’de yok**; Faz 2’de isteğe bağlı `debouncedSearchQuery` ile barkod/isim süzümü.
- [ ] **0.4** Mobil / masaüstü: Eksik–fazla listesindeki **sütun / kart** bileşenleriyle hizalı, yoksa Yaklaşan SKT’deki gibi **basit kart listesi** — Öneri: önce **basit tutarlı kart** (hızlı teslim), sonra istenirse `STOCK_LIST_COLUMNS` benzeri ortaklaştırma.

**Çıktı:** Kararlar dokümanda işaretli; uygulamaya geçilebilir.

---

## Faz 1 — Tip ve sekme iskeleti

**Amaç:** Derleyen minimum UI.

- [ ] **1.1** `TabType` genişlet: `"bakery"` (veya `"firin"` — projede tek dil İngilizce anahtar tercih edilirse `"bakery"`).
- [ ] **1.2** Tablist’e dördüncü sekme: görünür metin **“Fırın ürünleri”**, `id="tab-bakery"`, `aria-controls="panel-bakery"`, `role="tab"`.
- [ ] **1.3** `tabpanel`: `id="panel-bakery"`, `aria-labelledby="tab-bakery"`, `activeTab === "bakery"` iken içerik dalı.
- [ ] **1.4** `useMemo` ile `bakeryRows`: `resolveBakeryProducts(catalogProducts)` — `app/lib/bakeryProductBarcodes.ts` içinde `REFERENCE_WATER` ile aynı imza deseni (`barcode`, görünen ad, `catalogFullName?`).

**Çıktı:** Sekmeye tıklanınca boş veya placeholder liste; build kırılmaz.

---

## Faz 2 — Liste ve tıklama (ürün kartı)

**Amaç:** Kullanıcı akışı mevcut katalog ile aynı.

- [ ] **2.1** Liste: barkod sırası `BAKERY_PRODUCT_BARCODES` ile sabit; her satırda **isim** (`catalogProducts` eşleşmesi), **barkod**, isteğe **küçük görsel** (`Image` / mevcut katalog grid stiline yakın).
- [ ] **2.2** **Tıklama:** `catalogProducts.find(p => p.barcode === row.barcode)` → varsa `setSelectedCatalogProduct(product)`; `AddProductModal` zaten `selectedCatalogProduct` ile açılıyorsa ek iş yok; değilse mevcut katalog akışındaki `onOpenCatalogProduct` / `setSelectedCatalogProduct` ile aynı yolu çağır.
- [ ] **2.3** Katalogda yoksa: `setToast` veya satırda `cursor-not-allowed` + `aria-disabled` (tıklanamaz).
- [ ] **2.4** **Boş katalog / yükleniyor:** `catalogLoading` durumunda skeleton veya “katalog yükleniyor…” — diğer sekmelerle tutarlı.

**Çıktı:** Fırın sekmesinden ürün kartı, eksik–fazla–katalogdaki ile aynı modal deneyimi.

---

## Faz 3 — UX ve erişilebilirlik

- [ ] **3.1** Klavye: sekme sırası (Tab) ve `Enter` / `Space` ile sekme seçimi mevcut pattern ile uyumlu.
- [ ] **3.2** `aria-label` / `title`: gereksiz tooltip yok; kısa `aria-label` yeterli.
- [ ] **3.3** Karanlık mod: mevcut `zinc` / border sınıfları ile uyum.
- [ ] **3.4** (İsteğe bağlı) Fırın sekmesinde **üst arama** ile liste süzme.

---

## Faz 4 — İçerik yönetimi ve operasyon

- [ ] **4.1** Barkod listesini güncelleme süreci: PR’da `bakeryProductBarcodes.ts` düzenleme veya ileride Firestore koleksiyonu + tek seferlik okuma (şimdilik statik yeterli).
- [ ] **4.2** Yeni ürün önce `products.json` / Firestore supplemental’a eklenmediyse listede “eksik” görünür — operasyon notu: **ürünü önce kataloga ekle**.

---

## Dosya odakları (tahmini)

| Dosya | Not |
|--------|-----|
| `app/page.tsx` | `TabType`, tablist, `tabpanel`, `bakeryRows`, tıklama, boş durum |
| `app/lib/bakeryProductBarcodes.ts` | **Yeni** — barkod dizisi + `resolveBakeryProducts` |
| `app/components/AddProductModal.tsx` | Gerekirse `catalogProduct` / görünüm modu — çoğunlukla dokunmadan |
| `app/lib/types.ts` | Gerekirse küçük tip export’u |

---

## Bağımlılıklar

- **Katalog:** `GET /api/products` — barkodların listede olması için veri tarafında tanımlı olmalı.
- **Stok kalemi değil:** Fırın listesi `stock_items` tipinde değil; yalnızca **katalog ürünü** önizlemesi — stok ekleme akışı bu sekmede zorunlu değil (isteğe bağlı sonraki faz).

---

## Özet kontrol listesi (tek bakışta)

1. [ ] `bakeryProductBarcodes.ts` + barkod sırası  
2. [ ] `TabType` + UI sekme + panel  
3. [ ] Liste + katalog eşleştirme + tıklama → `selectedCatalogProduct`  
4. [ ] Katalogda yok / yükleme durumları  
5. [ ] a11y ve karanlık mod  
6. [ ] (Opsiyonel) arama süzümü  

Bu yol haritası tamamlandığında **Fırın ürünleri** sekmesi, sabit barkod setiyle katalogla hizalı ve mevcut ürün kartı deneyimini yeniden kullanır.
