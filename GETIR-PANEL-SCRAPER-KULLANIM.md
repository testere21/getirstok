# Getir Panelinden Ürün Çekme Rehberi

## Hızlı Başlangıç

### 1. Getir Paneline Gidin
- `warehouse.getir.com` adresine gidin
- Giriş yapın
- **"Raf Etiketi"** veya **"shelf-label/list"** sayfasına gidin
- URL şöyle olmalı: `warehouse.getir.com/r/5dc32d8b734a192200caddf8/stock/stock-management/shelf-label/list`

### 2. Console'u Açın
- **F12** tuşuna basın
- **Console** sekmesine gidin

### 3. Script'i Çalıştırın
- `scripts/getir-panel-scraper-console.js` dosyasını açın
- **TAMAMINI** kopyalayın (Ctrl+A, Ctrl+C)
- Console'a yapıştırın (Ctrl+V)
- **Enter** tuşuna basın

### 4. Otomatik Başlatma
Script yüklendikten sonra otomatik başlamaz. Başlatmak için console'da şunu yazın:
```javascript
startScraping();
```

## Ne Yapar?

1. ✅ Tüm sayfaları tarar (1'den son sayfaya kadar)
2. ✅ Her sayfadaki ürünleri çeker:
   - Barkod
   - Ürün ID
   - Ürün adı
   - Görsel URL
3. ✅ `products.json` dosyasına kaydeder
4. ✅ Mapping'leri Firestore'a kaydeder (barkod → ürün ID)

## Çıktı

Console'da şunları göreceksiniz:
```
🚀 Ürün çekme başlatılıyor...
📚 Toplam 80 sayfa bulundu
✅ Sayfa 1/80: 100 ürün, 100 mapping eklendi
✅ Sayfa 2/80: 100 ürün, 100 mapping eklendi
...
🎉 Çekme tamamlandı!
📦 Toplam 7800 ürün
🔗 Toplam 7800 mapping
```

## Sorun Giderme

### ❌ "Satır bulunamadı" Hatası
- Sayfanın tamamen yüklendiğinden emin olun
- Sayfayı yenileyin (F5)
- Script'i tekrar çalıştırın

### ❌ "Sonraki sayfaya geçilemedi" Hatası
- Sayfa numarasını kontrol edin
- Manuel olarak sonraki sayfaya geçip script'i tekrar çalıştırın

### ❌ API Hatası
- Dev server'ın çalıştığından emin olun: `npm run dev`
- Console'da hata mesajını kontrol edin

### ⚠️ Script Yavaş Çalışıyor
- Normal! Her sayfa için 2-3 saniye bekliyor
- 80 sayfa için ~3-4 dakika sürebilir
- Sabırlı olun!

## Sonuç

Script tamamlandıktan sonra:
1. ✅ `data/products.json` dosyası güncellenmiş olacak
2. ✅ Firestore'da mapping'ler kaydedilmiş olacak
3. ✅ Artık hızlı stok sorgulama yapabilirsiniz!

## Test

Mapping'lerin kaydedildiğini test etmek için:
1. Test sayfasını açın: `test-getir-stock.html`
2. "Test 3: Barkod ile Stok Sorgulama" butonuna tıklayın
3. Eğer hızlı sonuç dönerse, başarılı! 🎉

