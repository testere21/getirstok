// Background Service Worker - Token yakalama ve API'ye gönderme
// Hem Getir Bayi Paneli hem de Getir Depo Paneli token'larını yakalar

// Depo tablosu ve özellik bayrakları (içerik betiğiyle aynı dosya)
importScripts("warehouses.js");
const WH = self.GETIRSTOK_WAREHOUSES;

// Local test: true → localhost:3000 | Netlify deploy sonrası false yap
const USE_LOCAL_API = false;
const API_BASE = USE_LOCAL_API
  ? "http://localhost:3000"
  : "https://getirware.netlify.app";
const API_ENDPOINT = `${API_BASE}/api/token/save`;
const TRANSFER_CAPTURE_ENDPOINT = `${API_BASE}/api/warehouse-transfer/capture`;

const PANEL_URL_PATTERNS = [
  "https://getirware.netlify.app/*",
  "http://localhost:3000/*",
  "http://127.0.0.1:3000/*",
];

// -----------------------------
// Depo algılama ve özellik bayrakları
// Depo, isteğin geldiği sekmenin adresindeki /r/{24 hane}/ kimliğinden (ya da API adresindeki
// /warehouse/{24 hane}/ kısmından) bulunur. Hiçbiri yoksa bu bilgisayarda en son görülen depo
// kullanılır. Tabloda olmayan ya da bilinmeyen depoda token/sevkiyat panele GÖNDERİLMEZ
// (yanlış depoya yazılmasın).
// -----------------------------

async function loadFeatureOverrides() {
  const { featureOverrides } = await chrome.storage.local.get("featureOverrides");
  return featureOverrides && typeof featureOverrides === "object" ? featureOverrides : {};
}

async function lastKnownWarehouseId() {
  const { lastWarehouseId } = await chrome.storage.local.get("lastWarehouseId");
  const id = WH.normalizeId(lastWarehouseId);
  return id && WH.isKnownWarehouse(id) ? id : null;
}

async function warehouseIdFromTab(tabId) {
  if (typeof tabId !== "number" || tabId < 0) return null;
  try {
    const tab = await chrome.tabs.get(tabId);
    return WH.warehouseIdFromPageUrl(tab?.url);
  } catch {
    return null;
  }
}

/** Depo bilinen bir depoysa ve özellik açıksa true */
async function warehouseFeatureOn(warehouseId, name) {
  if (!warehouseId || !WH.isKnownWarehouse(warehouseId)) return false;
  return WH.featureEnabled(warehouseId, name, await loadFeatureOverrides());
}

function buildPanelUrlWithQuery(query) {
  const base = "https://getirware.netlify.app/";
  const u = new URL(base);
  if (query && String(query).trim()) {
    u.searchParams.set("q", String(query).trim());
  }
  return u.toString();
}

async function focusOrOpenPanelAndSearch(query) {
  const q = String(query || "").trim();
  // 1) Panel tabı zaten açık mı?
  const tabs = await chrome.tabs.query({ url: PANEL_URL_PATTERNS });
  if (tabs && tabs.length > 0) {
    // En son aktif olanı seçmeye çalış
    const sorted = [...tabs].sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    const t = sorted[0];
    if (t.id != null) {
      await chrome.tabs.update(t.id, { active: true });
      if (t.windowId != null) {
        await chrome.windows.update(t.windowId, { focused: true });
      }
      // 0) Önce doğrudan DOM'a yapıştırmayı dene (mesajlaşmadan bağımsız, daha sağlam)
      try {
        await chrome.scripting.executeScript({
          target: { tabId: t.id },
          args: [q],
          func: (value) => {
            try {
              const v = String(value || "");
              // Panel sayfası bu mesajı dinleyip aramayı kendi durumuna yazar (en sağlam yol)
              window.postMessage({ source: "getirstok-extension", type: "SEARCH", query: v }, "*");
              const input =
                document.querySelector('input[aria-label="Ürün ismi veya barkod ile ara"]') ||
                document.querySelector('input[placeholder*="ara"]') ||
                document.querySelector('input[type="text"]');
              if (!input) return { ok: false, reason: "input_not_found" };
              input.focus();
              // Doğrudan `input.value = v` React'te görünmez; yerel setter ile yazılır
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
              setter.call(input, v);
              input.dispatchEvent(new Event("input", { bubbles: true }));
              try { input.select(); } catch {}
              return { ok: true };
            } catch (e) {
              return { ok: false, reason: "exception", message: String(e?.message || e) };
            }
          },
        });
        return;
      } catch (e) {
        // scripting başarısız olursa mesaj/URL fallback'e devam
        console.warn("[Getir Token Yakalayıcı] scripting paste failed:", e);
      }

      // Aynı sekmede URL fallback hazırlığı (mesaj gitmezse sayfayı q ile yeniler)
      const buildSameTabUrlWithQuery = () => {
        try {
          const current = t.url ? new URL(t.url) : null;
          if (!current) return buildPanelUrlWithQuery(q);
          if (q) current.searchParams.set("q", q);
          else current.searchParams.delete("q");
          return current.toString();
        } catch {
          return buildPanelUrlWithQuery(q);
        }
      };
      // Panel content script'e mesaj
      try {
        await chrome.tabs.sendMessage(t.id, { type: "GETIRSTOK_SEARCH", query: q });
      } catch {
        // içerik script hazır değilse URL fallback
        try {
          const url = buildSameTabUrlWithQuery();
          await chrome.tabs.update(t.id, { url });
        } catch {}
      }
      return;
    }
  }

  // 2) Açık değilse yeni sekme aç
  const url = buildPanelUrlWithQuery(q);
  await chrome.tabs.create({ url, active: true });
}

