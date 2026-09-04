# Sevkiyat kontrol — yol haritası

**Ne:** Panelde **Sevkiyat kontrol** sihirbazı. Depo Getir transfer API’sinden o güne ait teslimat ürünlerini alır; kullanıcıya iki iş sunar: paneldeki **eksik** kayıtlarla kesişim, veya sevkiyattaki **tüm gelen ürünler**.

**Nasıl değil:** Getir Depo Paneli ekranına tıklatma / iframe yok. Token + yakalanmış (veya bilinen) transfer URL’si ile sunucu isteği.

Tamamlanan adımları `[ ]` → `[x]` yapın. Faz bitmeden sonrakine geçmeyin.

---

## Hedef davranış (kullanıcı gözü)

| Adım | Ne olur |
|------|--------|
| Buton | Ana panelde **Sevkiyat kontrol** (şimdiki “Sevkiyat test” linkinin yerine veya yanına asıl iş) |
| 1 | **Tarih** sorulur → **Devam** |
| 2 | İki seçenek: **Eksik ürünleri bul** · **Gelen ürünleri bul** |
| Eksik | Yalnız panelde **eksik** olarak duran ve sevkiyatta da olan ürünler. Örnek: *Sütaş yarım yağlı süt (5 eksik) · K0011039635 paletinde var* |
| Gelen | Sevkiyattaki **tüm ürünler** + satır miktarı + mümkünse **genel toplam**. Eksik listesine bakılmaz |
| Geri | Adımlar arasında Geri; kapatınca panel aynı kalır (eksik kayıt silinmez) |

---


## Mevcut durum (kodda var)

| Parça | Durum |
|--------|--------|
| Eklenti transfer URL + gövde yakalama | Var (`chrome-extension`, sürüm 1.2.3+) |
| Firestore capture | `warehouse_transfer_list_capture` / `warehouse_transfer_detail_capture` |
| Replay + parse | `getirWarehouseTransferService.ts` (liste satırı, ürün adı/barkod/adet, palet) |
| Panel | **Sevkiyat kontrol** sihirbazı (`SevkiyatControlWizard`) |
| Eksik liste | Firestore `type === "missing"` — sihirbaz kesiştirir |

**Boşluk:** Faz 7 kenar durumlar; canlıda Netlify kredisi.

---

## Faz 0 — Kararlar

**Amaç:** Kod yazmadan netleştir. Hepsi `[x]` olunca Faz 1 kontrolü / Faz 2.

- [x] **0.1** **Tarih varsayılanı:** Açılışta **bugün (İstanbul)**.
- [x] **0.2** **Aynı günde birden fazla teslimat:** Tüm teslimatların ürünleri **birleşsin**.
- [x] **0.3** **Eşleşme anahtarı:** Önce **barkod** (normalize: trim). Barkod yoksa / uyuşmazsa ürün **adı**.
- [x] **0.4** **Aynı barkod, birden fazla eksik kaydı:** Miktarları **topla**, tek satır.
- [x] **0.5** **Ürün birden fazla palette:** Tüm palet kodları, virgülle.
- [x] **0.6** **Eksikte sevkiyatta olmayan:** Listelenmez (sessiz). Özet Faz 5.
- [x] **0.7** **Buton yeri:** Ana başlığın altı.
- [x] **0.8** **Telegram:** İlk teslim **yok**.
- [x] **0.9** **Netlify pause:** Geliştirme **local**.

**Çıktı:** 0.1–0.9 yazılı; itiraz yoksa `[x]`.

---

## Faz 1 — Test altyapısı

**Amaç:** Panel sihirbazından önce Getir transfer’in ürün verip vermediğini görmek. **Kod yazımı bitti.** Aşağıdaki “depoda doğrulama” sen işaretleyeceksin.

### Kod (tamamlandı)

