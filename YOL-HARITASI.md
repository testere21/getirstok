# Yol Haritası — İki Depo (Soğukkuyu + Bostanlı), Tek Eklenti, Fırın Çık

Durum işaretleri: `[ ]` Bekliyor · `[~]` Sürüyor · `[x]` Bitti · `[!]` Engel var

Son güncelleme: 2026-11-18

---

## 1. Alınan kararlar

**Depolar**
- Sadece **Soğukkuyu** (`6113e59fbb8549d0f20e65f5`) ve **Bostanlı** (`5dc32dc9734a192200caddfb`). **Ulupark yok.**
- Ana ekranda depo seçici olacak. Seçilen depoya göre veri görünecek.
- Bostanlı seçiliyken **Fırın**, **Fırın çık** ve **SKT** gizlenir. Bu üçü sadece Soğukkuyu'da kalır.
- Depoya göre ayrılan sekmeler: Eksik, Fazla, Sayım, Kasa/Palet. İstatistikler zaten depo bazlı.
- Mevcut `stock_items` kayıtları Soğukkuyu'ya aittir.

**Fırın**
- Panelden **Fırın sekmesi kaldırılır**. Birlikte kalkanlar: "Beni pişir" Telegram bildirimi, panelin pişirme sesi, aktif/deaktif anahtarı, eklentinin pişirme önerisi yüklemesi.
- **Fırın çık** özelliği kalır, üst çubuğa taşınır.
- Fırın ürün listesi koddan çıkıp Firestore'a taşınır. Fırın çık içinde **ürün ekleme, çıkarma ve sıralama** olur.
- Fırın çık görselleri aynen kalır (yerel `public/bakery-images/{barkod}.jpg`, yoksa katalog görseli).
- Eklentideki fırın özellikleri (Pişirme Önerileri rozeti, ses, istatistik) bu işten etkilenmez.

**Eklenti**
- **Tek eklenti.** Depo, adresteki `/r/{24 hane}/` kimliğinden otomatik algılanır. Elle depo seçtirilmez.
- Özellik tablosu: her depo için hangi özelliğin açık olduğu bir tabloda tutulur. Ayarlar penceresinde "Depo varsayılanı / Açık / Kapalı" seçilebilir.
- Bostanlı'da kapalı olacaklar: barkod eşleştirme/arama, toplama modu, stok sütunu, pişirme önerisi yükleme.
- Token ve depo kimliği **depo başına ayrı kayıt** olarak panele gönderilir.
- `chrome-extension-bostanli` klasörü iş bitince silinir.

**Çalışma kuralları**
- Siz "push yap" demeden **hiçbir şey push edilmez** (commit de yalnızca istenince).
- Canlı veritabanına yazan her işlem öncesinde onayınız alınır.
- Her adımın sonunda: ne değişti, nasıl test edildi, sizin neye bakmanız gerekiyor.
- Yeni istekler aşağıdaki "Sonradan eklenenler" bölümüne yazılır, siz onaylamadan sıraya girmez.

---

## 2. Adımlar

Sıra, "önce panel iki depoya hazırlanır (Soğukkuyu'yu bozmadan), sonra eklenti" mantığıyla kurulmuştur.

### Adım 1 — Depo altyapısı  `[x]`  (risk: düşük)
- [x] 1a. `franchiseWarehouses.ts`: Ulupark'ı listeden çıkar
- [x] 1b. Ulupark'a ait kayıt var mı kontrol et (toplayıcı istatistikleri, DPS); varsa veriye dokunma, sadece arayüzde gösterme
- [x] 1c. İstatistikler sekmesinde "Tümü" seçeneğini iki depoya indir
- [x] 1d. Seçili depo için ortak yardımcı (depo kimliği okuma/saklama) ekle
- Bitiş ölçütü: testler ve lint geçer, panel Soğukkuyu'da eskisi gibi çalışır.

### Adım 2 — Depo başına token ve depo kimliği  `[x]`  (risk: orta; Soğukkuyu bozulmamalı)
- [x] 2a. Tek `active_warehouse` / `active_warehouse_id` yerine depo başına kayıt (`active_warehouse_<id>`); eski kayıt Soğukkuyu için okunmaya devam eder
- [x] 2b. `/api/token/save` ve `/api/warehouse-id/save`: depo kimliğini alıp ona göre yaz
- [x] 2c. `getGetirWarehouseToken` ve `getActiveWarehouseId`: seçili depoyu parametre olarak al
- [x] 2d. Depo paneli servislerini seçili depoyla çağır: **sayım** (Kasa/Palet) bağlandı; **SKT ve tedarikçi iade** bilerek Soğukkuyu'da kaldı (Bostanlı'da gizli); **sevkiyat** sonradan depoya bağlandı (bkz. Sonradan eklenenler)
- Bitiş ölçütü: Soğukkuyu için hiçbir davranış değişmez; kod iki depo için hazır.