let lastTransferCaptureKey = "";
let lastTransferCaptureAt = 0;

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "WAREHOUSE_TRANSFER_CAPTURE") return;
  const url = String(msg.url || "");
  if (!url.includes("warehouse-panel-api-gateway.getirapi.com")) return;
  if (/receiving-windows|transfer-orders/i.test(url)) return;
  const isInboundTransfer = /\/inbound\/transfer(\/|\?|$)/i.test(url);
  const isInboundProductish =
    /\/inbound\//i.test(url) && /product|item|sku|pallet|line/i.test(url);
  if (!isInboundTransfer && !isInboundProductish) return;
  const method = String(msg.method || "GET").toUpperCase();
  const requestBody =
    typeof msg.requestBody === "string" ? msg.requestBody : null;
  const key = `${method} ${url} ${requestBody || ""}`;
  const now = Date.now();
  if (key === lastTransferCaptureKey && now - lastTransferCaptureAt < 4000) {
    return;
  }
  lastTransferCaptureKey = key;
  lastTransferCaptureAt = now;

  const fromUrl = extractWarehouseIdFromUrl(url);
  if (fromUrl) captureWarehouseId(fromUrl);

  const summary = msg.summary && typeof msg.summary === "object" ? msg.summary : null;
  const endpoints = [TRANSFER_CAPTURE_ENDPOINT];
  if (!USE_LOCAL_API) {
    endpoints.push("http://localhost:3000/api/warehouse-transfer/capture");
  }

  (async () => {
    // Hangi depoya ait: önce API adresindeki kimlik, sonra sayfanın bildirdiği, sonra sekme adresi.
    // Bilinen bir depo değilse ya da sevkiyat yakalama kapalıysa hiçbir yere gönderilmez.
    const warehouseId =
      fromUrl ||
      WH.normalizeId(msg.warehouseId) ||
      (await warehouseIdFromTab(sender?.tab?.id)) ||
      (await lastKnownWarehouseId());
    if (!(await warehouseFeatureOn(warehouseId, "transferCapture"))) return;
    const payload = { url, method, requestBody, summary, warehouseId };

    let anyOk = false;
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (response.ok) {
          anyOk = true;
          console.log(
            "[Getir Token Yakalayıcı] Transfer isteği kaydedildi:",
            method,
            url,
            endpoint
          );
        } else {
          console.warn(
            "[Getir Token Yakalayıcı] Transfer yakalama kaydı:",
            response.status,
            endpoint
          );
        }
      } catch (e) {
        console.warn("[Getir Token Yakalayıcı] Transfer yakalama API:", endpoint, e);
      }
    }
    if (!anyOk) {
      console.error("[Getir Token Yakalayıcı] Transfer yakalama hiçbir API'ye yazılamadı");
    }
  })();
});

chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  if (!msg || msg.type !== "GETIRSTOK_OPEN_SEARCH") return;
  // async işi background'da tamamla
  (async () => {
    try {
      await focusOrOpenPanelAndSearch(msg.query);
    } catch (e) {
      console.error("[Getir Token Yakalayıcı] Panel arama hatası:", e);
    }
  })();
  return true;
});

// Paneller her istekte aynı token'ı yolluyor (depo Kontrol Paneli birkaç saniyede bir);
// aynı token'ı tekrar tekrar panele yazmamak için (bayi / depo+depo kimliği) başına son gönderileni tutuyoruz.
const lastSentTokenByKey = {};
// Depo isteklerinde her seferinde depo aramamak için: sekme → o sekmede son işlenen token
const lastHandledWarehouseTokenByTab = new Map();

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Sayfa adresi değişince (başka depoya geçilmiş olabilir) o sekme yeniden değerlendirilsin
  if (changeInfo.url) lastHandledWarehouseTokenByTab.delete(tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => lastHandledWarehouseTokenByTab.delete(tabId));

// /auth/* isteklerinde Bearer access token değil (refresh-token, OTP ön token'ı)
function isFranchiseDataRequest(url) {
  const u = String(url || "");
  if (!u.includes("franchise-api-gateway.getirapi.com")) return false;
  return !/franchise-api-gateway\.getirapi\.com\/auth\//i.test(u);
}

/**
 * Depo paneli isteğinin hangi depoya ait olduğu: önce API adresindeki kimlik, sonra isteği yapan
 * sekmenin adresi, en son bu bilgisayarda son görülen depo. (Sekme adresi var ama bilinmeyen bir
 * depoysa o kimlik döner; yedeğe düşülmez.)
 */
async function warehouseIdForRequest(details) {
  const fromApiUrl = WH.warehouseIdFromGatewayUrl(details.url);
  if (fromApiUrl) return fromApiUrl;
  const fromTab = await warehouseIdFromTab(details.tabId);
  if (fromTab) return fromTab;
  return lastKnownWarehouseId();
}

