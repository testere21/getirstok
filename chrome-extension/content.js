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

/** Elle düzeltilen barkodlar (arka plan sunucudan alıp chrome.storage'a yazar): nameKey → { name, barcode } */
let barcodeOverrides = {};

function barcodeNameKey(name) {
  return normalizeText(name).toLocaleLowerCase("tr-TR");
}

try {
  chrome.storage.local.get(["orderBarcodeOverrides"], (store) => {
    barcodeOverrides = store?.orderBarcodeOverrides || {};
    rerenderBarcodes();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.orderBarcodeOverrides) return;
    barcodeOverrides = changes.orderBarcodeOverrides.newValue || {};
    rerenderBarcodes();
  });
  // Sayfa açılınca güncel listeyi iste (başka bilgisayarda yapılan düzeltmeler gelsin)
  chrome.runtime.sendMessage({ type: "GETIRSTOK_BARCODE_OVERRIDES_REFRESH" }, () => void chrome.runtime.lastError);
} catch {
  /* eklenti bağlamı yok (ör. test sayfası) */
}

/** Düzeltme listesi değişince çizili barkod kartları yeniden çizilsin (düzenleme açık olanlar hariç) */
function rerenderBarcodes() {
  for (const wrap of document.querySelectorAll(".getirstok-barcode-wrap")) {
    if (wrap.dataset.editing === "1") continue;
    const name = wrap.dataset.name;
    if (name) renderBarcodeWrap(wrap, name);
  }
}

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
    /* Toplama modu: pencerenin sağ alt köşesinde küçük "TM" */
    .ant-modal-content:has(> #getirstok-picking-btn) {
      padding-bottom: 50px !important;
    }
    #getirstok-picking-btn {
      position: absolute;
      right: 14px;
      bottom: 12px;
      z-index: 2;
      height: 30px;
      min-width: 38px;
      padding: 0 10px;
      border-radius: 9px;
      border: 1px solid #5c3ebc;
      background: #ffffff;
      color: #5c3ebc;
      font: 800 12px/1 system-ui, sans-serif;
      letter-spacing: 0.04em;
      cursor: pointer;
      box-shadow: 0 2px 6px -2px rgba(93, 62, 188, 0.35);
      transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
    }
    #getirstok-picking-btn:hover {
      background: #5c3ebc;
      color: #ffffff;
      transform: translateY(-1px);
    }
    #getirstok-picking-btn[data-state="sending"] {
      opacity: 0.6;
      cursor: progress;
    }
    #getirstok-picking-btn[data-state="done"] {
      border-color: #16a34a;
      background: #dcfce7;
      color: #15803d;
    }
    #getirstok-picking-btn[data-state="error"] {
      border-color: #dc2626;
      background: #fee2e2;
      color: #b91c1c;
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
    .getirstok-bc-actions {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .getirstok-bc-edit-btn {
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
      gap: 5px;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .getirstok-bc-edit-btn:hover {
      background: #f3f0ff;
      border-color: #d9d0f7;
      color: #5d3ebc;
    }
    .getirstok-bc-edit-btn svg { width: 13px; height: 13px; display: block; }
    .getirstok-bc-edit-btn--text {
      width: auto;
      height: 22px;
      margin-left: 6px;
      padding: 0 8px;
      border-radius: 999px;
      border-color: #d9d0f7;
      background: #f3f0ff;
      color: #5d3ebc;
      font: 600 11px/1 system-ui, sans-serif;
    }
    .getirstok-bc-card--manual {
      border-color: #d9d0f7;
      box-shadow: 0 0 0 1px #ede7fc inset;
    }
    .getirstok-bc-manual {
      margin-left: 6px;
      padding: 1px 5px;
      border-radius: 4px;
      background: #ede7fc;
      color: #5d3ebc;
      font: 700 9px/1.3 system-ui, sans-serif;
      letter-spacing: 0.04em;
      vertical-align: 1px;
      user-select: none;
    }
    .getirstok-bc-edit {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      padding: 6px;
      border: 1px solid #d9d0f7;
      border-radius: 10px;
      background: #faf9fe;
    }
    .getirstok-bc-edit input {
      width: 170px;
      height: 30px;
      padding: 0 9px;
      border: 1px solid #d6d0e6;
      border-radius: 8px;
      background: #ffffff;
      font: 600 13px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      letter-spacing: 0.04em;
      color: #1f1b2e;
      outline: none;
    }
    .getirstok-bc-edit input:focus {
      border-color: #5d3ebc;
      box-shadow: 0 0 0 3px rgba(93, 62, 188, 0.15);
    }
    .getirstok-bc-edit button {
      height: 30px;
      padding: 0 11px;
      border-radius: 8px;
      font: 600 12px/1 system-ui, sans-serif;
      cursor: pointer;
    }
    .getirstok-bc-edit-save {
      border: 1px solid #5d3ebc;
      background: #5d3ebc;
      color: #ffffff;
    }
    .getirstok-bc-edit-save:disabled { opacity: 0.6; cursor: default; }
    .getirstok-bc-edit-cancel {
      border: 1px solid #e5e7eb;
      background: #ffffff;
      color: #4b4560;
    }
    .getirstok-bc-edit-cancel:hover { background: #f5f3fb; }
    .getirstok-bc-edit-status {
      flex-basis: 100%;
      font: 500 11px/1.3 system-ui, sans-serif;
      color: #6b6580;
    }
    .getirstok-bc-edit-status:empty { display: none; }
    .getirstok-bc-edit-status[data-tone="error"] { color: #b91c1c; }
    .getirstok-bc-missing {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      background: #f3f4f6;
      font: 500 11px/1.4 system-ui, sans-serif;
      color: #9ca3af;
    }
    .getirstok-size {
      margin-left: 4px;
      white-space: nowrap;
    }
    .getirstok-bc-choice {
      border: none;
      cursor: pointer;
    }
    .getirstok-bc-choice:hover {
      background: #ddd3fa;
    }
    .getirstok-bc-pick {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px;
      padding: 6px 8px;
      border: 1px dashed #f0c36d;
      border-radius: 10px;
      background: #fffbeb;
    }
    .getirstok-bc-pick-label {
      font: 700 11px/1.4 system-ui, sans-serif;
      color: #92400e;
    }
    .getirstok-bc-pick-chip {
      padding: 2px 9px;
      border: 1px solid #e4def4;
      border-radius: 999px;
      background: #ffffff;
      font: 600 11.5px/1.5 system-ui, sans-serif;
      color: #5d3ebc;
      cursor: pointer;
    }
    .getirstok-bc-pick-chip:hover {
      background: #5d3ebc;
      border-color: #5d3ebc;
      color: #ffffff;
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
      background: #f8f6fd !important;
      border: none !important;
      border-top: 1px solid #ebe6f7 !important;
      border-bottom: 1px solid #ebe6f7 !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      color: #1f1b2e !important;
      transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody > tr.ant-table-row > td:first-child {
      padding-left: 10px !important;
      border-left: 1px solid #ebe6f7 !important;
      border-radius: 14px 0 0 14px !important;
      box-shadow: inset 4px 0 0 transparent;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody > tr.ant-table-row > td:last-child {
      border-right: 1px solid #ebe6f7 !important;
      border-radius: 0 14px 14px 0 !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody > tr.ant-table-row:hover {
      transform: translateY(-2px);
      filter: drop-shadow(0 8px 14px rgba(93, 62, 188, 0.16));
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody > tr.ant-table-row:hover > td {
      background: #f2eefc !important;
      border-color: #cfc3f5 !important;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody > tr.ant-table-row:hover > td:first-child {
      box-shadow: inset 4px 0 0 #7c5ce0;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody > tr.ant-table-row:hover > td:not(:first-child):not(:has(> .getirstok-search-btn)) {
      color: #4c2fa8 !important;
    }
    /* Görsel: renkli kutu + multiply → fotoğrafın beyaz zemini kutunun rengine karışır */
    .ant-modal-content.getirstok-order-modal .ant-table-tbody .ant-image {
      width: 52px !important;
      height: 52px !important;
      padding: 5px;
      box-sizing: border-box;
      border-radius: 14px;
      background: linear-gradient(145deg, #ece6fb, #e2dbf7);
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      transition: transform 0.2s ease, background 0.2s ease;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody .ant-image-img {
      box-sizing: border-box;
      width: 42px !important;
      height: 42px !important;
      padding: 0;
      object-fit: contain;
      background: transparent !important;
      border: none;
      mix-blend-mode: multiply;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody .ant-image-mask {
      border-radius: 14px;
    }
    .ant-modal-content.getirstok-order-modal .ant-table-tbody > tr.ant-table-row:hover .ant-image {
      transform: scale(1.06);
      background: linear-gradient(145deg, #e4dcfa, #d8cff4);
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
    /* Barkod kartı beyaz kalır (okutmak için kontrast), lavanta satırın üstünde ayrı kart */
    .ant-modal-content.getirstok-order-modal .getirstok-bc-card {
      border-color: #e2dbf5;
      box-shadow: 0 2px 6px -2px rgba(93, 62, 188, 0.18);
    }
    .ant-modal-content.getirstok-order-modal .getirstok-bc-copy,
    .ant-modal-content.getirstok-order-modal .getirstok-bc-edit-btn:not(.getirstok-bc-edit-btn--text) {
      border-color: #e6e0f6;
      background: #f6f3fd;
      color: #7a6fa0;
    }
    .ant-modal-content.getirstok-order-modal .getirstok-bc-missing {
      background: #ffffff;
      border: 1px solid #ebe6f7;
      color: #8a849d;
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
    .querySelectorAll(".getirstok-search-btn, .getirstok-barcode-wrap, .getirstok-size, button")
    .forEach((el) => el.remove());
  const name = normalizeText(clone.innerText || "");
  if (looksLikeProductName(name)) {
    cell.dataset.getirstokOriginalName = name;
  }
  return name;
}

/**
 * Ürün görselinin katalogdaki anahtarı. Yeni CDN: görsel kimliği (tiresiz ilk 12 hane);
 * eski CDN adresi ürün kimliğini içerir ("/product/{productId}_tr_...").
 * product-barcodes.js'i üreten scripts/build-extension-catalog.mjs ile aynı kural.
 */
function productImageKey(url) {
  const u = String(url || "");
  const img = u.match(/\/([0-9a-f]{8})-([0-9a-f]{4})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z]+/i);
  if (img) return { kind: "image", key: `${img[1]}${img[2]}`.toLowerCase() };
  const pid = u.match(/\/product\/([0-9a-f]{24})_/i);
  if (pid) return { kind: "productId", key: pid[1].toLowerCase() };
  return null;
}

/** Katalog değeri "barkod" ya da "barkod|gramaj" */
function parseCatalogValue(value) {
  if (!value) return null;
  const [barcode, size = ""] = String(value).split("|");
  return { barcode, size };
}

/** @returns { barcode, size } | null */
function catalogFromImage(imageUrl) {
  const ref = productImageKey(imageUrl);
  if (!ref) return null;
  const map =
    ref.kind === "image" ? window.__GETIRSTOK_CATALOG_IMAGES || {} : window.__GETIRSTOK_CATALOG_PRODUCT_IDS || {};
  return parseCatalogValue(map[ref.key]);
}

/** Elle düzeltmenin kaydedildiği ad: görsel biliniyorsa ürüne özel (aynı adlı başka gramaj etkilenmez) */
function barcodeOverrideName(name, imageUrl) {
  const ref = productImageKey(imageUrl);
  return ref ? `${normalizeText(name)} #${ref.key}` : normalizeText(name);
}

/**
 * @returns { barcode, size, manual, overrideName, candidates? } — sıra: bu ürüne özel elle düzeltme,
 * siparişin görseli, ada göre elle düzeltme, katalogda ad. Ad birden çok gramaja gidiyorsa
 * tahmin edilmez; `candidates` ile seçenekler döner. `size`: adın sonuna eklenecek gramaj.
 */
function resolveBarcodeInfo(name, imageUrl) {
  const overrideName = barcodeOverrideName(name, imageUrl);
  const fromImage = catalogFromImage(imageUrl);
  const scoped = barcodeOverrides[barcodeNameKey(overrideName)];
  if (scoped?.barcode) return { barcode: scoped.barcode, size: fromImage?.size || "", manual: true, overrideName };
  if (fromImage) return { barcode: fromImage.barcode, size: fromImage.size, manual: false, overrideName };
  const byName = barcodeOverrides[barcodeNameKey(name)];
  if (byName?.barcode) return { barcode: byName.barcode, size: "", manual: true, overrideName };
  const { barcode, size = "", candidates } = resolveBarcodeByName(name);
  return { barcode, size, manual: false, overrideName, candidates };
}

function resolveBarcodeByName(name) {
  const raw = normalizeText(name);
  if (!raw) return { barcode: null };

  // Canlı Getir API yanıtından yakalanan barkodlar
  const lower = raw.toLowerCase();
  const live = liveOrderBarcodes[raw] || liveOrderBarcodes[lower];
  if (live) return { barcode: live };

  // Paket içi katalog (tam ad; gramajsız ad yalnız tek ürüne gidiyorsa listede)
  const catalog = window.__GETIRSTOK_CATALOG_BARCODES || {};
  const trLower = raw.toLocaleLowerCase("tr-TR");
  const trBase = trLower.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  for (const key of [trLower, lower, trBase]) {
    const found = parseCatalogValue(catalog[key]);
    if (found) return found;
  }
  const ambiguous = (window.__GETIRSTOK_CATALOG_AMBIGUOUS || {})[trBase];
  if (ambiguous) return { barcode: null, candidates: ambiguous };
  return { barcode: null };
}

/** Ad hücresinde, Getir'in yazdığı adın hemen ardında "(200 ml)" — ad zaten gramajlıysa eklenmez */
function setProductSizeLabel(wrap, name, size) {
  const cell = wrap.parentElement;
  if (!cell) return;
  let label = cell.querySelector(":scope > .getirstok-size");
  const text = size && !/\)\s*$/.test(normalizeText(name)) ? `(${size})` : "";
  if (!text) {
    label?.remove();
    return;
  }
  if (!label) {
    label = document.createElement("span");
    label.className = "getirstok-size";
    cell.insertBefore(label, wrap);
  }
  if (label.textContent !== text) label.textContent = text;
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

const PENCIL_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

function injectBarcodeIntoCell(cell, name, imageUrl) {
  if (!cell) return;

  let wrap = cell.querySelector('.getirstok-barcode-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'getirstok-barcode-wrap';
    cell.appendChild(wrap);
  }
  wrap.style.display = showBarcodes ? 'flex' : 'none';
  const image = imageUrl || '';
  // Satır başka ürünle yeniden kullanılırsa önceki gramaj seçimi taşınmasın
  if (wrap.dataset.name !== name || (wrap.dataset.image || '') !== image) delete wrap.dataset.choice;
  wrap.dataset.image = image;
  // Düzenleme açıkken yazılan barkod silinmesin
  if (wrap.dataset.editing === '1' && wrap.dataset.name === name) return;
  renderBarcodeWrap(wrap, name);
}

/** Ürün adı sütununun görseli: ad hücresinde ya da hemen solundaki (#) hücrelerde */
function findProductImageForName(tds, nameIdx, nameColIndices) {
  const prevName = Math.max(-1, ...nameColIndices.filter((i) => i < nameIdx));
  for (let i = nameIdx; i > prevName; i--) {
    const img = tds[i]?.querySelector('img');
    if (img?.src) return img.currentSrc || img.src;
  }
  return '';
}

/** "Sütaş Ayran (200 ml)" → "200 ml" (seçenek düğmesinde gösterilir) */
function variantLabel(fullName) {
  const m = normalizeText(fullName).match(/\(([^()]+)\)\s*$/);
  return m ? m[1] : normalizeText(fullName);
}

function smallIconButton(className, title, svg, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.innerHTML = svg;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick(btn);
  });
  return btn;
}

/** Satırın içinde barkod girme / düzeltme formu */
function openBarcodeEditor(wrap, name, current) {
  wrap.dataset.editing = '1';
  wrap.innerHTML = '';
  const form = document.createElement('form');
  form.className = 'getirstok-bc-edit';
  form.addEventListener('click', (e) => e.stopPropagation());

  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.placeholder = 'Barkodu yazın veya okutun';
  input.value = current.barcode || '';
  input.maxLength = 20;
  input.setAttribute('aria-label', `${name} barkodu`);

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'getirstok-bc-edit-save';
  save.textContent = 'Kaydet';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'getirstok-bc-edit-cancel';
  cancel.textContent = 'İptal';

  const status = document.createElement('span');
  status.className = 'getirstok-bc-edit-status';

  const close = () => {
    delete wrap.dataset.editing;
    renderBarcodeWrap(wrap, name, { force: true });
  };

  const send = (barcode) => {
    save.disabled = true;
    status.textContent = 'Kaydediliyor…';
    try {
      const overrideName = current.overrideName || name;
      chrome.runtime.sendMessage({ type: 'GETIRSTOK_BARCODE_OVERRIDE_SAVE', name: overrideName, barcode }, (res) => {
        if (chrome.runtime.lastError || !res?.ok) {
          save.disabled = false;
          status.textContent = res?.error || 'Kaydedilemedi, tekrar deneyin.';
          status.dataset.tone = 'error';
          return;
        }
        // Liste chrome.storage'dan güncellenince kart yeniden çizilir
        close();
      });
    } catch {
      save.disabled = false;
      status.textContent = 'Eklenti yenilenmiş; sayfayı yenileyin.';
      status.dataset.tone = 'error';
    }
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const value = input.value.replace(/\s+/g, '');
    if (!/^\d{4,20}$/.test(value)) {
      status.textContent = '4–20 haneli rakam olmalı';
      status.dataset.tone = 'error';
      input.focus();
      return;
    }
    send(value);
  });
  cancel.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    close();
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  });

  form.append(input, save, cancel);
  if (current.manual) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'getirstok-bc-edit-cancel';
    reset.textContent = 'Otomatiğe dön';
    reset.title = 'Elle girilen barkodu sil, eklentinin bulduğunu kullan';
    reset.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      send(null);
    });
    form.appendChild(reset);
  }
  form.appendChild(status);
  wrap.appendChild(form);
  input.focus();
  input.select();
}

function renderBarcodeWrap(wrap, name, { force = false } = {}) {
  const info = resolveBarcodeInfo(name, wrap.dataset.image || '');
  // Ad birden çok gramaja gidiyorsa: bu satır için seçilen gramaj (kalıcı değil)
  const chosen =
    !info.barcode && info.candidates && wrap.dataset.choice
      ? info.candidates.find(([, b]) => b === wrap.dataset.choice) || null
      : null;
  const barcode = info.barcode || chosen?.[1] || null;
  setProductSizeLabel(wrap, name, info.size || (chosen ? variantLabel(chosen[0]) : ""));

  // Her DOM değişiminde yeniden çizme; aynı barkod zaten çizildiyse dokunma
  const key = `${name}|${wrap.dataset.image || ''}|${barcode || ''}|${info.manual ? 'm' : 'a'}|${info.candidates ? info.candidates.length : 0}`;
  if (!force && wrap.dataset.barcode === key && wrap.childElementCount > 0) return;
  wrap.dataset.barcode = key;
  wrap.dataset.name = name;
  wrap.innerHTML = '';

  const editBtn = smallIconButton(
    'getirstok-bc-edit-btn',
    barcode ? 'Barkodu düzelt' : 'Barkod ekle',
    PENCIL_ICON_SVG,
    () => openBarcodeEditor(wrap, name, { ...info, barcode })
  );

  if (!barcode && info.candidates) {
    // Tahmin yok: yanlış gramajın barkodu okutulmasın, kullanıcı seçsin
    const pick = document.createElement('div');
    pick.className = 'getirstok-bc-pick';
    const label = document.createElement('span');
    label.className = 'getirstok-bc-pick-label';
    label.textContent = 'Hangi gramaj?';
    pick.appendChild(label);
    for (const [fullName, candidate] of info.candidates) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'getirstok-bc-pick-chip';
      chip.textContent = variantLabel(fullName);
      chip.title = `${fullName} · ${candidate}`;
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        wrap.dataset.choice = candidate;
        renderBarcodeWrap(wrap, name, { force: true });
      });
      pick.appendChild(chip);
    }
    wrap.appendChild(pick);
    return;
  }

  if (!barcode) {
    const missing = document.createElement('span');
    missing.className = 'getirstok-bc-missing';
    missing.textContent = 'Barkod bulunamadı';
    wrap.appendChild(missing);
    editBtn.classList.add('getirstok-bc-edit-btn--text');
    editBtn.insertAdjacentText('beforeend', 'Barkod ekle');
    wrap.appendChild(editBtn);
    return;
  }

  const card = document.createElement('div');
  card.className = 'getirstok-bc-card';
  if (info.manual) card.classList.add('getirstok-bc-card--manual');

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
  if (info.manual) {
    const manualTag = document.createElement('span');
    manualTag.className = 'getirstok-bc-manual';
    manualTag.textContent = 'elle';
    manualTag.title = 'Bu barkod elle girildi';
    num.appendChild(manualTag);
  }
  if (chosen) {
    // Seçilen gramaj: tıklayınca seçeneklere döner
    const choiceTag = document.createElement('button');
    choiceTag.type = 'button';
    choiceTag.className = 'getirstok-bc-manual getirstok-bc-choice';
    choiceTag.textContent = `${variantLabel(chosen[0])} ✕`;
    choiceTag.title = 'Gramajı değiştir';
    choiceTag.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      delete wrap.dataset.choice;
      renderBarcodeWrap(wrap, name, { force: true });
    });
    num.appendChild(choiceTag);
  }
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
  const actions = document.createElement('div');
  actions.className = 'getirstok-bc-actions';
  actions.append(copyBtn, editBtn);
  card.appendChild(actions);
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

// ── Toplama modu: siparişin ürünlerini bizim paneldeki geçici toplama listesine gönder ──
const PICKING_LABEL = "TM";
const PICKING_TITLE = "Toplama modu: ürünleri paneldeki toplama listesine gönder";

