# Getir Token Yakalayıcı - Chrome Eklentisi

Bu Chrome eklentisi, Getir Bayi Paneli (franchise.getir.com) ve Getir Depo Paneli (warehouse.getir.com) Authorization Bearer token'larını ayrı ayrı yakalayıp getirstok.netlify.app API'sine gönderir.

## Kurulum

1. Chrome'da `chrome://extensions/` adresine git
2. Sağ üstteki "Developer mode" toggle'ını aktif et
3. "Load unpacked" butonuna tıkla
4. Bu `chrome-extension` klasörünü seç
5. Eklenti yüklenecek

## Kullanım

### Bayi Paneli (Franchise) Token Yakalama

1. `franchise.getir.com` adresine git ve giriş yap
2. **Stocks** sayfasını aç (veya stocks API'sine istek yapan herhangi bir sayfa)
3. Eklenti otomatik olarak Authorization token'ını yakalayacak
4. Token yakalandığında:
   - Sağ üstte yeşil bir bildirim görünecek
   - Eklenti ikonunda yeşil bir "✓" işareti görünecek
   - Token otomatik olarak API'ye gönderilecek

### Depo Paneli (Warehouse) Token Yakalama

1. `warehouse.getir.com` adresine git ve giriş yap
2. **Products** sayfasını aç (veya products API'sine istek yapan herhangi bir sayfa)
3. Eklenti otomatik olarak Authorization token'ını yakalayacak
4. Token yakalandığında:
   - Sağ üstte yeşil bir bildirim görünecek
   - Eklenti ikonunda yeşil bir "✓" işareti görünecek
   - Token otomatik olarak API'ye gönderilecek

## Popup Arayüzü

Eklenti ikonuna tıklayarak popup'ı açabilirsiniz. Popup'ta:

- **Bayi Paneli (Franchise)** bölümü: Bayi paneli token durumunu gösterir
- **Depo Paneli (Warehouse)** bölümü: Depo paneli token durumunu gösterir

Her panel için:
- Token yakalandıysa: Yeşil kutu ile "Token yakalandı!" mesajı
- Token yakalanmadıysa: Kırmızı kutu ile "Token henüz yakalanmadı" mesajı
- Token bilgisi: Token'ın ilk 30 karakteri
- Yakalanma zamanı: Token'ın yakalandığı tarih ve saat
- "Token Test Et" butonu: Token'ı manuel olarak API'ye göndermek için

## Dosya Yapısı

- `manifest.json` - Eklenti yapılandırması
- `background.js` - Service worker (token yakalama ve API'ye gönderme)
- `content.js` - Content script (sayfada bildirim gösterme)
- `popup.html` - Eklenti popup arayüzü
- `popup.js` - Popup script (token durumunu gösterme)
- `warehouses.js` - Depo tablosu (Soğukkuyu, Bostanlı) ve depo başına özellik bayrakları

## Depolar ve özellikler (2.1.0)

Tek eklenti iki depoda da çalışır. Depo, sayfa adresindeki `/r/{depo kimliği}/` bölümünden anlaşılır; adreste yoksa en son görülen depo kullanılır. Tanınmayan depoda yalnızca temel düzen çalışır, hiçbir şey sunucuya gönderilmez.

| Özellik | Soğukkuyu | Bostanlı |
| --- | --- | --- |
| `layout` (düzen düzeltmeleri) | açık | açık |
| `boardSearch` (Kontrol Paneli'nde paket arama kutusu) | açık | açık |
| `bakery` (Fırın sekmesi) | açık | açık |
| `bakeryStats` (Fırın istatistiği) | açık | açık |
| `tokenSync` (token gönderimi) | açık | açık |
| `transferCapture` (Sevkiyat için transfer yakalama) | açık | açık |
| `barcodeSearch` (sipariş barkod arama) | açık | kapalı |
| `picking` (Toplama / TM düğmesi, barkod aramaya bağlı) | açık | kapalı |
| `expiryStock` (SKT stok sütunu) | açık | kapalı |

Eklenti ikonuna tıklayınca açılan pencerenin altındaki **Depo Özellikleri** bölümünden açık sekmedeki (yoksa son görülen) **tanınan depo** için, yani Soğukkuyu ya da Bostanlı, her özelliği "Varsayılan / Açık / Kapalı" yapabilirsiniz. Seçimler yalnızca eklentinin yüklü olduğu bu bilgisayardaki tarayıcıya aittir (başka bilgisayara geçmez). `bakeryStats`, `tokenSync` ve `transferCapture` kilitlidir: pencerede gösterilmez, kayıtlı bir seçim olsa bile her zaman açıktır. Ayarlar parola ile korunur (parola girilmeden seçimler kilitli kalır, pencere kapanınca tekrar kilitlenir). Seçimler `chrome.storage.local` içindeki `featureOverrides` alanında durur; değişiklikten sonra açık Getir depo sayfalarını yenileyin. Tanınmayan depolarda seçim dikkate alınmaz.

### Paket arama kutusu (Kontrol Paneli)

Sipariş panosunun üstünde küçük bir **Paket ara** düğmesi durur; tıklayınca arama çubuğu aşağı doğru açılır. Çubuğun dışına tıklanınca (ya da Esc / düğmeye tekrar basılınca) çubuk kapanır, arama silinir ve pano varsayılan görünümüne döner. Yazılanlara göre kartlar süzülür: **BNK.050** gibi lokasyon, kurye ya da toplayıcı adı, sipariş kodu ve **paket içeriği** (ör. "eker ayran"; birden çok kelimede hepsi aranır, Türkçe harf farkı önemsenmez). Kartta ürün adı görünmediği için eşleşmeyen kartların sipariş pencereleri görünmeden açılıp okunur ve kapatılır (üstte "içerikler okunuyor" yazar); okunanlar 15 dakika önbellekte kalır, sonraki aramalar anında sonuç verir. "Temizle" yazıyı siler. Ayarlardan "Ana ekranda paket arama kutusu" ile kapatılabilir.

### Sayfa görünümleri

Aynı bölümün altındaki **Sayfa Görünümleri** ile Bostanlı'da her sayfa/bölüm için görünüm seçilir (varsayılan: Yeni görünüm). Soğukkuyu hep yeni görünümdedir.

| Sayfa / bölüm | Seçenekler |
| --- | --- |
| Sol menü, Kontrol Paneli üst sekmeleri, Sipariş panosu, Kurye / toplayıcı paneli, Sipariş detayı penceresi, Sayım detayı penceresi | Yeni görünüm / Eski görünüm |
| Satıştan Kaldırma, Ürün Son Kullanma Tarihleri, Sayım Listesi, İade Siparişler | Yeni görünüm / Eski görünüm / Gizli |

- **Yeni görünüm:** eklentinin sadeleştirilmiş hali.
- **Eski görünüm:** Getir'in kendi hali; eklenti o sayfaya dokunmaz, daha önce eklediklerini kaldırır.
- **Gizli:** sayfanın ana kartı gizlenir, yerine hiçbir yazı konmaz (yan menüdeki bağlantı kalır).
- "Sadeleştirilmiş görünüm" özelliği kapalıysa tüm sayfalar eski görünümdedir. Seçimler `pageViews` alanında tutulur; değişiklik açık sayfalara hemen uygulanır (olmazsa sayfayı yenileyin).

Token ve sevkiyat verisi ilgili depo kimliğiyle gönderilir; Bostanlı verisi Soğukkuyu kaydını ezmez. Pişirme önerisini panele yükleme özelliği kaldırıldı.

## Development vs Production

**Development (Local Test):**
- API endpoint: `http://localhost:3000/api/token/save`
- `background.js` ve `popup.js` dosyalarında `API_ENDPOINT` değişkenini kontrol edin
- Local development server çalışıyor olmalı (`npm run dev`)

**Production:**
- API endpoint: `https://getirstok.netlify.app/api/token/save`
- Production'a deploy etmeden önce `background.js` ve `popup.js` dosyalarındaki `API_ENDPOINT` değişkenini production URL'ine güncelleyin

## Token Yönetimi

- **İki panel bağımsız:** Bayi paneli ve depo paneli token'ları ayrı ayrı yakalanır ve kaydedilir
- **Token süresi:** Token'lar genellikle 12-24 saat geçerlidir
- **Token yenileme:** Token süresi bittiğinde, ilgili panel sayfasını yenileyerek yeni token yakalanabilir
- **Storage:** Token'lar Chrome'un local storage'ında saklanır (sadece eklenti içinde)
  - Bayi paneli: `lastToken_franchise`
  - Depo paneli: `lastToken_warehouse`

## Notlar

- Eklenti sadece belirli endpoint'lere giden istekleri dinler:
  - Bayi Paneli: `franchise-api-gateway.getirapi.com/stocks*`
  - Depo Paneli: `warehouse-panel-api-gateway.getirapi.com/*/products*`
- Token'ın ilk 20 karakteri console'da loglanır (güvenlik için tam token loglanmaz)
- Token formatı kontrol edilir (eyJ ile başlamalı ve en az 50 karakter olmalı)