async function handleCapturedToken(tokenType, bearerToken, details) {
  let warehouseId = null;
  if (tokenType === "warehouse") {
    const alreadyHandled = lastHandledWarehouseTokenByTab.get(details.tabId) === bearerToken;
    if (alreadyHandled) return;
    warehouseId = await warehouseIdForRequest(details);
    // Depo bilinmiyorsa, tabloda yoksa ya da token gönderimi kapalıysa panele hiçbir şey gitmez
    // (token yanlış depoya yazılmasın). Durum değişmediği için sonraki istekte yeniden denenir.
    if (!(await warehouseFeatureOn(warehouseId, "tokenSync"))) return;
    captureWarehouseId(warehouseId);
    if (typeof details.tabId === "number" && details.tabId >= 0) {
      lastHandledWarehouseTokenByTab.set(details.tabId, bearerToken);
    }
  }

  const key = tokenType === "warehouse" ? `warehouse:${warehouseId}` : "franchise";
  const previousToken = lastSentTokenByKey[key];
  if (bearerToken === previousToken) return;
  lastSentTokenByKey[key] = bearerToken;
  const panelName = tokenType === "franchise" ? "Bayi Paneli" : "Depo Paneli";
  console.log(
    `[Getir Token Yakalayıcı] ${panelName} token yakalandı${warehouseId ? ` (${WH.warehouseName(warehouseId)})` : ""}:`,
    bearerToken.substring(0, 20) + "..."
  );

  // Depo token'ı ~15 dk'da bir yenileniyor; content.js lastCapturedAt değişince
  // toast gösterdiği için sonraki yenilemeler ayrı damgaya yazılıyor
  const stampKey =
    tokenType === "warehouse" && previousToken
      ? "lastRefreshedAt_warehouse"
      : `lastCapturedAt_${tokenType}`;
  chrome.storage.local.set(
    {
      [`lastToken_${tokenType}`]: bearerToken,
      [stampKey]: new Date().toISOString(),
    },
    () => {
      console.log(`[Getir Token Yakalayıcı] ${panelName} token storage'a kaydedildi`);
    }
  );

  // Gönderilemezse 1 dk sonraki ilk istekte tekrar denensin (count her birkaç
  // saniyede geldiği için hemen sıfırlamak API'ye istek yağdırırdı)
  sendTokenToAPI(bearerToken, tokenType, warehouseId).then((ok) => {
    if (ok) return;
    setTimeout(() => {
      if (lastSentTokenByKey[key] === bearerToken) {
        lastSentTokenByKey[key] = null;
        if (tokenType === "warehouse") lastHandledWarehouseTokenByTab.delete(details.tabId);
      }
    }, 60 * 1000);
  });

  // Gateway'in kullandığı Bearer gerçekten Keycloak access_token'ı mı?
  if (tokenType === "warehouse") {
    checkOidcBearerMatch(bearerToken);
  }
}

// Token yakalama - webRequest API kullanarak
chrome.webRequest.onBeforeSendHeaders.addListener(
  function (details) {
    let tokenType = null;

    // Getir Bayi Paneli token'ı (franchise-api-gateway) — yeni panel /stocks'a
    // her sayfada gitmediği için gateway'e giden tüm veri isteklerinden alınıyor.
    // Bayi token'ı bir depoya bağlı değil (iki depoyu da kapsıyor).
    if (isFranchiseDataRequest(details.url)) tokenType = "franchise";

    // Getir Depo Paneli token'ı — panel token'ını kendisi yeniliyor; yeni token'ı
    // ilk taşıyan istek genelde Kontrol Paneli'nin count/orders sorgusu olduğu için
    // gateway'e giden tüm istekler dinleniyor
    if (details.url.includes("warehouse-panel-api-gateway.getirapi.com")) tokenType = "warehouse";

    if (!tokenType) return;

    // Authorization header'ını bul
    const authHeader = details.requestHeaders?.find(
      (header) => header.name.toLowerCase() === "authorization"
    );
    if (!authHeader || !authHeader.value) return;

    // Bearer token formatını kontrol et
    const token = authHeader.value;
    if (!token.startsWith("Bearer ")) return;
    const bearerToken = token.substring(7); // "Bearer " kısmını çıkar

    // Token formatını kontrol et (eyJ ile başlamalı)
    if (!(bearerToken.startsWith("eyJ") && bearerToken.length > 50)) {
      console.warn(`[Getir Token Yakalayıcı] Geçersiz token formatı:`, bearerToken.substring(0, 20) + "...");
      return;
    }

    handleCapturedToken(tokenType, bearerToken, details).catch((e) =>
      console.warn("[Getir Token Yakalayıcı] Token işlenemedi:", e)
    );
  },
  {
    urls: [
      "https://franchise-api-gateway.getirapi.com/*",
      "https://warehouse-panel-api-gateway.getirapi.com/*"
    ]
  },
  ["requestHeaders"]
);

function extractWarehouseIdFromUrl(url) {
  return WH.warehouseIdFromGatewayUrl(url);
}

let lastCapturedWarehouseId = null;

