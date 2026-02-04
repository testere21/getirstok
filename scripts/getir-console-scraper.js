/**
 * Getir Depo Paneli (warehouse.getir.com - Raf Etiketi) sayfasında çalıştırın.
 *
 * OTOMATIK KAYIT (önerilen):
 * 1. Projede "npm run dev" çalışıyor olsun (örn. http://localhost:3000).
 * 2. Getir ürün listesi sayfasında listeyi aşağı kaydırarak tüm ürünlerin yüklendiğinden emin olun.
 * 3. F12 → Console. Bu dosyanın TAMAMINI kopyalayıp konsola yapıştırın, Enter.
 * 4. Script veriyi toplar ve projedeki data/products.json dosyasına otomatik kaydeder.
 *
 * Port farklıysa: Aşağıdaki SAVE_URL'i değiştirin (örn. 'http://localhost:3001/api/products/save').
 *
 * Çalışmazsa: Bir ürün satırına sağ tık → "Öğeyi denetle" → satırın tag/class'ına bakın.
 * rowSelectors dizisine gerekirse yeni selector ekleyin.
 */

(function () {
  // Proje dev server adresi (port farklıysa buradan değiştirin)
  const SAVE_URL = "http://localhost:3000/api/products/save";

  const products = [];
  let rows = [];

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

  for (const sel of rowSelectors) {
    try {
      rows = document.querySelectorAll(sel);
      if (rows.length >= 2) break;
    } catch (e) {}
  }

  if (rows.length === 0) {
    console.log(
      "Satır bulunamadı. Öğeyi denetle ile bir ürün satırına tıklayıp tag/class adını kontrol edin."
    );
    return;
  }

  const getText = (el) =>
    (el && el.textContent ? el.textContent.trim() : "") || "";
  const getImgSrc = (el) =>
    el && el.querySelector && el.querySelector("img")
      ? el.querySelector("img").src
      : "";

  for (const row of rows) {
    const cells = row.querySelectorAll(
      "td, [role=\"gridcell\"], .ag-cell, [class*=\"ag-cell\"], [class*=\"cell\"]"
    );
    if (cells.length < 2) continue;

    let barcode = "";
    let imageUrl = "";
    let productId = "";
    let name = "";

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

  console.log("Toplam:", products.length, "ürün");

  function fallbackCopy() {
    const json = JSON.stringify(products, null, 2);
    console.log(json);
    try {
      if (typeof copy === "function") {
        copy(json);
        console.log(
          "Panoya kopyalandı. data/products.json içine yapıştırıp kaydedin."
        );
      } else {
        console.log("Yukarıdaki JSON'u seçip Ctrl+C ile kopyalayın.");
      }
    } catch (e) {
      console.log("Yukarıdaki JSON çıktısını seçip Ctrl+C ile kopyalayın.");
    }
  }

  fetch(SAVE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(products),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.ok) {
        console.log(
          "✅ " + (data.message || "data/products.json güncellendi.")
        );
      } else {
        console.warn("Kayıt yanıtı:", data);
        fallbackCopy();
      }
    })
    .catch((err) => {
      console.warn(
        "Otomatik kayıt başarısız (npm run dev çalışıyor mu?):",
        err.message
      );
      fallbackCopy();
    });

  window.__GETIR_SCRAPED_PRODUCTS__ = products;
  return products;
})();
