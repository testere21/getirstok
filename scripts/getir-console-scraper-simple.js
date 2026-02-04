/**
 * Getir Depo Paneli – Basit ve güvenilir scraper (productId yok, tek satır JSON).
 *
 * Kullanım:
 * 1. Getir ürün listesi sayfasında 1. sayfada olun.
 * 2. npm run dev açık olsun.
 * 3. F12 → Console → Bu dosyanın TAMAMINI yapıştırıp Enter.
 * 4. Script sayfa sayfa ilerler, tüm ürünleri toplar ve kaydeder.
 */

(async function () {
  const SAVE_URL = "http://localhost:3000/api/products/save";
  const MAX_PAGES = 85;
  const WAIT_MS = 2500;

  const allProducts = [];
  const seenBarcodes = new Set();
  
  if (window.__GETIR_SCRAPED_PRODUCTS__ && Array.isArray(window.__GETIR_SCRAPED_PRODUCTS__)) {
    for (const p of window.__GETIR_SCRAPED_PRODUCTS__) {
      const barcode = p.barcode || "";
      if (barcode && !seenBarcodes.has(barcode)) {
        seenBarcodes.add(barcode);
        allProducts.push(p);
      }
    }
    console.log(`📦 Önceki çalışmadan ${allProducts.length} ürün yüklendi, kaldığı yerden devam ediliyor...`);
  }
  
  let currentPage = 1;
  let consecutiveEmptyPages = 0;

  function getText(el) {
    return (el && el.textContent ? el.textContent.trim() : "") || "";
  }

  function getImgSrc(el) {
    if (!el) return "";
    const img = el.querySelector("img");
    return img ? img.src : "";
  }

  function scrapeCurrentPage() {
    const products = [];
    const rowSelectors = [
      ".ag-row",
      ".ag-center-cols-viewport .ag-row",
      "table tbody tr",
      '[role="row"]',
      ".ant-table-tbody tr",
    ];

    let rows = [];
    for (const sel of rowSelectors) {
      try {
        rows = document.querySelectorAll(sel);
        if (rows.length >= 2) break;
      } catch (e) {}
    }

    for (const row of rows) {
      const cells = row.querySelectorAll("td, [role='gridcell'], .ag-cell");
      if (cells.length < 2) continue;

      let barcode = "";
      let name = "";
      let imageUrl = "";

      for (let i = 0; i < cells.length; i++) {
        const text = getText(cells[i]);
        const img = getImgSrc(cells[i]);

        if (img) imageUrl = img;
        if (text && /^\d{8,}$/.test(text.replace(/\s/g, ""))) {
          barcode = text.replace(/\s/g, "");
        }
        if (
          text &&
          text.length > 5 &&
          !/^\d+$/.test(text) &&
          !/^[a-f0-9]{24}$/i.test(text) &&
          text !== "Ürün Görseli" &&
          text !== "Barkodlar"
        ) {
          name = text;
        }
      }

      if (!barcode && !name) continue;
      if (barcode === "Barkodlar" || name === "Ürün Görseli") continue;

      const normalizedBarcode =
        barcode.length > 13 ? barcode.slice(0, 13) : barcode;

      if (!seenBarcodes.has(normalizedBarcode) && normalizedBarcode) {
        seenBarcodes.add(normalizedBarcode);
        products.push({
          name: name || "-",
          barcode: normalizedBarcode,
          imageUrl: imageUrl || undefined,
        });
      }
    }

    return products;
  }

  function findNextButton() {
    const selectors = [
      '.ag-paging-button[ref="btNext"]:not(.ag-disabled)',
      '.ag-paging-button-next:not(.ag-disabled)',
      '[ref="btNext"]:not(.ag-disabled)',
      '.ant-pagination-next:not(.ant-pagination-disabled) button',
      '.ant-pagination-next:not(.ant-pagination-disabled)',
      '[aria-label="Next Page"]:not([aria-disabled="true"])',
      '[aria-label="Sonraki sayfa"]:not([aria-disabled="true"])',
    ];

    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const isDisabled =
            el.classList.contains("ag-disabled") ||
            el.classList.contains("ant-pagination-disabled") ||
            el.getAttribute("aria-disabled") === "true" ||
            el.closest(".ag-disabled") ||
            el.closest(".ant-pagination-disabled");
          if (!isDisabled) {
            return el;
          }
        }
      } catch (e) {}
    }

    const paginationContainers = document.querySelectorAll(
      ".ant-pagination, .ag-paging-panel, [class*='pagination'], [class*='paging']"
    );
    for (const container of paginationContainers) {
      const buttons = container.querySelectorAll("button, a, [role='button'], span");
      for (const btn of buttons) {
        const text = getText(btn).toLowerCase().trim();
        const isNext =
          text === ">" ||
          text === "›" ||
          text.includes("sonraki") ||
          text.includes("next") ||
          btn.textContent === ">" ||
          btn.textContent === "›";
        if (isNext) {
          const isDisabled =
            btn.classList.contains("ag-disabled") ||
            btn.classList.contains("ant-pagination-disabled") ||
            btn.getAttribute("aria-disabled") === "true" ||
            btn.closest(".ag-disabled") ||
            btn.closest(".ant-pagination-disabled");
          if (!isDisabled) {
            const clickable = btn.tagName === "BUTTON" || btn.tagName === "A" || btn.getAttribute("role") === "button" ? btn : btn.closest("button, a");
            if (clickable) return clickable;
            return btn;
          }
        }
      }
    }

    const allButtons = document.querySelectorAll("button, a, [role='button']");
    for (const btn of allButtons) {
      const text = getText(btn).toLowerCase();
      const isNext =
        text.includes("sonraki") ||
        text.includes("next") ||
        text === "›" ||
        text === ">";
      if (isNext) {
        const isDisabled =
          btn.classList.contains("ag-disabled") ||
          btn.classList.contains("ant-pagination-disabled") ||
          btn.getAttribute("aria-disabled") === "true" ||
          btn.closest(".ag-disabled") ||
          btn.closest(".ant-pagination-disabled");
        if (!isDisabled) {
          return btn;
        }
      }
    }

    return null;
  }

  function clickNext() {
    const btn = findNextButton();
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  console.log("🚀 Başlıyor: Sayfa 1 okunuyor...");

  while (currentPage <= MAX_PAGES) {
    await sleep(500);
    const batch = scrapeCurrentPage();

    if (batch.length === 0) {
      consecutiveEmptyPages++;
      if (consecutiveEmptyPages >= 2) {
        console.log("⚠️ 2 sayfa üst üste boş, duruluyor.");
        break;
      }
    } else {
      consecutiveEmptyPages = 0;
      allProducts.push(...batch);
      console.log(
        `✅ Sayfa ${currentPage}: ${batch.length} yeni ürün → Toplam: ${allProducts.length}`
      );
    }

    if (currentPage >= MAX_PAGES) {
      console.log(`📄 Maksimum sayfa sayısına (${MAX_PAGES}) ulaşıldı.`);
      break;
    }

    let hasNext = clickNext();
    if (!hasNext) {
      await sleep(1000);
      hasNext = clickNext();
    }
    if (!hasNext) {
      console.log("⚠️ Sonraki sayfa butonu bulunamadı veya devre dışı.");
      console.log("💡 İpucu: Sayfa numarasına tıklayarak manuel olarak ilerleyebilirsiniz, sonra script'i tekrar çalıştırın.");
      break;
    }

    currentPage++;
    await sleep(WAIT_MS);
  }

  const cleaned = allProducts.filter(
    (p) => p.name !== "Ürün Görseli" && p.barcode !== "Barkodlar"
  );

  console.log(`\n📊 Toplam benzersiz ürün: ${cleaned.length}`);

  try {
    const res = await fetch(SAVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cleaned),
    });
    const data = await res.json();
    if (data.ok) {
      console.log(`✅ ${data.message || "data/products.json güncellendi."}`);
    } else {
      console.warn("⚠️ Kayıt yanıtı:", data);
      if (typeof copy === "function") {
        copy(JSON.stringify(cleaned));
        console.log("📋 JSON panoya kopyalandı.");
      }
    }
  } catch (err) {
    console.warn("❌ Kayıt hatası:", err.message);
    if (typeof copy === "function") {
      copy(JSON.stringify(cleaned));
      console.log("📋 JSON panoya kopyalandı. Bana yapıştırın, dosyaya kaydedeyim.");
    }
  }

  window.__GETIR_SCRAPED_PRODUCTS__ = cleaned;
  return cleaned;
})();
