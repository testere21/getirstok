# Temiz Ürün Çekme Rehberi

## 🧹 Temiz Başlangıç

### 1. Mevcut Verileri Yedekle (Opsiyonel)
```bash
# PowerShell'de:
Copy-Item data/products.json data/products.json.backup
```

### 2. Getir Paneline Gidin
- `warehouse.getir.com` → Giriş yapın
- **"Raf Etiketi"** veya **"shelf-label/list"** sayfasına gidin
- **1. sayfada** olduğunuzdan emin olun

### 3. Console'u Açın
- **F12** → **Console** sekmesi

### 4. Script'i Yükleyin
- `scripts/getir-panel-scraper-console.js` dosyasını açın
- **TAMAMINI** kopyalayın (Ctrl+A, Ctrl+C)
- Console'a yapıştırın (Ctrl+V)
- **Enter** tuşuna basın

### 5. Verileri Temizle (Eğer Gerekirse)
Console'da:
```javascript
clearData();
```

### 6. Başlat
Console'da:
```javascript
startScraping();
```

## 🔧 İyileştirmeler

Script'te yapılan iyileştirmeler:
- ✅ Daha güvenilir pagination (sayfa geçişi)
- ✅ Retry mekanizması (hata durumunda tekrar dener)
- ✅ Daha uzun bekleme süreleri (sayfa yüklenmesi için)
- ✅ Sayfa numarası tespiti iyileştirildi
- ✅ Boş sayfa kontrolü eklendi

## ⏱️ Süre

- Her sayfa için ~3-5 saniye
- 80 sayfa için ~5-7 dakika
- Toplam ~7800 ürün çekilecek

## 📊 İlerleme Takibi

Console'da şunları göreceksiniz:
```
📚 Bulunan maksimum sayfa: 80
✅ Sayfa 1/80: 100 ürün, 100 mapping eklendi
📊 Toplam: 100 ürün, 100 mapping
➡️ Sayfa 2'e geçiliyor...
✅ Sayfa 2/80: 100 ürün, 100 mapping eklendi
📊 Toplam: 200 ürün, 200 mapping
...
```

## ⚠️ Sorun Giderme

### Script 41. sayfada durdu
- Script'i durdurun (sayfayı yenileyin)
- 41. sayfaya manuel olarak gidin
- Script'i tekrar yükleyin
- `startScraping()` çalıştırın

### "Sonraki sayfaya geçilemedi" Hatası
- Script otomatik olarak 3 saniye bekleyip tekrar dener
- Eğer yine başarısız olursa, manuel olarak sonraki sayfaya geçin
- Script'i tekrar çalıştırın

### Sayfa yavaş yükleniyor
- Normal! Her sayfa için 3-5 saniye bekliyor
- Sabırlı olun, script devam edecek

## ✅ Başarı Kontrolü

Script tamamlandığında:
```
🎉 Çekme tamamlandı!
📦 Toplam 7800 ürün
🔗 Toplam 7800 mapping
✅ Tüm veriler başarıyla kaydedildi!
```

Bu mesajları görürseniz, başarılı demektir! 🎉

