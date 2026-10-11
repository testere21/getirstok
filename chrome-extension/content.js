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
const isFranchisePanel = /^franchise(-v2)?\.getir\.com$/.test(window.location.hostname);
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
// -----------------------------
// Sipariş detayında "Kopyala + panelde ara" & "Barkodları göster" (franchise + warehouse)
// -----------------------------

let showBarcodes = false;
const liveOrderBarcodes = {};

function ensureStyleOnce() {
  if (document.getElementById("getirstok-search-style")) return;
  const style = document.createElement("style");
  style.id = "getirstok-search-style";
  style.textContent = `
    .getirstok-search-btn {
      margin-left: 8px;
      width: 24px;
      height: 24px;
      padding: 0;
      border-radius: 999px;
      border: 1px solid rgba(245, 158, 11, 0.55);
      background: linear-gradient(90deg, rgba(245, 158, 11, 0.95), rgba(234, 88, 12, 0.95));
      color: #fff;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
      flex-shrink: 0;
      transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
    }
    .getirstok-search-btn:hover {
      filter: brightness(1.08);
      transform: scale(1.12);
      box-shadow: 0 4px 10px -2px rgba(234, 88, 12, 0.55);
    }
    .getirstok-search-btn:active { transform: scale(0.96); }
    .getirstok-search-btn svg { width: 14px; height: 14px; display: block; transition: transform 0.18s ease; }
    .getirstok-search-btn:hover svg { transform: translateX(1.5px); }
    .getirstok-search-btn.copied { background: #16a34a; border-color: #16a34a; }

    .getirstok-toggle-barcodes-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 8px;
      border: 1px solid #5c3ebc;
      background: #ffffff;
      color: #5c3ebc;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      line-height: 1.2;
      transition: all 0.2s ease;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      user-select: none;
    }
    .getirstok-toggle-barcodes-btn:hover {
      background: #f5f3ff;
      border-color: #4c329b;
      transform: translateY(-1px);
      box-shadow: 0 6px 14px -4px rgba(93, 62, 188, 0.35);
    }
    .getirstok-toggle-barcodes-btn:active { transform: translateY(0); }
    .getirstok-toggle-barcodes-btn.active:hover { background: #4c329b; }
    .getirstok-toggle-barcodes-btn.active {
      background: #5c3ebc;
      color: #ffffff;
      box-shadow: 0 2px 5px rgba(92, 62, 188, 0.35);
    }

    .getirstok-barcode-wrap {
      display: none;
      margin-top: 6px;
    }
    .getirstok-bc-card {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 5px 4px 6px;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06);
      transition: border-color 0.18s ease, box-shadow 0.18s ease;
    }
    .getirstok-bc-card:hover {
      border-color: #d9cff8;
      box-shadow: 0 4px 12px -4px rgba(93, 62, 188, 0.25);
    }
    .getirstok-bc-main {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }
    .getirstok-bc-canvas {
      display: block;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }
    .getirstok-bc-num {
      font: 600 10.5px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      letter-spacing: 0.08em;
      color: #374151;
      user-select: all;
    }
    .getirstok-bc-copy {
      width: 26px;
      height: 26px;
      padding: 0;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      background: #f9fafb;
      color: #6b7280;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .getirstok-bc-copy:hover {
      background: #f3f0ff;
      border-color: #d9d0f7;
      color: #5d3ebc;
    }
    .getirstok-bc-copy.copied {
      background: #f0fdf4;
      border-color: #bbf7d0;
      color: #16a34a;
    }
    .getirstok-bc-copy svg { width: 14px; height: 14px; display: block; }
    .getirstok-bc-missing {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      background: #f3f4f6;
      font: 500 11px/1.4 system-ui, sans-serif;
      color: #9ca3af;
    }

    /* ── Sipariş detayı penceresi (yalnızca decorateOrderModal ile işaretlenen modal) ──
       Ant Design stilleri sonradan yüklendiği için !important gerekiyor. */
    .ant-modal-content.getirstok-order-modal {
      border-radius: 18px !important;
      padding: 18px 20px 20px !important;
      box-shadow: 0 24px 56px -16px rgba(31, 27, 46, 0.35) !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-modal-header {
      margin-bottom: 12px !important;
      padding: 0 !important;
      border: none !important;
      background: transparent !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-modal-title {
      font-size: 17px !important;
      font-weight: 700 !important;
      color: #1f1b2e !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-modal-title .ant-tag {
      margin: 0 !important;
      padding: 1px 10px !important;
      font: 600 11.5px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
      color: #5d3ebc !important;
      background: #f3f0ff !important;
      border: 1px solid #e4dcfb !important;
      border-radius: 999px !important;
    }

    /* Genel bilgiler: tek panel, 4 sütun, etiket ve değer yan yana */
    .ant-modal-content.getirstok-order-modal .ant-descriptions {
      margin: 0 0 14px !important;
      padding: 0 !important;
      background: transparent !important;
      border: none !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-descriptions-view {
      padding: 10px 14px !important;
      background: #faf9fd !important;
      border: 1px solid #eeebf6 !important;
      border-radius: 14px !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-descriptions-view > table {
      display: block !important;
      width: 100% !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-descriptions-view > table > tbody {
      display: grid !important;
      grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      gap: 6px 18px !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-descriptions-row {
      display: contents !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-descriptions-item {
      display: block !important;
      min-width: 0;
      order: 20;
      padding: 3px 0 !important;
      background: transparent !important;
      border: none !important;
    }
    /* Satır 1: müşteri · adres · durum — Satır 2: adres açıklaması · lokasyon · adet — Satır 3: toplayıcı · kurye · not */
    .ant-modal-content.getirstok-order-modal [data-getirstok-field="customer"] { order: 1; }
    .ant-modal-content.getirstok-order-modal [data-getirstok-field="address"] { order: 2; }
    .ant-modal-content.getirstok-order-modal [data-getirstok-field="status"] { order: 3; }
    .ant-modal-content.getirstok-order-modal [data-getirstok-field="address-note"] { order: 4; }
    .ant-modal-content.getirstok-order-modal [data-getirstok-field="location"] { order: 5; }
    .ant-modal-content.getirstok-order-modal [data-getirstok-field="count"] { order: 6; }
    .ant-modal-content.getirstok-order-modal [data-getirstok-field="picker"] { order: 7; }
    .ant-modal-content.getirstok-order-modal [data-getirstok-field="courier"] { order: 8; }
    .ant-modal-content.getirstok-order-modal [data-getirstok-field="note"] { order: 9; }
    .ant-modal-content.getirstok-order-modal [data-getirstok-field="bag"] {
      display: none !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-descriptions-item[data-getirstok-field="address"],
    .ant-modal-content.getirstok-order-modal .ant-descriptions-item[data-getirstok-field="address-note"],
    .ant-modal-content.getirstok-order-modal .ant-descriptions-item[data-getirstok-field="note"] {
      grid-column: span 2 !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-descriptions-item-container {
      display: flex !important;
      flex-wrap: nowrap !important;
      align-items: baseline !important;
      gap: 6px !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-descriptions-item-label {
      margin: 0 !important;
      padding: 0 !important;
      font-size: 11.5px !important;
      font-weight: 500 !important;
      line-height: 1.5 !important;
      color: #9a94ad !important;
      white-space: nowrap !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-descriptions-item-label::after {
      display: none !important;
      content: none !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-descriptions-item-content {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 13px !important;
      font-weight: 600 !important;
      line-height: 1.5 !important;
      color: #1f1b2e !important;
      word-break: break-word;
    }
    .ant-modal-content.getirstok-order-modal .ant-descriptions-item-content .ant-tag {
      margin: 0 !important;
      padding: 0 7px !important;
      font-size: 11.5px !important;
      line-height: 18px !important;
      font-weight: 700 !important;
      border-radius: 6px !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-descriptions-item-content [class*="avatarSection"] {
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      vertical-align: middle;
    }
    .ant-modal-content.getirstok-order-modal .ant-descriptions-item-content .ant-avatar {
      width: 18px !important;
      height: 18px !important;
      font-size: 10px !important;
      margin: 0 !important;
    }
    .ant-modal-content.getirstok-order-modal [data-getirstok-field="status"] .ant-descriptions-item-content {
      flex: none !important;
      width: max-content !important;
      max-width: 100% !important;
      display: inline-block !important;
      padding: 0 9px !important;
      border-radius: 999px !important;
      background: #ede9fe !important;
      color: #5d3ebc !important;
      font-size: 11.5px !important;
      font-weight: 700 !important;
      line-height: 20px !important;
    }
    .ant-modal-content.getirstok-order-modal [data-getirstok-field="note"][data-getirstok-filled="1"] {
      margin: -1px -8px !important;
      padding: 3px 8px !important;
      background: #fffbeb !important;
      border-radius: 8px !important;
      box-shadow: inset 0 0 0 1px #fde68a !important;
    }
    .ant-modal-content.getirstok-order-modal [data-getirstok-field="note"][data-getirstok-filled="1"] .ant-descriptions-item-label {
      color: #b45309 !important;
    }

    .ant-modal-content.getirstok-order-modal [class*="missingProductContainer"] {
      margin: 0 0 12px !important;
    }

    /* Ürün listeleri */
    .ant-modal-content.getirstok-order-modal .ant-row:has(.ant-table-wrapper) {
      margin-left: -6px !important;
      margin-right: -6px !important;
      row-gap: 12px !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-row:has(.ant-table-wrapper) > .ant-col {
      padding-left: 6px !important;
      padding-right: 6px !important;
    }
    /* Ürün sayısı tekse sağdaki boş "Veri Yok" tablosunu gizle, dolu tabloyu tam genişliğe yay */
    .ant-modal-content.getirstok-order-modal .ant-row:has(.ant-table:not(.ant-table-empty)) > .ant-col:has(.ant-table-empty) {
      display: none !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-row:has(.ant-table-empty) > .ant-col {
      flex: 0 0 100% !important;
      max-width: 100% !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-table {
      background: transparent !important;
    }
    /* Her ürün satırı ayrı bir kart: border-spacing ile aralık, kenarlıklar hücrelerde */
    .ant-modal-content.getirstok-order-modal .ant-table-container {
      background: transparent !important;
      border: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-container table {
      border: none !important;
      border-radius: 0 !important;
      border-collapse: separate !important;
      border-spacing: 0 8px !important;
      margin-top: -8px !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-thead > tr > th {
      padding: 4px 14px 0 !important;
      text-align: left !important;
      background: transparent !important;
      border: none !important;
      font-size: 11.5px !important;
      font-weight: 600 !important;
      color: #a19bb5 !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-thead > tr > th:first-child {
      width: 1% !important;
      white-space: nowrap !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-thead > tr > th::before {
      display: none !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody > tr.ant-table-row {
      transition: transform 0.18s ease, filter 0.18s ease;
      filter: drop-shadow(0 1px 1.5px rgba(31, 27, 46, 0.06));
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody > tr.ant-table-row > td {
      padding: 10px 14px !important;
      vertical-align: middle !important;
      background: #ffffff !important;
      border: none !important;
      border-top: 1px solid #e9e5f3 !important;
      border-bottom: 1px solid #e9e5f3 !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      color: #1f1b2e !important;
      transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody > tr.ant-table-row > td:first-child {
      padding-left: 10px !important;
      border-left: 1px solid #e9e5f3 !important;
      border-radius: 14px 0 0 14px !important;
      box-shadow: inset 4px 0 0 transparent;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody > tr.ant-table-row > td:last-child {
      border-right: 1px solid #e9e5f3 !important;
      border-radius: 0 14px 14px 0 !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody > tr.ant-table-row:hover {
      transform: translateY(-2px);
      filter: drop-shadow(0 8px 14px rgba(93, 62, 188, 0.16));
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody > tr.ant-table-row:hover > td {
      background: #fdfcff !important;
      border-color: #cfc3f5 !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody > tr.ant-table-row:hover > td:first-child {
      box-shadow: inset 4px 0 0 #7c5ce0;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody > tr.ant-table-row:hover > td:not(:first-child):not(:has(> .getirstok-search-btn)) {
      color: #4c2fa8 !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody .ant-image {
      width: 44px !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody .ant-image-img {
      box-sizing: border-box;
      width: 44px !important;
      height: 44px !important;
      padding: 3px;
      object-fit: contain;
      background: #ffffff;
      border: 1px solid #efecf7;
      border-radius: 12px;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody > tr.ant-table-row:hover .ant-image-img {
      transform: scale(1.08);
      border-color: #d9cff8;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody > tr.ant-table-row > td:has(> .getirstok-search-btn) {
      width: 1% !important;
      white-space: nowrap !important;
      font-size: 16px !important;
      font-weight: 800 !important;
      color: #5d3ebc !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody td:has(> .getirstok-search-btn)::before {
      content: "×";
      margin-right: 2px;
      font-size: 13px;
      font-weight: 600;
      color: #a19bb5;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-placeholder > td {
      background: #ffffff !important;
      border: 1px dashed #e4dff0 !important;
      border-radius: 14px !important;
    }

    /* Hover efektleri: bilgi alanları, butonlar, kapatma */
    .ant-modal-content.getirstok-order-modal .ant-descriptions-item {
      margin: 0 -8px !important;
      padding: 3px 8px !important;
      border-radius: 8px !important;
      transition: background 0.15s ease;
    }
    .ant-modal-content.getirstok-order-modal .ant-descriptions-item:hover {
      background: #f1edfb !important;
    }
    .ant-modal-content.getirstok-order-modal [data-getirstok-field="note"][data-getirstok-filled="1"]:hover {
      background: #fef3c7 !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-btn {
      transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-btn:not(:disabled):hover {
      transform: translateY(-1px);
      filter: brightness(1.06);
      box-shadow: 0 6px 14px -4px rgba(93, 62, 188, 0.45) !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-btn:not(:disabled):active {
      transform: translateY(0);
    }
    .ant-modal-content.getirstok-order-modal .ant-modal-close {
      border-radius: 10px !important;
      transition: background 0.18s ease, color 0.18s ease, transform 0.25s ease !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-modal-close:hover {
      background: #f1edfb !important;
      color: #5d3ebc !important;
      transform: rotate(90deg);
    }
    @media (max-width: 900px) {
      .ant-modal-content.getirstok-order-modal .ant-descriptions-view > table > tbody {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function normalizeText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function looksLikeProductName(text) {
  const t = normalizeText(text);
  if (!t) return false;
  if (t.length < 3) return false;
  if (/^\d+$/.test(t)) return false;
  const lower = t.toLowerCase();
  if (lower === "ürün adı" || lower === "adet" || lower === "#" || lower === "ürün") return false;
  return true;
}

function getCleanProductNameFromCell(cell) {
  if (!cell) return "";
  if (cell.dataset.getirstokOriginalName) {
    return cell.dataset.getirstokOriginalName;
  }
  const clone = cell.cloneNode(true);
  clone
    .querySelectorAll(".getirstok-search-btn, .getirstok-barcode-wrap, button")
    .forEach((el) => el.remove());
  const name = normalizeText(clone.innerText || "");
  if (looksLikeProductName(name)) {
    cell.dataset.getirstokOriginalName = name;
  }
  return name;
}

function resolveBarcode(name) {
  if (!name) return null;
  const raw = normalizeText(name);
  if (!raw) return null;

  // 1. Canlı Getir API yanıtından yakalanan barkodlar
  if (liveOrderBarcodes[raw]) return liveOrderBarcodes[raw];
  const lower = raw.toLowerCase();
  if (liveOrderBarcodes[lower]) return liveOrderBarcodes[lower];

  // 2. Paket içi katalog barkod haritası
  const catalog = window.__GETIRSTOK_CATALOG_BARCODES || {};
  if (catalog[lower]) return catalog[lower];
  if (catalog[raw]) return catalog[raw];

  // 3. Parantez içi gramaj/hacim temizleme (örn: "Sprite Limon (1 L)" -> "Sprite Limon")
  const base = raw.replace(/\s*\([^)]*\)\s*$/g, "").trim().toLowerCase();
  if (catalog[base]) return catalog[base];
  const noParens = raw.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
  if (catalog[noParens]) return catalog[noParens];

  // 4. Türkçe küçük harf kontrolü
  const trLower = raw.toLocaleLowerCase("tr-TR");
  if (catalog[trLower]) return catalog[trLower];
  const trBase = trLower.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  if (catalog[trBase]) return catalog[trBase];

  // 5. Ön ek eşleşmesi
  if (base.length >= 4) {
    for (const [key, bc] of Object.entries(catalog)) {
      if (key.startsWith(base) || base.startsWith(key)) {
        return bc;
      }
    }
  }

  return null;
}

const SEARCH_ARROW_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';

/** Ürün adını kopyalayıp panelde arayan küçük ok butonu (adet hücresine konur) */
function injectButtonIntoCell(cell, name) {
  if (!cell) return;
  const q = normalizeText(name);
  const existing = cell.querySelector(".getirstok-search-btn");
  if (existing) {
    // Sayfa satırı başka ürünle yeniden kullanırsa ok eski ürünü aramasın
    if (existing.dataset.query !== q) {
      existing.dataset.query = q;
      existing.setAttribute("aria-label", `${q} — kopyala ve panelde ara`);
    }
    return;
  }
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "getirstok-search-btn";
  btn.innerHTML = SEARCH_ARROW_SVG;
  btn.title = "Kopyala + panelde ara";
  btn.dataset.query = q;
  btn.setAttribute("aria-label", `${q} — kopyala ve panelde ara`);
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const q = btn.dataset.query || "";
    if (!q) return;
    try {
      await navigator.clipboard.writeText(q);
      btn.classList.add("copied");
      setTimeout(() => btn.classList.remove("copied"), 1200);
    } catch {
      // clipboard başarısız olabilir; sorun değil
    }
    try {
      chrome.runtime.sendMessage({ type: "GETIRSTOK_OPEN_SEARCH", query: q });
    } catch {}
  });
  cell.appendChild(btn);
}

// ── Barkod çizici: geçerli 13 haneli → EAN-13, diğerleri → Code128 (B/C) ──
const BARCODE = (function () {
  // Her sembol için çubuk/boşluk genişliklerini temsil eden desen dizisi (0-106)
  const P = [
    '212222','222122','222221','121223','121322','131222','122213','122312',
    '132212','221213','221312','231212','112232','122132','122231','113222',
    '123122','123221','223211','221132','221231','213212','223112','312131',
    '311222','321122','321221','312212','322112','322211','212123','212321',
    '232121','111323','131123','131321','112313','132113','132311','211313',
    '231113','231311','112133','112331','132131','113123','113321','133121',
    '313121','211331','231131','213113','213311','213131','311123','311321',
    '331121','312113','312311','332111','314111','221411','431111','111224',
    '111422','121124','121421','141122','141221','112214','112412','122114',
    '122411','142112','142211','241211','221114','413111','241112','134111',
    '111242','121142','121241','114212','124112','124211','411212','421112',
    '421211','212141','214121','412121','111143','111341','131141','114113',
    '114311','411113','411311','113141','114131','311141','411131','211412',
    '211214','211232','233111'
  ];

  /** Sadece rakamsa Code C (iki hane tek sembol) → barkod yarı genişlikte */
  function code128Bits(text) {
    const syms = [];
    if (/^\d{4,}$/.test(text)) {
      syms.push(105); // Start C
      const evenLen = text.length - (text.length % 2);
      for (let i = 0; i < evenLen; i += 2) syms.push(+text.slice(i, i + 2));
      if (evenLen < text.length) {
        syms.push(100); // Code B'ye geç
        syms.push(text.charCodeAt(evenLen) - 32);
      }
    } else {
      syms.push(104); // Start B
      for (let i = 0; i < text.length; i++) {
        let v = text.charCodeAt(i) - 32;
        if (v < 0 || v > 94) v = 0; // geçersiz karakteri boşlukla değiştir
        syms.push(v);
      }
    }
    let check = syms[0];
    for (let i = 1; i < syms.length; i++) check += i * syms[i];
    syms.push(check % 103);
    syms.push(106); // Stop

    let bits = "";
    for (const s of syms) {
      const pat = P[s];
      for (let j = 0; j < pat.length; j++) bits += (j % 2 === 0 ? "1" : "0").repeat(+pat[j]);
    }
    return bits + "11"; // stop sonrası sonlandırma çubuğu
  }

  const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
  const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

  function isValidEan13(text) {
    if (!/^\d{13}$/.test(text)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += +text[i] * (i % 2 === 0 ? 1 : 3);
    return (10 - (sum % 10)) % 10 === +text[12];
  }

  function ean13Bits(text) {
    const parity = EAN_PARITY[+text[0]];
    let bits = "101";
    for (let i = 1; i <= 6; i++) {
      const r = EAN_R[+text[i]];
      bits += parity[i - 1] === "L"
        ? r.replace(/./g, (c) => (c === "1" ? "0" : "1")) // L = R'nin tersi
        : r.split("").reverse().join("");                    // G = R'nin aynası
    }
    bits += "01010";
    for (let i = 7; i <= 12; i++) bits += EAN_R[+text[i]];
    return bits + "101";
  }

  /**
   * Canvas'ı cihaz pikseline göre çizer; ölçekli ekranda (ör. %125) çubuklar bulanıklaşmaz.
   * @returns kullanılan format ("EAN-13" | "CODE128")
   */
  function draw(canvas, text, opts) {
    const cssModule = (opts && opts.moduleWidth) || 2;
    const cssHeight = (opts && opts.height) || 34;
    const quiet = "0".repeat(10);
    const ean = isValidEan13(text);
    const bits = quiet + (ean ? ean13Bits(text) : code128Bits(text)) + quiet;

    const dpr = window.devicePixelRatio || 1;
    const mw = Math.max(1, Math.round(cssModule * dpr));
    canvas.width = bits.length * mw;
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${canvas.width / dpr}px`;
    canvas.style.height = `${canvas.height / dpr}px`;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";
    let i = 0;
    while (i < bits.length) {
      if (bits[i] !== "1") { i++; continue; }
      let j = i;
      while (j < bits.length && bits[j] === "1") j++;
      ctx.fillRect(i * mw, 0, (j - i) * mw, canvas.height);
      i = j;
    }
    return ean ? "EAN-13" : "CODE128";
  }

  return { draw };
})();

