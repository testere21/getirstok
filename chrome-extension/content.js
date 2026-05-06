// Content Script - franchise.getir.com ve warehouse.getir.com sayfalarında çalışır
// Token yakalandığında kullanıcıya görsel geri bildirim gösterir

// Token yakalandığında gösterilecek bildirim
function showTokenCapturedNotification(panelName) {
  // Basit bir toast notification oluştur
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #10b981;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = `✓ ${panelName} token yakalandı ve kaydedildi!`;
  
  // Animasyon için style ekle
  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  
  // 3 saniye sonra kaldır
  setTimeout(() => {
    notification.style.animation = "slideIn 0.3s ease-out reverse";
    setTimeout(() => {
      notification.remove();
      style.remove();
    }, 300);
  }, 3000);
}

// Hangi panelde olduğumuzu belirle
const isFranchisePanel = window.location.hostname.includes("franchise.getir.com");
const isWarehousePanel = window.location.hostname.includes("warehouse.getir.com");

// Storage'dan token yakalama olayını dinle
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") {
    // Bayi Paneli token yakalandı
    if (changes.lastCapturedAt_franchise && isFranchisePanel) {
      showTokenCapturedNotification("Bayi Paneli");
    }
    
    // Depo Paneli token yakalandı
    if (changes.lastCapturedAt_warehouse && isWarehousePanel) {
      showTokenCapturedNotification("Depo Paneli");
    }
  }
});

const panelName = isFranchisePanel ? "Bayi Paneli" : isWarehousePanel ? "Depo Paneli" : "Bilinmeyen";
console.log(`[Getir Token Yakalayıcı] Content script yüklendi (${panelName})`);

// -----------------------------
// Sipariş detayında "Kopyala + panelde ara" (franchise + warehouse)
// -----------------------------

function ensureStyleOnce() {
  if (document.getElementById("getirstok-search-style")) return;
  const style = document.createElement("style");
  style.id = "getirstok-search-style";
  style.textContent = `
    .getirstok-search-btn {
      margin-left: 8px;
      padding: 4px 8px;
      border-radius: 8px;
      border: 1px solid rgba(245, 158, 11, 0.55);
      background: linear-gradient(90deg, rgba(245, 158, 11, 0.95), rgba(234, 88, 12, 0.95));
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      line-height: 1.2;
      white-space: nowrap;
    }
    .getirstok-search-btn:hover { filter: brightness(1.02); }
  `;
  document.head.appendChild(style);
}

function normalizeText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function looksLikeProductName(text) {
  const t = normalizeText(text);
  if (!t) return false;
  // çok kısa veya tamamen sayı ise ürün adı değil
  if (t.length < 4) return false;
  if (/^\d+$/.test(t)) return false;
  // başlık olmasın
  const lower = t.toLowerCase();
  if (lower === "ürün adı" || lower === "adet" || lower === "#" || lower === "ürün") return false;
  return true;
}

function pickNameCellFromRowCells(cells) {
  // en olası ürün adı: en uzun metne sahip hücre
  let best = null;
  let bestLen = 0;
  for (const c of cells) {
    const txt = normalizeText(c?.innerText || "");
    if (!looksLikeProductName(txt)) continue;
    if (txt.length > bestLen) {
      bestLen = txt.length;
      best = c;
    }
  }
  return best;
}

function injectButtonIntoCell(cell, name) {
  if (!cell) return;
  if (cell.querySelector(".getirstok-search-btn")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "getirstok-search-btn";
  btn.textContent = "Kopyala + panelde ara";
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const q = normalizeText(name);
    if (!q) return;
    try {
      await navigator.clipboard.writeText(q);
    } catch {
      // clipboard başarısız olabilir; sorun değil
    }
    try {
      chrome.runtime.sendMessage({ type: "GETIRSTOK_OPEN_SEARCH", query: q });
    } catch {}
  });
  cell.appendChild(btn);
}

function tryInjectButtons() {
  if (!isFranchisePanel && !isWarehousePanel) return;
  ensureStyleOnce();

  // 1) Eğer gerçek <table> varsa: ÜRÜN ADI sütununa buton ekle
  const tables = Array.from(document.querySelectorAll("table"));
  for (const table of tables) {
    const thead = table.querySelector("thead");
    const headerText = normalizeText(thead?.innerText || "");
    const headerLower = headerText.toLowerCase();
    // Sipariş ürün tablosu: "Ürün Adı" + "Adet" barındırmalı
    if (!headerLower.includes("ürün adı") || !headerLower.includes("adet"))
      continue;

    // Ürün adı sütun index'ini bul
    const ths = Array.from(thead?.querySelectorAll("th") ?? []);
    let nameColIdx = -1;
    for (let i = 0; i < ths.length; i++) {
      const t = normalizeText(ths[i].innerText || "").toLowerCase();
      if (t === "ürün adı" || t.includes("ürün adı")) {
        nameColIdx = i;
        break;
      }
    }
    if (nameColIdx < 0) continue;

    const rows = Array.from(table.querySelectorAll("tbody tr"));
    for (const tr of rows) {
      const tds = Array.from(tr.querySelectorAll("td"));
      if (tds.length === 0) continue;
      const nameCell = tds[nameColIdx] ?? null;
      if (!nameCell) continue;
      const name = normalizeText(nameCell.innerText || "");
      if (!looksLikeProductName(name)) continue;

      // Sadece ürün adının yanında göster: butonu cell'in sonuna ekle
      injectButtonIntoCell(nameCell, name);
    }
  }
}

if (isFranchisePanel || isWarehousePanel) {
  // Sayfa SPA olduğu için dinamik: mutasyonla takip et
  const mo = new MutationObserver(() => tryInjectButtons());
  mo.observe(document.documentElement, { childList: true, subtree: true });
  // İlk deneme
  setTimeout(tryInjectButtons, 800);
  setTimeout(tryInjectButtons, 2500);
}

