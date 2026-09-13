# Sayım sekmesi: Kategori verisi + eksik/fazla eşleştirme

## Amaç

Panele girdiğimiz **eksik** ve **fazla** kayıtları aynı kategori içinde karşı karşıya getirip, toplam tutarları en yakın olan çiftleri önermek. Change işlemi yapıldığında kâr/zararı göstermek ve iki kaydı da panelden düşmek.

Bunun ön koşulu: her ürünün **kategorisini bilmek**. Kodda şu an kategori diye bir alan yok, sıfırdan kuruyoruz.

---

## Faz 0 — Sabit kararlar (değişmeyecek)

Bu kararlar önceki konuşmada netleşti, fazların hepsi bunlara dayanıyor:

| Karar | Değer |
| --- | --- |
| Kategori kaynağı | Bayi paneli `/products` API'si (tarayıcı botu **yok**) |
| Kategori saklama yeri | `data/products.json` (tek seferlik script ile doldurulur) |
| Eşleştirme derinliği | İkisi de yazılır, UI'da seçenek. Varsayılan Faz 4'teki gözlemden sonra **alt kategori** oldu |
| Eşleştirme kapsamı | Sadece panele eksik/fazla eklediğimiz kayıtlar |
| Eşleştirme ölçütü | **Toplam tutar** farkı en küçük olan çift (birim fiyat farkı değil) |
| Kâr/zarar formülü | `fazla tutarı − eksik tutarı` (pozitif = kâr, negatif = zarar) |
| Change etkisi | İki kayıt da **tamamen** kapanır, adet eşitliği aranmaz |
| Change sonrası | Miktar sıfırlandığı için iki kayıt da `stock_items`'tan silinir (onay sorulur) |
| Zarar sınırı | Varsayılan **50 TL**, kullanıcı değiştirebilir |
| Çakışma kuralı | İki eksik aynı fazlayı isterse **zararı az olan** alır, diğeri ikinci adayına geçer |

### Elimizdeki API isteği

```
POST https://franchise-api-gateway.getirapi.com/products?limit=100&offset=0
authorization: Bearer <bayi (franchise) token>
content-type: application/json

{
  "warehouseId": "6113e59fbb8549d0f20e65f5",
  "countryCode": "TR",
  "language": "tr",
  "searchFilterOptions": {
    "fullName": true, "barcodes": true, "supplier": true,
    "brandName": true, "manufacturerName": true, "masterCategoryName": true
  }
}
```

`warehouseId` zaten kodda sabit: `FRANCHISE_WAREHOUSE_ID_SOGUKKUYU` (`app/lib/types.ts:66`).

### Cevaptan kullanacağımız alanlar

```jsonc
{
  "id": "559823ceb1dc700c006a7098",        // products.json'daki productId ile birebir aynı
  "category":    { "name": { "tr": "Süt Ürünleri" } },
  "subCategory": { "name": { "tr": "Yoğurt" } },
  "storageType": "+4",                      // "+4" | "-18" | "ambient"
  "expDays":     { "dead": 3 },             // supplierReturnDays ile aynı şey
  "price": 111.5,
  "barcodes": ["8696368011332"]
}
```

`categories` ve `subCategories` **dizilerini kullanmayacağız** — onlar kampanya/koleksiyon üyelikleri, ürünün gerçek kategorisi değil. Tek doğru kaynak `category` ve `subCategory` nesneleri.

### Başlangıç durumu (Faz 1 öncesi)

`data/products.json` → **8.548 ürün**, 8.547'sinde `productId` var.

| Alan | Dolu | Boş |
| --- | --- | --- |
| `productId` | 8.547 | 1 |
| `price` | 6.238 | 2.310 |
| `supplierReturnDays` | 2.947 | 5.601 |
| `category` | 0 | 8.548 |

Bayi paneli bu depo için **6.377 ürün** bildiriyor (`total` alanı). `limit=100` ile **64 istek**, toplam ~60 saniye.

---

## Faz 1 — Kategori doldurma script'i ✅ TAMAMLANDI