const COPY_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

// ────────────────────────────────────────────────────────────────────────────

function injectBarcodeIntoCell(cell, barcode) {
  if (!cell) return;

  let wrap = cell.querySelector('.getirstok-barcode-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'getirstok-barcode-wrap';
    cell.appendChild(wrap);
  }
  wrap.style.display = showBarcodes ? 'flex' : 'none';

  // Her DOM değişiminde yeniden çizme; aynı barkod zaten çizildiyse dokunma
  const key = barcode || '';
  if (wrap.dataset.barcode === key && wrap.childElementCount > 0) return;
  wrap.dataset.barcode = key;
  wrap.innerHTML = '';

  if (!barcode) {
    const missing = document.createElement('span');
    missing.className = 'getirstok-bc-missing';
    missing.textContent = 'Barkod bulunamadı';
    wrap.appendChild(missing);
    return;
  }

  const card = document.createElement('div');
  card.className = 'getirstok-bc-card';

  const main = document.createElement('div');
  main.className = 'getirstok-bc-main';
  const canvas = document.createElement('canvas');
  canvas.className = 'getirstok-bc-canvas';
  main.appendChild(canvas);
  try {
    const format = BARCODE.draw(canvas, barcode, { moduleWidth: 2, height: 34 });
    canvas.title = `${format} · ${barcode}`;
  } catch {
    canvas.remove();
  }
  const num = document.createElement('span');
  num.className = 'getirstok-bc-num';
  num.textContent = barcode;
  main.appendChild(num);
  card.appendChild(main);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'getirstok-bc-copy';
  copyBtn.title = 'Barkodu kopyala';
  copyBtn.setAttribute('aria-label', `Barkodu kopyala: ${barcode}`);
  copyBtn.innerHTML = COPY_ICON_SVG;
  copyBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(barcode);
      copyBtn.classList.add('copied');
      copyBtn.innerHTML = CHECK_ICON_SVG;
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyBtn.innerHTML = COPY_ICON_SVG;
      }, 1500);
    } catch {}
  });
  card.appendChild(copyBtn);
  wrap.appendChild(card);
}