/** Bu bilgisayarda en son görülen (bilinen) depoyu saklar; token ve sevkiyat gönderiminde yedek olur */
function captureWarehouseId(warehouseId) {
  const id = WH.normalizeId(warehouseId);
  if (!id || !WH.isKnownWarehouse(id)) return;
  // Service worker yeniden başlayınca tekrar yazılır (zararsız)
  if (lastCapturedWarehouseId === id) return;
  lastCapturedWarehouseId = id;

  chrome.storage.local.set({
    lastWarehouseId: id,
    lastWarehouseIdCapturedAt: new Date().toISOString(),
  });
  console.log("[Getir Token Yakalayıcı] Depo algılandı:", WH.warehouseName(id));
}

chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    if (
      details.url.includes("warehouse-panel-api-gateway.getirapi.com") &&
      (details.url.includes("/products") || /transfer/i.test(details.url))
    ) {
      const fromUrl = extractWarehouseIdFromUrl(details.url);
      if (fromUrl) captureWarehouseId(fromUrl);
    }
  },
  {
    urls: [
      "https://warehouse-panel-api-gateway.getirapi.com/*/products*",
      "https://warehouse-panel-api-gateway.getirapi.com/*transfer*",
    ],
  }
);

// Token'ı Next.js API'ye gönderme (type bilgisi ile). Depo token'ı depo kimliğiyle gider:
// panel her depo için ayrı kayıt tutar, böylece bir deponun token'ı öbürünü ezmez.
async function sendTokenToAPI(token, type, warehouseId) {
  if (type === "warehouse" && !(warehouseId && WH.isKnownWarehouse(warehouseId))) {
    console.warn("[Getir Token Yakalayıcı] Depo bilinmiyor, depo token'ı panele gönderilmedi");
    return false;
  }
  const endpoints = [API_ENDPOINT];
  if (!USE_LOCAL_API) {
    endpoints.push("http://localhost:3000/api/token/save");
  }
  const panelName = type === "franchise" ? "Bayi Paneli" : "Depo Paneli";
  const body = JSON.stringify(type === "warehouse" ? { token, type, warehouseId } : { token, type });
  let anyOk = false;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (response.ok) {
        anyOk = true;
        const data = await response.json();
        console.log(
          `[Getir Token Yakalayıcı] ${panelName} token kaydedildi:`,
          endpoint,
          data
        );
      } else {
        const error = await response.text();
        console.warn(
          `[Getir Token Yakalayıcı] ${panelName} token kaydı:`,
          endpoint,
          error
        );
      }
    } catch (error) {
      console.warn(`[Getir Token Yakalayıcı] ${panelName} API:`, endpoint, error);
    }
  }

  if (anyOk) {
    chrome.action.setBadgeText({ text: "✓" });
    chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "" });
    }, 3000);
  } else {
    console.error(`[Getir Token Yakalayıcı] ${panelName} token hiçbir API'ye yazılamadı`);
    chrome.action.setBadgeText({ text: "✗" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "" });
    }, 3000);
  }
  return anyOk;
}

// -----------------------------
// Depo paneli oturum koruyucu (Keycloak)
// access_token 15 dk, refresh_token 3 saat yaşıyor. Access token bitmeden
// refresh_token ile yenileyip zinciri sürdürüyoruz; böylece kullanıcının
// token tazelemek için depo panelini yenilemesi gerekmiyor.
// -----------------------------

const OIDC_TOKEN_ENDPOINT =
  "https://stockid.getirapi.com/realms/getir-prod/protocol/openid-connect/token";
const OIDC_CLIENT_ID = "warehouse-panel-frontend-client";
const OIDC_ALARM_NAME = "warehouse-token-refresh";
// Access token'ın bitmesine bu kadar kalınca yenile
const OIDC_REFRESH_MARGIN_MS = 5 * 60 * 1000;
// Service worker uyusa da alarm uyandırır; her turda sadece süre kontrolü yapılır
const OIDC_CHECK_PERIOD_MINUTES = 2;
const OIDC_DEFAULT_EXPIRES_IN = 900;
const OIDC_DEFAULT_REFRESH_EXPIRES_IN = 10800;