**Dosya:** `scripts/fill-product-categories-from-franchise-api.mjs`
**npm script:** `"fill-categories": "node scripts/fill-product-categories-from-franchise-api.mjs"`

Kalıp olarak `scripts/fill-supplier-return-days-from-warehouse.mjs` alınacak (batch mantığı, yedek alma, çözümlenemeyenleri dosyaya yazma). `fill-product-prices-from-stocks-api.mjs` ürün başına tek istek atıyor; **onu kopyalamıyoruz**, sayfa sayfa çekmek 8.548 istek yerine 68 istek demek.

### Akış

1. `GETIR_TOKEN` (bayi token) yoksa hata verip çık.
2. `products.json` oku, `productId → [index]` haritası kur (aynı productId birden fazla satırda olabilir).
3. `offset=0`'dan başla, `limit=100` ile çek. İlk cevaptaki `total` alanından kaç sayfa olduğunu hesapla; körlemesine "boş sayfa gelene kadar" döngü **yok**, ayrıca 200 sayfa üst sınırı koy.
4. Her ürün için `id` (yoksa `_id`) ile haritada eşleşme ara. Bulamazsa **barkod** ile ikinci bir deneme yap (`barcodes` dizisi + normalize).
5. Eşleşen satıra yaz.
6. Bitince yedek al, dosyayı kaydet, özet bas.

### Yazılacak alanlar

| Alan | Kaynak | Davranış |
| --- | --- | --- |
| `category` | `category.name.tr` | Her zaman yaz (`OVERWRITE=0` ise sadece boşsa) |
| `subCategory` | `subCategory.name.tr` | Aynı |
| `storageType` | `storageType` | Aynı |
| `price` | `price` | **Sadece boşsa** yaz — mevcut fiyatı ezmeyecek |
| `supplierReturnDays` | `expDays.dead` | **Sadece boşsa** yaz |

Son iki satır bedava kazanç: aynı istekten 2.310 eksik fiyat ve 5.601 eksik iade günü de dolacak. Mevcut değerleri asla ezmiyoruz, çünkü onlar başka (daha güvenilir) kaynaktan geldi.

### Env değişkenleri

```powershell
$env:GETIR_TOKEN="eyJ..."   # bayi paneli token'ı (zorunlu)
$env:DRY_RUN="1"            # dosyaya yazmaz, ilk 2 sayfayı çekip örnek basar
$env:LIMIT="5"              # sadece N sayfa (test için)
$env:MS_BETWEEN="150"       # sayfalar arası bekleme
$env:WAREHOUSE_ID="..."     # varsayılan Soğukkuyu
$env:OVERWRITE="1"          # dolu kategorileri de ez (varsayılan 0)
```

### Çıktılar

- `data/products.json.bak-before-categories` — yazma öncesi yedek
- `scripts/unresolved-categories.json` — panelde bulunamayan productId'ler + ürün adları (beklenen ~1.800)
- Konsol özeti: `sayfa=68 çekilen=6735 kategori=X altKategori=X saklama=X fiyat+=X iadeGünü+=X eşleşmeyen=X`

### Faz 1 kabul kriterleri

- [x] `DRY_RUN=1` ile çalıştır → ilk ürünlerin kategorileri konsolda doğru görünüyor, dosya değişmemiş
- [x] `LIMIT=2` ile gerçek yazma → 204 ürün kategorilenmiş, git diff'te sadece yeni alanlar var
- [x] Tam çalıştırma → 6.212 ürün kategorilendi, dosya bozulmadı (hâlâ 8.548 ürün)
- [ ] `unresolved-categories.json` içindeki ürünlerden 3-5 tanesini bayi panelinde elle ara → gerçekten yoklar

### Faz 1 sonuçları (13.09.2026)

| Alan | Öncesi | Sonrası |
| --- | --- | --- |
| `category` | 0 | **6.212** |
| `subCategory` | 0 | **6.212** |
| `storageType` | 0 | **6.112** |
| `supplierReturnDays` | 2.947 | **6.352** (+3.405) |
| `price` | 6.238 | **6.933** (695 boş dolduruldu, 2.355 bayat fiyat tazelendi) |