function updateToggleButtonState(btn) {
  if (!btn) btn = document.getElementById("getirstok-toggle-barcodes-btn");
  if (!btn) return;
  if (showBarcodes) {
    btn.classList.add("active");
    btn.textContent = "Barkodları gizle";
  } else {
    btn.classList.remove("active");
    btn.textContent = "Barkodları göster";
  }
}

function updateAllBarcodeBadges() {
  const wraps = document.querySelectorAll('.getirstok-barcode-wrap');
  wraps.forEach((w) => {
    w.style.display = showBarcodes ? 'flex' : 'none';
  });
}

/**
 * Butonun içinde durduğu yatay flex satırı bulur (modal genişliğinde, tek satır yüksekliğinde).
 * Daha büyük bir bloğa (ör. sipariş bilgileri) çıkılırsa null döner.
 */
function findButtonRow(anchorBtn) {
  const btnRect = anchorBtn.getBoundingClientRect();
  if (btnRect.width === 0 || btnRect.height === 0) return null;
  let node = anchorBtn.parentElement;
  for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
    const rect = node.getBoundingClientRect();
    if (rect.height > btnRect.height * 2.5) return null;
    const cs = getComputedStyle(node);
    const isRow =
      (cs.display === "flex" || cs.display === "inline-flex") &&
      !cs.flexDirection.startsWith("column");
    if (isRow && rect.width > btnRect.width * 3) return node;
  }
  return null;
}

