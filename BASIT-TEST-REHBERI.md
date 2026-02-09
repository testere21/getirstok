# 🧪 Basit Test Rehberi

## Hızlı Başlangıç

### 1. Dev Server'ı Başlatın
```bash
npm run dev
```

### 2. Test Sayfasını Açın
Tarayıcıda `test-getir-stock.html` dosyasını açın:
- Dosyaya çift tıklayın, veya
- Tarayıcıda `file:///C:/Users/PC/Desktop/yeniFerhat/getirstok/test-getir-stock.html` yazın

### 3. Test Adımları (Sırayla)

#### ✅ Test 1: Ürün ID ile Stok Sorgulama
- **Buton:** "Test Et (Product ID: 559823ceb1dc700c006a7098)"
- **Ne yapar:** Direkt ürün ID'si ile stok sorgular (hızlı yöntem)
- **Beklenen:** `{"stock": 4, "productId": "559823ceb1dc700c006a7098"}` gibi bir sonuç

#### ✅ Test 2: Mapping Kaydetme
- **Buton:** "Mapping Kaydet"
- **Ne yapar:** İlk ürünün (Activia Sade) mapping'ini Firestore'a kaydeder
- **Beklenen:** `{"success": true, "message": "Mapping kaydedildi"}`

#### ✅ Test 3: Barkod ile Stok Sorgulama (Mapping Sonrası)
- **Buton:** "Test Et (Barcode: 8696368011332)"
- **Ne yapar:** Mapping kaydettikten sonra barkod ile hızlı stok sorgular
- **Beklenen:** `{"stock": 4, "success": true}` gibi bir sonuç
- **Not:** Bu sefer hızlı olacak çünkü mapping'den ürün ID'sini bulacak

#### ✅ Test 4: Toplu Mapping Kaydetme
- **Buton:** "Toplu Kaydet"
- **Ne yapar:** Resimdeki 8 ürünün mapping'lerini toplu kaydeder
- **Beklenen:** `{"success": true, "count": 8, "message": "8 mapping kaydedildi"}`
- **Not:** Bu biraz zaman alabilir (Firestore batch write limit: 500)

---

## Test Ürünleri

Resimden alınan 8 ürün:

1. **Activia Sade** - Barkod: `8696368011332`, ID: `559823ceb1dc700c006a7098`
2. **Activia Çilekli** - Barkod: `8696368011349`, ID: `559823f7b1dc700c006a709c`
3. **Activia Ananaslı** - Barkod: `8696368011493`, ID: `55982415b1dc700c006a70a0`
4. **Cook Alüminyum Folyo** - Barkod: `8690709040005`, ID: `55982541b1dc700c006a70b0`
5. **Cook Pişirme Kağıdı** - Barkod: `8690709260090`, ID: `55982584b1dc700c006a70bc`
6. **Nesfit Karışık Meyveli** - Barkod: `8690632020297`, ID: `559825dcb1dc700c006a70c4`
7. **Nesfit Kırmızı Meyveli** - Barkod: `8690632760391`, ID: `55982606b1dc700c006a70cc`
8. **Nesfit Çikolatalı** - Barkod: `8690632704685`, ID: `55982655b1dc700c006a70d8`

---

## Sorun Giderme

### ❌ "Failed to fetch" Hatası
- Dev server çalışıyor mu kontrol edin: `http://localhost:3000`
- CORS hatası olabilir, API route'larında CORS header'ları var mı kontrol edin

### ❌ "Token bulunamadı" Hatası
- Chrome eklentisini kullanarak token ekleyin
- `http://localhost:3000/api/token/save` endpoint'ine token gönderin

### ❌ "API hatası: 401" Hatası
- Token geçersiz, yeni token ekleyin

### ❌ "Product ID not found in mapping" Log'u
- Test 2'yi (Mapping Kaydetme) önce çalıştırın

### ❌ "Product not found" Sonucu
- Ürün ID'si yanlış olabilir veya ürün stokta yok
- Getir panelinde bu ürünün stokta olduğundan emin olun

---

## Sonraki Adımlar

Test başarılı olduktan sonra:
1. 7800 ürünün mapping'lerini hazırlayın
2. `test-getir-stock.html` dosyasındaki `testProducts` array'ini güncelleyin
3. Test 4'ü (Toplu Mapping) çalıştırın
4. Artık tüm ürünler için hızlı stok sorgulama yapabilirsiniz!

