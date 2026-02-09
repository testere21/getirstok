/**
 * Eksik ProductId'leri Otomatik Ekleme Script'i
 * 
 * Bu script, products.json'da productId olmayan ürünlerin productId'lerini
 * Getir panelinde TÜM SAYFALARI otomatik gezerek bulur ve products.json'a ekler.
 * 
 * Kullanım:
 * 1. products.json'ı kontrol edin: node scripts/check-product-ids.mjs
 * 2. Getir panelinde "shelf-label/list" veya ürün listesi sayfasına gidin (1. sayfada olun)
 * 3. F12 → Console → Bu dosyanın TAMAMINI kopyalayıp yapıştırın, Enter
 * 4. Script otomatik olarak tüm sayfaları gezecek ve eksik productId'leri ekleyecek
 * 
 * DURDURMAK İÇİN: stopScraping() fonksiyonunu console'da çalıştırın
 */

(async function() {
  const API_BASE = 'http://localhost:3000';
  const UPDATE_URL = `${API_BASE}/api/products/update-product-ids`;
  
  // Eksik barcode'ları API'den çek
  let missingBarcodes = [];
  let missingBarcodesSet = new Set();
  
  // İstatistikler
  let currentPage = 1;
  let maxPages = 80; // Varsayılan maksimum sayfa sayısı
  let totalFound = 0;
  let totalUpdated = 0;
  let isRunning = false;
  let shouldStop = false;
  
  console.log('🔍 Eksik ProductId Otomatik Ekleme Script\'i Başlatıldı');
  
  // Önce API'den eksik barcode'ları çek
  try {
    const response = await fetch(`${API_BASE}/api/products/missing-barcodes`);
    const data = await response.json();
    if (data.barcodes && Array.isArray(data.barcodes)) {
      missingBarcodes = data.barcodes;
      missingBarcodesSet = new Set(missingBarcodes.map(b => b.trim()));
      console.log(`✅ API'den ${missingBarcodes.length} eksik barcode çekildi`);
    }
  } catch (err) {
    console.error('❌ API\'den barcode çekilemedi:', err);
    console.log('💡 İpucu: npm run dev çalışıyor mu?');
    return;
  }
  
  if (missingBarcodes.length === 0) {
    console.warn('⚠️ Eksik barcode listesi boş! Tüm ürünler productId\'ye sahip olabilir.');
    return;
  }
  
  console.log(`📋 ${missingBarcodes.length} ürün için productId aranacak`);
  console.log(`📄 Maksimum ${maxPages} sayfa taranacak\n`);
  
  // Maksimum sayfa sayısını bul
  function findMaxPages() {
    const paginationSelectors = [
      '.ag-paging-panel',
      '[class*="pagination"]',
      '[class*="Pagination"]',
      '.ant-pagination',
      '[role="navigation"]'
    ];
    
    let pagination = null;
    for (const sel of paginationSelectors) {
      pagination = document.querySelector(sel);
      if (pagination) break;
    }
    
    if (pagination) {
      const pageNumbers = pagination.querySelectorAll('button, a, span, div');
      let max = 1;
      pageNumbers.forEach(el => {
        const text = el.textContent?.trim() || '';
        const num = parseInt(text);
        if (!isNaN(num) && num > max && num < 10000) {
          max = num;
        }
      });
      
      if (max > 1) {
        console.log(`📚 Bulunan maksimum sayfa: ${max}`);
        return max;
      }
    }
    
    return maxPages;
  }
  
  // Mevcut sayfadaki ürünleri çek
  function scrapeCurrentPage() {
    const products = [];
    const rowSelectors = [
      '.ag-row',
      '.ag-center-cols-viewport .ag-row',
      'table tbody tr',
      '[role="row"]:not([role="row"] [role="row"])',
      '.ant-table-tbody tr'
    ];
    
    let rows = [];
    for (const sel of rowSelectors) {
      try {
        rows = document.querySelectorAll(sel);
        if (rows.length >= 2) break;
      } catch (e) {}
    }
    
    if (rows.length === 0) {
      return products;
    }
    
    function getText(el) {
      return (el && el.textContent ? el.textContent.trim() : "") || "";
    }
    
    for (const row of rows) {
      try {
        const cells = row.querySelectorAll(
          'td, [role="gridcell"], .ag-cell, [class*="ag-cell"], [class*="cell"]'
        );
        if (cells.length < 2) continue;
        
        let barcode = "";
        let productId = "";
        let name = "";
        let imageUrl = "";
        
        if (cells.length >= 4) {
          barcode = getText(cells[0]);
          const img = cells[1].querySelector('img');
          imageUrl = img ? img.src : "";
          productId = getText(cells[2]);
          name = getText(cells[3]);
        } else {
          for (let i = 0; i < cells.length; i++) {
            const t = getText(cells[i]);
            const img = cells[i].querySelector('img');
            if (img) imageUrl = img.src;
            if (t && /^\d{8,}$/.test(t.replace(/\s/g, ""))) {
              barcode = t.replace(/\s/g, "");
            }
            if (t && t.length > 15 && /^[a-f0-9]{24}$/i.test(t)) {
              productId = t;
            }
            if (t && t.length > 5 && !/^\d+$/.test(t) && !/^[a-f0-9]{24}$/i.test(t)) {
              name = t;
            }
          }
        }
        
        if (!barcode && !name) continue;
        
        // Sadece eksik barcode listesindeki ürünleri ekle
        const normalizedBarcode = barcode.length > 13 ? barcode.slice(0, 13) : barcode;
        if (missingBarcodesSet.has(normalizedBarcode) && productId) {
          products.push({
            barcode: normalizedBarcode,
            productId: productId,
            name: name || "",
            imageUrl: imageUrl || undefined
          });
        }
      } catch (e) {
        // Satır işlenirken hata oluşursa devam et
      }
    }
    
    return products;
  }
  
  // Sonraki sayfaya geç
  async function goToNextPage() {
    const selectors = [
      '.ag-paging-button[ref="btNext"]:not(.ag-disabled)',
      'button[aria-label*="next"]:not(:disabled)',
      'button[aria-label*="sonraki"]:not(:disabled)',
      '.ant-pagination-next:not(.ant-pagination-disabled)',
      '[class*="next"]:not([class*="disabled"])'
    ];
    
    let nextButton = null;
    for (const sel of selectors) {
      try {
        nextButton = document.querySelector(sel);
        if (nextButton && !nextButton.disabled && !nextButton.classList.contains('disabled')) {
          break;
        }
      } catch (e) {}
    }
    
    if (nextButton && !nextButton.disabled && !nextButton.classList.contains('disabled')) {
      nextButton.click();
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Sayfanın yüklendiğini kontrol et
      let retries = 0;
      while (retries < 5) {
        const rows = document.querySelectorAll('.ag-row, table tbody tr, [role="row"]');
        if (rows.length > 0) {
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        retries++;
      }
      return true;
    }
    
    return false;
  }
  
  // products.json'ı güncelle
  async function updateProductsJson(foundProducts) {
    if (foundProducts.length === 0) return 0;
    
    try {
      const response = await fetch(UPDATE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(foundProducts)
      });
      
      const data = await response.json();
      if (data.success) {
        return data.stats.updated || 0;
      }
    } catch (err) {
      console.error('❌ Güncelleme hatası:', err);
    }
    return 0;
  }
  
  // Ana döngü: Tüm sayfaları tara
  async function scanAllPages() {
    if (isRunning) {
      console.warn('⚠️ Script zaten çalışıyor!');
      return;
    }
    
    isRunning = true;
    shouldStop = false;
    
    // Maksimum sayfa sayısını güncelle
    maxPages = findMaxPages();
    
    console.log(`🚀 Tarama başlatılıyor... (Maksimum ${maxPages} sayfa)\n`);
    
    while (currentPage <= maxPages && !shouldStop) {
      console.log(`📄 Sayfa ${currentPage}/${maxPages} taranıyor...`);
      
      // Mevcut sayfadaki ürünleri çek
      const foundProducts = scrapeCurrentPage();
      
      if (foundProducts.length > 0) {
        console.log(`   ✅ ${foundProducts.length} ürün bulundu`);
        totalFound += foundProducts.length;
        
        // products.json'ı güncelle
        const updated = await updateProductsJson(foundProducts);
        totalUpdated += updated;
        
        if (updated > 0) {
          console.log(`   💾 ${updated} ürüne productId eklendi`);
        }
        
        // Bulunan barcode'ları listeden çıkar (performans için)
        foundProducts.forEach(p => {
          missingBarcodesSet.delete(p.barcode);
        });
        
        console.log(`   📊 Kalan eksik: ${missingBarcodesSet.size} ürün\n`);
      } else {
        console.log(`   ℹ️ Bu sayfada eksik productId'li ürün bulunamadı\n`);
      }
      
      // Tüm eksik ürünler bulunduysa dur
      if (missingBarcodesSet.size === 0) {
        console.log('🎉 Tüm eksik productId\'ler bulundu!');
        break;
      }
      
      // Son sayfaya ulaştıysak dur
      if (currentPage >= maxPages) {
        break;
      }
      
      // Sonraki sayfaya geç
      const hasNext = await goToNextPage();
      if (!hasNext) {
        console.log('⚠️ Sonraki sayfa bulunamadı, tarama durduruluyor.');
        break;
      }
      
      currentPage++;
    }
    
    isRunning = false;
    
    console.log('\n📊 Tarama Tamamlandı!');
    console.log(`   📄 Taranan sayfa: ${currentPage}`);
    console.log(`   🔍 Bulunan ürün: ${totalFound}`);
    console.log(`   ✅ Güncellenen ürün: ${totalUpdated}`);
    console.log(`   ⏳ Kalan eksik: ${missingBarcodesSet.size} ürün`);
  }
  
  // Durdurma fonksiyonu
  window.stopScraping = function() {
    shouldStop = true;
    console.log('⏸️ Tarama durduruluyor...');
  };
  
  // Taramayı başlat
  await scanAllPages();
  
  // Global fonksiyon: Manuel olarak ürün eklemek için
  window.addProductId = async function(barcode, productId) {
    try {
      const response = await fetch(UPDATE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ barcode, productId }])
      });
      
      const data = await response.json();
      if (data.success) {
        console.log(`✅ ${barcode} için productId eklendi: ${productId}`);
      } else {
        console.error('❌ Hata:', data.error);
      }
    } catch (err) {
      console.error('❌ Bağlantı hatası:', err);
    }
  };
  
  console.log('\n💡 İpucu: Taramayı durdurmak için: stopScraping()');
  console.log('💡 İpucu: Manuel olarak productId eklemek için:');
  console.log('   addProductId("8690632020297", "56ee399fd593b20300846b12")');
})();