function tryInjectBarcodeToggleButton() {
  if (!isFranchisePanel && !isWarehousePanel) return;

  const existingBtn = document.getElementById("getirstok-toggle-barcodes-btn");
  if (existingBtn) {
    updateToggleButtonState(existingBtn);
    return;
  }

  // Sipariş ürün tablosu var mı?
  const tables = Array.from(document.querySelectorAll("table"));
  let orderTable = null;
  for (const table of tables) {
    const thead = table.querySelector("thead");
    const headerText = normalizeText(thead?.textContent || "").toLocaleLowerCase("tr-TR");
    if (headerText.includes("ürün adı") && headerText.includes("adet")) {
      orderTable = table;
      break;
    }
  }
  if (!orderTable) return;

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "getirstok-toggle-barcodes-btn";
  toggleBtn.type = "button";
  toggleBtn.className =
    "getirstok-toggle-barcodes-btn" + (showBarcodes ? " active" : "");
  toggleBtn.textContent = showBarcodes
    ? "Barkodları gizle"
    : "Barkodları göster";

  toggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showBarcodes = !showBarcodes;
    updateToggleButtonState(toggleBtn);
    updateAllBarcodeBadges();
  });

  // 1) "Şüpheli Olarak Bildir" ile aynı satırın en soluna ekle (yanlışlıkla Şüpheli'ye basılmasın)
  const allButtons = Array.from(document.querySelectorAll("button"));
  const supheliBtn = allButtons.find((b) => /şüpheli/i.test(b.innerText || ""));
  const buttonRow = supheliBtn ? findButtonRow(supheliBtn) : null;
  if (buttonRow) {
    toggleBtn.style.marginRight = "auto";
    buttonRow.insertBefore(toggleBtn, buttonRow.firstChild);
    return;
  }

  // 2) Tablonun hemen üstüne, sola yerleştir
  const container = document.createElement("div");
  container.id = "getirstok-barcode-toggle-container";
  container.style.cssText =
    "display: flex; justify-content: flex-start; margin-bottom: 8px; width: 100%;";
  container.appendChild(toggleBtn);
  orderTable.parentElement.insertBefore(container, orderTable);
}

