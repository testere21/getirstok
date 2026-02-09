# Getir API Debug Rehberi

## Sorun
Şu anda tüm stokları çekip (4.7 milyon ürün) içinde barkod arıyoruz. Bu çok yavaş ve verimsiz.

## Doğru Yaklaşım
Getir panelinde stok sorgulama işlemi şöyle yapılıyor:
1. Sol tarafta "Stok" sekmesine tıklanıyor
2. "Mevcut Stok" sayfası açılıyor
3. "Ürün seçiniz" yazan yere barkod yazılıyor
4. Ürün listeleniyor
5. Listelenen ürün seçiliyor
6. Sağdaki "Getir" butonuna tıklanınca stok görünüyor

## Yapılması Gerekenler

### 1. Network Request'leri İnceleme

Getir panelinde (`franchise.getir.com`) şu adımları izleyin:

1. **Chrome DevTools'u açın** (F12)
2. **Network sekmesine** gidin
3. **"Preserve log"** seçeneğini işaretleyin
4. **"Filter"** kısmına `getirapi.com` yazın (sadece Getir API isteklerini görmek için)

#### Adım 1: Barkod ile Ürün Arama
1. Sol tarafta "Stok" sekmesine tıklayın
2. "Mevcut Stok" sayfasını açın
3. "Ürün seçiniz" yazan yere bir barkod yazın (örn: `5000112664782`)
4. Network sekmesinde yeni bir istek görünecek
5. Bu isteğe tıklayın ve şunları not edin:
   - **Request URL**: Tam URL nedir?
   - **Request Method**: GET mi POST mu?
   - **Request Headers**: Authorization header'ı var mı?
   - **Request Payload/Body**: Body'de ne var? (POST ise)
   - **Query Parameters**: URL'de hangi parametreler var? (GET ise)
   - **Response**: Response'da ne dönüyor? (JSON formatında)

#### Adım 2: "Getir" Butonuna Tıklama
1. Listelenen ürünü seçin
2. Sağdaki "Getir" butonuna tıklayın
3. Network sekmesinde yeni bir istek görünecek
4. Bu isteğe tıklayın ve şunları not edin:
   - **Request URL**: Tam URL nedir?
   - **Request Method**: GET mi POST mu?
   - **Request Headers**: Authorization header'ı var mı?
   - **Request Payload/Body**: Body'de ne var? (POST ise)
   - **Query Parameters**: URL'de hangi parametreler var? (GET ise)
   - **Response**: Response'da ne dönüyor? (JSON formatında)

### 2. Bilgileri Paylaşma

Aşağıdaki bilgileri paylaşın:

#### Barkod Arama İsteği:
```
URL: ...
Method: ...
Headers: ...
Body/Query: ...
Response (ilk 500 karakter): ...
```

#### Stok Getirme İsteği:
```
URL: ...
Method: ...
Headers: ...
Body/Query: ...
Response (ilk 500 karakter): ...
```

### 3. Alternatif: Console'da İnceleme

Eğer Network sekmesinde göremiyorsanız, Console'da şunu deneyin:

```javascript
// Tüm fetch isteklerini yakala
const originalFetch = window.fetch;
window.fetch = function(...args) {
  console.log('Fetch:', args);
  return originalFetch.apply(this, args);
};

// Şimdi barkod yazın ve "Getir" butonuna tıklayın
// Console'da tüm fetch istekleri görünecek
```

## Beklenen Sonuç

Muhtemelen şu endpoint'lerden biri kullanılıyor:
- `/stocks?barcode=...` (GET ile barkod parametresi)
- `/stocks/search` (POST ile body'de barkod)
- `/products?barcode=...` (GET ile ürün arama)
- `/products/search` (POST ile body'de barkod)

Bu bilgileri aldıktan sonra, `getirApiService.ts` dosyasını güncelleyeceğiz ve doğru endpoint'i kullanacağız.

