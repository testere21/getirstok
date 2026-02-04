/**
 * Getir Depo Paneli – TÜM SAYFALARI otomatik dolaşır (80 sayfa x 100 ürün).
 *
 * Kullanım:
 * 1. Getir ürün listesi sayfasında 1. sayfada olun (ilk 100 ürün görünsün).
 * 2. npm run dev açık olsun (kayıt için).
 * 3. F12 → Console → Bu dosyanın TAMAMINI yapıştırıp Enter.
 * 4. Script sayfa sayfa ilerleyip tüm ürünleri toplar, en sonda tek seferde kaydeder.
 *
 * Sayfalama butonu bulunamazsa: Panelde "Sonraki" / "Next" / ">" butonuna sağ tık → Öğeyi denetle →
 * class veya aria-label'ı bana yazın, script'e ekleyebilirim.
 *
 * DAHA HIZLI ALTERNATİF: F12 → Network → Listede bir "Sonraki" tıklayın. İsteklerde "product", "list",
 * "item" veya sayfa numarası geçen bir URL görürseniz (örn. ?page=2) o API'yi kullanabiliriz;
 * 80 sayfayı tek tek DOM yerine fetch ile çekip ~1 dakikada bitirebiliriz.
 */

(async function () {
  const SAVE_URL = "http://localhost:3000/api/products/save";
  const MAX_PAGES = 85;
  const WAIT_MS = 2200;
  const WAIT_AFTER_EMPTY_MS = 800;

  const rowSelectors = [
    "table tbody tr",
    '[role="row"]',
    ".ag-row",
    ".ag-center-cols-viewport .ag-row",
    '[data-row-id]',
    ".ant-table-tbody tr",
    '[class*="TableRow"]',
    '[class*="table-row"]',
  ];

  const nextPageSelectors = [
    '.ag-paging-button[ref="btNext"]',
    '.ag-paging-button-next',
    '[ref="btNext"]',
    'button.ag-paging-button:last-child',
    '.ag-paging-button.ag-disabled + .ag-paging-button',
    '.ag-paging-row-summary-panel ~ .ag-paging-button:last-child',
    '.ant-pagination-next:not(.ant-pagination-disabled)',
    '.ant-pagination-next button',
    '[aria-label="Next Page"]',
    '[aria-label="Sonraki sayfa"]',
    'button[aria-label="Next"]',
    'a.ant-pagination-item-link',
    '.pagination .next',
    '[class*="pagination"] button:last-child',
    'button:contains("Sonraki")',
    'button:contains("Next")',
    '.ag-icon-next',
    '[class*="next"]',
    'span.ag-icon.ag-icon-next',
    '.ag-picker-field-wrapper + button',
  ];

  const getText = (el) =>
    (el && el.textContent ? el.textContent.trim() : "") || "";
  const getImgSrc = (el) =>
    el && el.querySelector && el.querySelector("img")
      ? el.querySelector("img").src
      : "";

  function scrapeCurrentPage() {
    let rows = [];
    for (const sel of rowSelectors) {
      try {
        rows = document.querySelectorAll(sel);
        if (rows.length >= 2) break;
      } catch (e) {}
    }
    const products = [];
    for (const row of rows) {
      const cells = row.querySelectorAll(
        'td, [role="gridcell"], .ag-cell, [class*="ag-cell"], [class*="cell"]'
      );
      if (cells.length < 2) continue;
      let barcode = "",
        imageUrl = "",
        productId = "",
        name = "";
      if (cells.length >= 4) {
        barcode = getText(cells[0]);
        imageUrl = getImgSrc(cells[1]) || getImgSrc(cells[0]);
        productId = getText(cells[2]);
        name = getText(cells[3]);
      } else {
        for (let i = 0; i < cells.length; i++) {
          const t = getText(cells[i]);
          const src = getImgSrc(cells[i]);
          if (src) imageUrl = src;
          if (t && /^\d{8,}$/.test(t.replace(/\s/g, "")))
            barcode = t.replace(/\s/g, "");
          if (t && t.length > 15 && /^[a-f0-9]{24}$/i.test(t)) productId = t;
          if (
            t &&
            t.length > 5 &&
            !/^\d+$/.test(t) &&
            !/^[a-f0-9]{24}$/i.test(t)
          )
            name = t;
        }
      }
      if (!barcode && !name) continue;
      products.push({
        name: name || "-",
        barcode: (barcode || "").replace(/\s/g, ""),
        imageUrl: imageUrl || undefined,
        productId: productId || undefined,
      });
    }
    return products;
  }

  function findAndClickNext() {
    const tryClick = (el) => {
      if (!el) return false;
      const disabled =
        el.getAttribute("aria-disabled") === "true" ||
        el.classList.contains("ant-pagination-disabled") ||
        el.classList.contains("ag-disabled") ||
        el.closest(".ant-pagination-disabled") ||
        el.closest(".ag-disabled");
      if (disabled) return false;
      el.click();
      return true;
    };
    for (const sel of nextPageSelectors) {
      try {
        if (sel.startsWith("button:contains") || sel.startsWith("a:contains")) continue;
        const el = document.querySelector(sel);
        if (tryClick(el)) return true;
        const parent = el && (el.closest("button") || el.parentElement);
        if (parent && tryClick(parent)) return true;
      } catch (e) {}
    }
    const byText = document.evaluate(
      "//button[contains(.,'Sonraki')] | //a[contains(.,'Sonraki')] | //button[contains(.,'Next')] | //span[contains(.,'›')]/.. | //span[contains(@class,'ag-icon-next')]/..",
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    const node = byText.singleNodeValue;
    if (node && tryClick(node)) return true;
    if (node && tryClick(node.parentElement)) return true;
    const allButtons = document.querySelectorAll("button, a, [role='button']");
    for (const btn of allButtons) {
      const text = getText(btn).toLowerCase();
      if ((text.includes("sonraki") || text.includes("next") || text === "›" || text === ">") && tryClick(btn)) {
        return true;
      }
    }
    return false;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  const allProducts = [];
  const seenIds = new Set();
  
  if (window.__GETIR_SCRAPED_PRODUCTS__ && Array.isArray(window.__GETIR_SCRAPED_PRODUCTS__)) {
    for (const p of window.__GETIR_SCRAPED_PRODUCTS__) {
      const id = p.productId || p.barcode || p.name;
      if (id) {
        seenIds.add(id);
        allProducts.push(p);
      }
    }
    console.log(`Önceki çalışmadan ${allProducts.length} ürün yüklendi, kaldığı yerden devam ediliyor...`);
  }
  
  let page = 1;
  let noNewCount = 0;

  console.log("Başlıyor: sayfa 1 okunuyor...");

  while (page <= MAX_PAGES) {
    let batch = scrapeCurrentPage();
    if (batch.length <= 1 && page > 1) {
      await sleep(WAIT_AFTER_EMPTY_MS);
      batch = scrapeCurrentPage();
    }
    let newInBatch = 0;
    for (const p of batch) {
      const id = p.productId || p.barcode || p.name;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        allProducts.push(p);
        newInBatch++;
      }
    }

    console.log(
      `Sayfa ${page}: ${batch.length} satır, ${newInBatch} yeni → Toplam benzersiz: ${allProducts.length}`
    );

    if (batch.length === 0) noNewCount++;
    else noNewCount = 0;
    if (noNewCount >= 2) {
      console.log("2 sayfa üst üste boş, duruluyor.");
      break;
    }

    if (page === MAX_PAGES) break;

    let hasNext = findAndClickNext();
    if (!hasNext) {
      await sleep(800);
      hasNext = findAndClickNext();
    }
    if (!hasNext) {
      console.log("Sonraki sayfa butonu bulunamadı veya devre dışı, bitiriliyor.");
      break;
    }

    page++;
    await sleep(WAIT_MS);
  }

  const cleaned = allProducts.filter(
    (p) =>
      p.name !== "Ürün Görseli" &&
      p.barcode !== "Barkodlar"
  ).map((p) => ({
    ...p,
    barcode:
      typeof p.barcode === "string" && p.barcode.length > 13
        ? p.barcode.slice(0, 13)
        : p.barcode || "",
  }));

  console.log("Toplam benzersiz ürün:", cleaned.length);

  try {
    const res = await fetch(SAVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cleaned),
    });
    const data = await res.json();
    if (data.ok) {
      console.log("✅ " + (data.message || "data/products.json güncellendi."));
    } else {
      console.warn("Kayıt yanıtı:", data);
      if (typeof copy === "function") copy(JSON.stringify(cleaned, null, 2));
    }
  } catch (err) {
    console.warn("Kayıt hatası (CORS veya ağ):", err.message);
    if (typeof copy === "function") {
      copy(JSON.stringify(cleaned, null, 2));
      console.log("✅ JSON panoya kopyalandı. Projeyi yeniden başlatıp (npm run dev) tekrar deneyin veya bana yapıştırın, dosyaya kaydedeyim.");
    }
  }

  window.__GETIR_SCRAPED_PRODUCTS__ = cleaned;
  return cleaned;
})();