const ORDER_FIELD_BY_LABEL = {
  "müşteri adı": "customer",
  "teslimat adresi": "address",
  "adres açıklaması": "address-note",
  "durum": "status",
  "lokasyonlar": "location",
  "toplayıcı adı": "picker",
  "kurye adı": "courier",
  "poşet kullanımı": "bag",
  "adet": "count",
  "müşteri notu": "note",
};

/**
 * Sipariş detayı penceresini (Ant Design modal) yeniden stillenmek için işaretler.
 * Stiller yalnızca `.getirstok-order-modal` altında geçerli; panelin geri kalanı etkilenmez.
 */
function decorateOrderModal(orderTable) {
  const modal = orderTable.closest(".ant-modal-content");
  if (!modal) return;
  if (!modal.classList.contains("getirstok-order-modal")) {
    modal.classList.add("getirstok-order-modal");
  }
  modal.querySelectorAll(".ant-descriptions-item").forEach((item) => {
    // innerText değil: etiketler CSS ile büyük harfe çevrildiği için "TESLIMAT ADRESI" dönerdi
    const label = normalizeText(
      item.querySelector(".ant-descriptions-item-label")?.textContent || ""
    ).toLocaleLowerCase("tr-TR");
    const field = ORDER_FIELD_BY_LABEL[label] || "";
    if ((item.dataset.getirstokField || "") !== field) {
      if (field) item.dataset.getirstokField = field;
      else delete item.dataset.getirstokField;
    }
    if (field === "note") {
      const value = normalizeText(
        item.querySelector(".ant-descriptions-item-content")?.textContent || ""
      );
      const filled = value && value !== "-" ? "1" : "0";
      if (item.dataset.getirstokFilled !== filled) item.dataset.getirstokFilled = filled;
    }
  });
}

