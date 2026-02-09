/**
 * Getir Panelinden Ürün Çekme Script'i
 * 
 * Kullanım:
 * 1. Getir panelinde "shelf-label/list" sayfasına gidin
 * 2. F12 → Console
 * 3. Bu dosyanın TAMAMINI kopyalayıp yapıştırın, Enter
 * 4. Script tüm sayfaları tarayıp ürünleri toplayacak
 * 5. Sonunda JSON'u kopyalayacak ve API'ye gönderecek
 */

(function() {
  const API_BASE = 'http://localhost:3000';
  const SAVE_URL = `${API_BASE}/api/products/save`;
  const MAPPING_URL = `${API_BASE}/api/barcode-mapping/batch-save`;
  
  const allProducts = [];
  const allMappings = [];
  const seenBarcodes = new Set();
  const seenProductIds = new Set();
  
  let currentPage = 1;
  let maxPages = 1;
  let isRunning = false;
  let shouldStop = false;

  // Sayfa numarasını bul - daha güvenilir
  function findMaxPages() {
    // Farklı selector'ları dene
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
        // Sadece sayı olan text'leri al
        const num = parseInt(text);
        if (!isNaN(num) && num > max && num < 10000) { // 10000'den büyük sayılar muhtemelen yanlış
          max = num;
        }
      });
      
      // Eğer max hala 1 ise, sayfa numarasını başka yerden bul
      if (max === 1) {
        // "100 / sayfa" gibi text'lerden sayfa sayısını çıkar
        const pageInfo = pagination.textContent || '';
        const match = pageInfo.match(/(\d+)\s*\/\s*sayfa/i);
        if (match) {
          const itemsPerPage = parseInt(match[1]);
          // Toplam ürün sayısını bul (eğer görünüyorsa)
          const totalText = document.body.textContent || '';
          const totalMatch = totalText.match(/toplam[:\s]*(\d+)/i);
          if (totalMatch && itemsPerPage) {
            const total = parseInt(totalMatch[1]);
            max = Math.ceil(total / itemsPerPage);
          }
        }
      }
      
      console.log(`📚 Bulunan maksimum sayfa: ${max}`);
      return max;
    }
    
    console.warn('⚠️ Pagination bulunamadı, varsayılan olarak 100 sayfa kullanılacak');
    return 100; // Varsayılan olarak 100 sayfa
  }

  // Mevcut sayfadaki ürünleri çek
  function scrapeCurrentPage() {
    const products = [];
    const mappings = [];
    
    // Farklı selector'ları dene
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
      console.warn('⚠️ Satır bulunamadı!');
      return { products, mappings };
    }
    
    console.log(`📄 Sayfa ${currentPage}: ${rows.length} satır bulundu`);
    
    for (const row of rows) {
      try {
        const cells = row.querySelectorAll('td, [role="gridcell"], .ag-cell, [class*="ag-cell"]');
        if (cells.length < 3) continue;
        
        // Barkod (ilk sütun) - birden fazla olabilir
        const barcodeCell = cells[0];
        const barcodeText = barcodeCell?.textContent?.trim() || '';
        const barcodes = barcodeText
          .split(/[\s,]+/)
          .map(b => b.trim())
          .filter(b => b && /^\d+$/.test(b) && b.length >= 8)
          .slice(0, 1); // İlk geçerli barkodu al
        
        if (barcodes.length === 0) continue;
        const barcode = barcodes[0];
        
        // Ürün ID (üçüncü sütun genelde)
        let productId = '';
        for (let i = 1; i < cells.length; i++) {
          const text = cells[i]?.textContent?.trim() || '';
          // MongoDB ObjectId formatı: 24 karakter hex
          if (/^[a-f0-9]{24}$/i.test(text)) {
            productId = text;
            break;
          }
        }
        
        if (!productId) continue;
        
        // Ürün adı (son sütunlar)
        let productName = '';
        for (let i = cells.length - 1; i >= 0; i--) {
          const text = cells[i]?.textContent?.trim() || '';
          if (text && text.length > 5 && 
              !/^[a-f0-9]{24}$/i.test(text) && 
              !/^\d+$/.test(text) &&
              text !== 'aktifdeğil' &&
              !text.match(/^\d+\s*\/\s*sayfa$/)) {
            productName = text;
            break;
          }
        }
        
        // Görsel URL
        const img = row.querySelector('img');
        const imageUrl = img?.src || img?.getAttribute('data-src') || undefined;
        
        // Eğer bu barkod daha önce eklenmediyse
        if (!seenBarcodes.has(barcode)) {
          seenBarcodes.add(barcode);
          
          products.push({
            name: productName || '-',
            barcode: barcode,
            productId: productId || undefined, // Ürün ID'sini de ekle
            imageUrl: imageUrl
          });
        }
        
        // Mapping için (productId varsa)
        if (productId && !seenProductIds.has(productId)) {
          seenProductIds.add(productId);
          
          mappings.push({
            barcode: barcode,
            productId: productId,
            productName: productName || undefined
          });
        }
        
      } catch (e) {
        console.warn('Satır işlenirken hata:', e);
      }
    }
    
    return { products, mappings };
  }

  // Sonraki sayfaya geç - daha güvenilir yöntem
  async function goToNextPage() {
    // Önce farklı selector'ları dene
    const selectors = [
      '.ag-paging-button[ref="btNext"]:not(.ag-disabled)',
      'button[aria-label*="next"]:not(:disabled)',
      'button[aria-label*="sonraki"]:not(:disabled)',
      '.ant-pagination-next:not(.ant-pagination-disabled)',
      '[class*="next"]:not([class*="disabled"])',
      'button:has-text(">")',
      'button:has-text("Sonraki")'
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
    
    // Eğer buton bulunamadıysa, sayfa numarasına tıklamayı dene
    if (!nextButton) {
      const currentPageNum = currentPage + 1;
      const pageButton = Array.from(document.querySelectorAll('button, a, span')).find(el => {
        const text = el.textContent?.trim() || '';
        return text === String(currentPageNum);
      });
      
      if (pageButton) {
        nextButton = pageButton;
      }
    }
    
    if (nextButton && !nextButton.disabled && !nextButton.classList.contains('disabled')) {
      console.log(`➡️ Sayfa ${currentPage + 1}'e geçiliyor...`);
      nextButton.click();
      
      // Sayfa yüklenmesini bekle - daha uzun bekle
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
    
    console.warn(`⚠️ Sayfa ${currentPage + 1} butonu bulunamadı veya aktif değil`);
    return false;
  }

  // Durdurma fonksiyonu
  function stopScraping() {
    if (!isRunning) {
      console.log('⚠️ Script zaten durmuş!');
      return;
    }
    shouldStop = true;
    console.log('🛑 Durdurma isteği gönderildi...');
    console.log('💡 Mevcut sayfa tamamlandıktan sonra duracak.');
  }
  
  // Ana fonksiyon
  async function startScraping() {
    if (isRunning) {
      console.log('⚠️ Script zaten çalışıyor!');
      return;
    }
    
    isRunning = true;
    shouldStop = false;
    console.log('🚀 Ürün çekme başlatılıyor...');
    console.log('💡 Durdurmak için: stopScraping()');
    
    maxPages = findMaxPages();
    console.log(`📚 Toplam ${maxPages} sayfa bulundu`);
    
    // İlk sayfayı çek
    let { products, mappings } = scrapeCurrentPage();
    allProducts.push(...products);
    allMappings.push(...mappings);
    console.log(`✅ Sayfa ${currentPage}/${maxPages}: ${products.length} ürün, ${mappings.length} mapping eklendi`);
    
    // Diğer sayfaları çek
    while (currentPage < maxPages && !shouldStop) {
      const hasNext = await goToNextPage();
      if (!hasNext) {
        console.log(`⚠️ Sayfa ${currentPage + 1}'e geçilemedi, 3 saniye bekleniyor ve tekrar deneniyor...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Bir kez daha dene
        const retry = await goToNextPage();
        if (!retry) {
          console.log('❌ Sonraki sayfaya geçilemedi, durduruluyor...');
          console.log(`💡 Manuel olarak sayfa ${currentPage + 1}'e geçip script'i tekrar çalıştırabilirsiniz`);
          break;
        }
      }
      
      currentPage++;
      
      // Sayfa yüklenmesini bekle - daha uzun bekle
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Sayfa numarasını kontrol et
      let retries = 0;
      while (retries < 3) {
        const result = scrapeCurrentPage();
        if (result.products.length > 0 || result.mappings.length > 0) {
          allProducts.push(...result.products);
          allMappings.push(...result.mappings);
          
          console.log(`✅ Sayfa ${currentPage}/${maxPages}: ${result.products.length} ürün, ${result.mappings.length} mapping eklendi`);
          console.log(`📊 Toplam: ${allProducts.length} ürün, ${allMappings.length} mapping`);
          break;
        } else {
          retries++;
          console.log(`⏳ Sayfa ${currentPage} yükleniyor... (${retries}/3)`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      if (retries >= 3) {
        console.warn(`⚠️ Sayfa ${currentPage} boş görünüyor, atlanıyor...`);
      }
      
      // Durdurma kontrolü
      if (shouldStop) {
        console.log('🛑 Durdurma isteği alındı, durduruluyor...');
        break;
      }
    }
    
    console.log('\n🎉 Çekme tamamlandı!');
    console.log(`📦 Toplam ${allProducts.length} ürün`);
    console.log(`🔗 Toplam ${allMappings.length} mapping`);
    
    // Sonuçları göster
    console.log('\n📋 İlk 5 ürün örneği:');
    allProducts.slice(0, 5).forEach((p, i) => {
      console.log(`${i + 1}. ${p.name} - ${p.barcode}`);
    });
    
    // JSON'u kopyala
    const productsJson = JSON.stringify(allProducts, null, 2);
    const mappingsJson = JSON.stringify(allMappings, null, 2);
    
    try {
      if (typeof copy === 'function') {
        copy(productsJson);
        console.log('\n✅ Ürünler JSON\'u panoya kopyalandı!');
      }
    } catch (e) {
      console.log('\n⚠️ Panoya kopyalama başarısız, JSON aşağıda:');
      console.log(productsJson.substring(0, 500) + '...');
    }
    
    // API'ye kaydet
    console.log('\n💾 API\'ye kaydediliyor...');
    
    try {
      // 1. Ürünleri kaydet
      const productsResponse = await fetch(SAVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(allProducts)
      });
      
      const productsResult = await productsResponse.json();
      console.log('📦 Ürünler kaydedildi:', productsResult);
      
      // 2. Mapping'leri kaydet
      if (allMappings.length > 0) {
        const mappingsResponse = await fetch(MAPPING_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mappings: allMappings })
        });
        
        const mappingsResult = await mappingsResponse.json();
        console.log('🔗 Mapping\'ler kaydedildi:', mappingsResult);
      }
      
      console.log('\n✅ Tüm veriler başarıyla kaydedildi!');
      
    } catch (error) {
      console.error('❌ API hatası:', error);
      console.log('\n💡 Manuel kayıt için JSON\'lar:');
      console.log('\n📦 Ürünler JSON:');
      console.log(productsJson.substring(0, 1000) + '...');
      console.log('\n🔗 Mapping JSON:');
      console.log(mappingsJson.substring(0, 1000) + '...');
    }
    
    isRunning = false;
    shouldStop = false;
  }

  // Temizleme fonksiyonu
  function clearData() {
    allProducts.length = 0;
    allMappings.length = 0;
    seenBarcodes.clear();
    seenProductIds.clear();
    currentPage = 1;
    console.log('🧹 Veriler temizlendi!');
  }
  
  // Başlat
  console.log('📋 Getir Panel Ürün Çekici v2.0 (İyileştirilmiş)');
  console.log('💡 Script hazır!');
  console.log('');
  console.log('Komutlar:');
  console.log('  startScraping()  - Başlat');
  console.log('  stopScraping()   - Durdur');
  console.log('  clearData()      - Verileri temizle');
  console.log('');
  console.log('💡 Başlatmak için: startScraping()');
  console.log('💡 Durdurmak için: stopScraping()');
  console.log('');
  
  // Global'e ekle
  window.startScraping = startScraping;
  window.stopScraping = stopScraping;
  window.clearData = clearData;
})();