64 sayfa, 6.366 kayıt çekildi. Eşleşme **tamamen productId üzerinden** oldu (6.137), barkod yedek yoluna hiç ihtiyaç kalmadı. Kataloğumuzda kalan **2.336 ürün** panelde yok; panelde olup kataloğumuzda olmayan **229 ürün** de raporda listelendi (ileride kataloğa eklenebilirler).

**20 ana kategori** çıktı: Atıştırmalık (1.491), Temel Gıda (775), Su & İçecek (621), Süt Ürünleri (583), Kişisel Bakım (581), Ev Bakım (366), Dondurma (315), Kahvaltılık (287), Ev & Yaşam (270), Meyve & Sebze (223), Fırından (146), Bebek (133), Et Tavuk & Balık (115), Evcil Hayvan (94), Dondurulmuş (66), Pratik Yemek (59), Ekipman Ürünleri (36), Cinsel Sağlık (28), Demirbaş (21), Ramazan (2).

### Faz 1'de öğrenilenler

**Kısa sayfa "bitti" demek değil.** API bazı sayfalarda 100 yerine 99 kayıt döndürüyor. İlk denemede script 20. sayfada durup 2.018 üründe kaldı. Sayfalama artık `total` alanına güveniyor, kayıt sayısına değil.

**İade günü doğrulaması geçti:** 2.661/2.707 aynı (%98,3). Bu yüzden `FILL_SRD=1` ile boş olanlar dolduruldu.

**Fiyat doğrulaması geçmedi:** 3.104/5.459 aynı (%56,9). Fiyat **yazılmadı**. Ayrıntı ve karar aşağıda.

---

## Fiyat kaynağı kararı (Faz 3'ü etkiler)

Katalogdaki fiyatlar `/stocks` endpoint'inden aylar önce dolduruldu. Bayi panelinin `/products` endpoint'i farklı değerler veriyor:

| Ürün | Katalogdaki | Panel API |
| --- | --- | --- |
| Activia Sade Yoğurt | 111,50 | 101,99 |
| Red Bull (250 ml) | 68,50 | 79,50 |
| Lipton Demlik Poşet Çay | 136,50 | 159,99 |
| Haribo Altın Ayıcık | 47,99 | 54,99 |

Fark hem yukarı hem aşağı yönlü. 3.104 ürün **kuruşu kuruşuna** aynı; farklı alanlar olsaydı bu kadar tam eşleşme olmazdı. Yani büyük olasılıkla **aynı alan, bizimki bayat**.

Bu Sayım için doğrudan önemli: kâr/zarar hesabı fiyattan çıkıyor, bayat fiyat yanlış zarar demek.

**Karar: fiyatlar panel API'sinden tazelendi.** Script'e `REFRESH_PRICE=1` eklendi; 2.355 bayat fiyat güncellendi, 695 boş fiyat doldu. Red Bull 68,50 → 79,50, Activia 111,50 → 101,99, Lipton 136,50 → 159,99.

Bundan sonra fiyatları tazelemek için:

```powershell
$env:GETIR_TOKEN="eyJ..."; $env:FILL_PRICE="1"; $env:REFRESH_PRICE="1"; $env:FILL_SRD="1"
npm run fill-categories
```

---

## Faz 2 — Veri modelini ve API'yi hazırla ✅ TAMAMLANDI

### `app/lib/types.ts`

`CatalogProduct`'a üç alan:

```ts
/** Bayi panelindeki ana kategori (ör. "Süt Ürünleri") */
category?: string;
/** Bayi panelindeki alt kategori (ör. "Yoğurt") */
subCategory?: string;
/** Saklama koşulu: "+4" | "-18" | "ambient" */
storageType?: string;
```

`SupplementalCatalogProduct`'a da aynı üçü (raf etiketinden eklenen ürünler de sayıma girebilmeli).

### `app/lib/supplementalCatalogProductService.ts`

Burada **mevcut bir eksik** var, Sayım'ı vurur: `supplementalDocToCatalogProduct` sadece `name`, `barcode`, `imageUrl`, `productId` taşıyor. Firestore'a `price` yazılıyor ama geri okunurken **düşüyor**. Yani raf etiketinden eklenmiş bir ürünün fiyatı UI'a hiç ulaşmıyor. Bu fonksiyona `price`, `category`, `subCategory`, `storageType` eklenecek.

