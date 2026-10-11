# Kasa/palet sayımını panelden tek tuşla açma

## Amaç

Kasa ve palet ürünleri için depo panelinde elle yapılan "Sayım Oluştur" işini kendi panelimizden tek tuşla yapmak. Kullanıcı listeden hangi kasa/paletlerin sayılacağını işaretler, "Sayım oluştur"a basar; sunucumuz depo paneline sayım açma isteğini gönderir, sonucu panelde gösterir ve Telegram'a bildirir.

Elle yapılan akış (otomatiğe bağlanacak olan):

1. Depo paneli → Sayım → Aksiyonlar → Sayım Oluştur
2. Kapsam: **Kısmi**
3. Ürünler: barkodla arayıp bir veya birden fazla ürün seç
4. Nedenler: **"Stoklara dair şüphelerim var ve stoklarımı kontrol etmek istiyorum."**
5. Oluştur (onay penceresi yok, tek istek)

---

## Faz 0 — Sabit kararlar

| Karar | Değer |
| --- | --- |
| Yöntem | Sunucu, depo panelinin isteğini **doğrudan** gönderir. Form doldurma / tarayıcı botu yok, depo sekmesinin açık olması gerekmez |
| Token | Depo paneli token'ı (Firestore `active_warehouse_token`); eklenti zaten otomatik tazeliyor |
| Ürün listesi | 25 kasa/palet barkodundan oluşan **sabit liste** |
| Seçim | Kullanıcı her seferinde listeden hangilerinin gireceğini işaretler |
| Birden fazla ürün | Hepsi **tek bir sayımda** açılır (`productIds` dizisi) |
| Bildirim | Başarılı sayımda Telegram'a hangi ürünlerle açıldığı yazılır |
| Arayüz yeri | Sayım sekmesinin yanında **yeni bir sekme** |
| Varsayılan seçim | Pencere her açılışta **hiçbir ürün seçili değil** |
| Onay | "Sayım oluştur"dan sonra **ikinci onay** sorulur |

### Yakalanan istek 1 — Barkoddan ürün kimliği bulma

```
POST https://warehouse-panel-api-gateway.getirapi.com/v3/products/filter?offset=0&limit=10

{
  "fields": "_id barcodes picURL fullName",
  "includeDefaultFields": false,
  "keyword": "3000000000000016",
  "language": "tr",
  "searchFilterOptions": { "fullName": true, "barcodes": true, "id": true }
}
```

Cevap:

```jsonc
{
  "data": {
    "products": [{
      "id": "5f1540e1dec75b083d7fd7ab",
      "barcodes": ["3000000000000016"],
      "fullName": { "tr": "Ak Kasa", "en": "Ak Kasa" },
      "picURL":   { "tr": "https://cdn-image.getir.com/market/product/..." }
    }],
    "total": 1
  },
  "result": { "code": 0, "message": "SUCCESS!!!" }
}
```

`keyword` aynı anda ad ve kimlikte de aradığı için cevapta birden fazla ürün gelebilir; doğru ürün `barcodes` dizisinde barkodun **birebir** geçtiği satır.

### Yakalanan istek 2 — Sayım açma

```
POST https://warehouse-panel-api-gateway.getirapi.com/gstore-inventory-checks

{
  "scope": "200",
  "productIds": ["55982541b1dc700c006a70b0"],
  "reason": { "type": 10 },
  "warehouseId": "6113e59fbb8549d0f20e65f5"
}
```

| Alan | Anlamı |
| --- | --- |
| `scope: "200"` | Kapsam = Kısmi |
| `productIds` | Seçilen ürünlerin kimlikleri (birden fazla olabilir) |
| `reason.type: 10` | "Stoklara dair şüphelerim var ve stoklarımı kontrol etmek istiyorum." |
| `warehouseId` | Soğukkuyu — kodda zaten var: `FRANCHISE_WAREHOUSE_ID_SOGUKKUYU` (`app/lib/types.ts:66`) |

Cevap:

```json
{
  "data": { "inventoryCheckId": "6acb5d97b2d0b0b398e92c20" },
  "result": { "code": 0, "message": "SUCCESS!!!" }
}
```

### Başlıklar

Sunucumuzun depo paneline zaten gönderdiği başlıklarla aynı, yeni bir şey yok:

```
Authorization: Bearer <depo token>
Content-Type: application/json
Countrycode: TR
Language: tr
X-Requester-Client: warehouse-panel-frontend
```

### Kasa/palet barkodları (25 adet)

```
3000000000000001  3000000000000002  3000000000000003  3000000000000004
3000000000000005  3000000000000006  3000000000000007  3000000000000008
3000000000000009  3000000000000010  3000000000000011  3000000000000012
3000000000000013  3000000000000014  3000000000000015  3000000000000016
3000000000000017  3000000000000023  3000000000000024  3000000000000027
3000000000000028  3000000000000029  3000000000000030  3000000000000033
3000000000000034
```

`data/products.json`'da bunlardan sadece **biri** var (`3000000000000014` → Tire Kasa, `629da3f43f662e5464f62c75`). Bilinenler: `3000000000000016` → Ak Kasa (`5f1540e1dec75b083d7fd7ab`). Kalanların adı ve kimliği Faz 1'de çekilecek.

