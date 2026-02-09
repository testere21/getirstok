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
