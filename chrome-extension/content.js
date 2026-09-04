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

// -----------------------------
// Depo: Pişirme Önerileri → panele kaydet
// -----------------------------

const BAKE_SLOT_KEYS = ["08-12", "12-16", "16-20", "20-00"];

function headerTextToSlotKey(text) {
  const t = String(text || "").replace(/\s+/g, " ");
  if (/08:00/.test(t) && /12:00/.test(t)) return "08-12";
  if (/12:00/.test(t) && /16:00/.test(t)) return "12-16";
  if (/16:00/.test(t) && /20:00/.test(t)) return "16-20";
  if (/20:00/.test(t) && /00:00/.test(t)) return "20-00";
  return null;
}

function countSlotHeadersInText(text) {
  const t = String(text || "");
  let n = 0;
  if (/08:00\s*[-–]\s*12:00/.test(t)) n++;
  if (/12:00\s*[-–]\s*16:00/.test(t)) n++;
  if (/16:00\s*[-–]\s*20:00/.test(t)) n++;
  if (/20:00\s*[-–]\s*00:00/.test(t)) n++;
  return n;
}

function firstNumberField(obj, keys) {
  if (!obj || typeof obj !== "object") return null;
  for (const k of keys) {
    const n = Number(obj[k]);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

function mergeBakeItem(map, name, slot, qty, productId) {
  const n = String(name || "").replace(/\s+/g, " ").trim();
  if (!n || n.length < 4 || !slot || !Number.isFinite(qty)) return;
  if (!map[n]) map[n] = { name: n, slots: {}, productId };
  map[n].slots[slot] = Math.round(qty);
  if (productId && !map[n].productId) map[n].productId = productId;
}

function walkBakeJson(node, map, inheritedSlot) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((x) => walkBakeJson(x, map, inheritedSlot));
    return;
  }
  const slotFromText = headerTextToSlotKey(
    String(
      node.label ||
        node.title ||
        node.name ||
        node.interval ||
        node.slot ||
        node.timeRange ||
        node.startHour ||
        ""
    )
  );
  const start = node.start || node.from || node.startTime || node.begin;
  const end = node.end || node.to || node.endTime || node.finish;
  const slotFromRange = headerTextToSlotKey(`${start || ""} ${end || ""}`);
  const slot = slotFromRange || slotFromText || inheritedSlot;

  const productName =
    node.productName ||
    node.fullName ||
    node.product?.name ||
    (typeof node.name === "string" && !headerTextToSlotKey(node.name)
      ? node.name
      : null);
  const productId = String(
    node.productId || node.product?.id || node.id || node._id || ""
  );
  const qty = firstNumberField(node, [
    "bakeCount",
    "suggestedBake",
    "quantityToBake",
    "toBake",
    "cookAmount",
    "bakingSuggestion",
    "suggestedQuantity",
    "recommendedQuantity",
    "bakeQuantity",
    "amountToBake",
    "productionAmount",
    "suggestedBakeCount",
    "bakeSuggestion",
    "numberToBake",
    "pisir",
    "pişir",
  ]);
  if (productName && slot && qty != null) {
    const pid = /^[a-f0-9]{24}$/i.test(productId) ? productId : undefined;
    mergeBakeItem(map, productName, slot, qty, pid);
  }

  for (const v of Object.values(node)) {
    if (v && typeof v === "object") walkBakeJson(v, map, slot);
  }
}