/** Sipariş penceresinden toplama listesi: kimlik, raf lokasyonları, ürünler (müşteri bilgisi yok) */
function collectOrderForPicking(modal) {
  const orderId = collectOrderIdOnly(modal);

  // Birden çok lokasyon ayrı etiketlerde ama metinde boşluksuz ("BNK.017BNK.088"): kod kod okunur
  const locationText = normalizeText(
    modal.querySelector('[data-getirstok-field="location"] .ant-descriptions-item-content')?.textContent
  );
  const locations = [...new Set(locationText.match(/[a-zçğıöşü]+\.\d+/gi) || [])];

  const items = [];
  for (const table of modal.querySelectorAll("table")) {
    const ths = Array.from(table.querySelector("thead")?.querySelectorAll("th") ?? []);
    const heads = ths.map((th) => normalizeText(th.textContent).toLocaleLowerCase("tr-TR"));
    const nameCols = heads.flatMap((h, i) => (h.includes("ürün adı") ? [i] : []));
    if (nameCols.length === 0 || !heads.includes("adet")) continue;
    for (const tr of table.querySelectorAll("tbody tr")) {
      const tds = Array.from(tr.querySelectorAll("td"));
      for (const nameIdx of nameCols) {
        const nameCell = tds[nameIdx];
        const name = nameCell ? getCleanProductNameFromCell(nameCell) : "";
        if (!looksLikeProductName(name)) continue;
        let qtyIdx = heads.findIndex((h, i) => i > nameIdx && h === "adet");
        const nextName = nameCols.find((i) => i > nameIdx);
        if (nextName !== undefined && qtyIdx > nextName) qtyIdx = -1;
        const qtyCell = qtyIdx >= 0 ? tds[qtyIdx] : null;
        const quantity =
          normalizeText(qtyCell?.textContent).match(/\d+(?:[.,]\d+)?(?:\s*(?:kg|g|lt|l|adet))?/i)?.[0] || "1";
        const imageUrl = findProductImageForName(tds, nameIdx, nameCols);
        const info = resolveBarcodeInfo(name, imageUrl);
        // Birden çok gramajlı adda bu pencerede seçilen gramaj
        const choice = nameCell.querySelector(".getirstok-barcode-wrap")?.dataset.choice;
        const chosen = !info.barcode && choice ? info.candidates?.find(([, b]) => b === choice) : null;
        const size = info.size || (chosen ? variantLabel(chosen[0]) : "");
        items.push({
          name: size && !/\)\s*$/.test(name) ? `${name} (${size})` : name,
          quantity,
          imageUrl: /^https:/i.test(imageUrl) ? imageUrl : null,
          barcode: info.barcode || chosen?.[1] || null,
        });
      }
    }
  }
  return { orderId, locations, items };
}

function setPickingButtonState(btn, state, label, title = "") {
  btn.dataset.state = state;
  btn.textContent = label;
  btn.title = title;
}

function tryInjectPickingButton() {
  if (!isWarehousePanel) return;
  const toggle = document.getElementById("getirstok-toggle-barcodes-btn");
  const modal = toggle?.closest(".ant-modal-content");
  if (!toggle || !modal) return;
  const orderId = collectOrderIdOnly(modal);
  let btn = document.getElementById("getirstok-picking-btn");
  if (btn && btn.parentElement !== modal) {
    btn.remove();
    btn = null;
  }
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "getirstok-picking-btn";
    btn.type = "button";
    setPickingButtonState(btn, "idle", PICKING_LABEL, PICKING_TITLE);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.dataset.state === "sending") return;
      const order = collectOrderForPicking(btn.closest(".ant-modal-content"));
      if (!order.orderId || order.items.length === 0) {
        setPickingButtonState(btn, "error", `! ${PICKING_LABEL}`, "Sipariş kimliği ya da ürünler bulunamadı");
        return;
      }
      setPickingButtonState(btn, "sending", "…", "Gönderiliyor");
      try {
        chrome.runtime.sendMessage({ type: "GETIRSTOK_PICKING_ADD", order }, (res) => {
          if (chrome.runtime.lastError || !res?.ok) {
            setPickingButtonState(btn, "error", `! ${PICKING_LABEL}`, `Gönderilemedi: ${res?.error || "sunucuya ulaşılamadı"}`);
            return;
          }
          setPickingButtonState(
            btn,
            "done",
            `✓ ${PICKING_LABEL}`,
            `Toplama listesinde (${order.items.length} ürün). Tekrar basınca liste güncellenir`
          );
        });
      } catch {
        setPickingButtonState(btn, "error", `! ${PICKING_LABEL}`, "Eklenti yenilenmiş; sayfayı yenileyin");
      }
    });
    modal.appendChild(btn);
  }
  // Aynı pencere başka siparişle açılırsa durum sıfırlansın
  if ((btn.dataset.orderId || "") !== (orderId || "")) {
    btn.dataset.orderId = orderId || "";
    setPickingButtonState(btn, "idle", PICKING_LABEL, PICKING_TITLE);
  }
}

/** Pencere başlığındaki sipariş kimliği (24 haneli etiket) */
function collectOrderIdOnly(modal) {
  const el = Array.from(modal.querySelectorAll(".ant-tag, span, div")).find(
    (x) => x.childElementCount === 0 && /^[a-f0-9]{24}$/i.test(normalizeText(x.textContent))
  );
  return el ? normalizeText(el.textContent) : null;
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
  if (isWarehousePanel) {
    decorateWarehouseLayout();
    decorateBakeryPage();
  }
  ensureStyleOnce();
  tryInjectBarcodeToggleButton();
  tryInjectPickingButton();

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
        const image = findProductImageForName(tds, nameColIdx, nameColIndices);
        // Panelde arama gramajlı adla daha isabetli
        const { size } = resolveBarcodeInfo(name, image);
        const query = size && !/\)\s*$/.test(name) ? `${name} (${size})` : name;
        injectButtonIntoCell(qtyCell || nameCell, query);
        injectBarcodeIntoCell(nameCell, name, image);
      }
    }
  }
}

// -----------------------------
// Depo: Pişirme Önerileri sayfasını sadeleştir
// Getir'in elemanları silinmez (açma/sıralama bozulmasın); gizlenip yanlarına bizimkiler eklenir.
// Her çağrı sadece değişen şeye dokunur: aynı durumda DOM'a yazmaz, observer döngüye girmez.
// -----------------------------

const BAKE_PAGE_PATH_RE = /\/stock\/stock-management\/product\/bakery-estimation\//;
const HEATING_STORAGE_KEY = "getirstok.heatingEstimations";
const BAKE_BRAND_PREFIX_RE = /^La Lorraine\s+/i;

/** Ürün adı (tam ad, küçük harf, tek boşluk) → anlık stok. Dilimler arası aynı; hangi dilimde varsa alınır */
let heatingStocks = null;

function bakeNameKey(name) {
  return normalizeText(name).toLocaleLowerCase("tr-TR");
}

function buildHeatingStocks(json) {
  const slots = Array.isArray(json?.data) ? json.data : [];
  const stocks = new Map();
  for (const slot of slots) {
    for (const p of Array.isArray(slot?.products) ? slot.products : []) {
      const key = bakeNameKey(p?.fullName || p?.name);
      if (!key) continue;
      const entry = stocks.get(key) || {};
      for (const field of ["frozen", "available", "reserve"]) {
        if (typeof p[field] === "number") entry[field] = p[field];
      }
      stocks.set(key, entry);
    }
  }
  return stocks;
}

/** `startDate: "2026-10-18T12:00:00"` → "12-16" */
function heatingSlotKey(startDate) {
  const hour = Number(String(startDate || "").slice(11, 13));
  if (hour === 8) return "08-12";
  if (hour === 12) return "12-16";
  if (hour === 16) return "16-20";
  if (hour === 20) return "20-00";
  return null;
}

/** Panelin Fırın sekmesi için öneriler: ekrandan okumak yerine Getir'in kendi verisinden */
function bakeItemsFromHeating(json) {
  const map = {};
  for (const slot of Array.isArray(json?.data) ? json.data : []) {
    const key = heatingSlotKey(slot?.startDate);
    if (!key) continue;
    for (const p of Array.isArray(slot?.products) ? slot.products : []) {
      const qty = Number(p?.prediction);
      const pid = /^[a-f0-9]{24}$/i.test(String(p?.productId || "")) ? p.productId : undefined;
      mergeBakeItem(map, p?.fullName || p?.name, key, qty, pid);
    }
  }
  return Object.values(map);
}

function applyHeatingJson(json) {
  heatingStocks = buildHeatingStocks(json);
  publishBakeSuggestions(bakeItemsFromHeating(json));
}

function loadHeatingStocksFromSession() {
  try {
    const raw = sessionStorage.getItem(HEATING_STORAGE_KEY);
    if (raw) applyHeatingJson(JSON.parse(raw));
  } catch {
    /* bozuk kayıt */
  }
}

function setDataAttr(el, name, value) {
  if (value == null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value);
  }
}

function ensureBakeStyleOnce() {
  if (document.getElementById("getirstok-bake-style")) return;
  const style = document.createElement("style");
  style.id = "getirstok-bake-style";
  style.textContent = `
    /* Kart (saat dilimi) */
    [data-getirstok-bake-card] {
      border-radius: 14px !important;
      border: 1px solid #ebe7f5 !important;
      box-shadow: 0 1px 3px rgba(31, 27, 46, 0.06) !important;
      overflow: hidden;
      transition: opacity 0.2s ease;
    }
    [data-getirstok-bake-card] > .ant-card-head {
      min-height: 0 !important;
      padding: 8px 12px !important;
      background: #faf9fd !important;
      border-bottom: 1px solid #ebe7f5 !important;
    }
    [data-getirstok-bake-card] .period-title {
      font-size: 14px !important;
      font-weight: 700 !important;
      color: #1f1b2e !important;
    }
    [data-getirstok-bake-card="current"] {
      border: 2px solid #5d3ebc !important;
      box-shadow: 0 6px 18px -8px rgba(93, 62, 188, 0.45) !important;
    }
    [data-getirstok-bake-card="current"] > .ant-card-head {
      background: #5d3ebc !important;
    }
    [data-getirstok-bake-card="current"] > .ant-card-head .period-title,
    [data-getirstok-bake-card="current"] > .ant-card-head .period-title .anticon {
      color: #ffffff !important;
    }
    [data-getirstok-bake-card] .ant-card-head-wrapper {
      flex-wrap: nowrap !important;
      gap: 6px;
    }
    [data-getirstok-bake-card] .ant-card-head-title {
      min-width: 0;
      padding: 0 !important;
    }
    [data-getirstok-bake-card] .period-title {
      white-space: nowrap;
    }
    [data-getirstok-bake-card] .ant-card-extra {
      flex-shrink: 0;
      padding: 0 !important;
    }
    [data-getirstok-bake-card] .ant-card-extra [class*="cardActions"] {
      display: flex !important;
      flex-wrap: nowrap !important;
      gap: 4px !important;
    }
    [data-getirstok-bake-card="past"] {
      opacity: 0.55;
    }
    [data-getirstok-bake-card="past"]:hover {
      opacity: 1;
    }
    [data-getirstok-bake-card] > .ant-card-body {
      padding: 4px 6px 6px !important;
    }

    /* Ürün satırı */
    [data-getirstok-bake-item] {
      margin: 0 !important;
      border-bottom: 1px solid #f2f0f7 !important;
      border-radius: 10px !important;
    }
    [data-getirstok-bake-item]:last-child {
      border-bottom: none !important;
    }
    [data-getirstok-bake-item] > .ant-collapse-header {
      padding: 6px 6px 6px 8px !important;
      align-items: center !important;
    }
    [data-getirstok-bake-item] > .ant-collapse-header:hover {
      background: #faf9fe;
      border-radius: 10px;
    }
    [data-getirstok-bake-item] .ant-collapse-header-text {
      flex: 1 1 auto !important;
      min-width: 0 !important;
    }
    [data-getirstok-bake-item] .ant-collapse-header-text > div {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      flex-direction: row !important;
    }
    [data-getirstok-bake-item] .ant-collapse-header-text > div > div:first-child {
      flex: 1 1 auto;
      min-width: 0;
    }
    [data-getirstok-bake-item] .ant-collapse-header .ant-typography,
    [data-getirstok-bake-item] [class*="progressBarWrapper"] {
      display: none !important;
    }
    [data-getirstok-bake-item] .ant-collapse-header .ant-avatar {
      width: 26px !important;
      height: 26px !important;
      flex-shrink: 0;
      border-radius: 8px !important;
    }
    [data-getirstok-bake-item] .ant-collapse-header-text > div > div:first-child > div {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      min-width: 0;
    }
    .getirstok-bake-title {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      line-height: 1.25;
    }
    .getirstok-bake-name {
      font-size: 13px;
      font-weight: 600;
      color: #1f1b2e;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
    }
    .getirstok-bake-stock {
      font-size: 11px;
      color: #8a849d;
    }
    .getirstok-bake-stock b {
      font-weight: 600;
      color: #4b4560;
    }
    .getirstok-bake-qty {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 34px;
      height: 28px;
      padding: 0 6px;
      border-radius: 9px;
      background: #fff4e5;
      color: #c2410c;
      font-size: 16px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    [data-getirstok-bake-zero] .getirstok-bake-qty {
      background: #f3f2f7;
      color: #a19bb5;
    }
    [data-getirstok-bake-zero] .getirstok-bake-name {
      color: #8a849d;
      font-weight: 500;
    }
    [data-getirstok-bake-item][data-getirstok-bake-hidden] {
      display: none !important;
    }

    /* Raf boş + pişirme önerisi var (şu anki dilim) */
    [data-getirstok-bake-alert] {
      background: #fef2f2 !important;
      box-shadow: inset 3px 0 0 #dc2626;
    }
    [data-getirstok-bake-alert] .getirstok-bake-qty {
      background: #dc2626;
      color: #ffffff;
    }
    .getirstok-bake-alert {
      align-self: flex-start;
      margin-top: 2px;
      padding: 1px 7px;
      border-radius: 999px;
      background: #dc2626;
      color: #ffffff;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.02em;
      animation: getirstok-bake-pulse 1.4s ease-in-out infinite;
    }
    @keyframes getirstok-bake-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.55; }
    }
    @media (prefers-reduced-motion: reduce) {
      .getirstok-bake-alert { animation: none; }
    }

    /* Açılan detay: Satılan / Rezerve / Donuk / Raf */
    [data-getirstok-bake-item] .ant-collapse-content-box {
      padding: 0 8px 8px 46px !important;
    }
    [data-getirstok-bake-item] [class*="productStocks"] {
      display: grid !important;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4px !important;
    }
    [data-getirstok-bake-item] [class*="stockCell"] {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      gap: 1px !important;
      padding: 4px 2px !important;
      border-radius: 8px !important;
      background: #faf9fd !important;
      min-width: 0;
    }
    [data-getirstok-bake-item] [class*="stockLabel"] {
      font-size: 10.5px !important;
      color: #8a849d !important;
      white-space: nowrap;
    }
    [data-getirstok-bake-item] [class*="stockValue"] {
      font-size: 14px !important;
      font-weight: 700 !important;
      color: #1f1b2e !important;
      font-variant-numeric: tabular-nums;
    }
  `;
  document.head.appendChild(style);
}

/** Satırın başlığına kısa ad + stok bilgisi + adet rozeti ekler / günceller */
function decorateBakeItem(item, isCurrentSlot) {
  const header = item.querySelector(":scope > .ant-collapse-header");
  const nameEl = header?.querySelector(".ant-typography");
  const labelEl = header?.querySelector('[class*="progressBarLabel"]');
  const row = header?.querySelector(".ant-collapse-header-text > div");
  if (!nameEl || !labelEl || !row) return;

  const fullName = normalizeText(nameEl.textContent);
  const qtyMatch = normalizeText(labelEl.textContent).match(/(\d+)/);
  const qty = qtyMatch ? Number(qtyMatch[1]) : null;
  const stock = heatingStocks?.get(bakeNameKey(fullName)) ?? null;
  const frozenKnown = typeof stock?.frozen === "number";
  const shelfKnown = typeof stock?.available === "number";

  const hidden = frozenKnown && stock.frozen === 0;
  const alert = isCurrentSlot && !hidden && qty != null && qty > 0 && shelfKnown && stock.available === 0;

  setDataAttr(item, "data-getirstok-bake-item", "1");
  setDataAttr(item, "data-getirstok-bake-hidden", hidden ? "1" : null);
  setDataAttr(item, "data-getirstok-bake-zero", qty === 0 ? "1" : null);
  setDataAttr(item, "data-getirstok-bake-alert", alert ? "1" : null);

  // React satırı başka bir ürün için yeniden kullanırsa (sıralama) içerik baştan yazılır
  const stamp = JSON.stringify([fullName, qty, stock?.available ?? null, stock?.frozen ?? null, alert]);
  let title = nameEl.parentElement.querySelector(":scope > .getirstok-bake-title");
  let qtyBadge = row.querySelector(":scope > .getirstok-bake-qty");
  if (title && qtyBadge && title.dataset.stamp === stamp) return;

  if (!title) {
    title = document.createElement("span");
    title.className = "getirstok-bake-title";
    nameEl.insertAdjacentElement("afterend", title);
  }
  title.dataset.stamp = stamp;
  title.replaceChildren();
  const nameSpan = document.createElement("span");
  nameSpan.className = "getirstok-bake-name";
  nameSpan.textContent = fullName.replace(BAKE_BRAND_PREFIX_RE, "");
  nameSpan.title = fullName;
  title.appendChild(nameSpan);
  if (shelfKnown || frozenKnown) {
    const stockLine = document.createElement("span");
    stockLine.className = "getirstok-bake-stock";
    const parts = [];
    if (shelfKnown) parts.push(["Raf", stock.available]);
    if (frozenKnown) parts.push(["Donuk", stock.frozen]);
    parts.forEach(([label, value], i) => {
      if (i > 0) stockLine.append(" · ");
      const b = document.createElement("b");
      b.textContent = String(value);
      stockLine.append(`${label} `, b);
    });
    title.appendChild(stockLine);
  }
  if (alert) {
    const badge = document.createElement("span");
    badge.className = "getirstok-bake-alert";
    badge.textContent = "Beni pişir";
    title.appendChild(badge);
  }

  if (!qtyBadge) {
    qtyBadge = document.createElement("span");
    qtyBadge.className = "getirstok-bake-qty";
    row.appendChild(qtyBadge);
  }
  qtyBadge.textContent = qty == null ? "—" : String(qty);
  qtyBadge.title = qty == null ? "" : `${qty} pişir`;
}

function decorateBakeryPage() {
  if (!BAKE_PAGE_PATH_RE.test(window.location.pathname)) return;
  const cards = Array.from(document.querySelectorAll('[class*="heatingEstimationCard"]'));
  if (cards.length === 0) return;
  ensureBakeStyleOnce();
  if (!heatingStocks) loadHeatingStocksFromSession();

  const currentIdx = cards.findIndex((c) => /currentPeriodCard/.test(c.className));
  cards.forEach((card, idx) => {
    const slotState =
      currentIdx < 0 ? "" : idx < currentIdx ? "past" : idx === currentIdx ? "current" : "next";
    setDataAttr(card, "data-getirstok-bake-card", slotState);
    for (const item of card.querySelectorAll(".ant-collapse-item")) {
      decorateBakeItem(item, idx === currentIdx);
    }
  });
}

// -----------------------------
// Depo: genel görünüm — sol menü, üst sekmeler (tüm sayfalar), Kontrol Paneli panosu ve kurye paneli
// Getir'in CSS modülü sınıflarının sonundaki kod (--rB6oM) her sürümde değişebilir; sadece baş kısmı kullanılır.
// -----------------------------

const ORDER_STAGE_BY_HEADER = {
  "toplayıcı bekliyor": "waiting",
  doğrulanıyor: "verifying",
  hazırlanıyor: "preparing",
  hazırlandı: "prepared",
  "el değiştiriliyor": "handover",
  "yolda/ulaştı": "onway",
};

const COURIER_STATUS_BY_TEXT = {
  yolda: "onway",
  toplama: "picking",
  meşgul: "busy",
  müsait: "available",
  "geri dönüyor": "returning",
};