---

## Faz 1 — Kasa/palet listesini çıkar

25 barkodun ürün kimliği, adı ve görselini depo panelinden tek seferde çekip koda sabit liste olarak yazmak. Her tıklamada 25 arama isteği atmamak için liste bir kez çıkarılır.

- [x] `scripts/resolve-kasa-palet-products.mjs` (`npm run resolve-kasa-palet`): her barkod için İstek 1'i atar, `barcodes` içinde birebir eşleşen ürünü alır
- [x] Token: Firestore'daki depo token'ını okur (eklenti tazelediği için elle kopyalamak gerekmez); `GETIR_TOKEN` env'i verilirse onu kullanır
- [x] Çıktı: `app/lib/kasaPaletProducts.ts` → `KASA_PALET_PRODUCTS: { barcode, productId, name, imageUrl }[]`, sekmede aranması kolay olsun diye **ada göre** sıralı
- [x] Bulunamayan veya birden fazla eşleşen barkod varsa script durur ve listeler — sessizce eksik liste yazılmaz
- [x] `DRY_RUN=1` ile dosyaya dokunmadan deneme

**Kabul:** ✅ 25/25 barkod kimlik, ad ve görselle listede. Bilinen iki kimlik (Ak Kasa `5f1540e1dec75b083d7fd7ab`, Tire Kasa `629da3f43f662e5464f62c75`) birebir tuttu.

| Barkod | Ürün | Barkod | Ürün |
| --- | --- | --- | --- |
| 3000000000000016 | Ak Kasa | 3000000000000010 | Pepsi Palet |
| 3000000000000006 | Akkurt Kasa | 3000000000000033 | Pınar Kasa (Demirbaş) |
| 3000000000000013 | Balkan Kasa | 3000000000000009 | Sek Kasa |
| 3000000000000030 | Büyük Küfe | 3000000000000014 | Tire Kasa |
| 3000000000000011 | Chep Palet | 3000000000000003 | Uno Kasa |
| 3000000000000005 | Coca-Cola Palet | 3000000000000027 | Untad Kasa |
| 3000000000000008 | Eker Kasa | 3000000000000015 | Euro Palet |
| 3000000000000023 | Halk Ekmek Kasa | 3000000000000002 | Kuzeyden Euro Palet |
| 3000000000000017 | İçim Kasa | 3000000000000012 | Plastik Palet (Plastik Palet) |
| 3000000000000024 | IFKO Kasa | 3000000000000007 | Sütaş Kasa - 30012 |
| 3000000000000029 | İtimat Kasa | 3000000000000001 | Tahta Palet (Palet) |
| 3000000000000028 | Kapaklı Kasa | 3000000000000004 | Turpal Palet |
| 3000000000000034 | Küçük Küfe (1 Adet) | | |

---

## Faz 2 — Sunucu: sayım açma servisi

