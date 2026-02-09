# Getir Stok Sorgulama Test Rehberi

## 1. Ürün ID'si ile Test (Hızlı Yöntem)

### Adım 1: Dev Server'ı Başlatın
```bash
npm run dev
```

### Adım 2: Tarayıcıda Test Edin
Tarayıcıda şu URL'yi açın:
```
http://localhost:3000/api/getir-stock-by-product-id?productId=559823ceb1dc700c006a7098
```

**Beklenen Sonuç:**
```json
{
  "stock": 4,
  "productId": "559823ceb1dc700c006a7098"
}
```

Eğer `stock: null` dönerse, token veya API hatası olabilir. Console log'larına bakın.

---

## 2. Barkod ile Test (Mapping Olmadan)

### Adım 1: Tarayıcıda Test Edin
```
http://localhost:3000/api/getir-stock?barcode=8696368011332
```

**Not:** Bu yavaş olacak çünkü mapping yok, pagination ile arama yapacak.

---

## 3. Mapping Kaydetme

### Tekil Mapping Kaydetme

**Endpoint:** `POST /api/barcode-mapping/save`

**Body:**
```json
{
  "barcode": "8696368011332",
  "productId": "559823ceb1dc700c006a7098",
  "productName": "Activia Probiyotik Sade Yoğurt (4 x 100 g)"
}
```

**Örnek cURL:**
```bash
curl -X POST http://localhost:3000/api/barcode-mapping/save \
  -H "Content-Type: application/json" \
  -d '{
    "barcode": "8696368011332",
    "productId": "559823ceb1dc700c006a7098",
    "productName": "Activia Probiyotik Sade Yoğurt (4 x 100 g)"
  }'
```

### Toplu Mapping Kaydetme (7800 Ürün İçin)

**Endpoint:** `POST /api/barcode-mapping/batch-save`

**Body:**
```json
{
  "mappings": [
    {
      "barcode": "8696368011332",
      "productId": "559823ceb1dc700c006a7098",
      "productName": "Activia Probiyotik Sade Yoğurt (4 x 100 g)"
    },
    {
      "barcode": "5000112664782",
      "productId": "56ee399fd593b20300846b12",
      "productName": "Sprite (250 ml)"
    }
    // ... 7800 ürün
  ]
}
```

**Örnek JavaScript (Node.js veya Browser Console):**
```javascript
// Önce ürün listesini hazırlayın (barkod, productId, productName)
const mappings = [
  { barcode: "8696368011332", productId: "559823ceb1dc700c006a7098", productName: "Activia..." },
  // ... diğer ürünler
];

// Toplu kaydetme
fetch('http://localhost:3000/api/barcode-mapping/batch-save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mappings })
})
  .then(res => res.json())
  .then(data => console.log('Sonuç:', data))
  .catch(err => console.error('Hata:', err));
```

---

## 4. Mapping Sonrası Barkod ile Test

Mapping kaydettikten sonra, barkod ile hızlı stok sorgulama yapabilirsiniz:

```
http://localhost:3000/api/getir-stock?barcode=8696368011332
```

Bu sefer hızlı olacak çünkü:
1. Önce mapping'den ürün ID'sini bulacak
2. Sonra ürün ID'si ile hızlı stok sorgulama yapacak

---

## 5. Ürün Listesini Hazırlama

7800 ürünün mapping'lerini kaydetmek için, önce ürün listesini hazırlamanız gerekiyor.

**Format:**
```json
[
  {
    "barcode": "8696368011332",
    "productId": "559823ceb1dc700c006a7098",
    "productName": "Activia Probiyotik Sade Yoğurt (4 x 100 g)"
  }
]
```

**Not:** Bu listeyi başka panelden çekebilirsiniz veya manuel olarak hazırlayabilirsiniz.

---

## Sorun Giderme

### "Token bulunamadı" Hatası
- Chrome eklentisini kullanarak token ekleyin
- `http://localhost:3000/api/token/save` endpoint'ine token gönderin

### "API hatası: 401" Hatası
- Token geçersiz, yeni token ekleyin

### "Product ID not found in mapping" Log'u
- Mapping kaydedilmemiş, önce mapping kaydedin

### "Product not found" Sonucu
- Ürün ID'si yanlış olabilir veya ürün stokta yok

