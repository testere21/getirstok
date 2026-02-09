# Ürün ID'lerini Ekleme Rehberi

## Mevcut Durum

`data/products.json` dosyasında:
- ✅ Ürün isimleri var
- ✅ Barkod numaraları var
- ✅ Görsel URL'leri var
- ❌ **Ürün ID'leri YOK**

## Çözüm

### Yöntem 1: Manuel Ekleme (Küçük Liste İçin)

1. `data/products.json` dosyasını açın
2. Her ürün objesine `productId` field'ı ekleyin:

```json
[
  {
    "name": "Activia Probiyotik Sade Yoğurt (4 x 100 g)",
    "barcode": "8696368011332",
    "imageUrl": "...",
    "productId": "559823ceb1dc700c006a7098"  // ← Bu satırı ekleyin
  }
]
```

3. Script'i çalıştırın:
```bash
node scripts/add-product-ids-to-mapping.js
```

### Yöntem 2: Getir Panelinden Toplu Çekme (7800 Ürün İçin)

Getir panelinde ürün listesinde hem barkod hem de ürün ID görünüyor. Bu bilgileri toplu olarak çekmek için:

1. **Getir Panelinde:**
   - Ürün listesi sayfasına gidin
   - F12 → Console
   - Aşağıdaki script'i çalıştırın:

```javascript
// Getir panelinde çalıştırılacak script
const products = [];
const rows = document.querySelectorAll('.ag-row, table tbody tr');

rows.forEach(row => {
  const cells = row.querySelectorAll('td, .ag-cell');
  if (cells.length >= 4) {
    const barcode = cells[0]?.textContent?.trim() || '';
    const productId = cells[2]?.textContent?.trim() || '';
    const name = cells[3]?.textContent?.trim() || '';
    
    if (barcode && productId) {
      products.push({ barcode, productId, name });
    }
  }
});

// JSON olarak kopyala
console.log(JSON.stringify(products, null, 2));
copy(JSON.stringify(products, null, 2));
```

2. **Çıkan JSON'u kullanarak:**
   - `data/products.json` dosyasındaki ürünleri güncelleyin
   - Veya direkt mapping olarak kaydedin

### Yöntem 3: API ile Toplu Güncelleme

Eğer ürün ID'lerini başka bir kaynaktan alıyorsanız, `data/products.json` dosyasını güncelleyip script'i çalıştırın.

## Script Kullanımı

```bash
# Dev server'ın çalıştığından emin olun
npm run dev

# Başka bir terminal'de:
node scripts/add-product-ids-to-mapping.js
```

## Kontrol

Mapping'lerin kaydedildiğini kontrol etmek için:

1. Test sayfasını açın: `test-getir-stock.html`
2. "Test 3: Barkod ile Stok Sorgulama" butonuna tıklayın
3. Eğer hızlı sonuç dönerse, mapping başarılı demektir!