- [x] `app/lib/getirInventoryCheckService.ts` → `createInventoryCheck(productIds)`: İstek 2'yi gönderir, `inventoryCheckId` döndürür
- [x] `warehouseId`: `FRANCHISE_WAREHOUSE_ID_SOGUKKUYU` sabiti
- [x] `app/api/warehouse-inventory-check/route.ts` → `POST { productIds }` → `{ success, inventoryCheckId, products: [{ productId, barcode, name }] }`
  - Sadece Faz 1 listesindeki kimlikler kabul edilir. Panelden rastgele ürünle sayım açılamasın
  - Boş liste / bozuk gövde → 400
  - **CORS başlığı yok** (diğer route'lar `*` açıyor): gerçek sayım açtığı için başka bir site tarayıcı üzerinden tetikleyemesin
- [x] Hata mesajları kullanıcının ne yapacağını söylesin (`GetirWarehouseApiError`):
  - Token yok → "warehouse.getir.com'u açıp giriş yapın"
  - 401 → "token'ın süresi dolmuş, depo panelini yenileyin"
  - 403 → "sayım açma yetkiniz yok"
  - HTTP hata veya `result.code !== 0` → Getir'in kendi mesajı aynen gösterilir
  - Zaman aşımı (15 sn) / cevapta sayım no yok → "sayım açılmış olabilir, tekrar denemeden önce depo panelindeki listeye bakın". İstek Getir'e ulaşmış olabilir; körlemesine tekrar denemek çift sayım açar

**Kabul:** ✅

- Route: boş liste, listede olmayan ürün (`55982541b1dc700c006a70b0`) ve bozuk gövde 400 ile reddedildi; Getir'e istek gitmedi
- Gerçek sayım: kullanıcının istediği kasa dışı test ürünüyle (`8696292000020`, Untad Premium Siyez Ekmek, `6a882e8c83b47e95cf32f4e7`) servis doğrudan çağrıldı → sayım açıldı, `inventoryCheckId: 6acb60a18ddd324a2cbb6951`. Route bu ürünü listede olmadığı için kabul etmediğinden test servis üzerinden yapıldı; Getir'e giden istek aynı kod

---

## Faz 3 — Panel arayüzü ✅

- [x] Sayım sekmesinin yanına yeni sekme: **"Kasa/Palet Sayımı"** (`TabType`'a `"kasaPalet"`)
- [x] Sekmede 25 ürün, görsel + ad + barkod, her satırda onay kutusu; açılışta **hiçbiri seçili değil**
- [x] "Tümünü seç / Tümünü kaldır", seçili sayısı
- [x] "Sayım oluştur" — hiç ürün seçili değilse pasif
- [x] İkinci onay: "N ürünle depo panelinde sayım açılacak, emin misiniz?" → **Vazgeç / Eminim** (seçili ürün adları listelenir)
- [x] İstek sürerken butonlar kilitli (çift tıkla iki sayım açılmasın)
- [x] Başarıda: "Sayım açıldı, N ürün" + sayım kimliği, seçimler temizlenir; hata olursa Faz 2'deki mesaj

Dosyalar: `app/components/KasaPaletSayimTabContent.tsx`, `app/page.tsx` (sekme + panel).
Doğrulama: tarayıcıda sekme açıldı, 25 ürün görselleriyle listelendi, seçim/sayaç ve onay penceresi kontrol edildi.
"Eminim"e basılmadı (gerçek sayım açılmadı); gerçek uçtan uca deneme Faz 5'te.

---

## Faz 4 — Telegram bildirimi ✅

- [x] `buildInventoryCheckMessage` (`app/lib/telegramService.ts`):

```
📋 KASA/PALET SAYIMI AÇILDI
Ürün sayısı: 3
• Ak Kasa
• Büyük Küfe
• İçim Kasa
Sayım no: 6acb5d97b2d0b0b398e92c20
```

- [x] Bildirim Faz 2 route'unda, sayım başarıyla açıldıktan sonra sunucudan gönderilir. İstemci ayrı istek atmaz; sayım açılıp bildirim gitmeme durumu oluşmaz. Telegram hatası sayım sonucunu bozmaz

Dosyalar: `app/lib/telegramService.ts` (`buildInventoryCheckMessage`), `app/api/warehouse-inventory-check/route.ts`.
Sayım açılamazsa (token yok, Getir reddetti, doğrulama hatası) mesaj gönderilmez. Mesajın gerçekten gelmesi Faz 5'teki gerçek sayımla denenecek.

---

## Ek — Sayımı onaylama ✅

Açılan sayım depo panelinde "Yeni" durumunda kalıyor ve görevler (el terminali) ancak "Onayla" sonrası oluşuyor.

- İstek: `POST https://warehouse-panel-api-gateway.getirapi.com/gstore-inventory-checks/{inventoryCheckId}/approve`, gövde yok, aynı header'lar
- Cevap: `{"data":{"inventoryCheckId":"..."},"result":{"code":0,"message":"SUCCESS!!!"}}` → sayım "Hazır" olur
- "Yeni" olmayan sayımda Getir HTTP 500 + "Sayım durumu uygun değil!" döner (zaten onaylı sayımla denendi)
- [x] `approveInventoryCheck` (`app/lib/getirInventoryCheckService.ts`), route `POST /api/warehouse-inventory-check/approve` `{ inventoryCheckId }` (24 haneli hex doğrulaması, CORS yok)
- [x] Sayım açılınca "Sayım onaylansın mı?" → **Evet / Hayır**. Hayır veya onay hatasında sekmede "Onay bekliyor" şeridi + "Onayla" butonu kalır
- [ ] Gerçek uçtan uca deneme (yeni kasa/palet sayımı aç → Evet → depo panelinde "Hazır")

---

## Faz 5 — Test

- [ ] Faz 1 script'i: 25/25
- [ ] Tek ürünle gerçek sayım (depo panelinde görünüyor mu?)
- [ ] Birden fazla ürünle gerçek sayım, hepsi aynı sayımda mı?
- [ ] Token süresi dolmuşken anlaşılır hata
- [ ] Aynı ürün için zaten açık sayım varken Getir ne diyor, mesaj kullanıcıya düzgün geliyor mu?
- [ ] Telegram mesajı geldi

Not: Her test depo panelinde **gerçek** bir sayım açar. Testler tek ürünle başlasın, gereksiz açılan sayımlar panelden iptal edilsin.

---

## Riskler

**Token.** Depo token'ı 15 dakikalık; eklenti depo oturumu açık kaldıkça tazeliyor. Oturum kapanmışsa sayım açılamaz, kullanıcıya depo panelini açmasını söyleyen mesaj çıkar.

**Getir isteği değiştirirse.** `scope`, `reason.type` gibi kodlar Getir'in iç değerleri. Değişirse sayım açılmaz ve Getir'in hata mesajı görünür; bu durumda Faz 0'daki gibi isteği yeniden yakalayıp güncellemek yeterli.

**Yetki.** Sayım açıldıktan sonra depo paneli detay sayfasında 403 gösteriyor (hesabın detay sayfasına yetkisi yok); sayım yine de açılıyor. Bizim akışı etkilemiyor.