function ensureWarehouseLayoutStyleOnce() {
  if (document.getElementById("getirstok-layout-style")) return;
  const style = document.createElement("style");
  style.id = "getirstok-layout-style";
  style.textContent = `
    /* ── Sol menü ──
       Yapı ve sıra Getir'in; sadece görünüm. Seviyeler: ana başlık → alt başlık (oklu) → sayfa bağlantısı (noktalı).
       Getir üzerine gelince zemini koyu mor, yazıyı beyaz yapıyor (bazısı !important); burada hepsi açık zemin + koyu yazı. */
    aside[class*="sider--"] {
      background: #ffffff !important;
      border: 1px solid #ece8f6 !important;
      border-radius: 16px !important;
      box-shadow: 0 1px 3px rgba(31, 27, 46, 0.05) !important;
      scrollbar-width: thin;
      scrollbar-color: #d6cff0 transparent;
    }
    aside[class*="sider--"] > .ant-layout-sider-children {
      padding-bottom: 12px;
    }
    aside[class*="sider--"] [class*="searchInput--"] {
      position: sticky !important;
      top: 0;
      z-index: 3;
      margin: 0 !important;
      width: 100% !important;
      padding: 10px 10px 8px !important;
      border: none !important;
      border-radius: 0 !important;
      background: #ffffff !important;
      box-shadow: 0 1px 0 #f1eef8 !important;
    }
    aside[class*="sider--"] [class*="searchInput--"] .ant-input {
      background: transparent !important;
    }
    /* Ant Design bu ::before'u kendi içinde gizli kullanıyor; çerçeve olarak görünür yapılır */
    aside[class*="sider--"] [class*="searchInput--"]::before {
      content: "" !important;
      visibility: visible !important;
      width: auto !important;
      position: absolute;
      inset: 10px 10px 8px;
      border: 1px solid #d9d2ec;
      border-radius: 10px;
      background: #f6f4fb;
      z-index: -1;
      pointer-events: none;
    }
    aside[class*="sider--"] [class*="searchInput--"]:focus-within::before {
      border-color: #5d3ebc;
      box-shadow: 0 0 0 3px rgba(93, 62, 188, 0.15);
      background: #ffffff;
    }
    aside[class*="sider--"] [class*="searchInput--"] .ant-input-prefix {
      margin-inline-start: 10px;
      color: #a19bb5;
    }
    aside[class*="sider--"] .ant-menu {
      background: transparent !important;
      border-inline-end: none !important;
    }
    aside[class*="sider--"] .ant-menu-root {
      padding: 8px 8px 0 !important;
    }

    /* Ortak satır: sabit yükseklik yok, uzun adlar iki satıra temiz iner */
    aside[class*="sider--"] .ant-menu .ant-menu-item,
    aside[class*="sider--"] .ant-menu .ant-menu-submenu-title {
      position: relative;
      height: auto !important;
      min-height: 34px !important;
      line-height: 18px !important;
      padding-top: 8px !important;
      padding-bottom: 8px !important;
      padding-left: 10px !important;
      padding-right: 34px !important;
      margin: 1px 0 !important;
      width: 100% !important;
      white-space: normal !important;
      border-radius: 9px !important;
      color: #3b3550 !important;
      transition: background 0.15s ease, color 0.15s ease !important;
    }
    aside[class*="sider--"] .ant-menu .ant-menu-item {
      padding-right: 8px !important;
    }
    aside[class*="sider--"] .ant-menu-title-content {
      white-space: normal !important;
      line-height: 18px !important;
    }
    aside[class*="sider--"] .ant-menu-item .ant-menu-title-content > .ant-flex {
      align-items: center !important;
      gap: 6px;
    }
    aside[class*="sider--"] .ant-menu-item .ant-menu-title-content > .ant-flex > a {
      flex: 1 1 auto;
      min-width: 0;
      color: inherit !important;
    }
    aside[class*="sider--"] .ant-menu-item .ml-8 {
      display: none;
    }

    /* 1. seviye: ana başlıklar ve tek sayfalar */
    aside[class*="sider--"] .ant-menu-root > .ant-menu-item,
    aside[class*="sider--"] .ant-menu-root > .ant-menu-submenu > .ant-menu-submenu-title {
      font-size: 14px !important;
      font-weight: 650 !important;
      color: #1f1b2e !important;
    }
    aside[class*="sider--"] .ant-menu-root > .ant-menu-submenu {
      margin-top: 2px;
    }

    /* 2. seviye ve altı: girinti + ağaç çizgisi */
    aside[class*="sider--"] .ant-menu-sub.ant-menu-inline {
      margin: 2px 0 4px 16px !important;
      padding-left: 6px !important;
      border-left: 1.5px solid #ebe6f6 !important;
      background: transparent !important;
    }
    aside[class*="sider--"] .ant-menu-sub .ant-menu-submenu-title {
      min-height: 32px !important;
      padding-top: 7px !important;
      padding-bottom: 7px !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      color: #3b3550 !important;
    }
    aside[class*="sider--"] .ant-menu-sub .ant-menu-item {
      min-height: 32px !important;
      padding-top: 7px !important;
      padding-bottom: 7px !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      color: #5b556e !important;
    }
    aside[class*="sider--"] .ant-menu-sub .ant-menu-sub .ant-menu-item,
    aside[class*="sider--"] .ant-menu-sub .ant-menu-sub .ant-menu-submenu-title {
      font-size: 12.5px !important;
    }
    /* Sayfa bağlantılarının başında nokta: oklu (açılır) başlıklardan ayırt edilsin */
    aside[class*="sider--"] .ant-menu .ant-menu-sub .ant-menu-item {
      padding-left: 24px !important;
    }
    aside[class*="sider--"] .ant-menu-sub .ant-menu-item::before {
      content: "";
      position: absolute;
      left: 11px;
      top: 50%;
      width: 6px;
      height: 6px;
      margin-top: -3px;
      border-radius: 50%;
      background: #cfc6ea;
      transition: background 0.15s ease, transform 0.15s ease;
    }

    /* Ok */
    aside[class*="sider--"] .ant-menu-submenu-arrow {
      inset-inline-end: 12px !important;
      color: #a19bb5 !important;
    }
    aside[class*="sider--"] .ant-menu-submenu-arrow::before,
    aside[class*="sider--"] .ant-menu-submenu-arrow::after {
      background-color: #a19bb5 !important;
    }

    /* Üzerine gelince: açık zemin, koyu yazı */
    aside[class*="sider--"] .ant-menu .ant-menu-item:hover,
    aside[class*="sider--"] .ant-menu .ant-menu-submenu .ant-menu-submenu-title:hover {
      background: #f3effc !important;
    }
    aside[class*="sider--"] .ant-menu .ant-menu-submenu .ant-menu-submenu-title:hover span,
    aside[class*="sider--"] .ant-menu .ant-menu-submenu-active > .ant-menu-submenu-title > span,
    aside[class*="sider--"] .ant-menu .ant-menu-submenu-active > .ant-menu-submenu-title > .ant-menu-submenu-arrow,
    aside[class*="sider--"] .ant-menu .ant-menu-item:hover span a,
    aside[class*="sider--"] .ant-menu .ant-menu-item:hover .ant-menu-item-icon,
    aside[class*="sider--"] .ant-menu .ant-menu-item-active button {
      color: #2a2440 !important;
    }
    aside[class*="sider--"] .ant-menu .ant-menu-submenu .ant-menu-submenu-title:hover .ant-menu-submenu-arrow::before,
    aside[class*="sider--"] .ant-menu .ant-menu-submenu .ant-menu-submenu-title:hover .ant-menu-submenu-arrow::after {
      background-color: #5d3ebc !important;
    }
    aside[class*="sider--"] .ant-menu-sub .ant-menu-item:hover::before {
      background: #a99bd8;
    }

    /* Açık menünün başlığı */
    aside[class*="sider--"] .ant-menu .ant-menu-submenu-open > .ant-menu-submenu-title,
    aside[class*="sider--"] .ant-menu .ant-menu-submenu-open > .ant-menu-submenu-title span {
      color: #5d3ebc !important;
    }
    aside[class*="sider--"] .ant-menu .ant-menu-submenu-open > .ant-menu-submenu-title .ant-menu-submenu-arrow::before,
    aside[class*="sider--"] .ant-menu .ant-menu-submenu-open > .ant-menu-submenu-title .ant-menu-submenu-arrow::after {
      background-color: #5d3ebc !important;
    }

    /* Seçili sayfa */
    aside[class*="sider--"] .ant-menu .ant-menu-item-selected,
    aside[class*="sider--"] .ant-menu .ant-menu-item-selected:hover {
      background: #ede7fc !important;
      color: #5d3ebc !important;
      font-weight: 700 !important;
    }
    aside[class*="sider--"] .ant-menu-root > .ant-menu-item-selected {
      box-shadow: inset 3px 0 0 #5d3ebc;
    }
    aside[class*="sider--"] .ant-menu-item-selected::after {
      display: none !important;
    }
    aside[class*="sider--"] .ant-menu .ant-menu-item-selected span a,
    aside[class*="sider--"] .ant-menu .ant-menu-item-selected:hover span a,
    aside[class*="sider--"] .ant-menu .ant-menu-item-selected button,
    aside[class*="sider--"] .ant-menu .ant-menu-item-selected:hover button,
    aside[class*="sider--"] .ant-menu .ant-menu-submenu-selected > .ant-menu-submenu-title .ant-menu-title-content {
      color: #5d3ebc !important;
    }
    aside[class*="sider--"] .ant-menu-sub .ant-menu-item-selected::before {
      background: #5d3ebc;
      transform: scale(1.3);
    }
    aside[class*="sider--"] .ant-menu-submenu-selected > .ant-menu-submenu-title {
      font-weight: 700 !important;
    }

    /* Yıldızlar: soluk, üzerine gelince belirgin; küçük ki yıldızlı satırlar uzamasın */
    aside[class*="sider--"] .ant-menu-item .ant-btn-icon-only {
      width: 22px !important;
      min-width: 22px !important;
      height: 22px !important;
      padding: 0 !important;
      flex-shrink: 0;
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    aside[class*="sider--"] .ant-menu-item:hover .ant-btn-icon-only,
    aside[class*="sider--"] .ant-menu-item-selected .ant-btn-icon-only,
    aside[class*="sider--"] .ant-menu-item .ant-btn-icon-only:focus-visible {
      opacity: 1;
    }
    aside[class*="sider--"] .ant-menu-item .ant-btn-icon-only .anticon-star svg {
      width: 14px;
      height: 14px;
    }

    /* ── Üst sekmeler (Siparişler, Harita, …) ── */
    .ant-tabs[aria-label="Main navigation tabs"] > .ant-tabs-nav {
      margin-bottom: 14px !important;
    }
    .ant-tabs[aria-label="Main navigation tabs"] > .ant-tabs-nav::before {
      display: none !important;
    }
    .ant-tabs[aria-label="Main navigation tabs"] .ant-tabs-ink-bar {
      display: none !important;
    }
    .ant-tabs[aria-label="Main navigation tabs"] .ant-tabs-nav-list {
      gap: 6px;
      padding: 4px;
      border-radius: 12px;
      background: #f3f0fa;
    }
    .ant-tabs[aria-label="Main navigation tabs"] .ant-tabs-tab {
      margin: 0 !important;
      padding: 6px 14px !important;
      border-radius: 9px !important;
      transition: background 0.15s ease, box-shadow 0.15s ease !important;
    }
    .ant-tabs[aria-label="Main navigation tabs"] .ant-tabs-tab .ant-tabs-tab-btn {
      color: #5b556e !important;
      font-size: 13px !important;
      font-weight: 600 !important;
    }
    .ant-tabs[aria-label="Main navigation tabs"] .ant-tabs-tab:hover {
      background: rgba(255, 255, 255, 0.7) !important;
    }
    .ant-tabs[aria-label="Main navigation tabs"] .ant-tabs-tab-active {
      background: #ffffff !important;
      box-shadow: 0 1px 3px rgba(31, 27, 46, 0.1) !important;
    }
    .ant-tabs[aria-label="Main navigation tabs"] .ant-tabs-tab-active .ant-tabs-tab-btn {
      color: #5d3ebc !important;
    }
    .ant-tabs[aria-label="Main navigation tabs"] .ant-tabs-tab .ant-badge {
      color: inherit !important;
      font: inherit !important;
    }
    .ant-tabs[aria-label="Main navigation tabs"] .ant-badge-count {
      box-shadow: none !important;
      font-weight: 700 !important;
    }
    .ant-tabs[aria-label="Main navigation tabs"] .ant-tabs-tab[data-getirstok-hidden-tab] {
      display: none !important;
    }
    .ant-tabs[aria-label="Main navigation tabs"] .getirstok-link-tab {
      display: inline-flex;
      align-items: center;
      cursor: pointer;
    }
    .ant-tabs[aria-label="Main navigation tabs"] .getirstok-link-tab > a.ant-tabs-tab-btn {
      text-decoration: none !important;
      outline: none;
    }
    .ant-tabs[aria-label="Main navigation tabs"] .getirstok-link-tab:hover > a.ant-tabs-tab-btn {
      color: #5d3ebc !important;
    }

    /* ── Kontrol Paneli: sipariş panosu ── */
    /* Sütunlar Getir'deki gibi pano yüksekliğine uzar; kartlar sütunun içinde kayar */
    [class*="ordersList--"] {
      gap: 10px !important;
    }
    [class*="orderColumn--"] {
      display: flex !important;
      flex-direction: column !important;
      min-height: 0 !important;
      background: #f8f7fc !important;
      border: 1px solid #ece8f6 !important;
      border-radius: 14px !important;
      padding: 0 4px 6px !important;
    }
    [class*="orderHeader--"] {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      gap: 6px !important;
      padding: 12px 4px 10px !important;
      border: none !important;
    }
    /* Sayaç varsayılan gri; sütunda kart varsa CSS'ten hemen mor olur (JS'i beklemeden,
       açılışta renk atlaması olmasın). Kartsız ama sayısı 0 olmayan sütunu JS işaretler. */
    [class*="orderHeader--"] > p {
      margin: 0 !important;
      font-size: 13px !important;
      font-weight: 700 !important;
      color: #8a849d !important;
    }
    [class*="orderHeader--"] > .ant-typography {
      min-width: 34px;
      padding: 2px 10px;
      border: none !important;
      border-radius: 999px !important;
      background: #e9e6f2 !important;
      color: #8a849d !important;
      font-size: 14px !important;
      font-weight: 800 !important;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    [class*="orderColumn--"]:has([class*="orderCard--"]) [class*="orderHeader--"] > p,
    [data-getirstok-filled-column] [class*="orderHeader--"] > p {
      color: #3b3550 !important;
    }
    [class*="orderColumn--"]:has([class*="orderCard--"]) [class*="orderHeader--"] > .ant-typography,
    [data-getirstok-filled-column] [class*="orderHeader--"] > .ant-typography {
      background: #5d3ebc !important;
      color: #ffffff !important;
    }
    [class*="orderCardWrapper--"] {
      display: flex !important;
      flex-direction: column !important;
      flex: 1 1 auto !important;
      min-height: 0 !important;
      overflow-y: auto !important;
      gap: 8px !important;
      padding: 2px 2px 4px !important;
      scrollbar-width: thin;
      scrollbar-color: #a99bd8 #efecf7;
    }
    [class*="orderCardWrapper--"] > [class*="orderCard--"] {
      flex-shrink: 0;
    }
    [class*="orderCardWrapper--"]::-webkit-scrollbar {
      width: 8px;
    }
    [class*="orderCardWrapper--"]::-webkit-scrollbar-thumb {
      background: #a99bd8;
      border-radius: 999px;
    }
    [class*="orderCardWrapper--"]::-webkit-scrollbar-track {
      background: #efecf7;
      border-radius: 999px;
    }
    [class*="orderCard--"] {
      position: relative;
      margin: 0 !important;
      border: 1px solid #ebe7f5 !important;
      border-radius: 12px !important;
      background: #ffffff !important;
      box-shadow: 0 1px 3px rgba(31, 27, 46, 0.07) !important;
      overflow: hidden;
      transition: box-shadow 0.15s ease, transform 0.15s ease;
    }
    [class*="orderCard--"]:hover {
      box-shadow: 0 6px 16px -6px rgba(93, 62, 188, 0.3) !important;
      transform: translateY(-1px);
    }
    [class*="orderCard--"]:has([class*="bgDanger"]) {
      box-shadow: inset 4px 0 0 #dc2626, 0 1px 3px rgba(31, 27, 46, 0.07) !important;
    }
    [class*="orderCard--"]:has([class*="bgWarning"]) {
      box-shadow: inset 4px 0 0 #f59e0b, 0 1px 3px rgba(31, 27, 46, 0.07) !important;
    }
    [class*="orderCard--"]:has([class*="bgSuccess"]) {
      box-shadow: inset 4px 0 0 #16a34a, 0 1px 3px rgba(31, 27, 46, 0.07) !important;
    }
    [class*="orderCard--"] [class*="cardBody--"] {
      border: none !important;
      padding: 8px 6px 4px 10px !important;
    }
    /* Kartın başındaki boş yer tutucu */
    [class*="orderCard--"] > div:first-child:empty {
      display: none !important;
    }
    [class*="orderCard--"] [class*="cardBody--"] > [class*="textWithIcons--"][data-getirstok-empty-row] {
      display: none !important;
    }

    /* Toplayıcı bekleyen siparişler: dikkat isteyen kartlar, belirgin olsun */
    [data-getirstok-stage="waiting"] [class*="orderCard--"] {
      background: #fffaf0 !important;
      border-color: #fcd9a0 !important;
      box-shadow: inset 4px 0 0 #f59e0b, 0 2px 6px -2px rgba(217, 119, 6, 0.25) !important;
    }
    [data-getirstok-stage="waiting"] [class*="orderCard--"] [class*="cardBody--"] {
      padding: 10px 8px 10px 12px !important;
    }
    [data-getirstok-stage="waiting"] [class*="orderCard--"] [class*="textWithIcons--"] .ant-typography {
      font-size: 15px !important;
      font-weight: 800 !important;
      color: #1f1b2e !important;
    }
    [data-getirstok-stage="waiting"] [class*="orderCard--"] [class*="cardBody--"]::after {
      content: "Toplayıcı bekleniyor";
      display: inline-block;
      max-width: 100%;
      margin-top: 6px;
      padding: 2px 8px;
      border-radius: 8px;
      background: #fef3c7;
      color: #92400e;
      font-size: 10.5px;
      font-weight: 700;
      line-height: 1.35;
      white-space: normal;
    }
    [data-getirstok-stage="waiting"]:has([class*="orderCard--"]) [class*="orderHeader--"] > .ant-typography,
    [data-getirstok-stage="waiting"][data-getirstok-filled-column] [class*="orderHeader--"] > .ant-typography {
      background: #f59e0b !important;
    }

    /* Doğrulanıyor: mavi şerit */
    [data-getirstok-stage="verifying"] [class*="orderCard--"] {
      box-shadow: inset 4px 0 0 #3b82f6, 0 1px 3px rgba(31, 27, 46, 0.07) !important;
    }
    [class*="orderTimer--"] {
      font-size: 16px !important;
      font-weight: 800 !important;
      color: #1f1b2e !important;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
      text-align: left !important;
      margin-bottom: 4px !important;
    }
    [class*="orderCard--"]:has([class*="bgDanger"]) [class*="orderTimer--"] { color: #b91c1c !important; }
    [class*="orderCard--"]:has([class*="bgWarning"]) [class*="orderTimer--"] { color: #b45309 !important; }
    [class*="orderCard--"] [class*="progress--"] {
      height: 5px !important;
      margin: 0 0 8px !important;
      border-radius: 999px !important;
      background: #f1eff7 !important;
      overflow: hidden !important;
    }
    [class*="orderCard--"] [class*="progress--"] > div {
      height: 5px !important;
      max-width: 100% !important;
      padding: 0 !important;
      border-radius: 999px !important;
    }
    [class*="orderCard--"] [class*="textWithIcons--"] {
      display: flex !important;
      align-items: center !important;
      gap: 4px !important;
      margin: 2px 0 !important;
      min-width: 0;
    }
    [class*="orderCard--"] [class*="textIcon--"] {
      flex-shrink: 0;
      width: 14px !important;
      margin: 0 !important;
      opacity: 0.5;
    }
    [class*="orderCard--"] [class*="textIcon--"] svg {
      width: 13px !important;
      height: 13px !important;
    }
    [class*="orderCard--"] [class*="textWithIcons--"] > span {
      min-width: 0;
      overflow: hidden;
    }
    [class*="orderCard--"] [class*="textWithIcons--"] .ant-typography {
      font-size: 12.5px !important;
      font-weight: 600 !important;
      color: #3b3550 !important;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* Sipariş kodu = ilk bilgi satırı (süre/çubuk olan kartta onlardan hemen sonra, olmayanda en başta) */
    [class*="orderCard--"] [class*="cardBody--"] > :not([class*="textWithIcons--"]) + [class*="textWithIcons--"] .ant-typography,
    [class*="orderCard--"] [class*="cardBody--"] > [class*="textWithIcons--"]:first-child .ant-typography {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
      font-weight: 700 !important;
      color: #5d3ebc !important;
    }
    [class*="orderCard--"] [class*="batched--"] {
      margin-top: 6px !important;
    }
    [class*="orderCard--"] [class*="batchedBadge--"] {
      display: inline-block !important;
      width: auto !important;
      max-width: 100%;
      padding: 1px 7px !important;
      border-radius: 999px !important;
      background: #ede7fc !important;
      color: #5d3ebc !important;
      font-size: 10.5px !important;
      font-weight: 700 !important;
      line-height: 16px !important;
      white-space: nowrap !important;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    [class*="orderCard--"] [class*="locationContainer--"] {
      display: flex !important;
      justify-content: flex-end !important;
      padding: 0 10px 8px !important;
      border: none !important;
    }
    [class*="orderCard--"] [class*="locationContainer--"] .ant-tag {
      margin: 0 !important;
      border: none !important;
      border-radius: 6px !important;
      background: #f3f2f7 !important;
      color: #5b556e !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
      font-size: 11px !important;
      font-weight: 600 !important;
    }

    /* ── Kurye / toplayıcı paneli ── */
    [class*="pickerAndCourierPanel--"] .ant-tabs-card > .ant-tabs-nav .ant-tabs-tab {
      border-radius: 10px 10px 0 0 !important;
      font-weight: 700 !important;
    }
    [class*="courierAndPickerCard--"] {
      border: 1px solid #ebe7f5 !important;
      border-radius: 12px !important;
      box-shadow: 0 1px 3px rgba(31, 27, 46, 0.06) !important;
      overflow: hidden;
      transition: box-shadow 0.15s ease;
    }
    [class*="courierAndPickerCard--"]:hover {
      box-shadow: 0 6px 16px -6px rgba(31, 27, 46, 0.25) !important;
    }
    [class*="courierAndPickerCard--"] > .ant-card-body {
      padding: 10px 12px !important;
    }
    [class*="courierAndPickerCard--"] [class*="statusInner--"] {
      background: transparent !important;
      padding: 0 !important;
      margin-bottom: 4px !important;
    }
    [class*="courierAndPickerCard--"] [class*="statusInnerTag--"] {
      margin: 0 !important;
      padding: 1px 9px !important;
      border: none !important;
      border-radius: 999px !important;
      font-size: 11.5px !important;
      font-weight: 700 !important;
      background: #ede7fc !important;
      color: #5d3ebc !important;
    }
    [class*="courierAndPickerCard--"] [class*="name--"] {
      margin: 0 !important;
    }
    [class*="courierAndPickerCard--"] [class*="name--"] .ant-tag {
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      background: transparent !important;
      font-size: 13.5px !important;
      font-weight: 700 !important;
      color: #1f1b2e !important;
    }
    [class*="courierAndPickerCard--"] [class*="timer--"] {
      margin: 2px 0 0 !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      color: #6b6580 !important;
      font-variant-numeric: tabular-nums;
    }
    [data-getirstok-courier="onway"] { box-shadow: inset 4px 0 0 #5d3ebc, 0 1px 3px rgba(31, 27, 46, 0.06) !important; }
    [data-getirstok-courier="picking"] { box-shadow: inset 4px 0 0 #2563eb, 0 1px 3px rgba(31, 27, 46, 0.06) !important; }
    [data-getirstok-courier="busy"] { box-shadow: inset 4px 0 0 #dc2626, 0 1px 3px rgba(31, 27, 46, 0.06) !important; }
    [data-getirstok-courier="available"] { box-shadow: inset 4px 0 0 #16a34a, 0 1px 3px rgba(31, 27, 46, 0.06) !important; }
    [data-getirstok-courier="returning"] { box-shadow: inset 4px 0 0 #d97706, 0 1px 3px rgba(31, 27, 46, 0.06) !important; }
    [data-getirstok-courier="picking"] [class*="statusInnerTag--"] { background: #dbeafe !important; color: #1d4ed8 !important; }
    [data-getirstok-courier="busy"] [class*="statusInnerTag--"] { background: #fee2e2 !important; color: #b91c1c !important; }
    [data-getirstok-courier="available"] [class*="statusInnerTag--"] { background: #dcfce7 !important; color: #15803d !important; }
    [data-getirstok-courier="returning"] [class*="statusInnerTag--"] { background: #fef3c7 !important; color: #92400e !important; }
  `;
  document.head.appendChild(style);
}

// Kontrol Paneli üst sekmeleri: iki sekme gizlenir, yerine başka sayfalara giden sekmeler gelir.
// Tarihler tıklama anında hesaplanır (gün değişse de adres güncel kalsın).
const DASHBOARD_HIDDEN_TABS = new Set(["eksik ürünlü siparişler", "ileri tarihli siparişler"]);
const DASHBOARD_LINK_TABS = [
  {
    id: "shelf-label",
    label: "Raf Etiketi",
    url: (wid) => `/r/${wid}/stock/stock-management/shelf-label/list`,
  },
  {
    id: "remove-from-sales",
    label: "Satıştan Kaldırma",
    url: (wid, today) =>
      `/r/${wid}/stock/remove-from-sales/list?offset=1&endDate=${today}&startDate=${addDaysLocalYmd(today, -6)}&warehouseIds=${wid}&limit=50`,
  },
  {
    id: "supply-delivery",
    label: "Tedarik Teslimat Listesi",
    url: (wid, today) =>
      `/r/${wid}/stock/inbound/supply/delivery/list?offset=1&endDate=${today}&startDate=${addDaysLocalYmd(today, -14)}`,
  },
];

function addDaysLocalYmd(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  return localYmd(new Date(y, m - 1, d + days));
}

/** Adreste depo kimliği yoksa Soğukkuyu */
const DEFAULT_WAREHOUSE_ID = "6113e59fbb8549d0f20e65f5";