function decodeJwtPayload(token) {
  try {
    const part = String(token || "").split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Depo gateway'ine giden Bearer ile Keycloak access_token'ı aynı aileden mi?
// Değilse otomatik yenileme yanlış token yazmasın diye bayrak kaldırıyoruz.
async function checkOidcBearerMatch(bearerToken) {
  try {
    const { oidcAccessToken } = await chrome.storage.local.get("oidcAccessToken");
    if (!oidcAccessToken) return;
    if (oidcAccessToken === bearerToken) {
      await chrome.storage.local.set({ oidcBearerMismatch: false });
      return;
    }
    const fromOidc = decodeJwtPayload(oidcAccessToken);
    const fromGateway = decodeJwtPayload(bearerToken);
    const sameIssuer =
      !!fromOidc?.iss && !!fromGateway?.iss && fromOidc.iss === fromGateway.iss;
    await chrome.storage.local.set({ oidcBearerMismatch: !sameIssuer });
    if (!sameIssuer) {
      console.warn(
        "[Getir Token Yakalayıcı] Depo Bearer'ı Keycloak token'ı değil, otomatik yenileme panele token yazmayacak"
      );
    }
  } catch (e) {
    console.warn("[Getir Token Yakalayıcı] Bearer eşleşme kontrolü:", e);
  }
}

async function ensureRefreshAlarm() {
  try {
    const existing = await chrome.alarms.get(OIDC_ALARM_NAME);
    if (existing) return;
    chrome.alarms.create(OIDC_ALARM_NAME, {
      delayInMinutes: 1,
      periodInMinutes: OIDC_CHECK_PERIOD_MINUTES,
    });
  } catch (e) {
    console.warn("[Getir Token Yakalayıcı] Yenileme alarmı kurulamadı:", e);
  }
}

async function clearOidcSession(reason) {
  await chrome.storage.local.remove([
    "oidcAccessToken",
    "oidcRefreshToken",
    "oidcExpiresAt",
    "oidcRefreshExpiresAt",
  ]);
  await chrome.storage.local.set({ oidcSessionEndedAt: new Date().toISOString() });
  console.warn(
    `[Getir Token Yakalayıcı] Depo oturumu sonlandı (${reason}). Depo paneline tekrar giriş yapın.`
  );
  chrome.action.setBadgeText({ text: "!" });
  chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
}

// Yenilenen access_token'ı panele yaz. Toast spam olmasın diye
// lastCapturedAt_warehouse'a dokunmuyoruz, ayrı bir zaman damgası tutuyoruz.
async function pushRefreshedWarehouseToken(accessToken) {
  const { oidcBearerMismatch, oidcWarehouseId } = await chrome.storage.local.get([
    "oidcBearerMismatch",
    "oidcWarehouseId",
  ]);
  if (oidcBearerMismatch === true) return;
  // Hangi depoya yazılacak: oturumun açıldığı depo; bilinmiyorsa bu bilgisayarda son görülen.
  // Depo bilinmiyorsa ya da token gönderimi kapalıysa panele gönderilmez.
  const warehouseId =
    (WH.isKnownWarehouse(oidcWarehouseId) ? WH.normalizeId(oidcWarehouseId) : null) ||
    (await lastKnownWarehouseId());
  if (!(await warehouseFeatureOn(warehouseId, "tokenSync"))) return;
  await chrome.storage.local.set({
    lastToken_warehouse: accessToken,
    lastRefreshedAt_warehouse: new Date().toISOString(),
  });
  await sendTokenToAPI(accessToken, "warehouse", warehouseId);
}

async function storeOidcTokens(data, source) {
  const accessToken = typeof data?.access_token === "string" ? data.access_token : "";
  const refreshToken = typeof data?.refresh_token === "string" ? data.refresh_token : "";
  if (!accessToken.startsWith("eyJ") || !refreshToken) return false;

  const now = Date.now();
  const payload = decodeJwtPayload(accessToken);
  const expiresAt = Number.isFinite(payload?.exp)
    ? payload.exp * 1000
    : now + positiveNumber(data.expires_in, OIDC_DEFAULT_EXPIRES_IN) * 1000;
  const refreshExpiresAt =
    now +
    positiveNumber(data.refresh_expires_in, OIDC_DEFAULT_REFRESH_EXPIRES_IN) * 1000;

  await chrome.storage.local.set({
    oidcAccessToken: accessToken,
    oidcRefreshToken: refreshToken,
    oidcExpiresAt: expiresAt,
    oidcRefreshExpiresAt: refreshExpiresAt,
    oidcUpdatedAt: new Date().toISOString(),
    oidcSource: source,
  });
  await chrome.storage.local.remove("oidcSessionEndedAt");
  await ensureRefreshAlarm();

  const minutes = Math.round((expiresAt - now) / 60000);
  console.log(
    `[Getir Token Yakalayıcı] Depo oturum token'ı güncellendi (${source}), ${minutes} dk geçerli`
  );
  return true;
}

let oidcRefreshInFlight = null;

function buildRefreshBody(refreshToken) {
  return new URLSearchParams({
    grant_type: "refresh_token",
    client_id: OIDC_CLIENT_ID,
    refresh_token: refreshToken,
  }).toString();
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === "complete") finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

// Bellekten atılmış sekmeyi geri yükle. İçinde iş kaybı riski yok, sekme zaten boşaltılmış.
async function reloadDiscardedWarehouseTab(tabId) {
  const before = (await chrome.storage.local.get("oidcUpdatedAt")).oidcUpdatedAt || "";
  try {
    await chrome.tabs.reload(tabId);
  } catch (e) {
    return { status: 0, body: `sekme yeniden yüklenemedi: ${(e && e.message) || e}`, via: "sekme" };
  }
  await waitForTabComplete(tabId, 20000);
  // Sayfanın kendi token isteğinin hook'a düşmesi için biraz pay bırak
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const after = (await chrome.storage.local.get("oidcUpdatedAt")).oidcUpdatedAt || "";
  if (after && after !== before) {
    return { status: 200, body: "", via: "sekme yeniden yüklendi", captured: true };
  }
  return { status: 0, body: "sekme yeniden yüklendi ama token yakalanamadı", via: "sekme" };
}

// Asıl yol: isteği depo sekmesinin içinden at. Keycloak yalnızca
// warehouse.getir.com origin'ini kabul ediyor (eklentiden atınca 403 "Invalid origin").
async function refreshViaWarehouseTab(refreshToken) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: "https://warehouse.getir.com/*" });
  } catch (e) {
    return { status: 0, body: String((e && e.message) || e), via: "sekme" };
  }
  const withId = (tabs || []).filter((t) => t.id != null);
  const usable = withId.filter((t) => !t.discarded);
  if (usable.length === 0) {
    if (withId.length === 0) {
      return { status: 0, body: "depo sekmesi açık değil", via: "sekme" };
    }
    // Chrome sekmeyi bellekten atmış: içine kod enjekte edilemez. Yeniden yükleyince
    // sayfa kendi token akışını çalıştırır, hook da yeni token'ı yakalar.
    return reloadDiscardedWarehouseTab(withId[0].id);
  }
  const tab = usable.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];

  try {
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      args: [OIDC_TOKEN_ENDPOINT, buildRefreshBody(refreshToken)],
      func: async (endpoint, body) => {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
          });
          return { status: res.status, body: (await res.text()).slice(0, 4000) };
        } catch (e) {
          return { status: 0, body: String((e && e.message) || e) };
        }
      },
    });
    const result = injected?.result;
    return {
      status: Number(result?.status) || 0,
      body: String(result?.body || ""),
      via: "sekme",
    };
  } catch (e) {
    return { status: 0, body: String((e && e.message) || e), via: "sekme" };
  }
}

