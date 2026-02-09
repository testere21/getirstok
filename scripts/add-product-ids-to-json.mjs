/**
 * products.json dosyasına productId ekleme script'i
 * Firestore'daki mapping'lerden productId'leri alıp products.json'a ekler
 * 
 * Kullanım: node scripts/add-product-ids-to-json.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

// .env.local dosyasını yükle
const envPath = join(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
}

// Firebase config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Config kontrolü
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('❌ Firebase config bulunamadı!');
  console.error('💡 .env.local dosyasında NEXT_PUBLIC_FIREBASE_* değişkenlerini kontrol edin.');
  process.exit(1);
}

async function addProductIds() {
  try {
    console.log('🔥 Firebase bağlantısı kuruluyor...');
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    
    console.log('📦 products.json okunuyor...');
    const productsPath = join(process.cwd(), 'data', 'products.json');
    const productsData = await readFile(productsPath, 'utf-8');
    const products = JSON.parse(productsData);
    
    if (!Array.isArray(products)) {
      throw new Error('products.json bir array olmalı!');
    }
    
    console.log(`📊 ${products.length} ürün bulundu`);
    
    console.log('🔍 Firestore mappingleri cekiliyor...');
    const mappingRef = collection(db, 'barcode_product_mappings');
    const mappingSnapshot = await getDocs(mappingRef);
    
    // Barkod -> ProductId map oluştur
    const barcodeToProductId = new Map();
    mappingSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.barcode && data.productId) {
        barcodeToProductId.set(data.barcode.trim(), data.productId);
      }
    });
    
    console.log(`🔗 ${barcodeToProductId.size} mapping bulundu`);
    
    // products.json'daki her ürün için productId ekle
    let updated = 0;
    let notFound = 0;
    let alreadyHasId = 0;
    
    const updatedProducts = products.map((product) => {
      if (product.productId) {
        // Zaten var, değiştirme
        alreadyHasId++;
        return product;
      }
      
      const barcode = product.barcode?.trim();
      if (!barcode) {
        notFound++;
        return product;
      }
      
      const productId = barcodeToProductId.get(barcode);
      if (productId) {
        updated++;
        return {
          ...product,
          productId: productId,
        };
      } else {
        notFound++;
        return product;
      }
    });
    
    console.log(`✅ ${updated} ürüne productId eklendi`);
    console.log(`ℹ️ ${alreadyHasId} ürün zaten productId'ye sahip`);
    console.log(`⚠️ ${notFound} ürün için productId bulunamadı`);
    
    // products.json'ı güncelle
    console.log('💾 products.json güncelleniyor...');
    await writeFile(productsPath, JSON.stringify(updatedProducts, null, 2), 'utf-8');
    
    console.log('🎉 Tamamlandı! products.json güncellendi.');
    console.log(`📊 İstatistikler:`);
    console.log(`   - Toplam: ${products.length} ürün`);
    console.log(`   - Güncellenen: ${updated}`);
    console.log(`   - Zaten var: ${alreadyHasId}`);
    console.log(`   - Bulunamayan: ${notFound}`);
    
  } catch (error) {
    console.error('❌ Hata:', error);
    if (error.message) {
      console.error('   Mesaj:', error.message);
    }
    process.exit(1);
  }
}

addProductIds();