function scrapeDomBakeSuggestions() {
  const map = {};
  const headerEls = [];
  const all = document.querySelectorAll("h1,h2,h3,h4,div,span,p,button");
  for (const el of all) {
    const raw = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (raw.length > 64) continue;
    const key = headerTextToSlotKey(raw);
    if (!key) continue;
    headerEls.push({ el, key, len: raw.length });
  }
  const headersByKey = {};
  for (const h of headerEls) {
    if (!headersByKey[h.key] || h.len < headersByKey[h.key].len) {
      headersByKey[h.key] = h;
    }
  }
  const headers = Object.values(headersByKey);
  if (headers.length === 0) return [];

  const badgeCandidates = document.querySelectorAll("span,div,p,button,li");
  const badges = [];
  for (const el of badgeCandidates) {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    const m = t.match(/^(\d+)\s*Pişir$/i);
    if (!m) continue;
    let childAlso = false;
    const kids = el.querySelectorAll("span,div,p,button");
    for (const k of kids) {
      if (k !== el && /^\d+\s*Pişir$/i.test((k.textContent || "").replace(/\s+/g, " ").trim())) {
        childAlso = true;
        break;
      }
    }
    if (childAlso) continue;
    badges.push({ el, qty: Number(m[1]) });
  }

  function slotForBadge(el) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    let best = null;
    let bestDist = Infinity;
    for (const h of headers) {
      const hr = h.el.getBoundingClientRect();
      if (hr.width < 8) continue;
      const hcx = hr.left + hr.width / 2;
      const dist = Math.abs(cx - hcx);
      const inColumn = cx >= hr.left - 24 && cx <= hr.right + 24;
      const score = inColumn ? dist / 4 : dist;
      if (score < bestDist) {
        bestDist = score;
        best = h.key;
      }
    }
    return best;
  }

  function productNameNear(badgeEl) {
    let el = badgeEl.parentElement;
    for (let i = 0; i < 12 && el; i++) {
      const raw = el.innerText || "";
      const lines = raw
        .split("\n")
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      for (const line of lines) {
        if (line.length < 8 || line.length > 90) continue;
        if (/^\d+\s*Pişir$/i.test(line)) continue;
        if (headerTextToSlotKey(line)) continue;
        if (/^(satılan|rezerve|donuk|raf)\b/i.test(line)) continue;
        if (/pişirme öner|pişirme talimat/i.test(line)) continue;
        if (!/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(line)) continue;
        if (/^\d+$/.test(line)) continue;
        return line;
      }
      el = el.parentElement;
    }
    return "";
  }

  for (const { el, qty } of badges) {
    const slot = slotForBadge(el);
    const name = productNameNear(el);
    if (slot && name) mergeBakeItem(map, name, slot, qty);
  }

  // Aktif (açık detaylı) kartlar = şu anki saat dilimi — sütun eşleşmesi kaçarsa yedek
  const hour = new Date().getHours();
  let currentSlot = null;
  if (hour >= 8 && hour < 12) currentSlot = "08-12";
  else if (hour >= 12 && hour < 16) currentSlot = "12-16";
  else if (hour >= 16 && hour < 20) currentSlot = "16-20";
  else if (hour >= 20) currentSlot = "20-00";

  function isExpandedCard(badgeEl) {
    let p = badgeEl.parentElement;
    for (let i = 0; i < 10 && p; i++) {
      const t = p.innerText || "";
      if (/Satılan/i.test(t) && /\bRaf\b/i.test(t) && /Donuk/i.test(t)) {
        return true;
      }
      p = p.parentElement;
    }
    return false;
  }

  if (currentSlot) {
    for (const { el, qty } of badges) {
      if (!isExpandedCard(el)) continue;
      const name = productNameNear(el);
      if (name) mergeBakeItem(map, name, currentSlot, qty);
    }
  }
  return Object.values(map);
}

let lastBakePayloadHash = "";

function publishBakeSuggestions(items) {
  if (!Array.isArray(items) || items.length === 0) return;
  const cleaned = items
    .map((it) => ({
      name: String(it.name || "").trim(),
      productId: it.productId,
      slots: it.slots || {},
    }))
    .filter((it) => it.name && BAKE_SLOT_KEYS.some((k) => it.slots[k] != null));
  if (cleaned.length === 0) return;
  const hash = JSON.stringify(cleaned);
  if (hash === lastBakePayloadHash) return;
  console.log(
    "[Getir Token Yakalayıcı] Pişirme önerileri yakalandı:",
    cleaned.length,
    cleaned.slice(0, 3)
  );
  try {
    chrome.runtime.sendMessage(
      { type: "BAKERY_SUGGESTIONS_SAVE", items: cleaned },
      (res) => {
        if (chrome.runtime.lastError) {
          lastBakePayloadHash = "";
          console.error(
            "[Getir Token Yakalayıcı] Pişirme önerisi kayıt kanalı:",
            chrome.runtime.lastError.message
          );
          return;
        }
        if (res && res.ok) {
          lastBakePayloadHash = hash;
          console.log(
            "[Getir Token Yakalayıcı] Pişirme önerileri panele kaydedildi"
          );
        } else {
          lastBakePayloadHash = "";
          console.error(
            "[Getir Token Yakalayıcı] Pişirme önerileri kaydı başarısız:",
            res
          );
        }
      }
    );
  } catch (e) {
    lastBakePayloadHash = "";
    console.error("[Getir Token Yakalayıcı] Pişirme önerisi gönderilemedi:", e);
  }
}

if (isWarehousePanel) {
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (data && data.source === "getirstok-oidc-hook") {
      try {
        chrome.runtime.sendMessage({
          type: "WAREHOUSE_OIDC_TOKEN",
          data: data.data,
        });
      } catch {
        /* ignore */
      }
      return;
    }
    if (data && data.source === "getirstok-transfer-hook") {
      try {
        chrome.runtime.sendMessage({
          type: "WAREHOUSE_TRANSFER_CAPTURE",
          url: data.url,
          method: data.method,
          requestBody: data.requestBody,
          summary: data.summary,
        });
      } catch {
        /* ignore */
      }
      return;
    }
    if (!data || data.source !== "getirstok-bake-hook") return;
    const map = {};
    walkBakeJson(data.json, map, null);
    publishBakeSuggestions(Object.values(map));
  });

  function tryScrapeBakePage() {
    const bodyText = document.body ? document.body.innerText : "";
    if (!bodyText) return;
    if (!/\d+\s*Pişir/i.test(bodyText)) return;
    const items = scrapeDomBakeSuggestions();
    if (items.length === 0) {
      console.warn(
        "[Getir Token Yakalayıcı] Pişir rozetleri var ama sütun/ürün eşleşmedi, tekrar denenecek"
      );
      return;
    }
    publishBakeSuggestions(items);
  }

  setInterval(tryScrapeBakePage, 6000);
  setTimeout(tryScrapeBakePage, 1500);
  setTimeout(tryScrapeBakePage, 4000);
}