async function refreshViaExtension(refreshToken) {
  try {
    const response = await fetch(OIDC_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: buildRefreshBody(refreshToken),
    });
    return {
      status: response.status,
      body: (await response.text()).slice(0, 4000),
      via: "eklenti",
    };
  } catch (e) {
    return { status: 0, body: String((e && e.message) || e), via: "eklenti" };
  }
}

async function performRefreshRequest(refreshToken) {
  const viaTab = await refreshViaWarehouseTab(refreshToken);
  if (viaTab.status === 200) return viaTab;
  // Sunucu cevap verdiyse (400/401 gibi) bu gerçek bir hatadır, ikinci yolu denemeye gerek yok
  if (viaTab.status !== 0) return viaTab;

  const viaExtension = await refreshViaExtension(refreshToken);
  if (viaExtension.status === 200) return viaExtension;
  return {
    status: viaExtension.status,
    body: `${viaExtension.body} · sekme yolu: ${viaTab.body}`,
    via: "eklenti",
  };
}

async function refreshWarehouseToken(reason) {
  if (oidcRefreshInFlight) return oidcRefreshInFlight;
  oidcRefreshInFlight = (async () => {
    const store = await chrome.storage.local.get([
      "oidcRefreshToken",
      "oidcRefreshExpiresAt",
    ]);
    const refreshToken = store.oidcRefreshToken;
    if (!refreshToken) {
      return { ok: false, detail: "Kayıtlı oturum yok, depo paneline giriş yapın" };
    }

    const refreshExpiresAt = Number(store.oidcRefreshExpiresAt) || 0;
    if (refreshExpiresAt && Date.now() >= refreshExpiresAt) {
      await clearOidcSession("refresh token süresi doldu");
      return { ok: false, detail: "Oturum süresi doldu, tekrar giriş yapın" };
    }

    const result = await performRefreshRequest(refreshToken);

    if (result.status !== 200) {
      const detail = `${result.via} · durum ${result.status || "ağ hatası"} · ${result.body.slice(0, 200)}`;
      console.warn("[Getir Token Yakalayıcı] Token yenilenemedi:", detail);
      // invalid_grant = refresh token gerçekten ölmüş; diğer hatalarda oturumu koru
      if (result.status === 400 && /invalid_grant/i.test(result.body)) {
        await clearOidcSession("invalid_grant");
      }
      return { ok: false, detail };
    }

    // Sekme yeniden yüklendiyse token'ı sayfanın kendi akışı üretti, hook da kaydetti
    if (result.captured) {
      const { oidcAccessToken } = await chrome.storage.local.get("oidcAccessToken");
      if (oidcAccessToken) await pushRefreshedWarehouseToken(oidcAccessToken);
      return { ok: true, detail: result.via };
    }

    let data = null;
    try {
      data = JSON.parse(result.body);
    } catch {
      return { ok: false, detail: `${result.via} · cevap okunamadı` };
    }

    const stored = await storeOidcTokens(data, `yenileme:${reason}`);
    if (!stored) {
      return { ok: false, detail: `${result.via} · cevapta token yok` };
    }
    await pushRefreshedWarehouseToken(data.access_token);
    return { ok: true, detail: `${result.via} üzerinden yenilendi` };
  })();

  try {
    return await oidcRefreshInFlight;
  } finally {
    oidcRefreshInFlight = null;
  }
}

// Sayfadan (content script üzerinden) gelen giriş/yenileme cevabı
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "WAREHOUSE_OIDC_TOKEN") return;
  (async () => {
    const stored = await storeOidcTokens(msg.data, "panel");
    // Oturumun hangi depoda açıldığını sakla: yenilenen token o depoya yazılır
    const warehouseId =
      WH.normalizeId(msg.warehouseId) || (await warehouseIdFromTab(sender?.tab?.id));
    if (stored && warehouseId && WH.isKnownWarehouse(warehouseId)) {
      await chrome.storage.local.set({ oidcWarehouseId: warehouseId });
    }
    sendResponse({ ok: stored });
  })();
  return true;
});