function tryInjectButtons() {
  if (!isFranchisePanel && !isWarehousePanel) return;
  ensureStyleOnce();
  tryInjectBarcodeToggleButton();

  // 1) Eğer gerçek <table> varsa: ÜRÜN ADI sütunlarına buton ve barkod ekle
  const tables = Array.from(document.querySelectorAll("table"));
  for (const table of tables) {
    const thead = table.querySelector("thead");
    // innerText değil textContent: başlık CSS ile dönüştürülse de metin aynı kalsın
    const headerText = normalizeText(thead?.textContent || "");
    const headerLower = headerText.toLocaleLowerCase("tr-TR");
    // Sipariş ürün tablosu: "Ürün Adı" + "Adet" barındırmalı
    if (!headerLower.includes("ürün adı") || !headerLower.includes("adet"))
      continue;

    // Ürün adı sütun index'lerini bul (iki sütunlu tabloları da destekler)
    const ths = Array.from(thead?.querySelectorAll("th") ?? []);
    const nameColIndices = [];
    for (let i = 0; i < ths.length; i++) {
      const t = normalizeText(ths[i].textContent || "").toLocaleLowerCase("tr-TR");
      if (t === "ürün adı" || t.includes("ürün adı")) {
        nameColIndices.push(i);
      }
    }
    if (nameColIndices.length === 0) continue;

    decorateOrderModal(table);

    // Her ürün adı sütununun sağındaki ilk "Adet" sütunu (iki sütunlu tabloda kendi adet'i)
    const qtyColByName = new Map();
    for (const nameIdx of nameColIndices) {
      for (let i = nameIdx + 1; i < ths.length; i++) {
        if (nameColIndices.includes(i)) break;
        const t = normalizeText(ths[i].textContent || "").toLocaleLowerCase("tr-TR");
        if (t === "adet") {
          qtyColByName.set(nameIdx, i);
          break;
        }
      }
    }

    const rows = Array.from(table.querySelectorAll("tbody tr"));
    for (const tr of rows) {
      const tds = Array.from(tr.querySelectorAll("td"));
      if (tds.length === 0) continue;

      for (const nameColIdx of nameColIndices) {
        const nameCell = tds[nameColIdx] ?? null;
        if (!nameCell) continue;
        const name = getCleanProductNameFromCell(nameCell);
        if (!looksLikeProductName(name)) continue;

        const qtyIdx = qtyColByName.get(nameColIdx);
        const qtyCell = qtyIdx !== undefined ? tds[qtyIdx] ?? null : null;
        injectButtonIntoCell(qtyCell || nameCell, name);
        const barcode = resolveBarcode(name);
        injectBarcodeIntoCell(nameCell, barcode);
      }
    }
  }
}