- [x] **1.A** Eklenti: warehouse `transfer` isteğini yakala (URL + method + gövde), token ayrı kalsın. Manifest **1.2.3+** (`chrome-extension/background.js`, `warehouse-bake-hook.js` / content).
- [x] **1.B** Capture kaydı: Firestore `warehouse_transfer_list_capture` ve `warehouse_transfer_detail_capture` (`warehouseTransferCaptureService.ts`, `POST /api/warehouse-transfer/capture`).
- [x] **1.C** Aynı isteği warehouse token ile **replay** + liste/ürün/palet parse (`getirWarehouseTransferService.ts`).
- [x] **1.D** `GET /api/warehouse-transfer/test` — liste yok / detay yok / replay hata adımları (`need_list_capture`, `need_detail_capture`, …).
- [x] **1.E** `/sevkiyat-test` sayfası: yönerge + **Testi çalıştır** + teslimat ve ürün listesi.
- [x] **1.F** Ana panelde **Sevkiyat test** linki (`app/page.tsx` → `/sevkiyat-test`).
- [x] **1.G** Token/capture yokken JSON hata metni; test sayfası çökmez.

**Not:** Yakalanmış URL **olduğu gibi** tekrarlanır; sihirbazdaki tarih seçimi **Faz 2**.

### Depoda doğrulama (kod değil — senin kontrolün)

- [x] **1.1** Eklenti **1.2.4+** yüklü, `warehouse.getir.com` açık, depo token taze.

  Nasıl: `chrome://extensions` → Getir Token Yakalayıcı → **yenile**. Eklenti simgesine tıkla: üstte **Sürüm 1.2.5** (veya üstü), Depo bölümünde yeşil **token yakalandı** ve bugünün saati. Yoksa warehouse sekmesini F5. Netlify pause olduğu için token local `npm run dev` açıkken `localhost:3000`’e de yazılır (eklenti 1.2.5+). Yeşil + sürüm tamamsa burayı `[x]` yap, **1.2**’ye geç.
- [x] **1.2** Transfer Teslimat Listesi: tarih + Uygula → liste capture.

  Doğrulandı: `POST .../inbound/transfer?offset=0&limit=20` (2026-09-04).

  Nasıl: Eklentiyi **1.2.6** yenile, warehouse sekmesini F5. `localhost:3000/sevkiyat-test` açık kalsın. Getir’de **Transfer Teslimat Listesi** → tarih → **Uygula**. Test sayfasındaki **1.2 Liste yakalama** kutusu ~4 sn içinde yeşil URL + saat göstermeli. Gösterirse burayı `[x]` yap, **1.3**’e geç. Kutu sarı kalırsa Uygula’yı bir kez daha bas.
- [x] **1.3** Bir satırda **+** / **Ürünler** → detay capture (liste tek başına ürün vermiyorsa zorunlu).

  Doğrulandı: `GET .../inbound/transfer/{id}` yeşil kutu.

- [x] **1.4** `/sevkiyat-test` → **Testi çalıştır**: ürün adı, barkod, adet, palet görünür.

  Doğrulandı: 2026-09-04, 18 ürün satırı (ad + barkod + adet + palet `K…`). Kaynak `data.goods[]` + katalog.
- [ ] **1.5** Token yok / URL yok mesajı ekranda anlaşılır.

**Çıktı (kod):** Test yolu çalışır durumda. **Çıktı (doğrulama):** En az bir gerçek günde ürün satırları geldi. 1.1–1.4 yeşil olmadan Faz 2’ye geçilmez (parse/capture yaması gerekebilir).

---

## Faz 2 — Sunucu: tarihli sevkiyat ürünleri

**Amaç:** Panelin çağıracağı **tek kapı**. Yakalanmış URL şablonu + seçilen tarih.

- [x] **2.1** Yakalanmış liste URL / body içinde tarih alanını bul.

  **Parametre:** JSON gövde `createdAt` (`{ startDate, endDate }` ISO UTC = İstanbul günü). Query’de tarih yok; `offset`/`limit` sayfalama. Kod: `TRANSFER_LIST_DATE_FIELD` / `TRANSFER_LIST_DATE_SHAPE`.