// Popup'tan manuel yenileme
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "WAREHOUSE_TOKEN_REFRESH_NOW") return;
  (async () => {
    const result = await refreshWarehouseToken("manuel");
    sendResponse(result);
  })();
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm || alarm.name !== OIDC_ALARM_NAME) return;
  (async () => {
    const store = await chrome.storage.local.get([
      "oidcRefreshToken",
      "oidcExpiresAt",
    ]);
    if (!store.oidcRefreshToken) return;
    const expiresAt = Number(store.oidcExpiresAt) || 0;
    if (expiresAt - Date.now() > OIDC_REFRESH_MARGIN_MS) return;
    const result = await refreshWarehouseToken("alarm");
    if (!result.ok) {
      console.warn("[Getir Token Yakalayıcı] Otomatik yenileme başarısız:", result.detail);
    }
  })();
});

// -----------------------------
// Sipariş detayı: elle düzeltilen barkodlar (ürün adı → barkod)
// Kayıt önce bu tarayıcıda uygulanır (orderBarcodeOverrides), sonra sunucuya gönderilir.
// Gönderilemeyenler orderBarcodeOverridesPending'de bekler, sonraki yenilemede tekrar denenir.
// -----------------------------

const BARCODE_OVERRIDES_PATH = "/api/order-barcode-overrides";
const BARCODE_OVERRIDES_ALARM = "order-barcode-overrides-refresh";
const BARCODE_OVERRIDES_PERIOD_MINUTES = 15;

function barcodeOverrideEndpoints() {
  const bases = [API_BASE];
  if (!USE_LOCAL_API) bases.push("http://localhost:3000");
  return bases.map((b) => `${b}${BARCODE_OVERRIDES_PATH}`);
}

function barcodeNameKey(name) {
  return String(name || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
}

async function postBarcodeOverride(name, barcode) {
  let lastError = "Sunucuya ulaşılamadı";
  for (const endpoint of barcodeOverrideEndpoints()) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, barcode }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) return { ok: true };
      lastError = data?.error || `HTTP ${res.status}`;
      // Doğrulama hatası her uçta aynı olur; diğerini denemeye gerek yok
      if (res.status === 400) return { ok: false, error: lastError, invalid: true };
    } catch (e) {
      lastError = String((e && e.message) || e);
    }
  }
  return { ok: false, error: lastError };
}

async function fetchServerBarcodeOverrides() {
  for (const endpoint of barcodeOverrideEndpoints()) {
    try {
      const res = await fetch(endpoint);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data.overrides && typeof data.overrides === "object") {
        return data.overrides;
      }
    } catch {
      /* sıradaki uç */
    }
  }
  return null;
}

/** Bekleyenleri göndermeyi dener, sunucu listesini alır, hâlâ bekleyenleri üstüne uygular. */
async function refreshBarcodeOverrides() {
  // Barkod özelliği kapalı depoda (Bostanlı) sunucuya hiç gidilmez
  if (!(await warehouseFeatureOn(await lastKnownWarehouseId(), "barcodeSearch"))) {
    return { ok: false, skipped: true, pending: 0 };
  }
  const store = await chrome.storage.local.get(["orderBarcodeOverrides", "orderBarcodeOverridesPending"]);
  const pending = { ...(store.orderBarcodeOverridesPending || {}) };
  for (const [key, item] of Object.entries(pending)) {
    const result = await postBarcodeOverride(item.name, item.barcode);
    if (result.ok || result.invalid) delete pending[key];
  }

  const server = await fetchServerBarcodeOverrides();
  const merged = { ...(server ?? store.orderBarcodeOverrides ?? {}) };
  for (const [key, item] of Object.entries(pending)) {
    if (item.barcode == null) delete merged[key];
    else merged[key] = { name: item.name, barcode: item.barcode, updatedAt: item.updatedAt };
  }
  await chrome.storage.local.set({
    orderBarcodeOverrides: merged,
    orderBarcodeOverridesPending: pending,
    orderBarcodeOverridesSyncedAt: server ? new Date().toISOString() : store.orderBarcodeOverridesSyncedAt ?? null,
  });
  return { ok: server != null, pending: Object.keys(pending).length };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "GETIRSTOK_BARCODE_OVERRIDE_SAVE") return;
  (async () => {
    const name = String(msg.name || "").replace(/\s+/g, " ").trim();
    const barcode = msg.barcode == null ? null : String(msg.barcode).trim();
    if (name.length < 2 || (barcode != null && !/^\d{4,20}$/.test(barcode))) {
      sendResponse({ ok: false, error: "Barkod 4–20 haneli rakam olmalı." });
      return;
    }
    const key = barcodeNameKey(name);
    const updatedAt = new Date().toISOString();
    const store = await chrome.storage.local.get(["orderBarcodeOverrides", "orderBarcodeOverridesPending"]);
    const overrides = { ...(store.orderBarcodeOverrides || {}) };
    const pending = { ...(store.orderBarcodeOverridesPending || {}) };
    if (barcode == null) delete overrides[key];
    else overrides[key] = { name, barcode, updatedAt };
    pending[key] = { name, barcode, updatedAt };
    // Önce bu tarayıcıda uygula: sipariş ekranı hemen güncellensin
    await chrome.storage.local.set({ orderBarcodeOverrides: overrides, orderBarcodeOverridesPending: pending });

    const result = await postBarcodeOverride(name, barcode);
    if (result.ok) {
      const latest = (await chrome.storage.local.get("orderBarcodeOverridesPending")).orderBarcodeOverridesPending || {};
      if (latest[key]?.updatedAt === updatedAt) {
        delete latest[key];
        await chrome.storage.local.set({ orderBarcodeOverridesPending: latest });
      }
    }
    sendResponse({ ok: true, synced: result.ok, error: result.ok ? null : result.error });
  })();
  return true;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "GETIRSTOK_BARCODE_OVERRIDES_REFRESH") return;
  refreshBarcodeOverrides().then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});