function currentWarehouseId() {
  return window.location.pathname.match(/\/r\/([a-f0-9]{24})(\/|$)/i)?.[1] ?? DEFAULT_WAREHOUSE_ID;
}

function dashboardLinkUrl(tab) {
  return tab.url(currentWarehouseId(), localYmd(new Date()));
}

/** Sayfayı baştan yüklemeden geçiş (panelin kendi yönlendiricisi adres değişikliğini dinler) */
function navigateInPanel(url) {
  window.history.pushState(window.history.state, "", url);
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  // Yönlendirici tepki vermezse pano yerinde kalır: normal sayfa yüklemesine düş
  setTimeout(() => {
    if (document.querySelector('.ant-tabs[aria-label="Main navigation tabs"]')) window.location.assign(url);
  }, 900);
}

// ── Seçilen ürün adını Ürün Listesi / Raf Etiketi sayfasında bul ──
// Seçimin altında iki buton çıkar; tıklanınca sayfaya geçilir, ürün filtresine ad yazılıp
// eşleşen öneri seçilir ve Uygula'ya basılır. Geçiş sayfa yenilese de iş sessionStorage'da bekler.
const PRODUCT_FIND_STORAGE_KEY = "getirstok.productFind";
const PRODUCT_FIND_MAX_AGE_MS = 30 * 1000;
const PRODUCT_FIND_TARGETS = {
  products: {
    label: "Ürün listesinde bul",
    title: "ürün listesi",
    // Yan menü kapalıyken bağlantı DOM'da olmayabilir; adres düzeni diğer ürün sayfalarıyla aynı
    url: (wid) =>
      menuLinkHref("ürün listesi") || `/r/${wid}/stock/stock-management/product/list`,
  },
  shelf: {
    label: "Raf etiketinde bul",
    title: "raf etiketi",
    url: (wid) => `/r/${wid}/stock/stock-management/shelf-label/list`,
  },
};

function menuLinkHref(text) {
  for (const a of document.querySelectorAll("a[href]")) {
    if (normalizeText(a.textContent).toLocaleLowerCase("tr-TR") === text) return a.getAttribute("href");
  }
  return null;
}

let productFindPopup = null;
let productFindRunning = false;
/** Bekleyen arama var mı (her DOM değişikliğinde sessionStorage okunmasın) */
let productFindPending = false;
try {
  productFindPending = !!sessionStorage.getItem(PRODUCT_FIND_STORAGE_KEY);
} catch {
  /* depolama kapalı */
}

function ensureProductFindStyleOnce() {
  if (document.getElementById("getirstok-find-style")) return;
  const style = document.createElement("style");
  style.id = "getirstok-find-style";
  style.textContent = `
    .getirstok-find-pop {
      position: fixed;
      z-index: 2147483000;
      display: flex;
      gap: 6px;
      padding: 6px;
      border-radius: 12px;
      background: #ffffff;
      border: 1px solid #e4def4;
      box-shadow: 0 12px 32px -10px rgba(31, 27, 46, 0.35);
      font-family: inherit;
      animation: getirstok-find-in 0.12s ease-out;
    }
    @keyframes getirstok-find-in {
      from { opacity: 0; transform: translateY(-3px); }
      to { opacity: 1; transform: none; }
    }
    .getirstok-find-pop button {
      height: 30px;
      padding: 0 12px;
      border: 1px solid #e4def4;
      border-radius: 9px;
      background: #faf8ff;
      color: #5d3ebc;
      font-size: 12.5px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
    }
    .getirstok-find-pop button:hover {
      background: #5d3ebc;
      border-color: #5d3ebc;
      color: #ffffff;
    }
    .getirstok-find-toast {
      position: fixed;
      z-index: 2147483000;
      left: 50%;
      top: 18px;
      transform: translateX(-50%);
      padding: 9px 16px;
      border-radius: 12px;
      background: #1f1b2e;
      color: #ffffff;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 12px 32px -10px rgba(31, 27, 46, 0.5);
    }
  `;
  document.head.appendChild(style);
}

function showProductFindToast(text) {
  ensureProductFindStyleOnce();
  const toast = document.createElement("div");
  toast.className = "getirstok-find-toast";
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function hideProductFindPopup() {
  productFindPopup?.remove();
  productFindPopup = null;
}

/** Seçilen metin ürün adı olabilir mi: sipariş detayı penceresinde, kısa, tek satır, giriş kutusu dışında */
function productFindSelectionText() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const anchor = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
  if (!anchor?.closest?.(".ant-modal-content.getirstok-order-modal")) return null;
  if (anchor.closest("input, textarea, [contenteditable='true'], .getirstok-find-pop")) return null;
  const raw = sel.toString();
  if (/\n.*\S/.test(raw.trim())) return null;
  const text = normalizeText(raw);
  if (text.length < 3 || text.length > 150 || /^\d+$/.test(text)) return null;
  return { text, rect: sel.getRangeAt(0).getBoundingClientRect() };
}

function showProductFindPopup() {
  const found = productFindSelectionText();
  if (!found) {
    hideProductFindPopup();
    return;
  }
  ensureProductFindStyleOnce();
  hideProductFindPopup();
  const pop = document.createElement("div");
  pop.className = "getirstok-find-pop";
  // Butona basınca seçim kaybolmasın
  pop.addEventListener("mousedown", (e) => e.preventDefault());
  for (const [target, def] of Object.entries(PRODUCT_FIND_TARGETS)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = def.label;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideProductFindPopup();
      window.getSelection()?.removeAllRanges();
      startProductFind(target, found.text);
    });
    pop.appendChild(btn);
  }
  document.body.appendChild(pop);
  const width = pop.offsetWidth;
  const left = Math.max(8, Math.min(found.rect.left, window.innerWidth - width - 8));
  const below = found.rect.bottom + 6;
  const top = below + pop.offsetHeight > window.innerHeight - 8 ? found.rect.top - pop.offsetHeight - 6 : below;
  pop.style.left = `${left}px`;
  pop.style.top = `${Math.max(8, top)}px`;
  productFindPopup = pop;
}

function startProductFind(target, name, productId = null) {
  const url = PRODUCT_FIND_TARGETS[target].url(currentWarehouseId());
  const path = new URL(url, window.location.origin).pathname;
  const job = { target, name, productId, path, at: Date.now() };
  try {
    sessionStorage.setItem(PRODUCT_FIND_STORAGE_KEY, JSON.stringify(job));
    productFindPending = true;
  } catch {
    /* depolama kapalı */
  }
  if (window.location.pathname === path) {
    void runPendingProductFind();
    return;
  }
  window.history.pushState(window.history.state, "", url);
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  // Yönlendirici tepki vermezse (sayfa başlığı gelmezse) normal sayfa yüklemesine düş;
  // bu arada başka sayfaya geçildiyse (ör. Ürün Listesi → Raf Etiketi) dokunma
  const title = PRODUCT_FIND_TARGETS[target].title;
  setTimeout(() => {
    if (window.location.pathname === path && !findCardByTitle(title)) window.location.assign(url);
  }, 2500);
}

function findCardByTitle(title) {
  for (const head of document.querySelectorAll(".ant-card-head-title")) {
    if (normalizeText(head.textContent).toLocaleLowerCase("tr-TR") === title) return head.closest(".ant-card");
  }
  return null;
}

function readPendingProductFind() {
  try {
    const job = JSON.parse(sessionStorage.getItem(PRODUCT_FIND_STORAGE_KEY) || "null");
    if (!job || Date.now() - job.at > PRODUCT_FIND_MAX_AGE_MS) return null;
    return job;
  } catch {
    return null;
  }
}

/** React'in kontrol ettiği arama kutusuna yazı (değer doğrudan atanırsa React görmez) */
function typeIntoInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Ürün filtresi: arama yapılabilen, kilitli olmayan ilk seçim kutusu */
function findProductFilterSelect(card) {
  const selects = Array.from(
    card.querySelectorAll(".layout__filter .ant-select.ant-select-show-search:not(.ant-select-disabled)")
  ).filter((s) => !s.closest('[aria-label="saved-queries-dropdown"]'));
  return (
    selects.find((s) =>
      normalizeText(s.querySelector(".ant-select-selection-placeholder")?.textContent)
        .toLocaleLowerCase("tr-TR")
        .includes("ürün")
    ) || selects[0] || null
  );
}

async function runPendingProductFind() {
  if (productFindRunning) return;
  const job = readPendingProductFind();
  if (!job) {
    productFindPending = false;
    return;
  }
  if (window.location.pathname !== job.path) return;
  const card = findCardByTitle(PRODUCT_FIND_TARGETS[job.target]?.title || "");
  const select = card && findProductFilterSelect(card);
  if (!select) return;
  productFindRunning = true;
  productFindPending = false;
  sessionStorage.removeItem(PRODUCT_FIND_STORAGE_KEY);
  try {
    const picked = await findProductInFilter(card, select, job);
    if (picked && job.target === "products") await continueToShelfWithProductId(card, picked);
  } catch (error) {
    console.warn("[GetirStok] Ürün bulma:", error);
    showProductFindToast("Ürün otomatik seçilemedi; filtreden elle seçebilirsin.");
  } finally {
    productFindRunning = false;
  }
}

const openOptionText = (o) => normalizeText(o.textContent).toLocaleLowerCase("tr-TR");

/** Arama kutusuna yazıp açılan önerileri bekler; `accept` uymayan (eski) öneriler sayılmaz */
async function searchSelectOptions(select, input, keyword, accept) {
  simulateClick(select.querySelector(".ant-select-selector") || select);
  input.focus();
  typeIntoInput(input, "");
  typeIntoInput(input, keyword);
  return waitForElement(() => {
    const list = Array.from(
      document.querySelectorAll(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option")
    ).filter(accept);
    return list.length > 0 ? list : null;
  }, 8000);
}

/**
 * Ürün filtresinde ürünü bulup seçer ve Uygula'ya basar.
 * `job.productId` varsa önce kimlikle (öneri adı kimliği içermez; aynı adlı öneri seçilir),
 * sonuç yoksa adla aranır. @returns seçilen önerinin adı; seçilemediyse null
 */
async function findProductInFilter(card, select, job) {
  const want = normalizeText(job.name).toLocaleLowerCase("tr-TR");
  // Getir araması parantezli gramajla bulamayabilir; yazarken gramaj atılır, seçerken kullanılır
  const keyword = normalizeText(job.name.replace(/\s*\([^)]*\)\s*$/, ""));
  const keywordLower = keyword.toLocaleLowerCase("tr-TR");

  // Önceki filtre (seçili ürünler) kalmasın
  const clear = card.querySelector(".onboarding-clear-filter");
  if (clear && select.querySelector(".ant-select-selection-item")) {
    simulateClick(clear);
    await sleep(400);
  }
  const input = select.querySelector("input.ant-select-selection-search-input");
  if (!input) throw new Error("arama kutusu yok");

  let pick = null;
  let options = null;
  if (job.productId) {
    // Arama sonucu gelmeden görünen varsayılan liste seçilmesin: yalnız aynı ad kabul
    options = await searchSelectOptions(select, input, job.productId, (o) => openOptionText(o) === want);
    if (options) pick = options[0];
  }
  if (!pick) {
    options = await searchSelectOptions(select, input, keyword, (o) => openOptionText(o).includes(keywordLower));
    if (!options) {
      showProductFindToast(`"${keyword}" için ürün bulunamadı.`);
      return null;
    }
    const exact = options.find((o) => openOptionText(o) === want);
    const prefixed = options.filter((o) => openOptionText(o).startsWith(keywordLower));
    pick = exact || (prefixed.length === 1 ? prefixed[0] : options.length === 1 ? options[0] : null);
  }
  if (!pick) {
    showProductFindToast("Birden çok ürün var; listeden doğru olanı seç.");
    return null;
  }
  const pickedName = normalizeText(pick.textContent);
  simulateClick(pick);
  await sleep(250);
  // Çoklu seçimde liste açık kalır; kapat
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
  const apply = card.querySelector(".onboarding-apply-filter");
  if (apply) simulateClick(apply);
  return pickedName;
}