if (isFranchisePanel || isWarehousePanel) {
  // Sayfa SPA olduğu için dinamik: mutasyonla takip et
  // ÖNEMLI: tryInjectButtons() DOM'a eleman ekler → yeni mutation tetikler → sonsuz döngü.
  // Çözüm: işlem sırasında observer'ı geçici olarak durdur (disconnect/reconnect),
  // üstüne bir de debounce ekle ki art arda gelen mutasyonlar tek çağrıya indirgelesin.
  let debounceTimer = null;
  let isInjecting = false;

  function safeInjectButtons() {
    if (isInjecting) return; // re-entrancy guard
    isInjecting = true;
    mo.disconnect(); // DOM değişikliği yaparken observer'ı durdur
    try {
      tryInjectButtons();
    } finally {
      // Observer'ı yeniden başlat — bu sefer kendi eklediğimiz elemanlar tetiklemiyor
      mo.observe(document.documentElement, { childList: true, subtree: true });
      isInjecting = false;
    }
  }

  function debouncedInject() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(safeInjectButtons, 120);
  }

  var mo = new MutationObserver(debouncedInject);
  mo.observe(document.documentElement, { childList: true, subtree: true });
  // İlk deneme
  setTimeout(safeInjectButtons, 800);
  setTimeout(safeInjectButtons, 2500);
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