async function ensureBarcodeOverridesAlarm() {
  try {
    if (await chrome.alarms.get(BARCODE_OVERRIDES_ALARM)) return;
    chrome.alarms.create(BARCODE_OVERRIDES_ALARM, {
      delayInMinutes: 1,
      periodInMinutes: BARCODE_OVERRIDES_PERIOD_MINUTES,
    });
  } catch (e) {
    console.warn("[Getir Token Yakalayıcı] Barkod düzeltme alarmı kurulamadı:", e);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name !== BARCODE_OVERRIDES_ALARM) return;
  refreshBarcodeOverrides().catch((e) => console.warn("[Getir Token Yakalayıcı] Barkod düzeltmeleri yenilenemedi:", e));
});

chrome.runtime.onStartup.addListener(() => {
  ensureRefreshAlarm();
  ensureBarcodeOverridesAlarm();
  refreshBarcodeOverrides().catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => {
  ensureRefreshAlarm();
  ensureBarcodeOverridesAlarm();
  refreshBarcodeOverrides().catch(() => {});
});
ensureRefreshAlarm();
ensureBarcodeOverridesAlarm();

// -----------------------------
// Sayım penceresi: SKT kayıtlarından ürün stoğu (Getir sayımdaki ürünün stoğunu gizliyor)
// -----------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "GETIRSTOK_EXPIRY_STOCK") return;
  (async () => {
    const barcodes = Array.isArray(msg.barcodes) ? msg.barcodes.filter((b) => typeof b === "string") : [];
    const bases = [API_BASE];
    if (!USE_LOCAL_API) bases.push("http://localhost:3000");
    let lastError = "Sunucuya ulaşılamadı";
    for (const base of bases) {
      try {
        const res = await fetch(`${base}/api/warehouse-expiry-stock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ barcodes }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          sendResponse({ ok: true, barcodeToProductId: data.barcodeToProductId || {}, stocks: data.stocks || {} });
          return;
        }
        lastError = data?.error || `HTTP ${res.status}`;
        // Getir tarafı hatası (token vb.) her uçta aynı olur
        if (res.status !== 404) break;
      } catch (e) {
        lastError = String((e && e.message) || e);
      }
    }
    sendResponse({ ok: false, error: lastError });
  })();
  return true;
});

// -----------------------------
// Toplama modu: sipariş detayındaki ürünleri paneldeki geçici toplama listesine ekle
// -----------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "GETIRSTOK_PICKING_ADD") return;
  (async () => {
    const bases = [API_BASE];
    if (!USE_LOCAL_API) bases.push("http://localhost:3000");
    let lastError = "Sunucuya ulaşılamadı";
    for (const base of bases) {
      try {
        const res = await fetch(`${base}/api/picking-orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(msg.order || {}),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          sendResponse({ ok: true, items: data.items });
          return;
        }
        lastError = data?.error || `HTTP ${res.status}`;
        // Uç henüz yayında değilse (404) yerel sunucuyu dene; diğer hatalar her yerde aynı
        if (res.status !== 404) break;
      } catch (e) {
        lastError = String((e && e.message) || e);
      }
    }
    sendResponse({ ok: false, error: lastError });
  })();
  return true;
});

// -----------------------------
// Pişirme istatistikleri: depo başına ortak kayıt (her bilgisayar kendi dakikalarını gönderir)
// -----------------------------

async function bakeStatsRequest(path, init) {
  const bases = [API_BASE];
  if (!USE_LOCAL_API) bases.push("http://localhost:3000");
  let lastError = "Sunucuya ulaşılamadı";
  for (const base of bases) {
    try {
      const res = await fetch(`${base}${path}`, init);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) return { ok: true, data };
      lastError = data?.error || `HTTP ${res.status}`;
      if (res.status !== 404) break;
    } catch (e) {
      lastError = String((e && e.message) || e);
    }
  }
  return { ok: false, error: lastError };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "GETIRSTOK_BAKE_STATS_PUSH") return;
  bakeStatsRequest("/api/bakery-stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ warehouseId: msg.warehouseId, days: msg.days || {} }),
  }).then(sendResponse);
  return true;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "GETIRSTOK_BAKE_STATS_GET") return;
  const qs = new URLSearchParams({ warehouseId: msg.warehouseId || "", from: msg.from || "", to: msg.to || "" });
  bakeStatsRequest(`/api/bakery-stats?${qs}`, { method: "GET" }).then((r) =>
    sendResponse(r.ok ? { ok: true, days: r.data.days || {} } : r)
  );
  return true;
});

// Eklenti yüklendiğinde console'a bilgi ver
console.log("[Getir Token Yakalayıcı] Background service worker başlatıldı");