`GET /api/products` route'unda değişiklik gerekmiyor, alanları olduğu gibi geçiriyor.

### `app/page.tsx`

Üç ayrı harita yerine tek bir `catalogByBarcode: Map<string, CatalogProduct>` kuruldu; `catalogPriceByBarcode` artık ondan türüyor. Harita **alternatif barkodları da** (`barcodes[]`) indeksliyor — eski fiyat haritası sadece `p.barcode`'a bakıyordu, alternatif barkodla girilen kayıtlar fiyatsız kalıyordu. Ana barkodlar önce yazılıyor, alternatif onların üzerine geçemiyor.

### Faz 2 kabul kriterleri

- [x] `npm run build` temiz, `npx tsc --noEmit` temiz
- [x] `catalogByBarcode` üzerinden kategori ve fiyat tek yerden okunuyor
- [x] Raf etiketinden eklenmiş bir ürünün fiyatı artık UI'a geliyor

### Faz 2'de çıkan iki hata

**Fiyat Firestore'dan geri okunmuyordu.** `supplementalDocToCatalogProduct` sadece dört alan taşıyordu; `price` yazılıyor ama okunmuyordu.

**Spread ile üzerine yazma.** `mergeProductsJsonWithSupplemental` birleştirmeyi `{ ...prev, ...s }` ile yapıyor. Ek kayıtta `imageUrl: undefined` gibi bir alan varsa `products.json`'daki **dolu** değeri siliyordu. Dönüştürücü artık boş alanları objeye hiç koymuyor; bu, `imageUrl` ve `productId` için zaten var olan sessiz hatayı da kapattı.

---

## Faz 3 — Eşleştirme motoru (saf fonksiyon + test) ✅ TAMAMLANDI

**Dosyalar:**
- `app/lib/sayimMatch.ts`
- `app/lib/sayimMatch.test.ts`
- `scripts/run-sayim-match-tests.mjs` (kalıp: `run-sevkiyat-match-tests.mjs`)
- npm script: `"test:sayim-match": "node scripts/run-sayim-match-tests.mjs"`

Firestore'a **dokunmayacak**, tamamen saf fonksiyon. `sevkiyatMatch.ts` bunun mevcut örneği.

### İmza

```ts
export type SayimCandidate = {
  id: string;            // stock_items doküman id'si
  name: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  category: string;
  total: number;         // quantity * unitPrice
};

export type SayimPair = {
  missing: SayimCandidate;
  extra: SayimCandidate;
  category: string;
  net: number;           // extra.total - missing.total
  exceedsLimit: boolean; // net < -lossLimit
};

export type SayimMatchResult = {
  pairs: SayimPair[];
  unmatchedMissing: SayimCandidate[];
  unmatchedExtra: SayimCandidate[];
  skipped: { item: SayimCandidate; reason: "no_category" | "no_price" }[];
};

export function matchSayimItems(
  missingItems: readonly StockItemWithId[],
  extraItems: readonly StockItemWithId[],
  opts: {
    categoryOf: (barcode: string) => string | null;
    priceOf: (barcode: string) => number | null;
    lossLimitTry: number;   // varsayılan 50
  }
): SayimMatchResult;
```

### Algoritma