- [x] **2.2** Servis: `getTransferProductsForDate(date: "YYYY-MM-DD")` → teslimatlar + düz ürün listesi.
- [x] **2.3** Birden fazla teslimat: her `id` için detay GET; üst sınır 20 (`TRANSFER_DELIVERY_FETCH_CAP`), fazlasında uyarı.
- [x] **2.4** `POST /api/warehouse-transfer/products` gövde `{ date }`. Token/capture yok: Türkçe hata, 4xx.
- [x] **2.5** Aynı barkod (yoksa productId / ad): miktar toplam, palet birleşimi (`mergeTransferProductsForIncoming`).
- [x] **2.6** Parse boşsa: 200 + `products: []` + `error`; sahte ürün yok.

**Çıktı:** `POST /api/warehouse-transfer/products`. Panel sihirbazı Faz 4–6.

---

## Faz 3 — Eksik eşleştirme (sunucu veya saf fonksiyon)

**Amaç:** UI’den bağımsız, test edilebilir kural. Firestore’a bu fazda yazılmaz.

- [x] **3.1** Girdi: `missingItems[]` (`name`, `barcode`, `quantity`) + `transferProducts[]`.
- [x] **3.2** 0.3–0.5: kesişim `{ displayName, missingQty, palletCodes[], transferQty }`.
- [x] **3.3** Barkodsuz: ada göre; aynı ada birden fazla SKU → eşleşme yok.
- [x] **3.4** `npm run test:sevkiyat-match` — süt+palet bir satır; sevkiyatta yok → boş.

**Çıktı:** `app/lib/sevkiyatMatch.ts`. Panel **Faz 5**’te bağlanır.

---

## Faz 4 — Sihirbaz iskeleti (panel)

**Amaç:** Görünen akış; henüz gerçek API şart değil (geçici boş / yükleniyor).

- [x] **4.1** **Sevkiyat kontrol** butonu (0.7). Başlığın altı; Fırın çık ile ayrı.
- [x] **4.2** Modal: adım 1 tarih + Devam + İptal.
- [x] **4.3** Adım 2: **Eksik ürünleri bul** · **Gelen ürünleri bul**.
- [x] **4.4** Yükleme spinner; `loading` iken ikinci tık yok.
- [x] **4.5** Escape / overlay kapatır. `SevkiyatControlWizard.tsx`.
- [x] **4.6** Geliştirici test sayfası kaldırıldı; panelde yalnızca **Sevkiyat kontrol**.

**Çıktı:** Tıklanınca tarih → iki seçenek; listeler henüz boş (Faz 5–6).

---

## Faz 5 — Eksik ürünleri bul (bağla)

**Amaç:** Kullanıcının asıl cümlesi.

- [x] **5.1** Devam + bu seçenek: Faz 2 API + `items` içinden `type === "missing"`.
- [x] **5.2** Faz 3 eşleştirme; satır: **{ad} ({n} eksik) · {palet} paletinde var**.
- [x] **5.3** Boş kesişim: “Bu tarihte eksik listedeki ürünlerden sevkiyatta eşleşen yok.”
- [x] **5.4** API/token hatası: kırmızı metin + **Tekrar dene**; sihirbaz kapanmaz.
- [x] **5.5** Liste kaydırılabilir; modal `min(90dvh, 640px)` (Fırın çık ile aynı tavan).
- [x] **5.6** Özet: “N eksik kayıttan M’si sevkiyatta bulundu”.

**Çıktı:** Gerçek eksik + gerçek sevkiyat kesişimi ekranda.

---

## Faz 6 — Gelen ürünleri bul (bağla)

**Amaç:** O günün malı tek bakışta.

- [x] **6.1** Aynı tarih API; eksik liste kullanılmaz.
- [x] **6.2** Satır: ad, barkod, miktar, paletler.
- [x] **6.3** Üstte toplam miktar; `null` satırlar toplama girmez (“miktarsız N satır”).
- [x] **6.4** SKU sayısı görünür.
- [x] **6.5** Boş gün: “Bu tarihte teslimat/ürün yok.”
- [x] **6.6** Sıra: ad A→Z (`tr-TR`).

**Çıktı:** Gelen listesi + toplam; Eksik akışı ayrı.

---

## Faz 7 — Kenar durumlar