### Adım 3 — `stock_items` depoya ayırma  `[~]`  (risk: orta; canlı veriye yazar) — 3g push sonrası kaldı
- [x] 3a. **Yedek:** `stock_items` koleksiyonunun JSON kopyasını al
- [x] 3b. **Kuru çalıştırma:** kaç kayıt var, kaçında `warehouseId` yok (hiçbir şey yazmaz); sayıyı size göster
- [x] 3c. **Yazma tarafı:** yeni kayıtlar `warehouseId` ile yazılsın (filtreden önce yayına alınır)
- [x] 3d. **Göç:** `warehouseId` olmayan kayıtlara Soğukkuyu kimliğini yaz (onayınızla; tekrar çalışsa zarar vermez)
- [x] 3e. **Doğrulama:** alanı olmayan kayıt kalmadı sayımı
- [x] 3f. **Okuma tarafı:** `subscribeStockItems` ve ilgili okumalar `where("warehouseId", "==", seçili depo)` ile
- [ ] 3g. **Push sonrası:** `node --env-file=.env.local scripts/migrate-stock-items-warehouse.mjs` (kuru) çalıştırıp `missing: 0` doğrula; sıfır değilse `--apply` ile tekrar çalıştır (push'a kadar canlıdaki eski panel alansız kayıt ekleyebilir)
    - Bitiş ölçütü: her depo yalnızca kendi kayıtlarını okur; eski kayıtlar Soğukkuyu'da görünür.

### Adım 4 — Ana ekran depo seçici ve sekme gizleme  `[x]`  (risk: orta)
- [x] 4a. Üst bölümde Soğukkuyu / Bostanlı seçici (seçim `localStorage`; İstatistikler ile ortak)
- [x] 4b. Bostanlı seçiliyken Fırın ve SKT sekmeleri gizlenir; açık sekme gizlenirse "Eksik"e dönülür
- [x] 4c. SKT bildirimi ve 5 dakikalık SKT kontrolü sadece Soğukkuyu'da çalışsın
- [x] 4d. Eksik/Fazla ve Sayım ekranları seçili depoyu kullansın
- Bitiş ölçütü: depo değişince veri ve sekmeler doğru değişir.

### Adım 5 — Fırın sekmesini kaldırma ve temizlik  `[x]`  (risk: orta; çok kod silinir)
- [x] 5a. Fırın sekmesi, listesi, sıralama, tükenenler görünümü
- [x] 5b. 5 dakikalık otomatik fırın stok yenileme (en büyük sürekli yük)
- [x] 5c. Pişirme önerisi ve deaktif ürün dinleyicileri, `bakeryInactiveService` (silindi); `bakeryBakeSuggestionService` yalnızca eski eklentinin yüklemesi için küçültülüp bırakıldı (Adım 8'de silinecek)
- [x] 5d. Telegram "Beni pişir" bildirimi ve panel pişirme sesi
- [x] 5e. Kullanılmayan API rotaları: `/api/telegram/bakery-bake-alert` ve `/api/bakery-suggestions` (GET) silindi; `/api/bakery-suggestions/save` **bilerek kaldı** (canlı eklenti hâlâ buraya yüklüyor; Adım 8'de eklentiden yükleme kalkınca silinecek). `/api/bakery-images` Fırın çık tarafından kullanılıyor, kaldı.
- [x] (Adım 6'dan öne alındı) 6c. Fırın çık düğmesi üst çubukta (Bostanlı'da gizli) ve 6f. raf stoğu yalnızca düğmeye basılınca çekiliyor — aksi halde Fırın çık erişilemez kalırdı
- Bitiş ölçütü: derleme, lint ve testler geçer; kullanılmayan kod kalmaz.

### Adım 6 — Fırın çık: üst çubuk + ürün yönetimi  `[x]`  (risk: orta)
- [x] 6a. Fırın ürün listesi Firestore'a: `getir_tokens/bakery_products` belgesi (`items: [{barcode, name?}]`, sıra = dizi sırası). `productId` tutulmadı: stok zaten barkodla çekiliyor, ad/görsel katalogdan geliyor.
- [x] 6b. Varsayılan liste (eski sabit liste, aslında **21** barkod, 23 değil): belge yokken kullanılır ve **ilk düzenlemede belgeye yazılır** — açılışta otomatik yazma yok.
- [x] 6c. Fırın çık butonu üst çubuğa (Bostanlı'da gizli) — Adım 5'te yapıldı
- [x] 6d. "Fırın ürünleri" düğmesi (Fırın çık'ın yanında, yalnızca Soğukkuyu): ad/barkodla katalogda ara-ekle, çıkar (onaylı), yukarı/aşağı taşı; her değişiklik anında kaydedilir (en fazla 50 ürün)
- [x] 6e. Katalogda bulunamayan arama için "Katalogda bulunamadı — yeni ürün olarak ekle" → `ManualAddProductModal` (kataloğa yazar, sonra listeye ekler)
- [x] 6f. Raf stoğu sadece Fırın çık açılınca, listedeki ürünler için bir kez çekilir; stoğu okunamayan ürün kuyrukta "Stok okunamadı — rafı elle kontrol edin" olarak görünür
- Bitiş ölçütü: ürün ekle/çıkar çalışır; sihirbaz yeni listeyi kullanır; stok okunamayan ürün "stok okunamadı" diye görünür.

### Adım 7 — Bayi stok sorgusunu seçili depoya bağlama  `[x]`  (risk: yüksek; canlı test gerekir)
- [x] 7a. `FRANCHISE_WAREHOUSE_ID_SOGUKKUYU` sabitini seçili depoya bağla
- [x] 7b. **Canlı test:** Bayi token'ı Bostanlı stoğunu okuyor (14.913 satır, hepsi tarandı; Soğukkuyu 6.914). Ayrı bir çözüm gerekmiyor. (Bostanlı kataloğu için bkz. "Sonradan eklenenler")
- [x] 7a-not. Katalog çözücü (`catalogProductIdResolver.ts`) artık isteğe bağlı `warehouseId` alıyor; stok çağrıları bunu geçiriyor (Bostanlı'ya özgü barkod ürün kimliğine çevriliyor).
- [x] 7c. Gerekmedi (bayi token'ı Bostanlı'yı okuyor).
- Bitiş ölçütü: Bostanlı stok değerleri doğru geliyor veya yapılamayacağı net.

### Adım 8 — Tek eklenti: depo algılama ve özellik bayrakları  `[x]`  (risk: yüksek; Soğukkuyu canlıda)
- [x] 8a. `warehouses.js`: depo tablosu (`id`, `name`, `features`)
- [x] 8b. Depo kimliği adresten algılanır; son görülen kimlik yedek; bilinmeyen depoda yalnızca temel özellikler
- [x] 8c. Bayraklar: `layout`, `bakery`, `bakeryStats`, `barcodeSearch`, `picking`, `expiryStock`, `tokenSync`, `bakeSuggestionUpload` (panele öneri yüklemesi bu işte kapanır), **`transferCapture`** (Sevkiyat için transfer listesi yakalama; Bostanlı'da da açık, istek gövdesine `warehouseId` eklenir)
- [x] 8d. Token ve depo kimliği gönderimi depo kimliğiyle (Soğukkuyu kaydı ezilmez)
- [x] 8e. Fırın istatistiği yalnızca algılanan depo için kaydedilir
- [x] 8f. Soğukkuyu davranışı aynı kalıyor mu karşılaştırma (özellik özellik)
- Bitiş ölçütü: Soğukkuyu'da hiçbir şey kaybolmaz; Bostanlı'da yalnızca açık özellikler çalışır.

### Adım 9 — Eklenti ayarlar penceresi ve paketleme  `[x]` (paket yenileme hariç)  (risk: düşük)
- [x] 9a. Popup: algılanan depo + her özellik için "Depo varsayılanı / Açık / Kapalı"
- [x] 9b. Ayarlar `chrome.storage.local`'da
- [x] 9c. `chrome-extension-bostanli` klasörünü sil
- [~] 9d. Sürüm 2.0.0 yapıldı; `.rar` paketi **siz isteyince** yenilenecek (bekliyor)
- Bitiş ölçütü: tek paket iki bilgisayarda kurulur.

### Adım 10 — Son kontrol  `[ ]`
- [ ] 10a. İki depo için uçtan uca deneme (Eksik/Fazla, Sayım, Fırın çık, İstatistik, eklenti)
- [ ] 10b. Test, lint, tip kontrolü
- [ ] 10c. Push (yalnızca "push yap" denince)

---

## 3. Risk ve bağımlılık notları
- **Adım 3d (göç)** canlı veriye yazar. Yedek ve onay olmadan çalıştırılmaz.
- **Adım 7 ve 8** canlı Getir verisi ve gerçek hesap gerektirir; test için sizden yardım istenecek.
- Adım 1–4 eklentiye dokunmaz, Soğukkuyu eklentisi bu aralıkta olduğu gibi çalışır.
- Adım 5 ve 6 arasında Fırın çık ekranı geçici olarak erişilemez kalmasın diye 6, 5'ten hemen sonra yapılır (ya da Fırın çık, 5'te silinmeden yeni yerine taşınır).
- Adım 2'de depo başına token kaydı yapılmadan Bostanlı eklentisi token göndermemeli (Soğukkuyu token'ını ezer).

## 4. Sonradan eklenenler
- **Sevkiyat ve DPS özeti iki depoda da görünsün, her depo kendi verisini göstersin** (kullanıcı isteği, Adım 4'ün devamı olarak yapıldı; bkz. günlük "Adım 4 devamı"). Eklenti tarafı (Bostanlı'da transfer yakalama) Adım 8c'de `transferCapture` bayrağı olarak eklendi.
- **Bostanlı'da "Toplama" düğmesi gizli; Kasa/Palet sayımı asla yanlış depoda açılmasın** (kullanıcı kararı, Adım 5 sonrası yapıldı): Bostanlı'nın ayrı Kasa/Palet ürün listesi **olmayacak** (tek ortak liste, `kasaPaletProducts.ts`), ama sayım seçili depoda açılır.
  - `app/page.tsx`: Toplama düğmesi ve modalı yalnızca Soğukkuyu'da.
  - Kasa/Palet sayım uçları (`/api/warehouse-inventory-check` ve `/approve`) artık `warehouseId`'yi **zorunlu** istiyor (`requireExplicitWarehouseId`); eksik/boş/tanınmayan depo 400 döner, sessizce Soğukkuyu'ya düşmez. `createInventoryCheck`/`approveInventoryCheck` servisindeki varsayılan depo parametresi kaldırıldı, depo her zaman açık verilir ve doğrulanır.
  - Onay pencereleri ve başarı mesajı depo adını gösterir ("Sayım açılsın mı? · Bostanlı").
  - Test: `requireExplicitWarehouseId` birim testi (`test:warehouses` 6/6); dev sunucuda depo yok/boş/Ulupark → 400; tarayıcıda (sahte yanıtla, Getir'e gitmeden) Bostanlı seçiliyken oluşturma ve onay istekleri `warehouseId = 5dc32dc9…` ile gitti.
  - Not: Depo değiştirilince Kasa/Palet sekmesi sıfırlanır; açılmış ama onaylanmamış bir sayımın "Onayla" şeridi kaybolur (sayım panelde "Yeni" kalır, panelden onaylanabilir).
- **Bostanlı ürün kataloğu (ayrı dosya)** (kullanıcı kararı: ayrı katalog, tüm ürünler). Bostanlı'da 14.913, Soğukkuyu'da 6.914 ürün var; katalog (8.548 + 27 ek) Bostanlı'nın yarısından azını kapsıyordu (6.590 eksik, bunların 1.726'sının stoğu var).
  - `scripts/sync-bostanli-catalog.mjs` (`npm run sync-bostanli-catalog`, `DRY_RUN=1` ile önce rapor): bayi stok listesinden Bostanlı'nın tüm ürünlerini tarar, `products.json` ve Firestore ek katalogda olmayanları **`data/products-bostanli.json`** dosyasına yazar (6.581 ürün; tekrar çalıştırılabilir, her seferinde baştan üretir; tarama %98'den azsa yazmaz). Soğukkuyu dosyasına dokunmaz. Ortak ürünlerde alan eşlemesi doğrulandı: barkod %99,5, ad %96 uyumlu.
  - `app/lib/catalogLoader.ts` (yeni): yalnızca Bostanlı seçiliyse bu dosyayı da ekler. `/api/products?warehouseId=` buna göre 8.575 (Soğukkuyu, eskisiyle aynı) / 15.156 (Bostanlı) ürün döner; `warehouseId` verilmezse Soğukkuyu, tanınmayan depo 400. Panel ve `AddProductModal` kataloğu seçili depoyla çeker, depo değişince yeniden yükler (geç gelen eski yanıt yenisini ezmez).
  - Yeni ürünler çıktıkça betik elle yeniden çalıştırılmalı (otomatik değil).
  - **Açık nokta (Adım 8):** Eklentinin barkod katalogu (`product-barcodes.js`, `build-extension-catalog`) yalnızca `products.json`'dan üretiliyor; Bostanlı'ya özgü ürünler eklentide yok. Adım 8'de karar verilecek.
  - Test: `tsc` temiz, `/api/products` sayıları yukarıdaki gibi, tarayıcıda "ttec Hızlı Şarj" Bostanlı'da bulundu, Soğukkuyu'da bulunmadı, depo değişince geri döndü, konsolda hata yok.

## 5. Yapılanlar günlüğü
### Adım 1 — 2026-11-18 — bitti
- **Ulupark çıkarıldı:** `franchiseWarehouses.ts` artık yalnızca Soğukkuyu ve Bostanlı. Depo listesini kullanan her yer (İstatistikler sekmesi ve "Tüm depolar" seçeneği, toplayıcı yönetimi, toplayıcı metrik çekimi) otomatik iki depoya indi.
- **Ulupark'ta bulunan veri (canlı Firestore, sadece okuma):** 44 günlük `picker_stats_days` kaydı ve listede 10 toplayıcı. `bakery_stats_days` kaydı yok. Bu kayıtlara **dokunulmadı**; panelde gösterilmiyor.
- **Toplayıcı senkronu:** `pickerStatsSync.ts` içinde panelde olmayan bir depoya (Ulupark) yeni kayıt yazılmaz (1 satırlık koruma). Böylece Ulupark'ın verisi gizlice birikmeye devam etmez.
- **Seçili depo yardımcısı:** `selectedWarehouse.ts` (`localStorage` anahtarı `getirstok.warehouse`, sekmeler arası senkron, `useSelectedWarehouseId` kancası) ve `normalizeWarehouseId` / `BOSTANLI_WAREHOUSE_ID` / `DEFAULT_PANEL_WAREHOUSE_ID` (`franchiseWarehouses.ts`). Henüz arayüze bağlı değil, Adım 4'te kullanılacak.
- **Eski seçim:** İstatistikler sekmesinde kayıtlı eski bir Ulupark seçimi varsa kendiliğinden Soğukkuyu'ya düşer.
- **Test:** yeni `npm run test:warehouses` (2 test) + mevcut picker-stats (38), dps (11), bakery-stats (4) geçti. `tsc --noEmit` ve eslint temiz.
- **Değişen dosyalar:** `app/lib/franchiseWarehouses.ts`, `app/lib/selectedWarehouse.ts` (yeni), `app/lib/franchiseWarehouses.test.ts` (yeni), `scripts/run-warehouses-tests.mjs` (yeni), `app/lib/pickerStatsSync.ts`, `app/lib/types.ts` (yalnızca yorum), `package.json`.

### Adım 2 — 2026-11-18 — bitti
- **Canlı veride bulunan durum (sadece okuma):** eski `active_warehouse_id` kaydı Soğukkuyu'nun kimliğini (`6113…`) tutuyor ve eski `active_warehouse` token'ı Soğukkuyu'ya ait. Bu yüzden eski kayıtlar güvenle Soğukkuyu sayıldı. Kayıtlara **hiçbir şey yazılmadı veya silinmedi**.
- **Depo başına token kaydı:** `active_warehouse_{depoId}` (`warehouseTokenDocId`). Yeni kayıt, eklenti token'ı yeniden gönderdiğinde oluşur.
- **Yazma (`saveGetirToken` + `/api/token/save`):** depo paneli token'ı artık isteğe bağlı `warehouseId` alır. Kimlik gelmezse Soğukkuyu (kimlik göndermeyen mevcut eklenti Soğukkuyu'dur). Tanınmayan kimlik 400 ile reddedilir. Soğukkuyu token'ı hem yeni kayda hem eski `active_warehouse` kaydına yazılır (eski okuyucular ve geri dönüş için). Bayi token'ı değişmedi.
- **Okuma (`getGetirWarehouseToken(warehouseId)`):** varsayılan Soğukkuyu. Soğukkuyu için yeni kayıt yoksa eski kayda düşer. **Bostanlı asla Soğukkuyu'nun token'ına düşmez**; kendi kaydı yoksa `null` ("token yok" uyarısı). Geçersiz depo hata verir.
- **`getActiveWarehouseId(warehouseId)`:** artık eklentinin son yakaladığı kaydı okumaz (iki depo birbirini ezmesin diye); verilen depoyu döndürür. Eski bayat sabit (`DEFAULT_WAREHOUSE_ID`, `5dc32d8b…`) ve `getSavedGetirWarehouseId` kaldırıldı. Her çağrıda bir Firestore okuması azaldı.
- **`/api/warehouse-id/save`:** eski eklenti çağrısı bozulmasın diye duruyor; yalnızca Soğukkuyu kimliğini yazıyor, Bostanlı kimliği eski kaydı ezmesin diye yazılmıyor (200 + `saved:false`). Adım 8'de eklenti kimliği token ile gönderince bu uç kaldırılabilir.
- **Sayım (Kasa/Palet):** `createInventoryCheck` / `approveInventoryCheck` ve iki API ucu isteğe bağlı `warehouseId` alır (varsayılan Soğukkuyu, tanınmayan depo 400). Sayım isteğinin gövdesindeki `warehouseId` artık sabit Soğukkuyu yerine seçilen depo. Arayüz henüz depo göndermiyor (Adım 4), bu yüzden bugün davranış aynı.
- **Bilerek dokunulmayanlar:** SKT (`getirWarehouseExpiringProductsService`), tedarikçi iade (`getirWarehouseApiService`) ve sevkiyat (`getirWarehouseTransferService`) varsayılanla Soğukkuyu'da çalışıyor. Sevkiyat yakalama kayıtları (`warehouse_transfer_*_capture`) tek kayıt ve Soğukkuyu'ya ait.
- **Test:** `npm run test:warehouses` (4 test) geçti; `tsc --noEmit` temiz. Canlı Firestore'da **salt okuma** denemesi: Soğukkuyu token'ı eski kayıttan okunuyor, parametresiz çağrı aynı sonucu veriyor, Bostanlı `null`, Ulupark ve bozuk kimlik reddediliyor.
- **Değişen dosyalar:** `app/lib/types.ts`, `app/lib/franchiseWarehouses.ts`, `app/lib/getirTokenService.ts`, `app/lib/getirInventoryCheckService.ts`, `app/api/token/save/route.ts`, `app/api/warehouse-id/save/route.ts`, `app/api/warehouse-inventory-check/route.ts`, `app/api/warehouse-inventory-check/approve/route.ts`, `app/lib/franchiseWarehouses.test.ts`.

### Adım 3 — 2026-11-18 — bitti (3g hariç)
- **Canlı veri:** `stock_items` içinde 78 kayıt vardı (47 eksik, 31 fazla), hiçbirinde `warehouseId` yoktu.
- **Yedek:** `scripts/stock-items-backup-2026-11-18T19-27-47-303Z.json` (ve ikinci çalıştırmanın aynısı `…19-27-51…json`), 78 kayıt, Timestamp alanları ISO olarak. Git'te yok sayılıyor (`scripts/*.json`).
- **Göç (kullanıcı onayıyla):** 78/78 kayda yalnızca `warehouseId = 6113e59fbb8549d0f20e65f5` (Soğukkuyu) yazıldı; `updatedAt` dahil başka alana dokunulmadı. Sonra: alansız kayıt 0, tür sayıları aynı (47/31). Betik `scripts/migrate-stock-items-warehouse.mjs` (varsayılan kuru çalıştırma, `--apply` yazar, her seferinde önce yedek, tekrar çalışması güvenli).
- **Yazma tarafı:** `addStockItem` artık zorunlu `warehouseId` alıyor (tanınmayan depo hata veriyor); `AddProductModal` yeni `warehouseId` prop'u ile seçili depoyu veriyor.
- **Okuma tarafı:** `subscribeStockItems(warehouseId, …)` yalnızca o deponun kayıtlarını dinliyor (`where("warehouseId","==",…)`, tek alanlı eşitlik sorgusu, ek indeks gerekmez). `page.tsx` seçili depoyu `useSelectedWarehouseId()` ile alıyor; depo değişince liste sıfırlanıp yeniden dinleniyor. Seçici arayüzü Adım 4'te; şimdilik varsayılan Soğukkuyu.
- **Telegram:** `stock-event` ve Kasa/Palet sayım bildirimleri depo bilgisi taşıyor; Soğukkuyu mesajları aynı, Bostanlı mesajları "📍 Depo: Bostanlı" ile başlıyor (`warehouseLabelPrefix`). Diğer Telegram bildirimleri (ürün sorunu, sayım değişikliği, SKT) depo etiketi **almadı** (Bostanlı'da bu özellikler kapalı/Adım 4'te değerlendirilecek).
- **Test:** `npm run test:warehouses` 5 test geçti; `tsc --noEmit` temiz. Canlıda salt okuma: Soğukkuyu sorgusu 78 (47/31), Bostanlı 0. Paneli gerçekten açtım (Chrome): "Soğukkuyu kimliğiyle dinleme başladı, 78 kayıt alındı", "Toplam Ürün Çeşidi 78", Eksik listesi dolu.
- **Lint:** yeni hata yok. `page.tsx` 303. satırdaki `any` hatası eskiden beri var (bu işle ilgisiz), dokunulmadı.
- **Değişen dosyalar:** `app/lib/stockService.ts`, `app/lib/types.ts`, `app/lib/franchiseWarehouses.ts` (+test), `app/page.tsx`, `app/components/AddProductModal.tsx`, `app/api/telegram/stock-event/route.ts`, `app/api/warehouse-inventory-check/route.ts`, `scripts/migrate-stock-items-warehouse.mjs` (yeni).

### Adım 4 — 2026-11-18 — bitti
- **Seçici:** yeni `app/components/WarehouseSelector.tsx` (Soğukkuyu / Bostanlı), `page.tsx` başlığında başlığın yanında. Seçim `getirstok.warehouse` anahtarıyla `localStorage`'da, açık sekmeler arasında senkron.
- **Gizleme:** Bostanlı'da Yaklaşan SKT ve Fırın ürünleri sekmeleri çıkmıyor; bunlardan biri açıksa "Eksik" gösteriliyor, Soğukkuyu'ya dönünce seçili sekme geri geliyor.
- **Yük:** Bostanlı'da `/api/expiring-products` sorgusu ve 5 dakikalık yenilemesi, SKT bildirim rozeti/penceresi, Fırın stok yenilemesi (`/api/getir-stock`), pişirme önerisi ve deaktif ürün dinleyicileri çalışmıyor. Tarayıcıda doğrulandı: Bostanlı'ya geçince bu istekler gitmiyor.
- **Eksik/Fazla/Sayım:** seçili depoyu kullanıyor (Adım 3). Bostanlı'da liste boş, "Eksik ürün bulunmuyor".
- **Kasa/Palet:** daha önce depo kimliğini **göndermiyordu** (sunucu varsayılan olarak Soğukkuyu'ya düşüyordu, Bostanlı seçiliyken yanlış depoya gidebilirdi). Düzeltildi: sayım açma ve onay seçili depoyla gidiyor, onay sayımın açıldığı depoyu kullanıyor, depo değişince sekme sıfırlanıyor. Lokasyon QR'ı Soğukkuyu'ya ait olduğu için Bostanlı'da gizli.
- **İstatistikler:** depo filtresi artık ana ekrandaki seçimi izliyor; "Tüm depolar" yalnızca o sekmede geçici seçilebiliyor (eski `getirstok.pickerStats.warehouse` anahtarı kullanılmıyor).
- **Test:** `tsc` temiz, `test:warehouses` 5/5. Tarayıcıda: sekmeler, istek sayısı, Kasa/Palet lokasyon butonu, Soğukkuyu'ya dönüş (78 kayıt) doğrulandı. Lint'te yeni hata yok.
- **Bilerek dokunulmayanlar (karar bekliyor):** başlıktaki Sevkiyat, Toplama, DPS özeti ve Barkod Oluşturucu Bostanlı'da da görünüyor; Toplama/DPS/Sevkiyat verileri Soğukkuyu'ya ait. Kasa/Palet ürün listesi (`kasaPaletProducts.ts`) tek liste, depoya göre ayrılmadı.
- **Değişen dosyalar:** `app/page.tsx`, `app/components/WarehouseSelector.tsx` (yeni), `app/components/KasaPaletSayimTabContent.tsx`, `app/components/IstatistiklerTabContent.tsx`.

### Adım 4 devamı — 2026-11-18 — Sevkiyat ve DPS özeti depoya bağlandı
- **DPS özeti (başlık) ve İstatistikler > DPS:** seçili deponun puanını gösteriyor. Getir bayi token'ı Bostanlı'yı da okuyor (salt okunur canlı deneme: Bostanlı dün Bayi 82,8 / Kurye 84,6 / Depocu 80,5, sıra 284; Soğukkuyu 85,9 / 85,1 / 87,0, sıra 251). Yani **bayi token'ı iki depoyu da kapsıyor** (Adım 7b'nin DPS kısmı cevaplandı).
- **DPS önbelleği:** Soğukkuyu kayıtları eski kimlikle (`{from}_{to}`) aynen kaldı; Bostanlı `dps_scores/{depoId}_{from}_{to}` ile ayrı kayıt alıyor. `/api/dps?warehouseId=` (verilmezse Soğukkuyu, tanınmayan 400). Depo değişince eski depo puanı bir an bile gösterilmiyor.
- **Sevkiyat:** istek `warehouseId` ile gidiyor; sunucu o deponun depo paneli token'ını ve o deponun yakalanmış transfer listesini kullanıyor. Bostanlı asla Soğukkuyu'nun yakalamasını/token'ını kullanmıyor. Sihirbaz başlığında depo adı yazıyor ("Sevkiyat kontrol · Bostanlı"). Yakalama kayıtları: Soğukkuyu eski kimlikte, Bostanlı `…_capture_{depoId}`.
- **Canlı deneme:** Bostanlı sevkiyat sorgusu "Bostanlı için transfer listesi henüz yakalanmadı" döndürdü (beklenen: Bostanlı'dan henüz yakalama gelmedi). Tanınmayan depo 400. Soğukkuyu sevkiyat sorgusu "depo paneli token'ı geçersiz" (401) döndürdü: Soğukkuyu'nun kayıtlı depo token'ının süresi dolmuş, depo panelinde Transfer Teslimat Listesi'ni yenilemek gerek. Bu bu işten bağımsız (token yolu aynı).
- **Henüz çalışmayan kısım:** Bostanlı'dan transfer listesi yakalayan eklenti özelliği yok; Bostanlı bilgisayarındaki eklenti şimdilik yakalamıyor. Adım 8'de eklenir. O zamana kadar Bostanlı'da Sevkiyat yukarıdaki uyarıyı gösterir.
- **Test:** `tsc` temiz; `test:dps` 11/11 (Soğukkuyu/Bostanlı kimlik testi eklendi), `test:warehouses` 5/5.
- **Değişen dosyalar:** `app/lib/{dpsRange,dpsStore,dpsParse,getirDpsService,warehouseTransferCaptureService,getirWarehouseTransferService}.ts`, `app/lib/dpsRange.test.ts`, `app/api/dps/route.ts`, `app/api/warehouse-transfer/{capture,products}/route.ts`, `app/components/{DpsHeaderSummary,DpsPanel,SevkiyatControlWizard,IstatistiklerTabContent}.tsx`, `app/page.tsx`.

### Adım 5 — 2026-11-18 — bitti
- **Kaldırılanlar (`app/page.tsx`: +128 / −1157 satır):** Fırın sekmesi ve içeriği (liste, sıralama, "biten ürünler", deaktif ürünler ve aktif/deaktif anahtarı, tam ekran görsel kutusu), her 5 dakikada otomatik raf stoğu yenileme ve gece sessiz saat mantığı, pişirme önerisi ve deaktif ürün Firestore dinleyicileri, sekme rozeti, "Beni pişir" etiketi/şeridi, panelin pişirme sesi, "Beni pişir" Telegram bildirimi, `AddProductModal` içindeki `bakeryCatalogCard` kipi (yalnızca Fırın listesi kullanıyordu).
- **Silinen dosyalar:** `app/lib/bakeryInactiveService.ts`, `app/lib/bakeryQuietHours.ts`, `app/api/telegram/bakery-bake-alert/route.ts`, `app/api/bakery-suggestions/route.ts`. `bakeryBakeSuggestions.ts` yalnızca tipler kalacak şekilde, `bakeryBakeSuggestionService.ts` yalnızca kaydet kalacak şekilde küçültüldü.
- **Firestore'da artık okunmayan ama silinmeyen kayıtlar (veriye dokunulmadı):** `getir_tokens/bakery_bake_suggestions`, `getir_tokens/bakery_inactive_products`.
- **Fırın çık:** üst çubukta turuncu düğme (Bostanlı'da yok). Basınca raf stoğu (`/api/getir-stock`) ve görsel listesi (`/api/bakery-images`) **bir kez** çekilip sihirbaz açılıyor; arka planda hiçbir şey yenilenmiyor. Liste şimdilik kodda sabit 23 barkod (Adım 6'da Firestore'a taşınacak). Stoğu 0'dan büyük olanlar listenin kendi sırasıyla gösteriliyor (eskiden "pişirilecekler önce" sıralaması vardı, artık yok).
- **Test:** `tsc` temiz (yalnızca silinen rotaları hâlâ anan eski `.next/types` dosyası hata veriyor; dev sunucu yeniden başlayınca kendiliğinden düzelir); `test:warehouses` 5/5, `test:bakery-stats` 4/4. Tarayıcıda: açılışta fırın stoğu isteği yok, bekleyince ek istek yok, düğmeye basınca yalnızca `getir-stock` + `bakery-images`, sihirbaz "1 / 13 · Barkod ve raf stoku" ile açıldı; Bostanlı'da düğme ve sekmeler yok; konsolda hata yok.
- **Dikkat:** Canlı eklenti hâlâ pişirme önerisini `/api/bakery-suggestions/save`'e yüklüyor; bu uç duruyor, panel artık okumuyor. Eklentiye bu adımda dokunulmadı (Adım 8).

### Adım 6 — 2026-11-18 — bitti
- **Liste artık Firestore'da:** `getir_tokens/bakery_products` (`items: [{barcode, name?}]`, `updatedAt`). Belge yoksa eski 21 barkodluk liste varsayılan; ilk düzenlemede belgeye yazılır. Sihirbaz her açılışta listeyi **bir kez** okur (dinleyici yok).
- **Yeni dosyalar:** `app/lib/bakeryProducts.ts` (liste kuralları: ekle/çıkar/taşı/çöz/kuyruk), `bakeryProducts.test.ts` (+ `npm run test:bakery-products`, 6 test), `bakeryProductsService.ts` (Firestore okuma/yazma), `app/components/BakeryProductsEditor.tsx` (düzenleme penceresi).
- **Silinen:** `app/lib/bakeryProductBarcodes.ts` (sabit liste; içeriği varsayılan listeye taşındı).
- **Davranış değişiklikleri:** (1) Sihirbaz artık listedeki **her** ürünü sorar; eskiden "katalogda olmayanlar" atlanırdı (varsayılan 21'in hepsi katalogda, fark yok). (2) Stoğu okunamayan ürün atlanmaz, "Stok okunamadı — rafı elle kontrol edin" ile gösterilir; stoğu 0 olanlar yine gizli. (3) Liste okunamazsa "Fırın ürün listesi okunamadı" uyarısı çıkar, sessizce varsayılana düşmez.
- **Test:** `tsc` temiz, yeni dosyalarda eslint temiz; `test:bakery-products` 6/6, `test:warehouses` 6/6, `test:bakery-stats` 4/4. Tarayıcı: düzenleyici 21/50 ürünle açıldı ve açılışta Firestore'a yazılmadı; sırala, çıkar (Vazgeç ve Çıkar), katalogdan ekle çalıştı ve Firestore'a doğru yazıldı; Fırın çık, stok isteğini yeni sırayla 21 barkodla gönderdi; sahte `null` stokla "Stok okunamadı" göründü; konsolda hata yok.
- **Canlı veri:** Deneme için `bakery_products` belgesi oluşturuldu, test bitince **silindi** (şu an belge yok, liste varsayılan). "Yeni ürün olarak ekle" (kataloğa yazar) canlıda denenmedi, yalnızca düğmenin göründüğü doğrulandı.
- **Kalan lint:** `BakeryExitWizard.tsx` içinde eskiden beri var olan 2 `set-state-in-effect` hatası (bu adımda dokunulmadı).

### Adım 7 — 2026-11-18 — bitti
- **Stok sorguları seçili depoyla çalışıyor:** `getirApiService.ts` içindeki tüm stok fonksiyonları zorunlu `warehouseId` alıyor (`assertStockWarehouse`: tanınmayan depo 400 `INVALID_WAREHOUSE`); Getir isteğinde `warehouseIds: [seçili depo]`. `/api/getir-stock` (GET ve POST) ve `/api/getir-stock-by-product-id` `warehouseId` kabul ediyor; **verilmezse Soğukkuyu** (eklenti ve eski istemciler bozulmasın), geçersiz/Ulupark 400.
- **İstemci:** Ürün penceresi (`AddProductModal`), Sayım değişikliği penceresi (`SayimChangeModal`/`SayimTabContent`) ve Fırın çık stok isteği `warehouseId` gönderiyor.
- **Bostanlı'da gizlendi (ürün penceresi):** SKT işaretleme düğmesi ve kayıtlı SKT kutusu, `Kaç gün önceden çıkılacak` (Soğukkuyu depo API'si) düğmesi; SKT stok yedek sorgusu da yalnızca Soğukkuyu'da çalışır.
- **Canlı doğrulama (salt okunur):** 12 üründe (6 Bostanlı'ya özgü, 6 ortak) panel API'si Getir'in doğrudan cevabıyla iki depoda da 12/12 eşleşti. Ortak ürünlerde depolar farklı stok veriyor (örn. Activia Sade: Bostanlı 15, Soğukkuyu 6) — yani Adım 7'den önce Bostanlı seçiliyken Soğukkuyu'nun sayısı görünürdü. Depo verilmeyen istek Soğukkuyu'yu döndürüyor; Ulupark 400. Tarayıcıda Bostanlı seçiliyken ürün penceresi 15, Soğukkuyu'da 6 gösterdi; istekler doğru `warehouseId` ile gitti; konsolda hata yok.
- **Test:** `tsc` temiz; `test:warehouses` 6/6, `test:bakery-products` 6/6, `test:bakery-stats` 4/4. Eslint'te kalanlar eskiden var olan `any`/`set-state-in-effect` hataları.
- **Bilinen Getir davranışı:** Tek bir ürün kimliğiyle sorulunca Getir, stoğu 0 olan bazı Bostanlı ürünleri için satır dönmüyor (iki ürünle sorunca dönüyor). Panelde bu "stok bilinmiyor" (boş) görünür; yanlış sayı göstermez. Soğukkuyu'da da aynı yapı var.

### Adım 8 — 2026-11-18 — bitti
- **Tek eklenti (sürüm 1.9.0):** `chrome-extension/warehouses.js` depo tablosu + özellik bayrakları (`layout, bakery, bakeryStats, barcodeSearch, picking, expiryStock, tokenSync, transferCapture`). Soğukkuyu: hepsi açık. Bostanlı: `barcodeSearch`, `picking`, `expiryStock` kapalı, kalanı açık. Bilinmeyen depo (Ulupark vb.): yalnızca `layout`.
- **Depo algılama:** sayfa adresindeki `/r/{24hex}/`, API adresindeki `/warehouse/{24hex}/`, sekme adresi, en son görülen kimlik (`lastWarehouseId`) sırasıyla. `franchise.getir.com` sayfalarında adreste depo yok; son görülen depo kullanılır. Özellikler sayfa SPA olduğu için her seferinde taze hesaplanır. Ayarlar için altyapı hazır (`featureOverrides`), arayüzü Adım 9'da.
- **`content.js`:** her özellik bayrağın arkasında. Bostanlı'da barkod arama, TM/Toplama düğmesi, SKT stok sütunu yok; Fırın sekmesi ve Fırın istatistiği var. Fırın istatistiği yalnızca algılanan depo (sayfadaki, kesin kimlik) için biriktirilir ve o depo kimliğiyle gönderilir. Eski yerel istatistik göçü yalnızca Soğukkuyu sayfasında.
- **`background.js`:** token Soğukkuyu/Bostanlı kimliğiyle gönderilir (`/api/token/save` gövdesinde `warehouseId`); depo token'ı kimliksiz hiçbir yere gitmez; bayi token'ı eskisi gibi. Bilinmeyen depoda hiçbir şey gönderilmez. Sevkiyat yakalamaya `warehouseId` eklenir. `captureWarehouseId` artık sunucuya yazmıyor (yalnızca yerelde son depoyu tutar; `/api/warehouse-id/save` eski eklentiler için duruyor).
- **Pişirme önerisi yüklemesi kaldırıldı:** eklentiden (`content.js`, `warehouse-bake-hook.js`, `background.js`) tüm tarama/yükleme kodu silindi. Sunucu tarafı (`/api/bakery-suggestions/save`, `bakeryBakeSuggestionService.ts`, `bakeryBakeSuggestions.ts`) **bilerek kaldı**: sahadaki eski eklentiler hâlâ çağırabilir. **Adım 10'da silinecek** (yeni eklenti kurulduktan sonra).
- **Popup:** "Token Test Et" artık son görülen depo kimliğiyle gönderir; kimlik bilinmiyorsa uyarır (Bostanlı token'ı Soğukkuyu kaydını ezemez). Depo adı + kimliği gösterilir.
- **Karşılaştırma (8f), sahte Getir sayfasıyla (Playwright, gerçek Chrome):** sahte sipariş penceresi + sayım görev tablosu + sekme çubuğu. (1) Soğukkuyu: eski eklenti (git HEAD) ↔ yeni eklenti: sayfa içeriği, eklenen stil blokları, hazır işareti ve gönderilen mesajlar **birebir aynı**. (2) Bostanlı: eski Bostanlı eklentisi ↔ yeni eklenti: **birebir aynı**. Ayrıca depo senaryoları: Soğukkuyu (8 özellik açık), Bostanlı (barkod/toplama/SKT yok, mesajlar Bostanlı kimliğiyle), Ulupark (yalnızca düzen, hiçbir şey gönderilmez), adressiz sayfa (son depo / yoksa yalnızca düzen), özellik ezme.
- **Testler:** `npm run test:extension-warehouses` 7/7 (tablo, adres algılama, bayraklar), `npm run test:extension-background` 11/11 (sahte chrome API'siyle `background.js`: token hangi depo kimliğiyle gidiyor, bilinmeyen depo, tekrar gönderme, kapalı özellik, sevkiyat yakalama, pişirme önerisi mesajı artık işlenmiyor). Gerçek Getir girişi olmadan eklenti uçtan uca denenemedi; bunun için aşağıdaki kontrol listesi.
- **Bilinen sınırlar:** (1) Toplama düğmesi barkod arama düğmesine bağlı; Bostanlı'da barkod arama açılırsa Toplama da gelir. (2) Eklentinin barkod katalogu (`product-barcodes.js`) Bostanlı'ya özgü ürünleri içermiyor; yalnızca Bostanlı'da barkod arama açılırsa önemli. (3) `franchise.getir.com` sayfaları, eklenti yeni kurulduysa ve hiç depo sayfası açılmadıysa yalnızca temel özelliklerle başlar. (4) `data/products-bostanli.json` elle yenilenir (`npm run sync-bostanli-catalog`). (5) Telegram'daki sayım değişikliği / ürün sorunu / SKT mesajlarında depo etiketi yok (önceki adımlardan).

### Adım 9 — 2026-11-19 — bitti (paket hariç)
- **Ayarlar penceresi:** eklenti ikonunun açtığı pencerenin altına "Depo Özellikleri" bölümü eklendi (`popup.html`, `popup.js`). Üstte algılanan depo (açık sekmeden, yoksa son görülenden); altında depo seçici (Soğukkuyu / Bostanlı) ve 8 özellik için "Varsayılan (açık/kapalı) / Açık / Kapalı". Seçimler `chrome.storage.local` içinde `featureOverrides` altında; varsayılana dönen seçim kayıttan silinir. "Bu depoyu varsayılana döndür" düğmesi var. Tanınmayan depoda ayar yapılamaz (seçici yedek olarak Soğukkuyu'yu gösterir, uyarı yazar).
- **Uyarılar:** Toplama açık + barkod eşleştirme kapalıysa, token gönderimi veya sevkiyat yakalama kapalıysa pencerede uyarı çıkar.
- **Test:** Gerçek Chrome + sahte `chrome` API'siyle pencere denendi: algılama (sekme / yok / tanınmayan depo), seçim kaydı, varsayılana dönünce kaydın silinmesi, depo değiştirme, sıfırlama; konsol hatası yok. (Chrome artık `--load-extension` ile paketsiz yüklemeye izin vermediği için pencere gerçek eklenti olarak değil, sahte API ile denendi.) Gerçek eklentide denenmesi gerekir.
- **`chrome-extension-bostanli` klasörü silindi** (git'te takipli değildi, geri getirilemez). Silmeden önce içerik karşılaştırıldı: görünüm/Fırın/istatistik davranışı yeni eklentiyle birebir aynı çıkmıştı (Adım 8f), fork'un arka planı yalnızca istatistik iletiyordu ve yeni eklenti bunu zaten yapıyor.
- **Sürüm 2.0.0** (manifest açıklaması da güncellendi), `chrome-extension/README.md` güncellendi.
- **Bekleyen:** `.rar` paketleri yenilenmedi (siz isteyince). `chrome-extension.rar` diskte yok (silinmiş görünüyor, git'te "D"); isterseniz yeni sürümden üretilir.
- **Ayarlar penceresi sınırlandı (kullanıcı isteği):** yalnızca Bostanlı'nın özellikleri değiştirilebilir; Soğukkuyu seçici/ayardan kaldırıldı ve `warehouses.js` içinde `editable: false` olduğu için depolanmış bir Soğukkuyu seçimi olsa bile yok sayılır (`featuresFor`). Seçimler parola ile kilitli: parola girilmeden liste ve sıfırlama düğmesi kapalı; yanlış parolada hiçbir şey yazılmaz; popup kapanınca tekrar kilitlenir. Parola yalnızca yanlışlıkla değişikliği önler (kodda SHA-256 özeti tutulur, eklenti dosyaları okunabildiği için güvenlik sınırı değildir). Testler: `test:extension-warehouses` 8/8 (Soğukkuyu kilidi dahil), `test:extension-background` 11/11; pencere sahte API ile denendi (kilitli/yanlış/doğru parola/zorla değişiklik/Soğukkuyu sekmesi).

### Depoya göre tema — 2026-11-19 (kullanıcı isteği)
- **Ne:** Soğukkuyu seçiliyken panel mor (eskisi gibi), Bostanlı seçiliyken mavi. Tüm panel: üst alan, düğmeler, sekmeler, rozetler (mor/indigo kullanılan 66 yer).
- **Nasıl:** seçili depo `<html data-warehouse="sogukkuyu|bostanli">` olarak yazılır. `app/globals.css` içinde `html[data-warehouse="bostanli"]` altında Tailwind'in `violet`/`purple` değişkenleri mavi, `indigo` değişkenleri gök mavisi (sky) tonlarıyla değiştirilir; tek tek sınıf değişmedi. Yeni: `app/lib/warehouseTheme.ts`, `app/components/WarehouseThemeSync.tsx` (depo değişince anında geçiş). `app/layout.tsx` içindeki küçük satır içi betik kayıtlı depoyu ilk boyamadan önce okur (Bostanlı açılışında mor bir an görünmez). Depo anahtarı sabiti (`SELECTED_WAREHOUSE_STORAGE_KEY`) sunucu bileşeni de kullanabilsin diye `franchiseWarehouses.ts`ye taşındı (`selectedWarehouse.ts` yeniden dışa aktarır).
- **Test (localhost'ta Playwright + gerçek Chrome):** Soğukkuyu eski mor degrade; seçiciye tıklayınca Bostanlı mavi degrade; yenilemede ilk anda `bostanli` (flaş yok); geri Soğukkuyu; sayfa hatası yok. Ekran görüntüleriyle iki tema kontrol edildi. Eksik (kırmızı), fazla (yeşil), turuncu/siyah düğmeler değişmedi.
- **Arka plan (ek istek):** sade beyaz arka plan yerine temanın renginde yumuşak ışık lekeleri + ince nokta dokusu (`globals.css`: `--bg-base`, `--bg-glow-*`, `--bg-dot`; Soğukkuyu mor, Bostanlı mavi, koyu mod için ayrı değerler). Sabit (sticky) arama şeridi artık yarı saydam + bulanık (`page.tsx`), arka planda beyaz bant görünmez. İki temada ekran görüntüsüyle kontrol edildi.
- **Kapsam dışı:** DPS grafiğindeki "Bayi DPS" çizgi rengi (`#7c3aed`, veri rengi) ve Chrome eklentisi aynı kaldı.

### Fiyat güncelleme — 2026-11-19 (kullanıcı isteği)
- **Ne:** katalogdaki ürün fiyatları Getir bayi stok listesinden (`/stocks`, toplu) güncellendi. Yeni betik `scripts/update-catalog-prices.mjs` (`npm run update-prices` rapor modu; `APPLY=1` ile yazar, yedek alır). Yalnızca okur (Getir + Firestore token okuma); Firestore'a yazmaz.
- **Sonuç (APPLY ile yazıldı):** `data/products.json` (Soğukkuyu stoğu): 4187 aynı, 1979 değişti, 425 ürüne ilk kez fiyat yazıldı, 1957 ürün stokta bulunamadı (eski fiyatı kaldı). `data/products-bostanli.json`: 6106 aynı, 1 değişti, 1 eklendi. Doğrulama: `products.json`'da yalnızca `price` alanı değişti (2404 ürün, başka alan farkı 0). Yedekler: `data/*.bak-before-price-update`.
- **Dikkat:** (1) %50'den büyük değişen 150 ürün var (ör. Cook Alüminyum Folyo 127,99→44,99); kampanya/eski veri olabilir. (2) Fiyat bu dosyalardan okunuyor; uygulamada görünmesi için dosyaların yayına gitmesi (push) gerekir, yalnızca "push yap" denince. (3) Firestore ek katalog (`supplemental_catalog_products`) fiyatlarına dokunulmadı.

### Eklenti 2.2.2 — 2026-11-19 — Paket arama düğmeye alındı (kullanıcı isteği)
- **Ne:** arama kutusu artık varsayılan olarak yalnızca küçük bir "Paket ara" düğmesi. Tıklayınca çubuk aşağı doğru animasyonla açılır ve giriş odaklanır. Çubuğun dışına (gerçek) tıklanınca, Esc'ye ya da düğmeye tekrar basınca kapanır; arama silinir, pano varsayılan görünüme döner.
- **Nasıl:** `content.js` `setBoardSearchOpen`; dış tıklama `pointerdown` (capture) ile dinlenir ve `isTrusted=false` olaylar yok sayılır (içerik taramasının sahte tıklamaları çubuğu kapatmaz). Panel yeniden çizimiyle çubuk yeniden kurulursa açık/yazı durumu korunur.
- **Test (sahte pano, gerçek Chrome):** varsayılan yalnızca düğme (34 px), açılış + odak, tarama sırasında açık kalma, içerik/BNK araması, dışarı tıklama/Esc/düğme ile kapanıp tüm kartların geri gelmesi, sayfa hatası yok. Gerçek panelde denenmedi.

### Eklenti 2.2.1 — 2026-11-19 — Eksik barkodlar (kullanıcı isteği)
- **Sorun:** sipariş penceresinde bazı ürünlerde "Barkod bulunamadı" çıkıyordu (Cif Krem Altın Işıltısı, Smarter Magic Mop, Smarter Pofidi, Banvit Piliç Salam). Sebep: eklenti kataloğu (`product-barcodes.js`) yalnızca `data/products.json`'dan üretiliyordu; bu ürünler `data/products-bostanli.json`'da vardı (Adım 8'de açık bırakılan nokta).
- **Çözüm:** `scripts/build-extension-catalog.mjs` artık `products-bostanli.json`'daki, Soğukkuyu listesinde olmayan ürünleri de ekliyor (ad, görsel, ürün kimliği). Soğukkuyu kayıtları değişmez; eski katalogla karşılaştırıldı: dört tabloda değişen 0, kaybolan 0 (ad 15884→27519, görsel 6992→10875, ürün kimliği 8446→14974). Dört ürün artık barkod çözüyor. Katalog 1,7 MB → 2,9 MB.
- **Not:** İki listede de olmayan yepyeni ürünlerde "Barkod ekle" düğmesi kalır; listeleri tazelemek için `sync-bostanli-catalog.mjs` / `sync-images` sonrası `npm run build-extension-catalog` çalıştırılır. Sürüm 2.2.1; `.rar` yine siz isteyince.

### Eklenti 2.2.0 — 2026-11-19 — Ana ekran paket arama kutusu (kullanıcı isteği)
- **Ne:** Kontrol Paneli'nde sekmelerle pano arasına arama kutusu. BNK kodu, kurye/toplayıcı adı, sipariş kodu ve paket içeriği (ör. "eker ayran") ile kartlar süzülür. Yeni özellik bayrağı `boardSearch` (Soğukkuyu ve Bostanlı açık; Bostanlı'da ayarlardan kapatılabilir).
- **Nasıl:** `content.js` "Ana ekran paket arama". Kart metni (aksan/büyük-küçük harf duyarsız, tüm kelimeler aranır) anında eşleştirilir; ürün içeriği kartta olmadığı için eşleşmeyen kartın sipariş penceresi CSS ile görünmez tutularak açılır, ürün adları okunur, pencere kapatılır, sonuç 15 dk önbelleğe yazılır (kart anahtarı = ilk bilgi satırı/sipariş kodu). Getir'in API yanıtı varsayılmadı; yalnızca ekrandaki pencere okunur. Eşleşmeyen kartlar `data-getirstok-search-hide` ile gizlenir.
- **Test (sahte pano, Playwright + gerçek Chrome):** BNK.050, kurye adı (aksansız), ürün içeriği (iki pakette Eker Ayran), önbellekten tekrar açmadan arama, sonuç yok, temizleme, modal/işaret artığı kalmaması, sayfa hatası yok. `test:extension-warehouses` 9/9. Gerçek Getir panelinde denenmedi.
- **Bilinen sınırlar:** (1) Kartlar gerçek panelde sipariş penceresini tıklamayla açmıyorsa içerik araması boş döner (BNK/kurye/kod araması yine çalışır). (2) Sütun başlığındaki sipariş sayıları süzmeden etkilenmez. (3) İlk içerik aramasında kart başına ~1 sn sürer. (4) Sürüm 2.2.0; `.rar` yine siz isteyince.

### Eklenti 2.1.0 — 2026-11-19 — Sayfa Görünümleri (kullanıcı isteği)
- **Ne:** ayarlar penceresine "Sayfa Görünümleri" eklendi. Bostanlı'da her sayfa/bölüm için Yeni görünüm / Eski görünüm (/ Gizli) seçilir; parola kilidi ve "Soğukkuyu değişmez" kuralı aynen geçerli. Sayfalar: Sol menü, Kontrol Paneli üst sekmeleri, Sipariş panosu, Kurye/toplayıcı paneli, Sipariş detayı penceresi, Sayım detayı penceresi (yeni/eski); Satıştan Kaldırma, Ürün Son Kullanma Tarihleri, Sayım Listesi, İade Siparişler (yeni/eski/gizli).
- **Nasıl:** `warehouses.js` `PAGE_VIEWS` + `pageViewFor` (Soğukkuyu ve tanınmayan depo her zaman "yeni"; geçersiz mod yok sayılır). `content.js`: eski görünüm = eklentinin eklediği `data-getirstok-*` işaretleri, sınıflar ve elemanlar kaldırılır (`revertPageView`) ve sayfanın decorate işi yapılmaz; gizli = sayfanın ana kartı `display:none` (yerine hiçbir yazı konmaz). Yerleşim stili dört bölüme ayrıldı (sol menü / sekmeler / pano / kurye), her biri ayrı `<style>`. Seçimler `chrome.storage.local.pageViews`; değişiklik açık sayfalara sayfa yenilemeden uygulanır. "Sadeleştirilmiş görünüm" kapalıysa hepsi eski görünüm. Kayıtlı ayarlar okunana kadar sayfa "hazır" işaretlenmez (yanlış görünüm bir an bile çıkmasın).
- **Test (sahte Getir sayfaları, Playwright + gerçek Chrome):** Soğukkuyu ve Bostanlı varsayılan görünümde eski eklentiyle (2.0.0) birebir aynı çıktı (8/8: gövde, stiller, hazır işareti, gönderilen mesajlar). Bostanlı'da hepsi "eski" iken sayfa eklentisiz haline birebir eşit (4/4) ve yerleşim stili yok. Gizli: kart gizli, hiçbir not/yazı yok; canlı olarak yeniye ve eskiye dönülür (3 sayfa). Sayım Listesi gizli, bölüm bazlı eski görünüm, Soğukkuyu seçimi yok sayar, layout kapalıyken hiç işaret yok. Ayarlar penceresi: 10 satır, kilitliyken yazılmaz, kayıt/sıfırlama. `test:extension-warehouses` 9/9, `test:extension-background` 11/11. Gerçek Getir panelinde denenmedi.
- **Bilinen sınırlar:** (1) "Gizli" yan menüdeki bağlantıyı kaldırmaz, yalnızca sayfa içeriğini gizler; Getir'in sayfa kartı tablo bulunamazsa (yükleniyor) kısa süre görünebilir. (2) Sipariş detayı penceresi "eski" iken seçili metinden "Ürün ID bul" balonu da çıkmaz (pencere işaretine bağlı). (3) Eski görünümde Satıştan Kaldırma'nın varsayılan tarih/sayfa boyutu ayarı ve Sayım detayında 100 satır/SKT stok sütunu uygulanmaz. (4) Sayım Listesi "Onayla" düğmesi yalnızca yeni görünümde var. (5) Sürüm 2.1.0; `.rar` paketi yine siz isteyince.
- **Barkod tarayıcı yenilendi (ek istek):** bazı telefonlarda kamera yarım görünüyor, bazılarında barkodu okumuyordu. `BarcodeScanner.tsx` baştan yazıldı: kendi `video` görünümü (kare zorlaması ve boyut değiştiren kısıtlar yok, kamera çerçeveyi tam dolduruyor), hedef kutusunun içi tam çözünürlükte kırpılıp çözülüyor, telefonda yerleşik `BarcodeDetector` varsa o, yoksa ZXing (ham / eşiklenmiş / kenarları temizlenmiş kareler sırayla). Kamera açılmazsa farklı kısıtlarla yeniden deneme ve Türkçe hata + `Tekrar dene` düğmesi. Sahte kamerayla 390x844, 360x640 ve masaüstünde denendi; gerçek telefonda denenmedi.
- **Ana ekran üst kart ve SKT uyarısı yenilendi (ek istek):** başlık yazısı/ikonu kaldırıldı (ekran okuyucu için gizli başlık duruyor); depo seçici + DPS özeti + işlem düğmeleri baştan düzenlendi (mobilde iki eşit sütun). SKT uyarısı `ExpiringAlertBanner.tsx`: mobilde kartın içinde şerit, geniş ekranda sağ altta sabit rozet; halka dalgası + turuncu/kırmızı geçiş + ışık süpürmesi + çalan zil animasyonu (`globals.css` `.skt-alert*`; "hareketi azalt" ayarında animasyon kapalı). Tıklayınca açılan pencere (`ExpiringProductNotification.tsx`) yeniden tasarlandı: mobilde alttan açılan sayfa, geniş ekranda ortada pencere, arka plan karartması, Esc/dışarı tıklayınca kapanır, tarihler "3 Ara 2026" biçiminde.
- **Mobil liste düzeni (ek istek):** mobilde listeler iç kaydırma kutusunda değil sayfanın kendi akışında (`sm:` ve üstünde eski 55vh kutu aynı). Kök hata: `body`'de `overflow-x: hidden` (`html` ile birlikte) `position: sticky`'yi bozuyordu, ayrıca `flex-1` kaydırma alanında `min-h-0` yoktu (Kasa/Palet ve Sayım'da sayfada büyük boşluk). Düzeltmeler: `overflow-x: clip`; arama çubuğu artık gerçekten üstte sabit; sekme şeridi mobilde tek satır yatay kayar ve seçili sekmeyi ortalar; Eksik/Fazla mobil kartı kompakt (resim + bilgi solda, düzenle/sil sağda); Kasa/Palet "Sayım oluştur" düğmesi mobilde ekranın altında sabit.
- **Mobil liste düzeltmeleri 2 (ek istek):** sekme şeridi yana kaydırma yerine mobilde 3 sütunlu düzenli iki satır (Bostanlı'da 3+2), geniş ekranda eski tek satır; şerit arama çubuğunun hemen altında üstte sabit (çubuk yüksekliği `--search-strip-h` değişkeniyle ölçülüyor); `ScrollToTopButton.tsx`: 500 px sonrası sağ altta "en üste çık" düğmesi (Kasa/Palet sabit düğmesinin ve SKT rozetinin üstünde durur); mobil Eksik/Fazla kartında onay kutusu resmin ortasına hizalandı.
- **Sekme simgeleri (ek istek):** altı sekmenin hepsine simge (Eksik: PackageX, Fazla: PackagePlus, SKT: CalendarClock, Sayım: Scale, Kasa/Palet: ClipboardList, İstatistik: BarChart3); seçilen sekmenin simgesi zıplayarak belirir ve hafifçe süzülür, alt çizgi ortadan açılır, seçili olmayanlar üstüne gelince oynar (`globals.css` `.tab-*`; "hareketi azalt" ayarında kapalı). Sekmeler artık `PANEL_TABS` listesinden çiziliyor; mobilde 3 sütunlu ızgara (360 px dahil taşma yok).
- **Sevkiyat kontrol penceresi yenilendi (ek istek):** `SevkiyatControlWizard.tsx` yalnızca görünüm olarak yeniden tasarlandı (mantık/veri akışı aynı). Mobilde alttan açılan sayfa, geniş ekranda ortada pencere; koyu-mor gradyan başlık (kamyon simgesi, depo rozeti, bulunulan adım yazısı) + 3 adımlı ilerleme çubuğu (Tarih / Seçim / Sonuç). Tarih adımı: Dün/Bugün/Yarın kısayolları + okunur tarih ("20 Kasım 2026 Cuma") + tarih kutusu; seçim adımı: seçili tarih + "Değiştir" ve iki büyük seçenek kartı; sonuç adımında beyaz kartlar, adet/eksik rozetleri, arama + sıralama çubuğu liste kayarken üstte sabit. Tarih/seçim adımlarında pencere içeriğe göre kısalır (büyük boş alan yok). "Gelen ürünler" listesinin yavaşlığına DOKUNULMADI (önce danışılacak).
- **Sevkiyat "Gelen ürünler" hızlandırma (ek istek, A+B+C+D):** (A) `catalogBarcodeMatch.ts` `buildCatalogImageIndex`: barkod → görsel dizini katalog değişince bir kez kurulur, `page.tsx` `getCatalogProductImage` artık her satırda tüm kataloğu taramıyor (ilk eşleşen ürün kazanır, eski `find` ile aynı sonuç; ana listeler de hızlandı). (B) Liste ilk 40 satırla çizilir; sona gelince otomatik (IntersectionObserver) veya "Daha fazla göster" ile 40'ar eklenir (tüm ürünler ve palet içi liste). (C) `sevkiyatMatch.ts` arama metni ürün başına bir kez hazırlanır (WeakMap önbellek), arama kutuları yazmayı bırakınca (200 ms) süzer. (D) Türkçe `Intl.Collator` bir kez oluşturulur; palete göre sıralama yalnızca seçilince ve bir kez hesaplanır, arama sırayı bozmadığı için yeniden sıralanmaz. Ayrıca tarih adımından "Yarın" kısayolu kaldırıldı (sevkiyat yüklendikten ~1 saat içinde gelir). Test: `test:sevkiyat-match` 13/13; 3000 ürünlü sahte sevkiyatla liste ~120 ms'de açıldı, 40 satır çizildi, kaydırınca yükleniyor, arama/sıralama/palet detayı sorunsuz.
- **Sevkiyat: palet başına adet (ek istek):** "Eksik ürünler" kartında artık `K0011524466 paletinde 15 adet bu üründen var` yazar. `getirWarehouseTransferService.ts`: her ürün satırının adedi, satır tek palete aitse o palete yazılır (`palletQuantities`), teslimatlar birleşirken palet bazında toplanır; satır birden fazla palete aitse adet paylaştırılamaz (null) ve kart eski "paletinde var" yazısına döner (ürün zaten tek paletteyse toplam adet gösterilir). `sevkiyatMatch.ts`: `palletQuantityFor`. API yanıtına `palletQuantities` alanı eklendi (eski alanlar aynı). Test: `test:sevkiyat-match` 15/15; gerçek Getir verisi (19 Kasım, salt okuma): 335 ürün, palet adetleri toplamı tüm ürünlerde toplam adede eşit, bilinmeyen adet yok. Not: "Gelen ürünler" ve palet detayı ekranlarındaki adet hâlâ ürünün tüm paletlerdeki toplamıdır (isteğe bağlı iyileştirme).
- **Sevkiyat eşleştirme: elle eklenen / katalogda olmayan ürünler (ek istek):** Sorun: Getir teslimat detayı satırlarında yalnızca ürün ID'si ve adet var (ad/barkod yok); adı/barkodu yalnızca bizim katalogdan (products.json + supplemental) buluyorduk. Katalogda olmayan ürünler (elle eklenenler dahil) "Ürün 6e65f7" gibi adsız/barkodsuz kalıyor, "Eksikleri bul" eşleşmesi kaçırıyordu (19 Kasım'da 335 üründen 11'i; elle eklenen 8006530170062, 8698529301443, 8690120059945 için barkod→ürün ID eşlemesi de hiçbir yerde yoktu). Çözüm: `getirApiService.ts` `getGetirStockProductInfoByProductIds` + `getirWarehouseTransferService.ts` `enrichTransferProductsFromStock`: katalogdan sonra, kalan ürün ID'lerinin adı, TÜM barkodları (`packagingInfo.*.barcodes`) ve görseli deponun stok kaydından alınır (100'lük parçalar, 4 paralel; hata olursa sessizce atlanır, sevkiyat yine çalışır). API yanıtına `barcodes` ve `imageUrl` eklendi. `sevkiyatMatch.ts`: eşleşme artık ürünün herhangi bir barkoduyla ve baştaki sıfır farkıyla (EAN-13 / GTIN-14) yapılır; ad eşleşmesi yedek olarak duruyor; "Gelen ürünler" araması da ek barkodlara bakar ve görseli olmayan satırda Getir görselini gösterir. Test: `test:sevkiyat-match` 17/17; gerçek veri (salt okuma, 16-19 Kasım): barkodsuz ürün 0 (önceden 9-21), yer tutucu ad 0 (örn. Torku Labne, Prima Bebek Bezi artık adıyla/barkoduyla geliyor); süre ~1 sn artıyor (~2,4 sn). Not: sorduğun 3 barkod 16-19 Kasım sevkiyatlarında yoktu, bu yüzden canlıda o ürünlerle eşleşme görülemedi; aynı durum birim testle (ek barkod + GTIN-14) doğrulandı. Sınır: Getir'in stok kaydı olmayan (depoya hiç tanımlanmamış) ürün ID'leri yine adsız kalır.

- **Eklenti 2.2.3: Soğukkuyu Sayım penceresi kaydırma (ek istek):** Sayımdaki ürünler (50) penceresinde liste kaymıyordu. Pencere gövdesine (.ant-drawer-body) doğrudan yükseklik sınırı (calc(min(88vh,900px) - 64px)) + overflow-y: auto verildi, içindeki kart/tablo sarmalayıcılarının kendi yükseklik/kaydırma sınırı kaldırıldı; böylece kaydırma üst kutuların yükseklik hesabına bağlı değil. Sahte antd yapısında 50 satır kayıyor; gerçek Getir sayfasında kullanıcı doğrulaması bekleniyor. Satıştan Kaldırma ve Pişirme sayfalarındaki bozukluk için neden bulunamadı (stil kodu son commit ile aynı); kullanıcıdan bilgi bekleniyor.

- **Eklenti 2.2.4: Satıştan Kaldırma tablosunda sağdaki boşluk (ek istek):** Gizlenen sütunların (Tedarikçi, Birim, Sonuç Tipi, seçim) hücreleri gizlenince kalan hücreler sola kayıyor, ama tablonun <colgroup> kayıtları duruyordu; 	able-layout: fixed bu boş sütunlara da genişlik verip sağda boş şerit bırakıyordu. Düzeltme: markColgroupColumns gizli sütunların <col> kaydına da aynı işareti koyar (CSS onu da gizler); Satıştan Kaldırma, Ürün Son Kullanma, Sayım Listesi ve İade Siparişler tablolarına uygulandı. Test: sahte sabit düzenli tabloda eski halde ürün sütunu 181 px ve sağda ~720 px boşluk, yeni halde 767 px ve tablo sonuna kadar dolu. Gerçek Getir sayfasında kullanıcı doğrulaması bekleniyor.

- **Eklenti 2.2.5: Pişirme Önerileri sade görünümü geri geldi (ek istek):** Getir antd'yi güncellemiş; açılır satır başlığındaki metin kutusunun sınıfı .ant-collapse-header-text iken .ant-collapse-title oldu. Eklenti satırı bu sınıftan bulduğu için decorateBakeItem sessizce çıkıyor, kısa ad / Raf-Donuk stoğu / adet rozeti / Beni pişir uyarısı hiç çizilmiyordu (kartlar Getir'in kendi görünümünde kalıyordu). Düzeltme: decorateBakeItem ve bake CSS'i iki sınıfı da destekler (:is(.ant-collapse-header-text, .ant-collapse-title)); Satıştan Kaldırma/Sayım Listesi Filtreler başlık stili de aynı sınıfı kullandığı için güncellendi. Test: kullanıcının verdiği gerçek HTML yapısına göre kurulan sahte sayfada (eklentinin gerçek kodu çalıştırıldı) 4 satırın hepsi kısa ad + adet rozeti ile çiziliyor, 0 adetli satır soluk, Getir'in orijinal adı gizli. Gerçek sayfada kullanıcı doğrulaması bekleniyor. Not: Getir arayüz sürümü değiştiği için başka sayfalardaki sınıf adı varsayımları da kayabilir.

- **Eklenti 2.2.6: Satıştan Kaldırma sağ boşluk + gizli filtreler (ek istek):** Getir antd'de sabit sütun sınıfını ant-table-cell-fix-right yerine ant-table-cell-fix-end yaptı; eklenti boş başlıklı son sütunu (+ düğmesi) 'action' diye tanıyamıyordu, sütun genişliği/düğme stili verilmiyor ve fixed tabloda artan genişlik sağda boşluk bırakıyordu. Düzeltme: Satıştan Kaldırma ve Sayım Listesi tablolarında ve Sayım görev penceresi CSS'inde iki sınıf da kabul edilir. Ayrıca Select'lerde aria-label artık kapsayıcıda değil içteki input'ta; Depo/Sebep/Alt Neden/Tedarikçiler filtrelerinin gizlenmesi :has(input[aria-label=...]) ile yeniden çalışır, yeni antd select kenarlık/placeholder stili eklendi. Test: gerçek yeni antd yapısına göre kurulan sahte sayfada (eklentinin gerçek kodu) eylem sütunu 58 px, 4 filtre gizli, 3 sütun gizli. Gerçek sayfada kullanıcı doğrulaması bekleniyor.

- **Eklenti 2.2.7: Sayım Listesi yeni antd uyumu (ek istek):** Yeni antd'de seçim sütunundan sonra başlıksız boş bir sütun daha geliyor; eklenti bunu tanımadığı için tabloda boş bir şerit kalıyordu. Boş başlıklı sütunlar artık 'blank' diye işaretlenip gizleniyor. 'Kayıtlı aramalar' kutusunun aria-label'ı sarmalayıcıdan içteki input'a taşındığı için gizlenmiyordu; :has(...) ile (sadece o kutuyu kapsayan öğe) gizleniyor. Filtre gizleme (Kapsam/Durum/Depo/İş/Sebep) yeni .ant-select-placeholder sınıfını ve içteki input'un aria-label'ını da okuyor; Ürünler (arama kutusu) ürün bulma için ürün filtresi seçici de kayıtlı arama kutusunu dışarıda tutuyor. Filtreler açılır panelinin içerik sınıfları (ant-collapse-content/-box → ant-collapse-panel/-body) Satıştan Kaldırma, Sayım, Ürün Son Kullanma ve Pişirme stillerinde iki isimle de destekleniyor. Test: kullanıcının verdiği gerçek Sayım Listesi HTML'si (eklenti işaretleri temizlenerek) sahte sayfaya yüklenip eklentinin gerçek kodu çalıştırıldı: boş/ID/Depo/İş/3PL/Oluşturan sütunları gizli, Durum/Yüzde/Otomatik/Tarih/+ görünür, kayıtlı arama kutusu gizli, tarih aralığı + Ürünler + Otomatik Sayım filtresi görünür. Test sırasında yeni kuralın yanlışlıkla Filtreler panelinin tamamını gizlediği görüldü ve düzeltildi. Gerçek sayfada kullanıcı doğrulaması bekleniyor.

- **Eklenti 2.2.8: Sayım detayı penceresi yeni antd çekmece yapısı (ek istek):** Kullanıcının verdiği pencere gövdesi HTML'sinde eklentinin işaretleri (Sayım Detayı/Detaylar bölümü gizli, tablo sütunları, stok etiketleri) zaten çalışıyor; yalnızca pencere kabuğu (çerçeve) için yazılan CSS eski antd'nin .ant-drawer-content + .ant-drawer-wrapper-body sınıflarına bağlıydı. Yeni antd bunları tek .ant-drawer-section'a çevirmiş (flex sütun, height:100%, overflow:auto). Ortadaki pop-up'ın köşe yuvarlaması, yükseklik sınırı ve iç kaydırma kuralları artık iki yapıyı da kapsıyor (:is(.ant-drawer-content, .ant-drawer-section), :is(.ant-drawer-wrapper-body, .ant-drawer-section)). Test: sadece sözdizimi kontrolü (node --check); pencere kabuğunun gerçek HTML'i verilmediği ve antd CSS'i olmadığı için görsel test yapılamadı, gerçek sayfada kullanıcı doğrulaması bekleniyor.

- **Eklenti 2.2.9: Özelleştirme her depoda ve her bilgisayarda; kritik özellikler kilitli (ek istek):** Ayarlar penceresi yalnızca Bostanlı için çalışıyordu (Soğukkuyu sabitti). Artık açık sekmedeki (yoksa son görülen) tanınan depo, Soğukkuyu ya da Bostanlı, için Sadeleştirilmiş görünüm, paket arama, pişirme rozeti/sesi, barkod, toplama modu, SKT stok sütunu ve Sayfa Görünümleri ayarlanabiliyor. Seçimler chrome.storage.local'de tutulur: yalnızca eklentinin yüklü olduğu bilgisayardaki tarayıcıya özeldir, başka bilgisayara/hesaba geçmez, sunucuya gitmez. Kritik özellikler (Token gönderimi, Sevkiyat yakalama, Fırın istatistiği) kilitlendi: ayarlar penceresinde gösterilmez, eskiden kaydedilmiş 'kapalı' seçim varsa da warehouses.js onu yok sayar (tanınan depoda her zaman açık, tanınmayan depoda eskisi gibi kapalı). warehouses.js'ye LOCKED_FEATURES / EDITABLE_FEATURE_NAMES eklendi; parola kilidi korundu. Test: npm run test:extension-warehouses ve test:extension-background (11/11 ve 11/11, ilgili testler yeni kurala göre güncellendi: Soğukkuyu seçimi geçerli, token/sevkiyat seçimle kapatılamaz); popup sahte chrome ile açılıp Soğukkuyu sekmesinde 6 ayarın listelendiği ve bir seçimin yalnızca o depoya kaydedildiği doğrulandı. Gerçek eklentide kullanıcı doğrulaması bekleniyor.