1. **Aday süzme:** Kategorisi veya fiyatı olmayan kayıt eşleşmeye girmez, `skipped` listesine sebebiyle düşer (UI'da "kategorisi yok" diye göstereceğiz, sessizce yutmayacağız).
2. **Kategoriye göre grupla.** Derinlik ayarı `main` ise `category`, `sub` ise `subCategory` anahtar olur.
3. **Tüm çiftleri üret:** Her kategoride her (eksik × fazla) kombinasyonu için `net = extra.total − missing.total`.
4. **Sırala:** `Math.abs(net)` artan. Eşitlik durumunda ürün adına göre (`tr-TR`) — test tekrarlanabilir olsun.
5. **Açgözlü tüketim:** Sıradan ilerle, iki tarafı da henüz kullanılmamış çiftleri al ve tarafları tüketilmiş işaretle. Çakışma kuralı böylece kendiliğinden sağlanıyor: zararı küçük olan çift önce geldiği için fazlayı o kapıyor.
6. **Sınır:** `net < −lossLimit` olan çiftler `exceedsLimit: true` ile işaretlenir ama listeden **atılmaz** — UI varsayılan olarak gizler, "sınırı aşanları göster" ile açılır. Kâr tarafında sınır yok.
7. Eşleşmeyen taraflar `unmatchedMissing` / `unmatchedExtra` olarak döner.

> **Bilinen davranış:** Bu açgözlü yaklaşım teorik en iyi kombinasyonu garanti etmez. Bir eksik ürünün tek adayı varken o aday daha kârlı başka bir çifte kaptırılabilir; o eksik eşleşmesiz kalır. Konuşmada kararlaştırdığımız davranış bu ve sonuçları öngörülebilir.

### Test vakaları (`npm run test:sayim-match` — 12/12 geçiyor)

- [x] **Tutar bazlı tam kapanma:** Fazla 3×100 = 300, eksik 2×150 = 300 → net 0, ikisi de kapanır
- [x] **En yakın tutar kazanır:** Eksik A (2×150=300); adaylar Z (3×100=300) ve Y (2×140=280) → **Z** eşleşir, net 0
- [x] **Tek aday:** A'nın kategorisinde tek fazla Z varsa fark büyük olsa da eşleşir
- [x] **Çakışma:** İki eksik aynı fazlayı ister → zararı az olan alır, diğeri `unmatchedMissing`'e düşer
- [x] **Kategori ayrımı:** Farklı kategorideki eksik/fazla asla eşleşmez
- [x] **Zarar sınırı:** Peynir örneği (1×200 fazla vs 5×209 eksik, net −845) → `exceedsLimit: true`
- [x] **Kâr tarafında sınır yok:** net +800 → `exceedsLimit: false`
- [x] **Kategorisi yok:** `skipped` listesinde `no_category` sebebiyle görünür
- [x] **Fiyatı yok:** `skipped` listesinde `no_price` sebebiyle görünür
- [x] **Sıfır adet:** `skipped` listesinde `no_quantity` sebebiyle görünür
- [x] **Boş girdi:** Eksik veya fazla listesi boş → boş sonuç, hata yok
- [x] **Çok kayıt:** Aynı kategoride 2 eksik + 2 fazla → en küçük farklardan başlayarak eşleşir
- [x] **Kuruş hassasiyeti:** 3×101,99 vs 3×111,50 → net tam 28,53 (kayan nokta gürültüsü yok)

---

## Faz 4 — Sayım sekmesi arayüzü ✅ TAMAMLANDI

### Dosyalar

Sekme içeriği `app/components/SayimTabContent.tsx` içinde; `page.tsx` 3.000 satırı aşmış durumda, oraya gömülmedi. `page.tsx`'te sadece üç şey değişti: `TabType`'a `"sayim"`, sekme butonu (gök mavisi, `Scale` ikonu) ve içerik dalı.

Ayarlar `localStorage`'da tutuluyor (`getirstok.sayim.lossLimitTry`, `getirstok.sayim.depth`). Projede daha önce `localStorage` kullanılmadığı için not: değerler mount sonrası `useEffect` ile okunuyor, sunucu render'ıyla uyuşmazlık olmasın.

### Ekran yapısı

**Üst bar — ayarlar:**
- Zarar sınırı kutusu, varsayılan **50 TL**, `localStorage`'da saklanır
- Derinlik seçimi: `Ana kategori` / `Alt kategori` (varsayılan ana)
- Özet: `N çift · toplam net: +X TL` (pozitif yeşil, negatif kırmızı)

"Change yap" butonu Faz 4'te **devre dışı** duruyor (`title` ile sebebi yazılı); Firestore yazma Faz 5'te bağlanacak.

**Eşleşme kartları** — her çift için:

```
Uzun Ömürlü Süt
┌─ [img] FAZLA   Sütaş 100 g Peynir      3 ad × 100,00 = 300,00 TL
└─ [img] EKSİK   Sütaş 110 g Peynir      2 ad × 150,00 = 300,00 TL
   Net: 0,00 TL                                   [ Change yap ]
```

Her satırda ürünün küçük görseli var (`size-9`). Kaydın kendi `imageUrl`'i yoksa katalogdaki görsel kullanılıyor, o da yoksa `Package` ikonu. Görsel `sayimMatch` üzerinden taşınıyor — `sevkiyatMatch` de aynı şekilde `imageUrl` taşıyor.

Renk kodu mevcut panelle uyumlu: fazla için `extra` sekmesinin rengi, eksik için `missing` sekmesinin rengi. Net değer pozitifse yeşil, negatifse kırmızı.

**Alt bölümler (katlanır):**
- `Sınırı aşan çiftler (N)` — varsayılan kapalı
- `Eşleşme bulunamadı (N)` — kategorisinde karşılık yok
- `Kategorisi/fiyatı olmayan kayıtlar (N)` — Faz 1'de panelde bulunamayan ~1.800 ürünün panele girilmiş olanları buraya düşer; sessiz kaybolmasınlar

### Mobil

`EKSIK-FAZLA-LISTE-MOBIL-MASAUSTU-UYUM-ROADMAP.md` kararlarına uyulacak: kart yapısı tek kolona iner, fiyat satırı alta kayar, buton tam genişlik.

### Faz 4 kabul kriterleri

- [x] Sekme açılıyor, eşleşmeler görünüyor, sıfır veri durumunda boş ekran var
- [x] Zarar sınırı değiştirilince liste anında güncelleniyor, değer `localStorage`'da kalıyor
- [x] Ana/alt kategori geçişi farklı eşleşmeler üretiyor (ana: 13 çift / net +1.341,42 · alt: 10 çift / net +658,43)
- [x] Mobilde yatay kaydırma yok (390 px'de `scrollWidth === clientWidth`)
- [x] Tarayıcı konsolunda hata yok

### Faz 4'te gerçek veriyle görülenler

Panelde 44 eksik + 35 fazla kayıt varken **"Sayıma giremeyen kayıtlar" bölümü hiç çıkmadı** — yani eklediğimiz her ürünün hem kategorisi hem fiyatı var. Faz 1 tam isabet etmiş.

**Ana kategori alakasız ürünleri eşleştiriyor.** Gerçek bir örnek: "Kahvaltılık" kategorisinde Raya Organik Yeşil Çizik Zeytin ile Raya Organik Yumurta eşleşti. İkisi de aynı ana kategoride ama birbirinin yerine geçmesi zor. Alt kategori modu 13 çiftten 10 çifte indiriyor ve etiketler "Ev Bakım" yerine "Çamaşır", "Atıştırmalık" yerine "Kraker & Kurabiye" gibi anlamlı hâle geliyor. **Bu gözlem üzerine varsayılan alt kategoriye çevrildi.**

**Kâr tarafında sınır olmaması büyük farklara izin veriyor.** Komili Ayçiçek Yağı (401,99) ile Tat Cam Bezelye (113,99) eşleşip +288 TL kâr gösteriyor. Soruldu, karar değişmedi: sınır sadece zarar tarafında kalıyor, kârlı çiftlerin hepsi görünür.

---

## Faz 5 — Change işlemini uygula ✅ TAMAMLANDI

"Change yap" → onay modalı → Firestore yazma.

### Onay modalı — `app/components/SayimChangeModal.tsx`

Geniş (`max-w-2xl`) ve iki ürünü yan yana gösteren ayrı bir pencere. Her blokta ürün görseli, ad, `adet × birim = tutar` ve **okutulabilir barkod** var; altta net etki ve silinme uyarısı. Mobilde bloklar alt alta iniyor.

Barkod `BarcodeImage` ile üretiliyor (`jsbarcode`; 13 hane → EAN13, diğerleri → CODE128). Ekrandan okutulabilmesi için iki şey önemli: yükseklik 70 (ekranda ~234×109 px) ve barkodun **daima beyaz zeminde** durması — karanlık temada da okunsun.

`ConfirmModal` kullanılmadı: onay ekranında görsel ve barkod gerektiği için jenerik metin modalı yetmiyordu. Esc ile kapanıyor, uygulama sürerken kapatma engelli.

### Yazma

Tutar bazlı modelde iki taraf da tamamen kapandığı için miktarlar sıfıra iner → **iki kayıt da** `deleteStockItem` ile silinir (`app/lib/stockService.ts:85`). `updateStockItem` yolu bu fazda kullanılmıyor; kısmi kapatma diye bir durum oluşmuyor.

İki silme `Promise.allSettled` ile birlikte yürütülüyor (toplu silmedeki kalıp). Kısmi başarıda mesaj hangi tarafın silinemediğini söylüyor, çünkü kullanıcı o kaydı elle temizlemek zorunda kalacak:

- İkisi de başarılı → başarı modalı, net etki yazılı
- İkisi de başarısız → "hiçbir kayıt silinemedi, liste değişmedi"
- Biri başarısız → "`eksik`/`fazla` kaydı silinemedi; diğer kayıt silindi, kalanı elle kontrol edin"

Liste `subscribeStockItems` ile canlı dinlendiği için silme sonrası ekran kendiliğinden güncelleniyor; eşleştirme yeniden hesaplandığı için kaptırılan adaylar yeni eş bulabiliyor.

`ConfirmModal`'ın `message` alanı `string`'den `React.ReactNode`'a çevrildi (mevcut kullanımlarla uyumlu), böylece onay ekranında satır satır özet gösterilebiliyor.

### İki adımlı onay ve güncel stok

Silme geri alınamadığı için `SayimChangeModal` iki adıma çıkarıldı: **Onayla** hiçbir şey silmiyor, sadece alt tarafta sarı bir "Emin misiniz? İki kayıt da panelden silinecek ve bu işlem geri alınamaz." uyarısı açıyor ve butonu kırmızı **Eminim**'e çeviriyor. Silme yalnızca ikinci tıklamada `onConfirm` ile yapılıyor. Bu adımdaki **Vazgeç** pencereyi kapatmıyor, birinci adıma dönüyor — kullanıcı ürünleri tekrar gözden geçirebilsin. Pencere her açılışta birinci adımdan başlıyor (aynı çift ikinci adımda kapatılıp yeniden açılsa da).

Her iki ürünün **güncel raf stoğu** kartın içinde, adet × fiyat satırının altında küçük bir etiket olarak duruyor (`Getir stoğu: 3`). Veri mevcut toplu uçtan geliyor: `POST /api/getir-stock` ile iki barkod tek istekte çekiliyor (`getGetirStocksByBarcodes`, fırın sekmesindeki kalıp). Pencere kapanıp yeniden açıldığında yeniden çekiliyor, kapanınca istek `AbortController` ile iptal ediliyor. Stok gelmezse (token yok/hata) etiket "Getir stoğu alınamadı" yazıyor — change akışı buna bağlı değil, sadece bilgi amaçlı.

### Telegram bildirimi

Change tamamlanınca tek bir toplu mesaj gidiyor: `POST /api/telegram/sayim-change` → `buildSayimChangeMessage`.

```
🔁 SAYIM İLE ÜRÜN DÜZENLENDİ
Kategori: Gazlı İçecek

Fazla: <ad> / Barkod / Miktar: 3 × ₺375,50 = ₺1.126,50
Eksik: <ad> / Barkod / Miktar: 2 × ₺560,00 = ₺1.120,00

Toplam fark: +₺6,50 (kâr)
İki kayıt da panelden silindi.
```

`deleteStockItem` artık `{ skipTelegram: true }` alıyor; change akışı bunu kullanıyor, yoksa tek işlem için 3 mesaj düşüyordu (iki "ÜRÜN SİLİNDİ" + change). Diğer silme yolları (tek/toplu silme) eskisi gibi kendi bildirimini atıyor.

Kısmi başarıda (bir kayıt silinemedi) mesaj yine gidiyor ama son satır `⚠️ eksik kaydı silinemedi, elle kontrol edin.` oluyor — silinen kayıt kayıt dışı kalmasın. İki silme de başarısızsa hiç mesaj gitmiyor, çünkü panelde bir şey değişmiyor.

### Faz 5 kabul kriterleri

- [x] Change butonu aktif, 10 çiftin hepsinde çalışıyor
- [x] Onay modalı iki tarafı, net etkiyi ve "silinecek" uyarısını gösteriyor
- [x] Onay modalında iki ürünün görseli ve okutulabilir barkodu var
- [x] Onayla → ikinci "Eminim" onayı; silme ikinci tıklamada
- [x] Kartlarda ürünlerin güncel Getir stoğu görünüyor
- [x] Change sonrası Telegram'a tek toplu mesaj düşüyor (uç test edildi, `success: true`)
- [x] Modal mobilde alt alta iniyor, yatay kaydırma yok
- [x] Vazgeç → hiçbir şey değişmedi (özet öncesi/sonrası birebir aynı)
- [x] Kısmi hata için ayrı mesaj yazıldı
- [ ] **Onayla → iki kayıt da silindi** (gerçek kayıt silmemek için otomatik doğrulanmadı, elle denenmeli)

---

## Faz 6 — Uçtan uca test

Otomatik doğrulandı (Chrome + gerçek Firestore verisi):

- [x] `npm run test:sayim-match` yeşil (12/12)
- [x] `npm run build` temiz, `npx tsc --noEmit` temiz
- [x] `npm run lint` — yeni dosyalarda tek bulgu yok (depodaki 22 hata Sayım öncesinden)
- [x] Tarayıcı konsolunda hata yok
- [x] Mobil 390 px'de yatay kaydırma yok
- [x] Varsayılan alt kategori, ayar `localStorage`'da kalıcı

Elle denenecekler:

- [ ] **Onayla → Eminim** → iki kayıt da silindi, kart listeden düştü, kalan eşleşmeler yeniden hesaplandı
- [ ] Onayla → Vazgeç → birinci adıma dönüyor, hiçbir kayıt silinmiyor
- [ ] Zarar sınırını 0 yap → sadece kârlı ve başabaş çiftler kalıyor
- [ ] Zarar sınırını 10.000 yap → her çift görünüyor
- [ ] Diğer sekmeler (eksik/fazla/SKT/fırın) bozulmamış — özellikle fiyat haritası değiştiği için eksik/fazla toplam tutarlarına bak
- [ ] Alternatif barkodla girilmiş bir kayıt artık fiyatlı görünüyor

---

## Riskler ve notlar

**Token ömrü.** Faz 1 script'i bayi token'ı istiyor ve 68 istek ~15 saniye sürüyor, token süresi sorun olmayacak. Ama 401 alırsa script yarıda durmayıp o ana kadarki kazancı yazsın — yoksa token yenileyip baştan başlamak gerekir.

**Git diff büyüklüğü.** 6.700 ürüne 3-5 alan eklenmesi büyük bir diff üretir ama `price` ve `supplierReturnDays` zaten aynı şekilde dolduruldu, alışılmış bir durum.

**Kategori bayatlaması.** Kategori neredeyse hiç değişmiyor, tek seferlik doldurma yeterli. Yeni ürünler için script'i `OVERWRITE=0` ile tekrar çalıştırmak yeterli; sadece boş olanları dolduracak.

**Fiyatı olmayan ürün.** 2.310 ürünün fiyatı yok; Faz 1 bunların çoğunu dolduracak ama kalanlar sayıma giremez. Bu yüzden `skipped` listesi UI'da görünüyor — kullanıcı fiyatı elle girip tekrar denesin.

**Açgözlü eşleştirme.** Faz 3'te not edildi: en iyi kombinasyon garantisi yok. Pratikte kategori başına birkaç kayıt olacağı için fark etmeyecek. Sorun çıkarsa ileride kategori içi tam çözüm (Hungarian / küçük N'de brute force) eklenebilir.

**İleride:** Kısmi kapatma (adet bazlı, kullanıcı miktarı elle girer) bu haritanın dışında bıraktık. Tutar bazlı model bunu gereksiz kılıyor ama ihtiyaç olursa Faz 5'e eklenir.