**Amaç:** Depoda gerçek gün.

- [ ] **7.1** Capture eski, tarih yeni: mümkünse URL’de tarih değiştir; Getir 400 verirse “Depo panelinde bu tarihi bir kez açın (Uygula)” yönlendirmesi.
- [ ] **7.2** Detay capture yok, liste ürün vermiyor: “Listede + ile bir teslimatın Ürünler’ini açın” (test metninin paneli).
- [ ] **7.3** 20+ teslimat limiti: uyarı, yine ilk N işlensin veya hepsi (2.3 ile aynı kural).
- [ ] **7.4** Katalog / görsel **zorunlu değil** bu işte; yoksa metin yeter.
- [ ] **7.5** Eksik sekmesi / SKT / Fırın: sihirbaz açıkken arka plan kayması yok; kapanınca state sıfır.

**Çıktı:** Token, boş gün, eksik capture — panik yok, ne yapılacağı yazılı.

---

## Faz 8 — Kullanıcı kontrolü

**Amaç:** Yanlış palet / yanlış kesişim yok.

- [ ] **8.1** Getir’de bilinen bir palet + ürün ↔ panelde aynı barkod eksik → satır ve palet doğru.
- [ ] **8.2** Panelde eksik, sevkiyatta yok → Eksik listesinde görünmez.
- [ ] **8.3** Gelen: Getir ürün sayısı ile kaba uyum (birleştirme sonrası satır sayısı ≠ ham satır olabilir; toplam adet Getir ile tutsun).
- [ ] **8.4** Dün / bugün tarih değişimi yeni istek; eski liste kalmasın.
- [ ] **8.5** Mobil ve masaüstü: tarih, iki buton, kaydırma.
- [ ] **8.6** Canlı (Netlify açık olunca): token eklenti ile; test linki karıştırmasın.

**Çıktı:** Depoda bir teslimat günü ile işaretli; canlıya alınabilir.

---

## Faz 9 — İsteğe bağlı (sonra)

İlk teslim **şart değil**.

- [ ] **9.1** Telegram: kesişim özeti (0.8 evet ise).
- [ ] **9.2** Satıra tıklayınca katalog ürün kartı.
- [ ] **9.3** Palet kodunu kopyala.

---

## Dosyalar (tahmini)

| Dosya | Ne işe yarar |
|--------|----------------|
| `app/lib/getirWarehouseTransferService.ts` | Replay, parse, tarihli çekim |
| `app/lib/warehouseTransferCaptureService.ts` | Yakalanmış URL/body |
| `app/lib/sevkiyatMatch.ts` (yeni) | Eksik ∩ sevkiyat |
| `app/api/warehouse-transfer/products/route.ts` | Panel kapısı |
| `app/components/SevkiyatControlWizard.tsx` | Tarih + iki yol + listeler |
| `app/page.tsx` | Buton, `missingItems` aktarımı |
| `chrome-extension/*` | Capture |

---

## Faz sırası (kısa)

```
Faz 0  kararlar
  → Faz 1  test altyapısı (kod [x]; depo 1.1–1.5 sen)
    → Faz 2  tarihli ürün API
      → Faz 3  eşleştirme fonksiyonu
        → Faz 4  sihirbaz iskeleti
          → Faz 5  eksikleri bul
            → Faz 6  gelenleri bul
              → Faz 7  kenar durum
                → Faz 8  kontrol + canlı
                  → Faz 9  isteğe bağlı
```

---

## İlerleme

| Faz | Durum |
|-----|--------|
| 0 Kararlar | [ ] |
| 1 Test altyapısı (kod) | [x] |
| 1 Depoda doğrulama (1.1–1.5) | [ ] |
| 2 Tarihli ürün API | [ ] |
| 3 Eşleştirme | [ ] |
| 4 Sihirbaz iskeleti | [ ] |
| 5 Eksik ürünleri bul | [ ] |
| 6 Gelen ürünleri bul | [ ] |
| 7 Kenar durumlar | [ ] |
| 8 Kontrol | [ ] |
| 9 İsteğe bağlı | [ ] |