/** Ürün Listesi sonucundan ürün kimliğini okur (tablo filtreyle yenilenene kadar bekler) */
async function readProductIdFromList(card, name) {
  const want = normalizeText(name).toLocaleLowerCase("tr-TR");
  return waitForElement(() => {
    const table = card.querySelector(".ant-table-wrapper table");
    if (!table) return null;
    const headers = Array.from(table.querySelectorAll(":scope > thead > tr > th"), (th) =>
      normalizeText(th.textContent).toLocaleLowerCase("tr-TR")
    );
    const idCol = headers.findIndex((h) => h === "ürün ıd" || h === "ürün id");
    const nameCol = headers.indexOf("ürün adı");
    if (idCol < 0 || nameCol < 0) return null;
    const rows = Array.from(table.querySelectorAll(":scope > tbody > tr.ant-table-row"));
    // Filtre uygulanmadan önceki liste de bu ürünü içerebilir; yalnız tek satır kalınca okunur
    if (rows.length !== 1) return null;
    const cells = rows[0].children;
    if (normalizeText(cells[nameCol]?.textContent).toLocaleLowerCase("tr-TR") !== want) return null;
    return normalizeText(cells[idCol]?.textContent).match(/[a-f0-9]{24}/i)?.[0] || null;
  }, 10000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Sayfa odakta değilse ya da izin yoksa eski yöntem
    const area = document.createElement("textarea");
    area.value = text;
    area.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

async function continueToShelfWithProductId(card, name) {
  const productId = await readProductIdFromList(card, name);
  if (!productId) {
    showProductFindToast("Ürün ID okunamadı; raf etiketine geçilmedi.");
    return;
  }
  const copied = await copyText(productId);
  showProductFindToast(`${copied ? "Ürün ID kopyalandı" : "Ürün ID"}: ${productId} — raf etiketine geçiliyor`);
  await sleep(700);
  startProductFind("shelf", name, productId);
}

if (isWarehousePanel) {
  document.addEventListener("mouseup", (e) => {
    if (e.button !== 0 || e.target.closest?.(".getirstok-find-pop")) return;
    setTimeout(showProductFindPopup, 0);
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === "Escape") hideProductFindPopup();
    else if (e.shiftKey) setTimeout(showProductFindPopup, 0);
  });
  document.addEventListener("mousedown", (e) => {
    if (!e.target.closest?.(".getirstok-find-pop")) hideProductFindPopup();
  });
  window.addEventListener("scroll", hideProductFindPopup, true);
}

function createDashboardLinkTab(tab) {
  const wrap = document.createElement("div");
  wrap.className = "ant-tabs-tab getirstok-link-tab";
  wrap.setAttribute("data-getirstok-link-tab", tab.id);
  const a = document.createElement("a");
  a.className = "ant-tabs-tab-btn";
  a.textContent = tab.label;
  a.href = dashboardLinkUrl(tab);
  const refreshHref = () => {
    const url = dashboardLinkUrl(tab);
    if (a.getAttribute("href") !== url) a.setAttribute("href", url);
  };
  a.addEventListener("mouseenter", refreshHref);
  a.addEventListener("focus", refreshHref);
  a.addEventListener("click", (event) => {
    refreshHref();
    // Ctrl/Shift/orta tık: tarayıcı yeni sekmede açsın
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateInPanel(a.getAttribute("href"));
  });
  wrap.appendChild(a);
  return wrap;
}

function decorateDashboardTabs() {
  const list = document.querySelector('.ant-tabs[aria-label="Main navigation tabs"] .ant-tabs-nav-list');
  if (!list) return;
  let lastHidden = null;
  for (const tab of list.querySelectorAll(":scope > .ant-tabs-tab:not(.getirstok-link-tab)")) {
    const label = normalizeText(tab.querySelector(".ant-tabs-tab-btn")?.textContent).toLocaleLowerCase("tr-TR");
    const hide = DASHBOARD_HIDDEN_TABS.has(label);
    setDataAttr(tab, "data-getirstok-hidden-tab", hide ? "1" : null);
    if (hide) lastHidden = tab;
  }

  // Gizlenen sekmelerin yerine (bizim sekmeler atlanarak bulunan ilk Getir öğesinden önce);
  // gizlenecek sekme yoksa sona, ink bar'dan önce
  let anchor = lastHidden ? lastHidden.nextSibling : list.querySelector(":scope > .ant-tabs-ink-bar");
  while (anchor?.classList?.contains("getirstok-link-tab")) anchor = anchor.nextSibling;

  // Sondan başa: her sekme bir sonrakinin önüne; yerindeyse DOM'a dokunulmaz
  let ref = anchor;
  for (let i = DASHBOARD_LINK_TABS.length - 1; i >= 0; i--) {
    const tab = DASHBOARD_LINK_TABS[i];
    const el = list.querySelector(`:scope > [data-getirstok-link-tab="${tab.id}"]`) ?? createDashboardLinkTab(tab);
    if (el.parentNode !== list || el.nextSibling !== ref) list.insertBefore(el, ref);
    ref = el;
  }
}

function decorateDashboardColumns() {
  for (const column of document.querySelectorAll('[class*="orderColumn--"]')) {
    const header = column.querySelector('[class*="orderHeader--"]');
    const countText = header?.querySelector(":scope > .ant-typography")?.textContent;
    const title = normalizeText(header?.querySelector(":scope > p")?.textContent).toLocaleLowerCase("tr-TR");
    const hasCards = !!column.querySelector('[class*="orderCard--"]');
    const empty = !hasCards && /^\s*0\s*(\/\s*0\s*)?$/.test(countText ?? "");
    setDataAttr(column, "data-getirstok-filled-column", empty ? null : "1");
    setDataAttr(column, "data-getirstok-stage", ORDER_STAGE_BY_HEADER[title] ?? null);
  }
}

/**
 * Görünümü ilk anda belirleyen hafif işler: Getir sayfayı her değiştirdiğinde ekrana
 * çizilmeden önce (MutationObserver anında) çalışır, böylece eski hal bir an bile görünmez.
 */
function decorateWarehouseFast() {
  ensureWarehouseLayoutStyleOnce();
  decorateDashboardTabs();
  decorateDashboardColumns();
  // Tablo sayfaları: gizlenen sütun/filtreler bir an bile görünmesin (sayfa dışında hemen döner)
  decorateRemovalPage();
  decorateExpirationPage();
  decorateInventoryListPage();
  decorateInventoryTaskTables();
  if (productFindPending && !productFindRunning) void runPendingProductFind();
}

function decorateWarehouseLayout() {
  decorateWarehouseFast();

  // Henüz atanmamış bilgi satırları ("-") gizlensin; kart sadece dolu bilgiyi göstersin
  for (const row of document.querySelectorAll('[class*="orderCard--"] [class*="textWithIcons--"]')) {
    const value = normalizeText(row.textContent);
    setDataAttr(row, "data-getirstok-empty-row", value === "-" || value === "" ? "1" : null);
  }

  for (const card of document.querySelectorAll('[class*="courierAndPickerCard--"]')) {
    const statusText = normalizeText(card.querySelector('[class*="statusInnerTag--"]')?.textContent).toLocaleLowerCase("tr-TR");
    setDataAttr(card, "data-getirstok-courier", COURIER_STATUS_BY_TEXT[statusText] ?? null);
  }
}

// -----------------------------
// Depo: Ürün Son Kullanma Tarihleri sayfasını sadeleştir
// Ürün ID, Saklama Koşulu ve Lokasyon sütunları gizlenir; tarihlere kalan gün etiketi eklenir.
// Sütunlar sıraya göre değil başlık adına göre bulunur.
// -----------------------------

const EXPIRATION_PAGE_PATH_RE = /\/stock\/stock-management\/product\/expiration\//;
const EXPIRATION_COLUMN_BY_HEADER = {
  "ürün görseli": "image",
  // tr-TR küçük harfte "ID" → "ıd" olur
  "ürün ıd": "id",
  "ürün id": "id",
  "ürün adı": "name",
  "saklama koşulu": "storage",
  lokasyon: "location",
  "son kullanma tarihi": "expiry",
  "satıştan kaldırma tarihi": "removal",
  "ürün sayımı": "count",
};
/** Satıştan kaldırmaya bu kadar gün (ve daha az) kalınca sarı uyarı */
const EXPIRATION_SOON_DAYS = 2;

/** "18.10.2026" → bugüne göre gün farkı (bugün 0, yarın 1, dün -1) */
function daysFromTodayTr(text) {
  const m = normalizeText(text).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const target = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

function ensureExpirationStyleOnce() {
  if (document.getElementById("getirstok-exp-style")) return;
  const style = document.createElement("style");
  style.id = "getirstok-exp-style";
  style.textContent = `
    [data-getirstok-exp-card] {
      border-radius: 16px !important;
      border: 1px solid #ebe7f5 !important;
      box-shadow: 0 1px 3px rgba(31, 27, 46, 0.06) !important;
    }
    [data-getirstok-exp-card] > .ant-card-head {
      min-height: 0 !important;
      padding: 12px 18px !important;
      border-bottom: none !important;
    }
    [data-getirstok-exp-card] > .ant-card-head .ant-card-head-title {
      font-size: 17px !important;
      font-weight: 700 !important;
      color: #1f1b2e !important;
    }
    [data-getirstok-exp-card] > .ant-card-body {
      padding: 0 18px 18px !important;
    }
    /* Sütunlar gizlenince Getir'in dikey yerleşimi içeriğe göre daralmasın */
    [data-getirstok-exp-card] > .ant-card-body > .ant-space-vertical {
      display: flex !important;
      width: 100% !important;
    }
    [data-getirstok-exp-card] > .ant-card-body > .ant-space-vertical > .ant-space-item {
      width: 100% !important;
    }
    [data-getirstok-exp-table] .ant-table-thead > tr > th {
      white-space: nowrap;
    }
    [data-getirstok-exp-card] .ant-collapse {
      background: #faf9fd !important;
      border: 1px solid #eeebf6 !important;
      border-radius: 12px !important;
    }
    [data-getirstok-exp-card] .ant-collapse > .ant-collapse-item {
      border-bottom: none !important;
    }
    [data-getirstok-exp-card] .ant-collapse-content {
      background: transparent !important;
      border-top: none !important;
    }

    /* Gizlenen sütunlar */
    [data-getirstok-exp-col="id"],
    [data-getirstok-exp-col="storage"],
    [data-getirstok-exp-col="location"] {
      display: none !important;
    }

    /* Tablo */
    [data-getirstok-exp-table] .ant-table {
      background: transparent !important;
    }
    [data-getirstok-exp-table] .ant-table-container {
      border: 1px solid #eeebf6 !important;
      border-radius: 14px !important;
      overflow: hidden;
    }
    [data-getirstok-exp-table] .ant-table-thead > tr > th {
      padding: 10px 14px !important;
      background: #faf9fd !important;
      border-bottom: 1px solid #eeebf6 !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      color: #8a849d !important;
    }
    [data-getirstok-exp-table] .ant-table-thead > tr > th::before {
      display: none !important;
    }
    [data-getirstok-exp-table] .ant-table-tbody > tr.ant-table-row > td {
      padding: 10px 14px !important;
      vertical-align: middle !important;
      background: #ffffff !important;
      border-bottom: 1px solid #f4f2f9 !important;
      transition: background 0.15s ease;
    }
    [data-getirstok-exp-table] .ant-table-tbody > tr.ant-table-row:last-child > td {
      border-bottom: none !important;
    }
    [data-getirstok-exp-table] .ant-table-tbody > tr.ant-table-row:hover > td {
      background: #faf9fe !important;
    }
    [data-getirstok-exp-table] th[data-getirstok-exp-col="image"] {
      width: 72px !important;
    }
    [data-getirstok-exp-table] td[data-getirstok-exp-col="image"] .ant-image,
    [data-getirstok-exp-table] td[data-getirstok-exp-col="image"] .ant-image-img {
      width: 44px !important;
      height: 44px !important;
    }
    [data-getirstok-exp-table] td[data-getirstok-exp-col="image"] .ant-image-img {
      box-sizing: border-box;
      padding: 2px;
      object-fit: contain;
      background: #ffffff;
      border: 1px solid #efecf7;
      border-radius: 10px;
    }
    [data-getirstok-exp-table] td[data-getirstok-exp-col="image"] .ant-image-mask {
      border-radius: 10px;
    }
    [data-getirstok-exp-table] td[data-getirstok-exp-col="name"] .ant-tag {
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      background: transparent !important;
      white-space: normal !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      line-height: 1.35 !important;
      color: #1f1b2e !important;
    }
    [data-getirstok-exp-table] td[data-getirstok-exp-col="expiry"],
    [data-getirstok-exp-table] td[data-getirstok-exp-col="removal"] {
      font-size: 13px !important;
      font-variant-numeric: tabular-nums;
      color: #4b4560 !important;
    }
    [data-getirstok-exp-table] td[data-getirstok-exp-col="expiry"] .ant-space-item,
    [data-getirstok-exp-table] td[data-getirstok-exp-col="removal"] .ant-space-item {
      color: inherit !important;
    }
    [data-getirstok-exp-table] td[data-getirstok-exp-col] .ant-space {
      display: inline-flex !important;
    }
    [data-getirstok-exp-table] th[data-getirstok-exp-col="count"],
    [data-getirstok-exp-table] td[data-getirstok-exp-col="count"] {
      text-align: center !important;
    }
    [data-getirstok-exp-table] td[data-getirstok-exp-col="count"] {
      font-size: 16px !important;
      font-weight: 800 !important;
      color: #5d3ebc !important;
      font-variant-numeric: tabular-nums;
    }

    .getirstok-exp-chip {
      display: block;
      width: max-content;
      margin-top: 3px;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      line-height: 18px;
      white-space: nowrap;
      vertical-align: middle;
      background: #f3f2f7;
      color: #6b6580;
    }
    .getirstok-exp-chip[data-tone="red"] { background: #fee2e2; color: #b91c1c; }
    .getirstok-exp-chip[data-tone="amber"] { background: #fef3c7; color: #92400e; }
    .getirstok-exp-chip[data-tone="solid-red"] { background: #dc2626; color: #ffffff; }

    /* Satıştan kaldırma günü geldi / yaklaştı (genel satır stilinden daha özgül) */
    [data-getirstok-exp-table] .ant-table-tbody > tr.ant-table-row[data-getirstok-exp-status="due"] > td {
      background: #fef2f2 !important;
    }
    [data-getirstok-exp-table] .ant-table-tbody > tr.ant-table-row[data-getirstok-exp-status="due"] > td:first-child {
      box-shadow: inset 3px 0 0 #dc2626;
    }
    [data-getirstok-exp-table] .ant-table-tbody > tr.ant-table-row[data-getirstok-exp-status="soon"] > td {
      background: #fffbeb !important;
    }
    [data-getirstok-exp-table] .ant-table-tbody > tr.ant-table-row[data-getirstok-exp-status="soon"] > td:first-child {
      box-shadow: inset 3px 0 0 #f59e0b;
    }
    [data-getirstok-exp-table] .ant-table-tbody > tr.ant-table-row[data-getirstok-exp-status="due"]:hover > td {
      background: #fee2e2 !important;
    }
    [data-getirstok-exp-table] .ant-table-tbody > tr.ant-table-row[data-getirstok-exp-status="soon"]:hover > td {
      background: #fef3c7 !important;
    }
  `;
  document.head.appendChild(style);
}

function expiryChip(days) {
  if (days == null) return null;
  if (days < 0) return { text: `${-days} gün geçti`, tone: "red" };
  if (days === 0) return { text: "Bugün", tone: "red" };
  if (days === 1) return { text: "Yarın", tone: "amber" };
  return { text: `${days} gün`, tone: days <= EXPIRATION_SOON_DAYS ? "amber" : "gray" };
}

function removalChip(days) {
  if (days == null) return null;
  if (days < 0) return { text: `${-days} gün gecikti`, tone: "solid-red" };
  if (days === 0) return { text: "Bugün kaldır", tone: "solid-red" };
  if (days === 1) return { text: "Yarın", tone: "amber" };
  if (days <= EXPIRATION_SOON_DAYS) return { text: `${days} gün`, tone: "amber" };
  return null;
}

/** Hücrenin sonuna küçük etiket koyar; aynıysa dokunmaz */
function setExpirationChip(td, chip) {
  let el = td.querySelector(":scope > .getirstok-exp-chip");
  if (!chip) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("span");
    el.className = "getirstok-exp-chip";
    td.appendChild(el);
  }
  if (el.textContent !== chip.text) el.textContent = chip.text;
  setDataAttr(el, "data-tone", chip.tone);
}

function decorateExpirationTable(table) {
  const headerCells = Array.from(table.querySelectorAll(":scope > thead > tr > th"));
  const columns = headerCells.map(
    (th) => EXPIRATION_COLUMN_BY_HEADER[normalizeText(th.textContent).toLocaleLowerCase("tr-TR")] || null
  );
  if (!columns.includes("expiry") || !columns.includes("removal")) return false;

  headerCells.forEach((th, i) => setDataAttr(th, "data-getirstok-exp-col", columns[i]));
  // Ölçüm satırı da gizlenmeli; yoksa "table-layout: fixed" gizli sütunların genişliğini korur
  const measureCells = table.querySelectorAll(":scope > tbody > tr.ant-table-measure-row > *");
  measureCells.forEach((cell, i) => setDataAttr(cell, "data-getirstok-exp-col", columns[i] ?? null));

  for (const tr of table.querySelectorAll(":scope > tbody > tr.ant-table-row")) {
    const cells = Array.from(tr.children);
    let removalDays = null;
    cells.forEach((td, i) => {
      const col = columns[i] ?? null;
      setDataAttr(td, "data-getirstok-exp-col", col);
      if (col !== "expiry" && col !== "removal") return;
      const dateText = td.querySelector(".ant-space-item")?.textContent ?? td.textContent;
      const days = daysFromTodayTr(dateText);
      if (col === "expiry") setExpirationChip(td, expiryChip(days));
      else {
        removalDays = days;
        setExpirationChip(td, removalChip(days));
      }
    });
    const status =
      removalDays == null ? null : removalDays <= 0 ? "due" : removalDays <= EXPIRATION_SOON_DAYS ? "soon" : null;
    setDataAttr(tr, "data-getirstok-exp-status", status);
  }
  return true;
}

function decorateExpirationPage() {
  if (!EXPIRATION_PAGE_PATH_RE.test(window.location.pathname)) return;
  for (const table of document.querySelectorAll(".ant-table-wrapper table")) {
    if (!decorateExpirationTable(table)) continue;
    ensureExpirationStyleOnce();
    const wrapper = table.closest(".ant-table-wrapper");
    if (wrapper) setDataAttr(wrapper, "data-getirstok-exp-table", "1");
    const card = table.closest(".ant-card");
    if (card) setDataAttr(card, "data-getirstok-exp-card", "1");
  }
}

// -----------------------------
// Depo: Satıştan Kaldırma Listesi sayfasını sadeleştir
// Depo / Sebep / Alt Neden / Tedarikçiler filtreleri; Tedarikçiler, Birim, Sonuç Tipi ve seçim
// sütunları gizlenir. Hücrelere eleman eklenmez (React metni değiştirince silinirdi):
// kısa ad, durum etiketi, birim ve baş harfler data-* nitelikleriyle CSS'ten çizilir.
// -----------------------------

const REMOVAL_PAGE_PATH_RE = /\/stock\/remove-from-sales\/list\/?$/;
const REMOVAL_COLUMN_BY_HEADER = {
  "oluşturulma tarihi": "created",
  "ürün görseli": "image",
  ürün: "name",
  tedarikçiler: "supplier",
  sebep: "reason",
  "son kullanma tarihi": "expiry",
  "miktar:": "qty",
  miktar: "qty",
  birim: "unit",
  durum: "status",
  oluşturan: "creator",
  "sonuç tipi": "conclusion",
};
/** Bu sebepteki kayıtlar listede gösterilmez */
const REMOVAL_SKIPPED_REASON = "fırın ürünleri atık";
/** Sayfa açılınca: bugün dahil son 7 gün, sayfa başına 50 kayıt */
const REMOVAL_DEFAULT_DAYS = 7;
const REMOVAL_DEFAULT_PAGE_SIZE = "50";
/** Sayfaya her girişte varsayılanlar bir kez uygulanır; sayfadan çıkınca sıfırlanır */
let removalDefaultsStarted = false;
const REMOVAL_HIDDEN_FILTERS = [
  "warehouses-filter-item",
  "reason-filter-item",
  "subReason-filter-item",
  "suppliers-filter-item",
];

function removalStatusTone(text) {
  const t = text.toLocaleLowerCase("tr-TR");
  if (t.includes("tamam")) return "green";
  if (t.includes("iptal") || t.includes("redd") || t === "red") return "red";
  if (t.includes("bekl") || t.includes("onay") || t.includes("hazır")) return "amber";
  return "gray";
}

function removalReasonTone(text) {
  const t = text.toLocaleLowerCase("tr-TR");
  if (t.includes("son kullanma") || t.includes("skt") || t.includes("bozuk")) return "red";
  if (t.includes("hasar") || t.includes("kırık") || t.includes("ezik")) return "orange";
  if (t.includes("atık") || t.includes("imha")) return "amber";
  if (t.includes("iade") || t.includes("müşteri")) return "blue";
  return "gray";
}

/** "La Lorraine Taze Baget (110 g)" → { name: "Taze Baget", size: "110 g" } */
function splitRemovalProductName(full) {
  const clean = normalizeText(full).replace(BAKE_BRAND_PREFIX_RE, "");
  const m = clean.match(/^(.*\S)\s*\(([^()]+)\)\s*$/);
  return m ? { name: m[1], size: m[2] } : { name: clean, size: "" };
}

function personInitials(name) {
  return normalizeText(name)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR"))
    .join("");
}

function ensureRemovalStyleOnce() {
  if (document.getElementById("getirstok-rfs-style")) return;
  const style = document.createElement("style");
  style.id = "getirstok-rfs-style";
  style.textContent = `
    /* Kart */
    [data-getirstok-rfs-card] {
      border-radius: 18px !important;
      border: 1px solid #ebe7f5 !important;
      box-shadow: 0 1px 2px rgba(31, 27, 46, 0.04), 0 8px 24px -12px rgba(93, 62, 188, 0.18) !important;
      overflow: hidden;
    }
    [data-getirstok-rfs-card] > .ant-card-head {
      min-height: 0 !important;
      padding: 16px 22px 10px !important;
      border-bottom: none !important;
    }
    [data-getirstok-rfs-card] > .ant-card-head .ant-card-head-title {
      font-size: 18px !important;
      font-weight: 700 !important;
      letter-spacing: -0.01em;
      color: #1f1b2e !important;
    }
    [data-getirstok-rfs-card] > .ant-card-head .ant-card-extra .ant-btn {
      height: 34px !important;
      padding: 0 14px !important;
      border-radius: 10px !important;
      border-color: #e2dcf3 !important;
      color: #5d3ebc !important;
      font-weight: 600 !important;
    }
    [data-getirstok-rfs-card] > .ant-card-body {
      padding: 4px 22px 22px !important;
    }
    [data-getirstok-rfs-card] > .ant-card-body > .ant-space-vertical {
      display: flex !important;
      width: 100% !important;
      gap: 16px !important;
    }
    [data-getirstok-rfs-card] > .ant-card-body > .ant-space-vertical > .ant-space-item {
      width: 100% !important;
    }

    /* Filtreler */
    [data-getirstok-rfs-card] .ant-collapse {
      background: linear-gradient(180deg, #faf8ff 0%, #f6f3fd 100%) !important;
      border: 1px solid #ece7f8 !important;
      border-radius: 14px !important;
    }
    [data-getirstok-rfs-card] .ant-collapse > .ant-collapse-item {
      border-bottom: none !important;
    }
    [data-getirstok-rfs-card] .ant-collapse-header {
      padding: 10px 16px 0 !important;
    }
    [data-getirstok-rfs-card] .ant-collapse-header-text {
      font-size: 11px !important;
      font-weight: 700 !important;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #8a7fb0 !important;
    }
    [data-getirstok-rfs-card] .ant-collapse-expand-icon {
      display: none !important;
    }
    [data-getirstok-rfs-card] .ant-collapse-content {
      background: transparent !important;
      border-top: none !important;
    }
    [data-getirstok-rfs-card] .ant-collapse-content-box {
      padding: 10px 16px 14px !important;
    }
    [data-getirstok-rfs-card] .layout__filter-gap > :not(:last-child) {
      margin-bottom: 12px !important;
    }
    [data-getirstok-rfs-card] .layout__filter {
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)) !important;
      gap: 10px !important;
    }
    ${REMOVAL_HIDDEN_FILTERS.map(
      (label) => `[data-getirstok-rfs-card] .layout__filter > [aria-label="${label}"]`
    ).join(",\n    ")} {
      display: none !important;
    }
    [data-getirstok-rfs-card] .layout__filter > .ant-select,
    [data-getirstok-rfs-card] .layout__filter > .ant-picker {
      width: 100% !important;
      min-height: 38px;
    }
    [data-getirstok-rfs-card] .layout__filter .ant-select-selector,
    [data-getirstok-rfs-card] .layout__filter > .ant-picker {
      min-height: 38px !important;
      border-radius: 10px !important;
      border-color: #e4def4 !important;
      background: #ffffff !important;
      box-shadow: none !important;
    }
    [data-getirstok-rfs-card] .layout__filter .ant-select-selection-placeholder,
    [data-getirstok-rfs-card] .layout__filter .ant-picker-input > input::placeholder {
      color: #a59dbd !important;
    }
    [data-getirstok-rfs-card] .layout__filter .ant-select:hover .ant-select-selector,
    [data-getirstok-rfs-card] .layout__filter > .ant-picker:hover,
    [data-getirstok-rfs-card] .layout__filter .ant-select-focused .ant-select-selector,
    [data-getirstok-rfs-card] .layout__filter > .ant-picker-focused {
      border-color: #a78bfa !important;
    }
    [data-getirstok-rfs-card] .onboarding-apply-filter,
    [data-getirstok-rfs-card] .onboarding-clear-filter {
      height: 36px !important;
      padding: 0 18px !important;
      border-radius: 10px !important;
      font-weight: 600 !important;
    }
    [data-getirstok-rfs-card] .onboarding-apply-filter {
      background: #5d3ebc !important;
      border-color: #5d3ebc !important;
      box-shadow: 0 4px 12px -4px rgba(93, 62, 188, 0.55) !important;
    }
    [data-getirstok-rfs-card] .onboarding-clear-filter {
      border-color: #e4def4 !important;
      color: #5b5570 !important;
    }
    [data-getirstok-rfs-card] .onboarding-save-filter {
      border-radius: 10px !important;
      border-color: #e4def4 !important;
    }
    [data-getirstok-rfs-card] [aria-label="saved-queries-dropdown"] .ant-select-selector {
      border-radius: 10px !important;
      border-color: #e4def4 !important;
    }

    /* Fırın ürünleri atığı satırları listede görünmez */
    [data-getirstok-rfs-table] .ant-table-tbody > tr.ant-table-row[data-getirstok-rfs-skip] {
      display: none !important;
    }
    [data-getirstok-rfs-table][data-getirstok-rfs-skipped]::before {
      content: attr(data-getirstok-rfs-skipped) " fırın ürünü atığı bu sayfada gizlendi";
      display: inline-block;
      margin: 0 0 10px;
      padding: 3px 10px;
      border-radius: 999px;
      background: #f3f1f8;
      font-size: 11.5px;
      font-weight: 600;
      color: #7a7491;
    }

    /* Gizlenen sütunlar */
    [data-getirstok-rfs-col="select"],
    [data-getirstok-rfs-col="supplier"],
    [data-getirstok-rfs-col="unit"],
    [data-getirstok-rfs-col="conclusion"] {
      display: none !important;
    }

    /* Tablo */
    [data-getirstok-rfs-table] .ant-table {
      background: transparent !important;
    }
    [data-getirstok-rfs-table] .ant-table-container {
      border: 1px solid #eeebf6 !important;
      border-radius: 14px !important;
      overflow: hidden;
    }
    [data-getirstok-rfs-table] .ant-table-thead > tr > th {
      padding: 11px 14px !important;
      background: #faf9fd !important;
      border-bottom: 1px solid #eeebf6 !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      white-space: nowrap;
      color: #8a849d !important;
    }
    [data-getirstok-rfs-table] .ant-table-thead > tr > th::before {
      display: none !important;
    }
    /* Uzun başlıklar sütunu genişletmesin: kısa adla yeniden yazılır */
    [data-getirstok-rfs-table] .ant-table-thead > tr > th[data-getirstok-rfs-col="image"],
    [data-getirstok-rfs-table] .ant-table-thead > tr > th[data-getirstok-rfs-col="qty"],
    [data-getirstok-rfs-table] .ant-table-thead > tr > th[data-getirstok-rfs-col="created"],
    [data-getirstok-rfs-table] .ant-table-thead > tr > th[data-getirstok-rfs-col="expiry"] {
      font-size: 0 !important;
    }
    [data-getirstok-rfs-table] .ant-table-thead > tr > th[data-getirstok-rfs-col="qty"]::after { content: "Miktar"; font-size: 11px; }
    [data-getirstok-rfs-table] .ant-table-thead > tr > th[data-getirstok-rfs-col="created"]::after { content: "Tarih"; font-size: 11px; }
    [data-getirstok-rfs-table] .ant-table-thead > tr > th[data-getirstok-rfs-col="expiry"]::after { content: "SKT"; font-size: 11px; }
    [data-getirstok-rfs-table] .ant-table-thead > tr > th,
    [data-getirstok-rfs-table] .ant-table-tbody > tr.ant-table-row > td {
      padding-left: 10px !important;
      padding-right: 10px !important;
    }
    [data-getirstok-rfs-table] .ant-table-thead > tr > th[data-getirstok-rfs-col="created"],
    [data-getirstok-rfs-table] .ant-table-tbody > tr.ant-table-row > td[data-getirstok-rfs-col="created"] {
      padding-left: 18px !important;
    }
    /* Dar sütunlara sabit genişlik, kalan alan ürün adına. "table-layout: fixed" genişlik
       "auto" iken uygulanmadığı için tablo %100 yapılır. */
    [data-getirstok-rfs-table] table {
      width: 100% !important;
      min-width: 1080px !important;
    }
    /* Gizlenen seçim sütununun dar genişliği (colgroup) ilk görünen sütuna kaymasın */
    [data-getirstok-rfs-table] col.ant-table-selection-col {
      width: auto !important;
    }
    [data-getirstok-rfs-table] th[data-getirstok-rfs-col="created"] { width: 152px !important; }
    [data-getirstok-rfs-table] th[data-getirstok-rfs-col="image"] { width: 62px !important; }
    [data-getirstok-rfs-table] th[data-getirstok-rfs-col="reason"] { width: 200px !important; }
    [data-getirstok-rfs-table] th[data-getirstok-rfs-col="expiry"] { width: 90px !important; }
    [data-getirstok-rfs-table] th[data-getirstok-rfs-col="qty"] { width: 76px !important; }
    [data-getirstok-rfs-table] th[data-getirstok-rfs-col="status"] { width: 120px !important; }
    [data-getirstok-rfs-table] th[data-getirstok-rfs-col="creator"] { width: 140px !important; }
    [data-getirstok-rfs-table] th[data-getirstok-rfs-col="action"] { width: 56px !important; }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="name"],
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="reason"],
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="reason"] .ant-tag {
      white-space: normal !important;
      overflow-wrap: break-word;
      word-break: normal !important;
    }
    [data-getirstok-rfs-table] .ant-table-tbody > tr.ant-table-row > td {
      padding-top: 10px !important;
      padding-bottom: 10px !important;
      vertical-align: middle !important;
      background: #ffffff !important;
      border-bottom: 1px solid #f4f2f9 !important;
      transition: background 0.15s ease;
    }
    [data-getirstok-rfs-table] .ant-table-tbody > tr.ant-table-row:last-child > td {
      border-bottom: none !important;
    }
    [data-getirstok-rfs-table] .ant-table-tbody > tr.ant-table-row:hover > td {
      background: #faf8ff !important;
    }

    /* Duruma göre satır: soldan sağa açılan renk, solda şerit, üzerine gelince koyulaşır.
       Renk satıra verilir, hücreler saydam; sabit sağ sütun kaydırınca altı görünmesin diye dolu. */
    [data-getirstok-rfs-table] .ant-table-tbody > tr.ant-table-row[data-getirstok-rfs-row] > td {
      background: transparent !important;
    }
    [data-getirstok-rfs-table] .ant-table-tbody > tr.ant-table-row[data-getirstok-rfs-row] > td[data-getirstok-rfs-col="created"] {
      box-shadow: inset 4px 0 0 var(--getirstok-rfs-accent);
    }
    [data-getirstok-rfs-table] .ant-table-tbody > tr.ant-table-row[data-getirstok-rfs-row] > td.ant-table-cell-fix-right {
      background: var(--getirstok-rfs-end) !important;
    }
    [data-getirstok-rfs-table] .ant-table-tbody > tr.ant-table-row[data-getirstok-rfs-row] {
      background: linear-gradient(90deg, var(--getirstok-rfs-start) 0%, var(--getirstok-rfs-mid) 55%, var(--getirstok-rfs-end) 100%);
      transition: filter 0.15s ease;
    }
    [data-getirstok-rfs-table] .ant-table-tbody > tr.ant-table-row[data-getirstok-rfs-row]:hover {
      background: linear-gradient(90deg, var(--getirstok-rfs-hover-start) 0%, var(--getirstok-rfs-hover-end) 100%);
    }
    [data-getirstok-rfs-table] .ant-table-tbody > tr.ant-table-row[data-getirstok-rfs-row]:hover > td.ant-table-cell-fix-right {
      background: var(--getirstok-rfs-hover-end) !important;
    }
    [data-getirstok-rfs-table] tr[data-getirstok-rfs-row="amber"] {
      --getirstok-rfs-accent: #f59e0b;
      --getirstok-rfs-start: #fff1cc;
      --getirstok-rfs-mid: #fff8e6;
      --getirstok-rfs-end: #fffdf7;
      --getirstok-rfs-hover-start: #ffe3a1;
      --getirstok-rfs-hover-end: #fff4d6;
    }
    [data-getirstok-rfs-table] tr[data-getirstok-rfs-row="red"] {
      --getirstok-rfs-accent: #ef4444;
      --getirstok-rfs-start: #fde0e0;
      --getirstok-rfs-mid: #fef1f1;
      --getirstok-rfs-end: #fffbfb;
      --getirstok-rfs-hover-start: #fbc8c8;
      --getirstok-rfs-hover-end: #fde6e6;
    }
    /* Renkli satırların arası beyaz çizgiyle ayrılsın */
    [data-getirstok-rfs-table] .ant-table-tbody > tr.ant-table-row[data-getirstok-rfs-row] > td {
      border-bottom: 2px solid #ffffff !important;
    }

    /* Tarih */
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="created"] {
      white-space: nowrap;
      font-size: 12.5px !important;
      font-variant-numeric: tabular-nums;
      color: #6b6580 !important;
    }

    /* Görsel + ad: tek blok gibi dursun */
    [data-getirstok-rfs-table] th[data-getirstok-rfs-col="image"],
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="image"] {
      padding-right: 0 !important;
    }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="image"] .ant-image,
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="image"] .ant-image-img {
      width: 46px !important;
      height: 46px !important;
    }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="image"] .ant-image {
      border-radius: 12px;
      background: linear-gradient(135deg, #f3effc, #ebe5fa);
      overflow: hidden;
    }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="image"] .ant-image-img {
      box-sizing: border-box;
      padding: 4px;
      object-fit: contain;
      mix-blend-mode: multiply;
      background: transparent !important;
    }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="image"] .ant-image-mask {
      border-radius: 12px;
    }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="name"][data-getirstok-rfs-name] > .ant-tag {
      display: none !important;
    }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="name"][data-getirstok-rfs-name]::before {
      content: attr(data-getirstok-rfs-name);
      display: block;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.3;
      color: #1f1b2e;
    }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="name"][data-getirstok-rfs-size]::after {
      content: attr(data-getirstok-rfs-size);
      display: inline-block;
      margin-top: 4px;
      padding: 0 7px;
      border-radius: 6px;
      background: #f3f1f8;
      font-size: 11px;
      font-weight: 600;
      line-height: 18px;
      color: #7a7491;
    }

    /* Sebep */
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="reason"] .ant-tag {
      margin: 0 !important;
      padding: 2px 10px !important;
      border: none !important;
      border-radius: 999px !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      line-height: 18px !important;
      background: #f3f2f7 !important;
      color: #5b5570 !important;
    }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-reason="amber"] .ant-tag { background: #fef3c7 !important; color: #92400e !important; }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-reason="red"] .ant-tag { background: #fee2e2 !important; color: #b91c1c !important; }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-reason="orange"] .ant-tag { background: #ffedd5 !important; color: #c2410c !important; }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-reason="blue"] .ant-tag { background: #dbeafe !important; color: #1d4ed8 !important; }

    /* SKT */
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="expiry"] {
      white-space: nowrap;
      font-size: 13px !important;
      font-variant-numeric: tabular-nums;
      color: #4b4560 !important;
    }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="expiry"] .ant-space-item {
      color: inherit !important;
    }

    /* Miktar (+ birim) */
    [data-getirstok-rfs-table] th[data-getirstok-rfs-col="qty"],
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="qty"] {
      text-align: center !important;
    }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="qty"] {
      white-space: nowrap;
      font-size: 17px !important;
      font-weight: 800 !important;
      font-variant-numeric: tabular-nums;
      color: #5d3ebc !important;
    }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="qty"][data-getirstok-rfs-unit]::after {
      content: attr(data-getirstok-rfs-unit);
      margin-left: 4px;
      font-size: 11px;
      font-weight: 600;
      color: #a59dbd;
    }

    /* Durum: metin gizlenir, aynı metin etiket olarak çizilir */
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="status"][data-getirstok-rfs-status] {
      font-size: 0 !important;
      white-space: nowrap;
    }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="status"][data-getirstok-rfs-status]::before {
      content: attr(data-getirstok-rfs-status);
      display: inline-flex;
      align-items: center;
      padding: 3px 10px 3px 22px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      line-height: 16px;
      background: #f3f2f7 radial-gradient(circle at 11px 50%, #9ca3af 3.5px, transparent 4px);
      color: #5b5570;
    }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-tone="green"]::before {
      background: #dcfce7 radial-gradient(circle at 11px 50%, #16a34a 3.5px, transparent 4px) !important;
      color: #166534 !important;
    }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-tone="amber"]::before {
      background: #fef3c7 radial-gradient(circle at 11px 50%, #d97706 3.5px, transparent 4px) !important;
      color: #92400e !important;
    }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-tone="red"]::before {
      background: #fee2e2 radial-gradient(circle at 11px 50%, #dc2626 3.5px, transparent 4px) !important;
      color: #991b1b !important;
    }

    /* Oluşturan: baş harf rozeti */
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="creator"] {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 12.5px !important;
      font-weight: 600 !important;
      color: #3f3a52 !important;
    }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="creator"][data-getirstok-rfs-initials]::before {
      content: attr(data-getirstok-rfs-initials);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      margin-right: 8px;
      border-radius: 50%;
      background: linear-gradient(135deg, #7c5cdb, #5d3ebc);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: #ffffff;
      vertical-align: middle;
    }

    /* Satır sonu butonu */
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="action"] .ant-btn {
      width: 32px !important;
      height: 32px !important;
      border-radius: 10px !important;
      border-color: #e4def4 !important;
      color: #5d3ebc !important;
      background: #ffffff !important;
    }
    [data-getirstok-rfs-table] td[data-getirstok-rfs-col="action"] .ant-btn:hover {
      background: #f3effc !important;
      border-color: #c4b5fd !important;
    }

    /* Sayfalama */
    [data-getirstok-rfs-table] .ant-pagination {
      margin: 14px 0 0 !important;
    }
    [data-getirstok-rfs-table] .ant-pagination-item {
      border-radius: 8px !important;
    }
    [data-getirstok-rfs-table] .ant-pagination-item-active {
      border-color: #5d3ebc !important;
      background: #5d3ebc !important;
    }
    [data-getirstok-rfs-table] .ant-pagination-item-active a {
      color: #ffffff !important;
    }
  `;
  document.head.appendChild(style);
}

function decorateRemovalTable(table) {
  const headerCells = Array.from(table.querySelectorAll(":scope > thead > tr > th"));
  const columns = headerCells.map((th) => {
    if (th.classList.contains("ant-table-selection-column")) return "select";
    const key = normalizeText(th.textContent).toLocaleLowerCase("tr-TR");
    if (!key && th.classList.contains("ant-table-cell-fix-right")) return "action";
    return REMOVAL_COLUMN_BY_HEADER[key] || null;
  });
  if (!columns.includes("name") || !columns.includes("reason")) return null;

  headerCells.forEach((th, i) => setDataAttr(th, "data-getirstok-rfs-col", columns[i]));
  let skipped = 0;
  // Ölçüm satırı da gizlenmeli; yoksa gizli sütunların genişliği korunur
  table
    .querySelectorAll(":scope > tbody > tr.ant-table-measure-row > *")
    .forEach((cell, i) => setDataAttr(cell, "data-getirstok-rfs-col", columns[i] ?? null));

  for (const tr of table.querySelectorAll(":scope > tbody > tr.ant-table-row")) {
    const cells = Array.from(tr.children);
    const cellOf = (col) => {
      const i = columns.indexOf(col);
      return i >= 0 ? cells[i] ?? null : null;
    };
    cells.forEach((td, i) => setDataAttr(td, "data-getirstok-rfs-col", columns[i] ?? null));

    const nameCell = cellOf("name");
    if (nameCell) {
      const full = normalizeText(nameCell.querySelector(".ant-tag")?.textContent ?? nameCell.textContent);
      const { name, size } = splitRemovalProductName(full);
      setDataAttr(nameCell, "data-getirstok-rfs-name", name || null);
      setDataAttr(nameCell, "data-getirstok-rfs-size", size || null);
      if (nameCell.title !== full) nameCell.title = full;
    }

    const reasonCell = cellOf("reason");
    const reason = normalizeText(reasonCell?.textContent);
    if (reasonCell) setDataAttr(reasonCell, "data-getirstok-rfs-reason", removalReasonTone(reason));
    const skip = reason.toLocaleLowerCase("tr-TR") === REMOVAL_SKIPPED_REASON;
    setDataAttr(tr, "data-getirstok-rfs-skip", skip ? "1" : null);
    if (skip) skipped++;

    const qtyCell = cellOf("qty");
    if (qtyCell) {
      const unit = normalizeText(cellOf("unit")?.textContent).toLocaleLowerCase("tr-TR");
      setDataAttr(qtyCell, "data-getirstok-rfs-unit", unit || null);
    }

    const statusCell = cellOf("status");
    const status = normalizeText(statusCell?.textContent);
    const statusTone = status ? removalStatusTone(status) : null;
    if (statusCell) {
      setDataAttr(statusCell, "data-getirstok-rfs-status", status || null);
      setDataAttr(statusCell, "data-getirstok-rfs-tone", statusTone);
    }
    setDataAttr(tr, "data-getirstok-rfs-row", statusTone === "amber" || statusTone === "red" ? statusTone : null);

    const creatorCell = cellOf("creator");
    if (creatorCell) {
      const creator = normalizeText(creatorCell.textContent);
      setDataAttr(creatorCell, "data-getirstok-rfs-initials", personInitials(creator) || null);
      if (creatorCell.title !== creator) creatorCell.title = creator;
    }
  }
  return skipped;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForElement(find, timeoutMs = 4000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const el = find();
    if (el) return el;
    await sleep(80);
  }
  return null;
}

/** Ant Design bileşenleri mousedown/click'e göre açılıp seçtiği için tam tıklama dizisi */
function simulateClick(el) {
  const opts = { bubbles: true, cancelable: true, view: window };
  el.dispatchEvent(new PointerEvent("pointerdown", opts));
  el.dispatchEvent(new MouseEvent("mousedown", opts));
  el.dispatchEvent(new PointerEvent("pointerup", opts));
  el.dispatchEvent(new MouseEvent("mouseup", opts));
  el.dispatchEvent(new MouseEvent("click", opts));
}

function localYmd(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function ymdToTr(ymd) {
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}

/** Açık tarih seçicide günün hücresi (antd hücre başlığı "YYYY-MM-DD") */
function findPickerCell(ymd) {
  return document.querySelector(
    `.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) td.ant-picker-cell[title="${ymd}"]`
  );
}

/** Tarih aralığını bugün dahil son 7 güne çeker. @returns değişti mi */
async function applyRemovalDefaultRange(card) {
  const startInput = card.querySelector('.layout__filter .ant-picker-range input[date-range="start"]');
  const endInput = card.querySelector('.layout__filter .ant-picker-range input[date-range="end"]');
  if (!startInput || !endInput) return false;

  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (REMOVAL_DEFAULT_DAYS - 1));
  const fromYmd = localYmd(from);
  const toYmd = localYmd(today);
  if (startInput.value === ymdToTr(fromYmd) && endInput.value === ymdToTr(toYmd)) return false;

  startInput.focus();
  simulateClick(startInput);
  const fromCell = await waitForElement(() => findPickerCell(fromYmd), 2500);
  if (fromCell) {
    simulateClick(fromCell.querySelector(".ant-picker-cell-inner") || fromCell);
    const toCell = await waitForElement(() => findPickerCell(toYmd), 1500);
    if (!toCell) return false;
    simulateClick(toCell.querySelector(".ant-picker-cell-inner") || toCell);
  } else {
    // Hücre bulunamazsa (ör. başlangıç önceki ayda) Getir'in hazır seçeneği: bugünü içermez
    const preset = Array.from(
      document.querySelectorAll(".ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-presets li")
    ).find((li) => normalizeText(li.textContent).toLocaleLowerCase("tr-TR") === "son 7 gün");
    if (!preset) return false;
    simulateClick(preset);
  }
  await sleep(250);
  return true;
}

/** Sayfa başına kayıt sayısını 50 yapar. @returns değişti mi */
async function applyRemovalDefaultPageSize(card) {
  const changer = await waitForElement(() => card.querySelector(".ant-pagination-options-size-changer"), 6000);
  if (!changer) return false;
  const current = normalizeText(changer.querySelector(".ant-select-selection-item")?.textContent);
  if (current.startsWith(REMOVAL_DEFAULT_PAGE_SIZE)) return false;

  simulateClick(changer.querySelector(".ant-select-selector") || changer);
  const option = await waitForElement(
    () =>
      Array.from(
        document.querySelectorAll(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option")
      ).find((o) => normalizeText(o.textContent).startsWith(`${REMOVAL_DEFAULT_PAGE_SIZE} `)),
    2000
  );
  if (!option) return false;
  simulateClick(option);
  return true;
}

/** Sadece listeleme ayarı (veri değişmez): tarih → Uygula → sayfa boyutu */
async function applyRemovalDefaults(card) {
  try {
    if (await applyRemovalDefaultRange(card)) {
      const apply = card.querySelector(".onboarding-apply-filter");
      if (apply) simulateClick(apply);
      await sleep(900);
    }
    await applyRemovalDefaultPageSize(card);
  } catch (error) {
    console.warn("[GetirStok] Satıştan kaldırma varsayılanları uygulanamadı:", error);
  }
}

function decorateRemovalPage() {
  if (!REMOVAL_PAGE_PATH_RE.test(window.location.pathname)) {
    removalDefaultsStarted = false;
    return;
  }
  for (const table of document.querySelectorAll(".ant-table-wrapper table")) {
    const skipped = decorateRemovalTable(table);
    if (skipped == null) continue;
    ensureRemovalStyleOnce();
    const wrapper = table.closest(".ant-table-wrapper");
    if (wrapper) {
      setDataAttr(wrapper, "data-getirstok-rfs-table", "1");
      setDataAttr(wrapper, "data-getirstok-rfs-skipped", skipped > 0 ? String(skipped) : null);
    }
    const card = table.closest(".ant-card");
    if (card) {
      setDataAttr(card, "data-getirstok-rfs-card", "1");
      if (!removalDefaultsStarted) {
        removalDefaultsStarted = true;
        void applyRemovalDefaults(card);
      }
    }
  }
}

// -----------------------------
// Depo: Sayım Listesi sayfası — sade tablo + az filtre
// Sayfa adresi yerine tablo başlıklarından tanınır. Kart/filtre görünümü Satıştan Kaldırma
// sayfasıyla aynı (Getir'in ortak liste bileşeni); hücre metni yerine data-* ile CSS'ten çizilir.
// -----------------------------

const INVENTORY_LIST_COLUMN_BY_HEADER = {
  // tr-TR küçük harfte "ID" → "ıd" olur
  ıd: "id",
  id: "id",
  depo: "warehouse",
  durum: "status",
  "tamamlanma yüzdesi": "progress",
  iş: "job",
  "otomatik sayım": "auto",
  "dış kaynak sayımı (3pl)": "thirdParty",
  "oluşturulma tarihi": "created",
  oluşturan: "creator",
};
/** Boşken görünen yazıya göre gizlenen filtreler (seçim yapılınca yazı kaybolur; ad yedek) */
const INVENTORY_LIST_HIDDEN_FILTER_TEXTS = new Set(["kapsam", "durum", "depo", "iş", "sebep"]);
const INVENTORY_LIST_HIDDEN_FILTER_ARIA_RE = /warehouse|scope|status|reason|job/i;

function inventoryListStatusTone(text) {
  const t = text.toLocaleLowerCase("tr-TR");
  if (t.includes("tamam")) return "green";
  if (t.includes("iptal") || t.includes("red")) return "red";
  if (t.includes("devam") || t.includes("sayılıyor") || t.includes("başla")) return "amber";
  if (t.includes("hazır")) return "purple";
  return "gray";
}

function ensureInventoryListStyleOnce() {
  if (document.getElementById("getirstok-icl-style")) return;
  const style = document.createElement("style");
  style.id = "getirstok-icl-style";
  style.textContent = `
    [data-getirstok-icl-hidden],
    [data-getirstok-icl-card] [aria-label="saved-queries-dropdown"],
    [data-getirstok-icl-card] .onboarding-save-filter,
    [data-getirstok-icl-col="id"],
    [data-getirstok-icl-col="warehouse"],
    [data-getirstok-icl-col="job"],
    [data-getirstok-icl-col="thirdParty"],
    [data-getirstok-icl-col="creator"] {
      display: none !important;
    }
    [data-getirstok-icl-table] table {
      table-layout: auto !important;
      width: 100% !important;
      min-width: 0 !important;
    }
    [data-getirstok-icl-table] col {
      width: auto !important;
      min-width: 0 !important;
    }
    [data-getirstok-icl-table] .ant-table {
      background: transparent !important;
    }
    [data-getirstok-icl-table] .ant-table-container {
      border: 1px solid #eeebf6 !important;
      border-radius: 14px !important;
      overflow: hidden;
    }
    [data-getirstok-icl-table] .ant-table-thead > tr > th {
      padding: 11px 16px !important;
      background: #faf9fd !important;
      border-bottom: 1px solid #eeebf6 !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      white-space: nowrap;
      color: #8a849d !important;
    }
    [data-getirstok-icl-table] .ant-table-thead > tr > th::before {
      display: none !important;
    }
    [data-getirstok-icl-table] .ant-table-tbody > tr.ant-table-row {
      cursor: pointer;
    }
    [data-getirstok-icl-table] .ant-table-tbody > tr.ant-table-row > td {
      padding: 14px 16px !important;
      vertical-align: middle !important;
      background: #ffffff !important;
      border-bottom: 1px solid #f4f2f9 !important;
      transition: background 0.15s ease;
    }
    [data-getirstok-icl-table] .ant-table-tbody > tr.ant-table-row:last-child > td {
      border-bottom: none !important;
    }
    [data-getirstok-icl-table] .ant-table-tbody > tr.ant-table-row:hover > td {
      background: #faf8ff !important;
    }
    /* Duruma göre solda renkli şerit (ilk sütun: onay kutusu) */
    [data-getirstok-icl-table] tr[data-getirstok-icl-tone] > td:first-child {
      box-shadow: inset 4px 0 0 var(--getirstok-icl-accent, #d4d0e0);
    }
    [data-getirstok-icl-table] th[data-getirstok-icl-col="select"],
    [data-getirstok-icl-table] td[data-getirstok-icl-col="select"] {
      width: 52px !important;
      padding-left: 20px !important;
      padding-right: 4px !important;
      cursor: default;
    }
    [data-getirstok-icl-table] .ant-checkbox-checked .ant-checkbox-inner {
      background: #5d3ebc !important;
      border-color: #5d3ebc !important;
    }
    [data-getirstok-icl-table] .ant-table-tbody > tr.ant-table-row.ant-table-row-selected > td {
      background: #f3effc !important;
    }
    [data-getirstok-icl-table] tr[data-getirstok-icl-tone="green"] { --getirstok-icl-accent: #22c55e; }
    [data-getirstok-icl-table] tr[data-getirstok-icl-tone="amber"] { --getirstok-icl-accent: #f59e0b; }
    [data-getirstok-icl-table] tr[data-getirstok-icl-tone="purple"] { --getirstok-icl-accent: #7c5cdb; }
    [data-getirstok-icl-table] tr[data-getirstok-icl-tone="red"] { --getirstok-icl-accent: #ef4444; }

    /* Durum etiketi */
    [data-getirstok-icl-table] td[data-getirstok-icl-col="status"][data-getirstok-icl-status] {
      font-size: 0 !important;
      white-space: nowrap;
    }
    [data-getirstok-icl-table] td[data-getirstok-icl-col="status"][data-getirstok-icl-status]::before {
      content: attr(data-getirstok-icl-status);
      display: inline-flex;
      align-items: center;
      padding: 4px 12px 4px 24px;
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 700;
      line-height: 16px;
      background: #f3f2f7 radial-gradient(circle at 12px 50%, #9ca3af 3.5px, transparent 4px);
      color: #5b5570;
    }
    [data-getirstok-icl-table] tr[data-getirstok-icl-tone="green"] td[data-getirstok-icl-col="status"]::before {
      background: #dcfce7 radial-gradient(circle at 12px 50%, #16a34a 3.5px, transparent 4px) !important;
      color: #166534 !important;
    }
    [data-getirstok-icl-table] tr[data-getirstok-icl-tone="amber"] td[data-getirstok-icl-col="status"]::before {
      background: #fef3c7 radial-gradient(circle at 12px 50%, #d97706 3.5px, transparent 4px) !important;
      color: #92400e !important;
    }
    [data-getirstok-icl-table] tr[data-getirstok-icl-tone="purple"] td[data-getirstok-icl-col="status"]::before {
      background: #ede7fc radial-gradient(circle at 12px 50%, #7c5cdb 3.5px, transparent 4px) !important;
      color: #5d3ebc !important;
    }
    [data-getirstok-icl-table] tr[data-getirstok-icl-tone="red"] td[data-getirstok-icl-col="status"]::before {
      background: #fee2e2 radial-gradient(circle at 12px 50%, #dc2626 3.5px, transparent 4px) !important;
      color: #991b1b !important;
    }

    /* İlerleme: "25 / 25 ürün" + çubuk */
    [data-getirstok-icl-table] td[data-getirstok-icl-col="progress"][data-getirstok-icl-progress] {
      font-size: 0 !important;
      min-width: 180px;
    }
    [data-getirstok-icl-table] td[data-getirstok-icl-col="progress"][data-getirstok-icl-progress]::before {
      content: attr(data-getirstok-icl-progress);
      display: block;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #1f1b2e;
    }
    [data-getirstok-icl-table] td[data-getirstok-icl-col="progress"][data-getirstok-icl-progress]::after {
      content: "";
      display: block;
      height: 8px;
      border-radius: 999px;
      background: linear-gradient(
        90deg,
        var(--getirstok-icl-bar, #7c5cdb) 0 var(--getirstok-icl-p, 0%),
        #efecf7 var(--getirstok-icl-p, 0%) 100%
      );
    }
    [data-getirstok-icl-table] td[data-getirstok-icl-complete] {
      --getirstok-icl-bar: #22c55e;
    }

    /* Tür */
    [data-getirstok-icl-table] td[data-getirstok-icl-col="auto"][data-getirstok-icl-auto] {
      font-size: 0 !important;
      white-space: nowrap;
    }
    [data-getirstok-icl-table] td[data-getirstok-icl-col="auto"][data-getirstok-icl-auto]::before {
      content: attr(data-getirstok-icl-auto);
      display: inline-flex;
      padding: 3px 10px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      background: #f3f2f7;
      color: #6b6580;
    }
    [data-getirstok-icl-table] td[data-getirstok-icl-auto="Otomatik"]::before {
      background: #e0f2fe !important;
      color: #0369a1 !important;
    }

    /* Tarih */
    [data-getirstok-icl-table] td[data-getirstok-icl-col="created"] {
      white-space: nowrap;
      font-size: 13px !important;
      font-variant-numeric: tabular-nums;
      color: #6b6580 !important;
    }

    /* Satır sonu: sayımı aç */
    [data-getirstok-icl-table] td[data-getirstok-icl-col="action"] .ant-btn {
      width: 34px !important;
      height: 34px !important;
      border-radius: 10px !important;
      border-color: #e4def4 !important;
      color: #5d3ebc !important;
      background: #ffffff !important;
      transition: transform 0.15s ease, background 0.15s ease;
    }
    [data-getirstok-icl-table] tr.ant-table-row:hover td[data-getirstok-icl-col="action"] .ant-btn {
      background: #5d3ebc !important;
      border-color: #5d3ebc !important;
      color: #ffffff !important;
      transform: scale(1.06);
    }

    /* Sayfalama */
    [data-getirstok-icl-table] .ant-pagination {
      margin: 14px 0 0 !important;
    }
    [data-getirstok-icl-table] .ant-pagination-item {
      border-radius: 8px !important;
    }
    [data-getirstok-icl-table] .ant-pagination-item-active {
      border-color: #5d3ebc !important;
      background: #5d3ebc !important;
    }
    [data-getirstok-icl-table] .ant-pagination-item-active a {
      color: #ffffff !important;
    }
  `;
  document.head.appendChild(style);
}

function decorateInventoryListTable(table) {
  const headerCells = Array.from(table.querySelectorAll(":scope > thead > tr > th"));
  const columns = headerCells.map((th) => {
    if (th.classList.contains("ant-table-selection-column")) return "select";
    const key = normalizeText(th.textContent).toLocaleLowerCase("tr-TR");
    if (!key && th.classList.contains("ant-table-cell-fix-right")) return "action";
    return INVENTORY_LIST_COLUMN_BY_HEADER[key] || null;
  });
  if (!columns.includes("progress") || !columns.includes("auto")) return false;
  // Son sütun (satırı açan buton) başlıksız; sabit sağ sütun değilse de sondaki boş başlık
  const last = columns.length - 1;
  if (columns[last] == null && !normalizeText(headerCells[last]?.textContent)) columns[last] = "action";

  headerCells.forEach((th, i) => setDataAttr(th, "data-getirstok-icl-col", columns[i]));
  table
    .querySelectorAll(":scope > tbody > tr.ant-table-measure-row > *")
    .forEach((cell, i) => setDataAttr(cell, "data-getirstok-icl-col", columns[i] ?? null));

  for (const tr of table.querySelectorAll(":scope > tbody > tr.ant-table-row")) {
    const cells = Array.from(tr.children);
    cells.forEach((td, i) => setDataAttr(td, "data-getirstok-icl-col", columns[i] ?? null));
    const cellOf = (col) => {
      const i = columns.indexOf(col);
      return i >= 0 ? cells[i] ?? null : null;
    };

    const statusCell = cellOf("status");
    const status = normalizeText(statusCell?.textContent);
    if (statusCell) setDataAttr(statusCell, "data-getirstok-icl-status", status || null);
    setDataAttr(tr, "data-getirstok-icl-tone", status ? inventoryListStatusTone(status) : null);

    // "(25/25) - %100"
    const progressCell = cellOf("progress");
    if (progressCell) {
      const m = normalizeText(progressCell.textContent).match(/\((\d+)\s*\/\s*(\d+)\)\s*-?\s*%\s*(\d+)/);
      if (m) {
        const done = Number(m[1]);
        const total = Number(m[2]);
        const pct = Math.max(0, Math.min(100, Number(m[3])));
        setDataAttr(progressCell, "data-getirstok-icl-progress", `${done} / ${total} ürün · %${pct}`);
        setDataAttr(progressCell, "data-getirstok-icl-complete", total > 0 && done >= total ? "1" : null);
        if (progressCell.style.getPropertyValue("--getirstok-icl-p") !== `${pct}%`) {
          progressCell.style.setProperty("--getirstok-icl-p", `${pct}%`);
        }
      } else {
        setDataAttr(progressCell, "data-getirstok-icl-progress", null);
      }
    }

    const autoCell = cellOf("auto");
    if (autoCell) {
      const v = normalizeText(autoCell.textContent).toLocaleLowerCase("tr-TR");
      setDataAttr(autoCell, "data-getirstok-icl-auto", v === "evet" ? "Otomatik" : v === "hayır" ? "Manuel" : null);
    }
  }
  return true;
}

function inventoryListFilterText(item) {
  const placeholder =
    item.querySelector(".ant-select-selection-placeholder")?.textContent ||
    (item.matches("input[placeholder]") ? item.getAttribute("placeholder") : "") ||
    item.querySelector("input[placeholder]")?.getAttribute("placeholder") ||
    "";
  return normalizeText(placeholder).toLocaleLowerCase("tr-TR");
}

function hideInventoryListFilters(card) {
  for (const item of card.querySelectorAll(".layout__filter > *")) {
    if (item.closest(".ant-drawer")) continue;
    if (item.hasAttribute("data-getirstok-icl-hidden")) continue;
    const aria = item.getAttribute("aria-label") || "";
    const hide =
      INVENTORY_LIST_HIDDEN_FILTER_ARIA_RE.test(aria) ||
      INVENTORY_LIST_HIDDEN_FILTER_TEXTS.has(inventoryListFilterText(item)) ||
      // Depo filtresi seçili ve kilitli geliyor
      (item.matches(".ant-select-disabled") && !item.querySelector(".ant-select-selection-placeholder"));
    if (hide) item.setAttribute("data-getirstok-icl-hidden", "1");
  }
}

function decorateInventoryListPage() {
  for (const table of document.querySelectorAll(".ant-table-wrapper table")) {
    if (table.closest(".ant-drawer")) continue;
    if (!decorateInventoryListTable(table)) continue;
    ensureInventoryListStyleOnce();
    ensureRemovalStyleOnce();
    const wrapper = table.closest(".ant-table-wrapper");
    if (wrapper) setDataAttr(wrapper, "data-getirstok-icl-table", "1");
    const card = table.closest(".ant-card");
    if (card) {
      setDataAttr(card, "data-getirstok-rfs-card", "1");
      setDataAttr(card, "data-getirstok-icl-card", "1");
      hideInventoryListFilters(card);
    }
  }
}

/** Satırın boş bir yerine tıklamak sayımı açar (sondaki butona tıklanmış gibi) */
function onInventoryListRowClick(e) {
  const row = e.target.closest?.("[data-getirstok-icl-table] tr.ant-table-row");
  if (!row) return;
  if (
    e.target.closest(
      "button, a, input, label, .ant-checkbox-wrapper, .ant-table-selection-column, .ant-tag, .ant-typography-copy, [role='button']"
    )
  ) {
    return;
  }
  row.querySelector('td[data-getirstok-icl-col="action"] .ant-btn')?.click();
}

// -----------------------------
// Depo: Sayım detayı penceresi (Görevler tablosu) — sade görünüm + SKT kaydından stok
// Getir sayımdaki ürünün stoğunu her yerde gizliyor; SKT kaydı ("Ürün Son Kullanma
// Tarihleri") gizlenmiyor. Stok sunucumuzdan (barkod → ürün → SKT) toplu istenir.
// -----------------------------

const INVENTORY_TASK_COLUMN_BY_HEADER = {
  // tr-TR küçük harfte "ID" → "ıd" olur
  ıd: "taskId",
  id: "taskId",
  "ürün görseli": "image",
  "ürün ıd": "productId",
  "ürün id": "productId",
  "ürün adı": "name",
  "ürün barkodları": "barcodes",
  durum: "status",
  "oluşturulma tarihi": "created",
};
const INVENTORY_TASK_PAGE_SIZE = "100";
/** Aynı ürünün stoğu bu süre içinde tekrar istenmez */
const EXPIRY_STOCK_TTL_MS = 5 * 60 * 1000;
const EXPIRY_STOCK_ERROR_RETRY_MS = 30 * 1000;
/** Stok cevabı geldikçe artar; satır bu sürümle işlendiyse tekrar işlenmez */
let expiryStockVersion = 0;

/** barkod → { state: "loading" | "done" | "none" | "error", total?, lots?, at } */
const expiryStockByBarcode = new Map();
const expiryStockQueue = new Set();
let expiryStockTimer = null;
/**
 * Sayfa boyutu pencere başına bir kez ayarlanır (kullanıcı sonra değiştirirse karışılmaz).
 * "running" sürerken tekrar denenmez; sayfalama henüz çizilmediyse kayıt silinip sonra denenir.
 */
const inventoryPageSizeState = new WeakMap();
const inventoryPageSizeTries = new WeakMap();

function formatTrDate(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

function expiryStockNeedsFetch(barcode) {
  const entry = expiryStockByBarcode.get(barcode);
  if (!entry) return true;
  if (entry.state === "loading") return false;
  const age = Date.now() - entry.at;
  return entry.state === "error" ? age > EXPIRY_STOCK_ERROR_RETRY_MS : age > EXPIRY_STOCK_TTL_MS;
}

function flushExpiryStockQueue() {
  expiryStockTimer = null;
  const barcodes = [...expiryStockQueue];
  expiryStockQueue.clear();
  if (barcodes.length === 0) return;
  const at = Date.now();
  for (const b of barcodes) expiryStockByBarcode.set(b, { state: "loading", at });
  try {
    chrome.runtime.sendMessage({ type: "GETIRSTOK_EXPIRY_STOCK", barcodes }, (res) => {
      const done = Date.now();
      const failed = chrome.runtime.lastError || !res?.ok;
      for (const b of barcodes) {
        if (failed) {
          expiryStockByBarcode.set(b, { state: "error", at: done, error: res?.error });
          continue;
        }
        const pid = res.barcodeToProductId?.[b];
        const stock = pid ? res.stocks?.[pid] : null;
        expiryStockByBarcode.set(
          b,
          stock ? { state: "done", total: stock.total, lots: stock.lots || [], at: done } : { state: "none", at: done }
        );
      }
      if (failed) scheduleExpiryStockRetry();
      expiryStockVersion++;
      decorateInventoryTaskTables();
    });
  } catch {
    for (const b of barcodes) expiryStockByBarcode.set(b, { state: "error", at: Date.now() });
    scheduleExpiryStockRetry();
  }
}

/** Satırlar sürüm değişmeden işlenmediği için hatalı stoklar süre dolunca elle yeniden denenir */
function scheduleExpiryStockRetry() {
  setTimeout(() => {
    expiryStockVersion++;
    decorateInventoryTaskTables();
  }, EXPIRY_STOCK_ERROR_RETRY_MS + 200);
}

function requestExpiryStock(barcodes) {
  let added = false;
  for (const b of barcodes) {
    if (!expiryStockNeedsFetch(b) || expiryStockQueue.has(b)) continue;
    expiryStockQueue.add(b);
    added = true;
  }
  if (added && !expiryStockTimer) expiryStockTimer = setTimeout(flushExpiryStockQueue, 150);
}

/** Satırın barkodlarından SKT kaydı olanı seçer */
function expiryStockForBarcodes(barcodes) {
  const entries = barcodes.map((b) => expiryStockByBarcode.get(b)).filter(Boolean);
  const found = entries.find((e) => e.state === "done");
  if (found) return found;
  if (entries.some((e) => e.state === "loading") || entries.length < barcodes.length) return { state: "loading" };
  if (entries.some((e) => e.state === "error")) return { state: "error" };
  return { state: "none" };
}

function openSelectOptions(changer, timeoutMs) {
  return waitForElement(() => {
    const list = Array.from(
      document.querySelectorAll(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option")
    );
    return list.length > 0 ? list : null;
  }, timeoutMs);
}

/** @returns "done" (ayarlandı ya da zaten öyle) | "absent" (sayfalama yok, sonra denenmeli) | "failed" */
async function setTablePageSize(container, size) {
  const changer = container.querySelector(".ant-pagination-options-size-changer");
  if (!changer) return "absent";
  const current = normalizeText(changer.querySelector(".ant-select-selection-item")?.textContent);
  if (current.startsWith(`${size} `)) return "done";
  simulateClick(changer.querySelector(".ant-select-selector") || changer);
  let options = await openSelectOptions(changer, 1000);
  if (!options) {
    // İlk tıklama açmadıysa: arama kutusuna odaklanıp aşağı ok (Ant Design klavyeyle de açar)
    const input = changer.querySelector("input");
    if (input) {
      input.focus();
      simulateClick(input);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40, bubbles: true }));
    }
    options = await openSelectOptions(changer, 1500);
  }
  if (!options) return "failed";
  const exact = options.find((o) => normalizeText(o.textContent).startsWith(`${size} `));
  // İstenen boyut yoksa en büyüğü
  const best =
    exact ||
    options.reduce((a, b) => (parseInt(normalizeText(b.textContent), 10) > parseInt(normalizeText(a.textContent), 10) ? b : a));
  simulateClick(best);
  return "done";
}

function ensureInventoryTaskStyleOnce() {
  if (document.getElementById("getirstok-ic-style")) return;
  const style = document.createElement("style");
  style.id = "getirstok-ic-style";
  style.textContent = `
    [data-getirstok-ic-col="taskId"],
    [data-getirstok-ic-col="productId"],
    [data-getirstok-ic-col="barcodes"],
    [data-getirstok-ic-col="status"],
    [data-getirstok-ic-col="created"] {
      display: none !important;
    }
    [data-getirstok-ic-table] table {
      table-layout: auto !important;
      width: 100% !important;
      min-width: 0 !important;
    }
    [data-getirstok-ic-table] col {
      width: auto !important;
      min-width: 0 !important;
    }
    [data-getirstok-ic-table] .ant-table {
      background: transparent !important;
    }
    [data-getirstok-ic-table] .ant-table-container {
      border: 1px solid #eeebf6 !important;
      border-radius: 14px !important;
      overflow: hidden;
    }
    [data-getirstok-ic-table] .ant-table-thead > tr > th {
      padding: 9px 12px !important;
      background: #faf9fd !important;
      border-bottom: 1px solid #eeebf6 !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #8a849d !important;
      white-space: nowrap;
    }
    [data-getirstok-ic-table] .ant-table-thead > tr > th::before {
      display: none !important;
    }
    [data-getirstok-ic-table] .ant-table-thead > tr > th[data-getirstok-ic-col="image"] {
      font-size: 0 !important;
      width: 64px;
    }
    /* Ürün ID sütunu Ad'dan önce geliyor; stok Ad hücresinin sağ ucunda çizilir */
    [data-getirstok-ic-table] .ant-table-thead > tr > th[data-getirstok-ic-col="name"] {
      position: relative;
      padding-right: 124px !important;
    }
    [data-getirstok-ic-table] .ant-table-thead > tr > th[data-getirstok-ic-col="name"]::after {
      content: "Stok";
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      min-width: 76px;
      text-align: center;
    }
    [data-getirstok-ic-table] .ant-table-tbody > tr.ant-table-row > td {
      padding: 8px 12px !important;
      vertical-align: middle !important;
      background: #ffffff !important;
      border-bottom: 1px solid #f4f2f9 !important;
      transition: background 0.15s ease;
    }
    [data-getirstok-ic-table] .ant-table-tbody > tr.ant-table-row:last-child > td {
      border-bottom: none !important;
    }
    [data-getirstok-ic-table] .ant-table-tbody > tr.ant-table-row:hover > td {
      background: #faf8ff !important;
    }

    /* Görsel */
    [data-getirstok-ic-table] td[data-getirstok-ic-col="image"] {
      width: 64px;
      padding-right: 0 !important;
    }
    [data-getirstok-ic-table] td[data-getirstok-ic-col="image"] .ant-image,
    [data-getirstok-ic-table] td[data-getirstok-ic-col="image"] img {
      width: 44px !important;
      height: 44px !important;
    }
    [data-getirstok-ic-table] td[data-getirstok-ic-col="image"] .ant-image {
      box-sizing: border-box;
      border-radius: 12px;
      border: 1px solid #eeebf6;
      background: #ffffff;
      overflow: hidden;
    }
    [data-getirstok-ic-table] td[data-getirstok-ic-col="image"] img {
      box-sizing: border-box;
      padding: 3px;
      object-fit: contain;
      background: transparent !important;
    }

    /* Ad */
    [data-getirstok-ic-table] td[data-getirstok-ic-col="name"] .ant-tag {
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      background: transparent !important;
      white-space: normal !important;
      font-size: 14px !important;
      font-weight: 700 !important;
      line-height: 1.35 !important;
      color: #1f1b2e !important;
    }

    /* Stok: SKT kaydındaki toplam, Ad hücresinin sağında */
    [data-getirstok-ic-table] td[data-getirstok-ic-col="name"][data-getirstok-ic-stock] {
      position: relative;
      padding-right: 124px !important;
    }
    [data-getirstok-ic-table] td[data-getirstok-ic-col="name"][data-getirstok-ic-stock]::after {
      content: attr(data-getirstok-ic-stock);
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      white-space: nowrap;
      min-width: 76px;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      background: #f3f1f8;
      color: #8a849d;
    }
    [data-getirstok-ic-table] td[data-getirstok-ic-state="done"]::after {
      background: #ede7fc !important;
      color: #5d3ebc !important;
      font-size: 15px !important;
    }
    [data-getirstok-ic-table] td[data-getirstok-ic-state="none"]::after {
      font-size: 11.5px !important;
      font-weight: 600 !important;
    }
    /* Sayılan adet sistemden farklı: tek uyarı durumu */
    [data-getirstok-ic-table] td[data-getirstok-ic-col="name"][data-getirstok-ic-stock][data-getirstok-ic-warn]::after {
      content: "! " attr(data-getirstok-ic-stock);
      background: #fee2e2 !important;
      color: #b91c1c !important;
    }

    /* ── Pencere: sağdan açılan çekmece yerine ortada pop-up ── */
    .ant-drawer[data-getirstok-ic-drawer] .ant-drawer-mask {
      background: rgba(24, 18, 43, 0.6) !important;
    }
    .ant-drawer[data-getirstok-ic-drawer] .ant-drawer-content-wrapper {
      top: 50% !important;
      left: 50% !important;
      right: auto !important;
      bottom: auto !important;
      transform: translate(-50%, -50%) !important;
      width: min(720px, calc(100vw - 24px)) !important;
      height: auto !important;
      max-height: min(88vh, 900px) !important;
      border-radius: 20px !important;
      overflow: hidden !important;
      box-shadow: 0 24px 64px -16px rgba(31, 27, 46, 0.45) !important;
    }
    .ant-drawer[data-getirstok-ic-drawer] .ant-drawer-content {
      border-radius: 20px !important;
      max-height: min(88vh, 900px);
    }
    .ant-drawer[data-getirstok-ic-drawer] .ant-drawer-wrapper-body {
      display: flex !important;
      flex-direction: column !important;
      max-height: min(88vh, 900px);
    }
    .ant-drawer[data-getirstok-ic-drawer] .ant-drawer-header {
      padding: 14px 18px !important;
      border-bottom: 1px solid #f0edf7 !important;
    }
    .ant-drawer[data-getirstok-ic-drawer] .ant-drawer-header-title {
      flex-direction: row-reverse !important;
      justify-content: space-between !important;
    }
    .ant-drawer[data-getirstok-ic-drawer] .ant-drawer-title {
      font-size: 0 !important;
    }
    .ant-drawer[data-getirstok-ic-drawer] .ant-drawer-title::after {
      content: attr(data-getirstok-ic-title);
      font-size: 17px;
      font-weight: 700;
      color: #1f1b2e;
    }
    .ant-drawer[data-getirstok-ic-drawer] .ant-drawer-close {
      margin: 0 !important;
      width: 34px;
      height: 34px;
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      border-radius: 10px !important;
      background: #f3f1f8 !important;
      color: #5b5570 !important;
    }
    .ant-drawer[data-getirstok-ic-drawer] .ant-drawer-close:hover {
      background: #e9e4f6 !important;
      color: #1f1b2e !important;
    }
    .ant-drawer[data-getirstok-ic-drawer] .ant-drawer-extra {
      display: none !important;
    }
    .ant-drawer[data-getirstok-ic-drawer] .ant-drawer-body {
      flex: 1 1 auto !important;
      min-height: 0 !important;
      overflow-y: auto !important;
      padding: 14px 18px 18px !important;
    }
    /* "Sayım Detayı" bölümü gizli: sadece ürün listesi */
    [data-getirstok-ic-hidden] {
      display: none !important;
    }
    .ant-drawer[data-getirstok-ic-drawer] .ant-card {
      border: none !important;
      box-shadow: none !important;
      background: transparent !important;
    }
    .ant-drawer[data-getirstok-ic-drawer] .ant-card-head {
      display: none !important;
    }
    .ant-drawer[data-getirstok-ic-drawer] .ant-card-body {
      padding: 0 !important;
    }

    /* Satır sonu butonu */
    [data-getirstok-ic-table] td.ant-table-cell-fix-right .ant-btn,
    [data-getirstok-ic-table] td:last-child .ant-btn {
      width: 32px !important;
      height: 32px !important;
      border-radius: 10px !important;
      border-color: #e4def4 !important;
      color: #5d3ebc !important;
      background: #ffffff !important;
    }
    [data-getirstok-ic-table] td:last-child .ant-btn .anticon {
      display: inline-flex;
      transition: transform 0.2s ease;
    }

    /* ── "+" ile açılan Getir görev detayı penceresi gizli; detay satırın altında ── */
    html[data-getirstok-ic-open] .ant-drawer.ant-drawer-open:not([data-getirstok-ic-drawer]):not([data-getirstok-itd-show]),
    .ant-drawer[data-getirstok-itd-drawer]:not([data-getirstok-itd-show]) {
      visibility: hidden !important;
      pointer-events: none !important;
    }
    [data-getirstok-ic-table] tr[data-getirstok-itd-open] > td {
      background: #faf8ff !important;
      border-bottom: none !important;
    }
    [data-getirstok-ic-table] tr[data-getirstok-itd-open] td:last-child .ant-btn {
      background: #5d3ebc !important;
      border-color: #5d3ebc !important;
      color: #ffffff !important;
    }
    [data-getirstok-ic-table] tr[data-getirstok-itd-open] td:last-child .ant-btn .anticon {
      transform: rotate(45deg);
    }
    [data-getirstok-ic-table] tr.getirstok-itd-tr > td {
      padding: 0 12px 12px !important;
      background: #faf8ff !important;
      border-bottom: 1px solid #f4f2f9 !important;
    }
    .getirstok-itd {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      border: 1px solid #ece7f8;
      border-radius: 14px;
      background: #ffffff;
      animation: getirstok-itd-in 0.18s ease-out;
      font-size: 13px;
      color: #1f1b2e;
    }
    @keyframes getirstok-itd-in {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: none; }
    }
    .getirstok-itd-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 8px;
    }
    .getirstok-itd-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      border-radius: 999px;
      background: #f3f1f8;
      color: #5b5570;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    .getirstok-itd-chip[data-tone="done"] { background: #dcfce7; color: #15803d; }
    .getirstok-itd-chip[data-tone="progress"] { background: #fef3c7; color: #b45309; }
    .getirstok-itd-chip[data-tone="ready"] { background: #ede7fc; color: #5d3ebc; }
    .getirstok-itd-chip[data-tone="cancel"] { background: #fee2e2; color: #b91c1c; }
    .getirstok-itd-muted {
      color: #8a849d;
      font-size: 12px;
    }
    .getirstok-itd-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 8px;
    }
    .getirstok-itd-box {
      padding: 10px 12px;
      border-radius: 12px;
      background: #faf9fd;
      border: 1px solid #f0edf7;
    }
    .getirstok-itd-box-title {
      margin-bottom: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #8a849d;
    }
    .getirstok-itd-lot {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      padding: 2px 0;
    }
    .getirstok-itd-qty {
      font-size: 15px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: #5d3ebc;
    }
    .getirstok-itd-foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .getirstok-itd-diff {
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 700;
    }
    .getirstok-itd-diff[data-tone="ok"] { background: #dcfce7; color: #15803d; }
    .getirstok-itd-diff[data-tone="bad"] { background: #fee2e2; color: #b91c1c; }
    .getirstok-itd-loading {
      padding: 14px;
      text-align: center;
      color: #8a849d;
    }
    .getirstok-itd-error { color: #b91c1c; }
  `;
  document.head.appendChild(style);
}

const STOCK_TEXT_BY_STATE = { loading: "…", none: "SKT yok", error: "—" };

/** Her barkod ayrı etikette; birleşik metinden okunursa yan yana iki barkod tek sayı olur */
function inventoryCellBarcodes(cell) {
  if (!cell) return [];
  const tagTexts = Array.from(cell.querySelectorAll(".ant-tag"), (t) => normalizeText(t.textContent));
  return [
    ...new Set(
      (tagTexts.length > 0 ? tagTexts : normalizeText(cell.textContent).split(" ")).filter((t) => /^\d{6,14}$/.test(t))
    ),
  ];
}

function decorateInventoryTaskTable(table) {
  const headerCells = Array.from(table.querySelectorAll(":scope > thead > tr > th"));
  const columns = headerCells.map(
    (th) => INVENTORY_TASK_COLUMN_BY_HEADER[normalizeText(th.textContent).toLocaleLowerCase("tr-TR")] || null
  );
  if (
    !columns.includes("productId") ||
    !columns.includes("name") ||
    !columns.includes("barcodes") ||
    !columns.includes("status")
  ) {
    return false;
  }

  headerCells.forEach((th, i) => setDataAttr(th, "data-getirstok-ic-col", columns[i]));
  table
    .querySelectorAll(":scope > tbody > tr.ant-table-measure-row > *")
    .forEach((cell, i) => setDataAttr(cell, "data-getirstok-ic-col", columns[i] ?? null));

  const rows = Array.from(table.querySelectorAll(":scope > tbody > tr.ant-table-row"));
  const wanted = [];
  for (const tr of rows) {
    // Aynı satır (Getir içeriği değişmediyse) aynı stok sürümüyle tekrar işlenmez
    const stamp = `${expiryStockVersion}|${tr.children.length}|${tr.getAttribute("data-row-key") || ""}`;
    if (tr.getAttribute("data-getirstok-ic-v") === stamp) continue;
    tr.setAttribute("data-getirstok-ic-v", stamp);
    const cells = Array.from(tr.children);
    cells.forEach((td, i) => setDataAttr(td, "data-getirstok-ic-col", columns[i] ?? null));
    const barcodeCell = cells[columns.indexOf("barcodes")];
    const stockCell = cells[columns.indexOf("name")];
    if (!barcodeCell || !stockCell) continue;
    const barcodes = inventoryCellBarcodes(barcodeCell);
    if (barcodes.length === 0) {
      setDataAttr(stockCell, "data-getirstok-ic-state", "none");
      setDataAttr(stockCell, "data-getirstok-ic-stock", STOCK_TEXT_BY_STATE.none);
      continue;
    }
    wanted.push(...barcodes);
    const stock = expiryStockForBarcodes(barcodes);
    setDataAttr(stockCell, "data-getirstok-ic-state", stock.state);
    setDataAttr(stockCell, "data-getirstok-ic-stock", stock.state === "done" ? `${stock.total} adet` : STOCK_TEXT_BY_STATE[stock.state]);
    const title =
      stock.state === "done"
        ? stock.lots.map((l) => `${l.count} adet · SKT ${formatTrDate(l.expiryDate)}`).join("\n")
        : stock.state === "none"
          ? "Bu ürünün SKT kaydı yok (stok sayımda gizli)"
          : stock.state === "error"
            ? "SKT stoğu alınamadı; birazdan tekrar denenecek"
            : "";
    if (stockCell.title !== title) stockCell.title = title;
  }
  if (wanted.length > 0) requestExpiryStock(wanted);
  return true;
}

/** Çekmecede ürün tablosunun dışındaki "Sayım Detayı" bölümünü (başlık + açıklama kartı) işaretler */
function hideInventoryDetailSections(wrapper, body) {
  let node = wrapper;
  while (node && node !== body) {
    const parent = node.parentElement;
    if (!parent) break;
    for (const sib of parent.children) {
      // Açıklama kartı da içeride tablo kullanıyor; sadece ürün tablosunu içeren dal korunur
      if (sib === node || sib.querySelector(".ant-table-wrapper")) continue;
      const text = normalizeText(sib.textContent).toLocaleLowerCase("tr-TR");
      const isDetail =
        sib.matches(".ant-descriptions") || !!sib.querySelector(".ant-descriptions") || text === "sayım detayı";
      setDataAttr(sib, "data-getirstok-ic-hidden", isDetail ? "1" : null);
    }
    node = parent;
  }
}

/** Sayım çekmecesini ortada pop-up gibi gösterir */
function decorateInventoryDrawer(wrapper, table) {
  const drawer = wrapper.closest(".ant-drawer");
  if (!drawer) return;
  setDataAttr(drawer, "data-getirstok-ic-drawer", "1");
  const count = table.querySelectorAll(":scope > tbody > tr.ant-table-row").length;
  const title = drawer.querySelector(".ant-drawer-title");
  if (title) setDataAttr(title, "data-getirstok-ic-title", count > 0 ? `Sayımdaki ürünler (${count})` : "Sayımdaki ürünler");
  const body = drawer.querySelector(".ant-drawer-body");
  if (body) hideInventoryDetailSections(wrapper, body);
}

// ── Satır "+" → görev detayı satırın altında ──
// Getir "+" ile ikinci bir çekmece ("Sayım Görev Detayı") açıyor. Çekmece gizli tutulur,
// verisi okunup satırın altına kart olarak çizilir, sonra çekmece kapatılır.
const TASK_DETAIL_TIMEOUT_MS = 12000;
/** görev ID → { state: "loading" | "done" | "error", data?, at } */
const taskDetailById = new Map();
const openTaskDetailIds = new Set();
/** Gizli çekmecede beklenen son görev; yalnız bu eşleşince çekmece kapatılır */
let pendingTaskDetailId = null;

function inventoryRowTaskId(tr) {
  const key = tr.getAttribute("data-row-key");
  if (key) return key;
  const cell = tr.querySelector('td[data-getirstok-ic-col="taskId"]');
  return cell ? normalizeText(cell.textContent) || null : null;
}

function isDrawerOpen(drawer) {
  return drawer.classList.contains("ant-drawer-open");
}

function cellSpaceItems(cell) {
  if (!cell) return [];
  const items = Array.from(cell.querySelectorAll(".ant-space-item"), (x) => normalizeText(x.textContent));
  return (items.length > 0 ? items : [normalizeText(cell.textContent)]).filter((t) => t && t !== "-");
}

/** Getir'in görev detayı kartını okur; veri henüz yüklenmediyse null */
function parseTaskDetail(card) {
  if (card.querySelector(".ant-spin-spinning")) return null;
  const desc = {};
  for (const th of card.querySelectorAll(".ant-descriptions-item-label")) {
    const td = th.nextElementSibling;
    if (!td) continue;
    const first = td.querySelector(".ant-space-item");
    const value = normalizeText((first || td).textContent);
    desc[normalizeText(th.textContent).toLocaleLowerCase("tr-TR")] = value === "-" ? "" : value;
  }
  const taskId = desc["ıd"] || desc["id"];
  if (!taskId) return null;

  let products = null;
  for (const table of card.querySelectorAll(".ant-table-wrapper table")) {
    const headers = Array.from(table.querySelectorAll(":scope > thead > tr > th"), (th) =>
      normalizeText(th.textContent).toLocaleLowerCase("tr-TR")
    );
    const col = (name) => headers.indexOf(name);
    if (col("sistem stokları") < 0) continue;
    const rows = Array.from(table.querySelectorAll(":scope > tbody > tr.ant-table-row"));
    if (rows.length === 0 && !table.querySelector(".ant-table-placeholder")) return null;
    products = rows.map((tr) => {
      const cells = Array.from(tr.children);
      const at = (name) => cells[col(name)];
      return {
        name: normalizeText(at("ürün adı")?.textContent),
        systemStocks: cellSpaceItems(at("sistem stokları")),
        systemExpiry: cellSpaceItems(at("sistem son kullanma tarihi")),
        physicalStocks: cellSpaceItems(at("fiziksel stoklar")),
        physicalExpiry: cellSpaceItems(at("fiziksel son kullanma tarihi")),
        unit: normalizeText(at("birim")?.textContent).toLocaleLowerCase("tr-TR") || "adet",
      };
    });
    break;
  }
  if (!products) return null;
  return {
    taskId,
    status: desc["durum"] || "",
    assignedAt: desc["atanma zamanı"] || "",
    completedAt: desc["tamamlanma tarihi"] || "",
    assignee: desc["görevlendirilen"] || "",
    products,
  };
}

function decorateTaskDetailDrawers() {
  for (const card of document.querySelectorAll(".ant-drawer .inventoryCheckDetail")) {
    const drawer = card.closest(".ant-drawer");
    if (!drawer || drawer.hasAttribute("data-getirstok-ic-drawer")) continue;
    setDataAttr(drawer, "data-getirstok-itd-drawer", "1");
    if (!isDrawerOpen(drawer)) {
      setDataAttr(drawer, "data-getirstok-itd-show", null);
      continue;
    }
    const data = parseTaskDetail(card);
    if (!data || !openTaskDetailIds.has(data.taskId)) continue;
    taskDetailById.set(data.taskId, { state: "done", data, at: Date.now() });
    if (pendingTaskDetailId === data.taskId) {
      pendingTaskDetailId = null;
      drawer.querySelector(".ant-drawer-close")?.click();
    }
  }
}

function itdEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function taskStatusTone(status) {
  const s = status.toLocaleLowerCase("tr-TR");
  if (s.includes("tamam")) return "done";
  if (s.includes("devam")) return "progress";
  if (s.includes("iptal") || s.includes("red")) return "cancel";
  return "ready";
}

function sumQty(list) {
  let total = 0;
  for (const t of list) {
    const n = Number(String(t).replace(",", "."));
    if (!Number.isFinite(n)) return null;
    total += n;
  }
  return total;
}

function itdLotBox(title, lots, emptyText) {
  const box = itdEl("div", "getirstok-itd-box");
  box.appendChild(itdEl("div", "getirstok-itd-box-title", title));
  if (lots.length === 0) {
    box.appendChild(itdEl("div", "getirstok-itd-muted", emptyText));
    return box;
  }
  for (const lot of lots) {
    const line = itdEl("div", "getirstok-itd-lot");
    line.appendChild(itdEl("span", "getirstok-itd-qty", lot.qty));
    line.appendChild(itdEl("span", "getirstok-itd-muted", lot.expiry ? `SKT ${lot.expiry}` : "SKT yok"));
    box.appendChild(line);
  }
  return box;
}

function pairLots(stocks, expiries, unit) {
  return stocks.map((qty, i) => ({ qty: `${qty} ${unit}`, expiry: expiries[i] || "" }));
}

function rowExpiryStock(row) {
  return expiryStockForBarcodes(inventoryCellBarcodes(row.querySelector('td[data-getirstok-ic-col="barcodes"]')));
}

/**
 * Sistem stoğu ile sayılan adet. Sayım açıkken Getir sistem stoğunu boş gösterebiliyor; o zaman
 * SKT kaydı yedek. `diff` yalnız iki taraf da biliniyorsa sayı; SKT tarihleri karşılaştırılmaz.
 */
function compareTaskProduct(p, skt) {
  let systemLots = pairLots(p.systemStocks, p.systemExpiry, p.unit);
  let systemTotal = sumQty(p.systemStocks);
  let systemTitle = "Sistem stoğu";
  if (systemLots.length === 0 && skt.state === "done") {
    systemLots = skt.lots.map((l) => ({ qty: `${l.count} ${p.unit}`, expiry: formatTrDate(l.expiryDate) }));
    systemTotal = skt.total;
    systemTitle = "Sistem stoğu (SKT kaydı)";
  }
  const physicalTotal = sumQty(p.physicalStocks);
  const known = p.physicalStocks.length > 0 && physicalTotal != null && systemLots.length > 0 && systemTotal != null;
  return { systemLots, systemTitle, diff: known ? physicalTotal - systemTotal : null };
}

/** Sayılan adet sistemden farklı mı (detay henüz okunmadıysa false) */
function taskHasCountMismatch(entry, row) {
  if (entry?.state !== "done") return false;
  const skt = rowExpiryStock(row);
  return entry.data.products.some((p) => {
    const { diff } = compareTaskProduct(p, skt);
    return diff != null && diff !== 0;
  });
}

function buildTaskDetailContent(entry, row) {
  const root = itdEl("div", "getirstok-itd");
  // Büyük harf başlıklarda "i" → "İ" olsun
  root.lang = "tr";
  if (!entry || entry.state === "loading") {
    root.appendChild(itdEl("div", "getirstok-itd-loading", "Detay yükleniyor…"));
    return root;
  }
  if (entry.state === "error") {
    root.appendChild(
      itdEl("div", "getirstok-itd-loading getirstok-itd-error", "Detay alınamadı. Kapatıp tekrar açmayı dene.")
    );
    return root;
  }
  const d = entry.data;
  const head = itdEl("div", "getirstok-itd-head");
  if (d.status) {
    const chip = itdEl("span", "getirstok-itd-chip", d.status);
    chip.dataset.tone = taskStatusTone(d.status);
    head.appendChild(chip);
  }
  if (d.assignee) head.appendChild(itdEl("span", "getirstok-itd-chip", `Sayan: ${d.assignee}`));
  const times = [d.assignedAt && `Atandı ${d.assignedAt}`, d.completedAt && `Bitti ${d.completedAt}`].filter(Boolean);
  if (times.length > 0) head.appendChild(itdEl("span", "getirstok-itd-muted", times.join(" · ")));
  root.appendChild(head);

  const skt = rowExpiryStock(row);
  for (const p of d.products) {
    const { systemLots, systemTitle, diff } = compareTaskProduct(p, skt);
    const grid = itdEl("div", "getirstok-itd-grid");
    grid.appendChild(itdLotBox(systemTitle, systemLots, "Sayımda gizli"));
    grid.appendChild(
      itdLotBox("Sayılan", pairLots(p.physicalStocks, p.physicalExpiry, p.unit), "Henüz sayılmadı")
    );
    root.appendChild(grid);

    if (diff != null) {
      const foot = itdEl("div", "getirstok-itd-foot");
      const badge = itdEl(
        "span",
        "getirstok-itd-diff",
        diff === 0 ? "Fark yok" : `Fark: ${diff > 0 ? "+" : "−"}${Math.abs(diff)} ${p.unit}`
      );
      badge.dataset.tone = diff === 0 ? "ok" : "bad";
      foot.appendChild(badge);
      root.appendChild(foot);
    }
  }
  return root;
}

function taskDetailSignature(entry, row) {
  if (!entry || entry.state !== "done") return entry?.state || "loading";
  const skt = rowExpiryStock(row);
  return JSON.stringify([entry.data, skt.state, skt.total]);
}

function renderTaskDetailRows() {
  const popupOpen = !!document.querySelector(".ant-drawer-open[data-getirstok-ic-drawer]");
  // Sayım penceresi açıkken üstüne açılan Getir çekmeceleri gizli (CSS bu işarete bakar)
  setDataAttr(document.documentElement, "data-getirstok-ic-open", popupOpen ? "1" : null);
  if (!popupOpen) {
    openTaskDetailIds.clear();
    pendingTaskDetailId = null;
  }
  for (const tbody of document.querySelectorAll("[data-getirstok-ic-table] table > tbody")) {
    for (const extra of tbody.querySelectorAll(":scope > tr.getirstok-itd-tr")) {
      const id = extra.getAttribute("data-getirstok-itd-row");
      const prev = extra.previousElementSibling;
      if (!openTaskDetailIds.has(id) || !prev || inventoryRowTaskId(prev) !== id) extra.remove();
    }
    for (const row of tbody.querySelectorAll(":scope > tr.ant-table-row")) {
      const id = inventoryRowTaskId(row);
      const open = !!id && openTaskDetailIds.has(id);
      setDataAttr(row, "data-getirstok-itd-open", open ? "1" : null);
      const nameCell = row.querySelector('td[data-getirstok-ic-col="name"]');
      if (nameCell) {
        const warn = !!id && taskHasCountMismatch(taskDetailById.get(id), row);
        setDataAttr(nameCell, "data-getirstok-ic-warn", warn ? "1" : null);
      }
      if (!open) continue;
      let extra = row.nextElementSibling;
      if (!extra || !extra.classList.contains("getirstok-itd-tr") || extra.getAttribute("data-getirstok-itd-row") !== id) {
        extra = itdEl("tr", "getirstok-itd-tr");
        extra.setAttribute("data-getirstok-itd-row", id);
        extra.appendChild(itdEl("td"));
        row.after(extra);
      }
      const td = extra.firstElementChild;
      const colspan = String(row.children.length);
      if (td.getAttribute("colspan") !== colspan) td.setAttribute("colspan", colspan);
      const entry = taskDetailById.get(id);
      const sig = taskDetailSignature(entry, row);
      if (extra.dataset.sig === sig) continue;
      extra.dataset.sig = sig;
      td.replaceChildren(buildTaskDetailContent(entry, row));
    }
  }
}

function onInventoryRowButtonClick(e) {
  const btn = e.target.closest?.("[data-getirstok-ic-table] tr.ant-table-row > td:last-child .ant-btn");
  if (!btn) return;
  const id = inventoryRowTaskId(btn.closest("tr.ant-table-row"));
  if (!id) return;
  if (openTaskDetailIds.has(id)) {
    // Kapatma: Getir'in çekmecesi hiç açılmasın
    e.preventDefault();
    e.stopPropagation();
    openTaskDetailIds.delete(id);
    if (pendingTaskDetailId === id) pendingTaskDetailId = null;
    renderTaskDetailRows();
    return;
  }
  openTaskDetailIds.add(id);
  pendingTaskDetailId = id;
  const at = Date.now();
  taskDetailById.set(id, { state: "loading", at });
  renderTaskDetailRows();
  setTimeout(() => {
    const entry = taskDetailById.get(id);
    if (entry?.state !== "loading" || entry.at !== at) return;
    taskDetailById.set(id, { state: "error", at: Date.now() });
    if (pendingTaskDetailId === id) {
      pendingTaskDetailId = null;
      // Okunamadıysa Getir'in kendi penceresi görünür olsun
      for (const d of document.querySelectorAll(".ant-drawer.ant-drawer-open:not([data-getirstok-ic-drawer])")) {
        setDataAttr(d, "data-getirstok-itd-show", "1");
      }
    }
    renderTaskDetailRows();
  }, TASK_DETAIL_TIMEOUT_MS);
}

function decorateInventoryTaskTables() {
  for (const table of document.querySelectorAll(".ant-table-wrapper table")) {
    if (!decorateInventoryTaskTable(table)) continue;
    ensureInventoryTaskStyleOnce();
    const wrapper = table.closest(".ant-table-wrapper");
    if (!wrapper) continue;
    setDataAttr(wrapper, "data-getirstok-ic-table", "1");
    decorateInventoryDrawer(wrapper, table);
    if (!inventoryPageSizeState.has(wrapper)) {
      inventoryPageSizeState.set(wrapper, "running");
      setTablePageSize(wrapper, INVENTORY_TASK_PAGE_SIZE)
        .catch(() => "failed")
        .then((result) => {
          // Sayfalama henüz çizilmemiş: sonraki değişiklikte tekrar denenir
          if (result === "absent") {
            inventoryPageSizeState.delete(wrapper);
            return;
          }
          inventoryPageSizeState.set(wrapper, result);
          const tries = (inventoryPageSizeTries.get(wrapper) ?? 0) + 1;
          inventoryPageSizeTries.set(wrapper, tries);
          // Menü açılamadıysa (Getir hâlâ yüklüyor olabilir) birkaç saniye sonra tekrar
          if (result === "failed" && tries < 3) setTimeout(() => inventoryPageSizeState.delete(wrapper), 3000);
        });
    }
  }
  for (const d of document.querySelectorAll(".ant-drawer[data-getirstok-itd-show]:not(.ant-drawer-open)")) {
    setDataAttr(d, "data-getirstok-itd-show", null);
  }
  decorateTaskDetailDrawers();
  renderTaskDetailRows();
}

if (isWarehousePanel) {
  document.addEventListener("click", onInventoryRowButtonClick, true);
  document.addEventListener("click", onInventoryListRowClick);
}

if (isWarehousePanel) {
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== "getirstok-heating-estimations") return;
    applyHeatingJson(event.data.json);
    decorateBakeryPage();
  });
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

  // Sayfa sürekli değişirken (ilk yükleme) bekleme her seferinde uzamasın: en geç 400 ms'de bir çalış
  let debounceStartedAt = 0;
  function debouncedInject() {
    const now = Date.now();
    if (debounceTimer) clearTimeout(debounceTimer);
    else debounceStartedAt = now;
    const wait = now - debounceStartedAt >= 400 ? 0 : 120;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      safeInjectButtons();
    }, wait);
  }

  /** Hafif işler beklemeden: gözlemci geri çağrısı ekran çizilmeden önce çalışır */
  function runFastDecorations() {
    if (!isWarehousePanel || isInjecting) return;
    mo.disconnect();
    try {
      decorateWarehouseFast();
    } catch (error) {
      console.warn("[GetirStok] Hızlı düzenleme hatası:", error);
    } finally {
      // warehouse-early.css bu işarete kadar sekmeleri ve sayaçları gizli tutar
      if (!document.documentElement.hasAttribute("data-getirstok-ready")) {
        document.documentElement.setAttribute("data-getirstok-ready", "1");
      }
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  var mo = new MutationObserver(() => {
    runFastDecorations();
    debouncedInject();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  runFastDecorations();
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
    // Getir'in verisi yakalandıysa (heating-estimations) ekrandan okumaya gerek yok;
    // üstelik sayfa sadeleştirilince gizlenen yazılar ekran okumasını yanıltır
    if (!heatingStocks) loadHeatingStocksFromSession();
    if (heatingStocks) return;
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

