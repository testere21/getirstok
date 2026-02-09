/**
 * data/products.json dosyasındaki ürünleri kullanarak
 * barkod -> ürün ID mapping'lerini Firestore'a kaydeder
 * 
 * Kullanım:
 * 1. Getir panelinden ürün ID'lerini alın (resimdeki gibi)
 * 2. products.json dosyasına productId field'ını ekleyin
 * 3. node scripts/add-product-ids-to-mapping.js
 */

const fs = require('fs');
const path = require('path');

const PRODUCTS_FILE = path.join(__dirname, '..', 'data', 'products.json');
const API_BASE = 'http://localhost:3000';

async function addMappings() {
  try {
    // products.json dosyasını oku
    const productsContent = fs.readFileSync(PRODUCTS_FILE, 'utf-8');
    const products = JSON.parse(productsContent);

    console.log(`📦 Toplam ${products.length} ürün bulundu`);

    // productId olan ürünleri filtrele
    const productsWithId = products.filter(p => p.productId && p.barcode);
    
    console.log(`✅ ${productsWithId.length} ürünün productId'si var`);

    if (productsWithId.length === 0) {
      console.log('❌ Hiçbir üründe productId yok!');
      console.log('💡 Önce products.json dosyasına productId field\'ını ekleyin.');
      return;
    }

    // Mapping formatına çevir
    const mappings = productsWithId.map(p => ({
      barcode: p.barcode.trim(),
      productId: p.productId.trim(),
      productName: p.name || undefined
    }));

    console.log(`\n🔄 ${mappings.length} mapping kaydediliyor...`);

    // Toplu kaydetme API'sine gönder
    const response = await fetch(`${API_BASE}/api/barcode-mapping/batch-save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings })
    });

    const result = await response.json();

    if (result.success) {
      console.log(`\n✅ Başarılı! ${result.count} mapping kaydedildi.`);
    } else {
      console.error(`\n❌ Hata:`, result.error);
    }
  } catch (error) {
    console.error('❌ Hata:', error.message);
  }
}

// Çalıştır
addMappings();

