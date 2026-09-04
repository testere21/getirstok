// Background Service Worker - Token yakalama ve API'ye gönderme
// Hem Getir Bayi Paneli hem de Getir Depo Paneli token'larını yakalar

// Local test: true → localhost:3000 | Netlify deploy sonrası false yap
const USE_LOCAL_API = false;
const API_BASE = USE_LOCAL_API
  ? "http://localhost:3000"
  : "https://getirware.netlify.app";
const API_ENDPOINT = `${API_BASE}/api/token/save`;
const WAREHOUSE_ID_ENDPOINT = `${API_BASE}/api/warehouse-id/save`;
const TRANSFER_CAPTURE_ENDPOINT = `${API_BASE}/api/warehouse-transfer/capture`;

const PANEL_URL_PATTERNS = [
  "https://getirware.netlify.app/*",
  "http://localhost:3000/*",
  "http://127.0.0.1:3000/*",
];

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
              const input =
                document.querySelector('input[aria-label="Ürün ismi veya barkod ile ara"]') ||
                document.querySelector('input[placeholder*="ara"]') ||
                document.querySelector('input[type="text"]');
              if (!input) return { ok: false, reason: "input_not_found" };
              input.focus();
              input.value = v;
              // React kontrolü için input event
              input.dispatchEvent(new Event("input", { bubbles: true }));
              input.dispatchEvent(new Event("change", { bubbles: true }));
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

chrome.runtime.onMessage.addListener((msg) => {
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

  const payload = {
    url,
    method,
    requestBody,
    summary: msg.summary && typeof msg.summary === "object" ? msg.summary : null,
  };
  const endpoints = [TRANSFER_CAPTURE_ENDPOINT];
  if (!USE_LOCAL_API) {
    endpoints.push("http://localhost:3000/api/warehouse-transfer/capture");
  }

  (async () => {
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "BAKERY_SUGGESTIONS_SAVE") return;
  const items = Array.isArray(msg.items) ? msg.items : [];
  if (items.length === 0) {
    sendResponse({ ok: false, error: "empty" });
    return true;
  }
  (async () => {
    try {
      const response = await fetch(`${API_BASE}/api/bakery-suggestions/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const text = await response.text();
      if (response.ok) {
        console.log(
          "[Getir Token Yakalayıcı] Pişirme önerileri kaydedildi:",
          items.length,
          API_BASE
        );
        sendResponse({ ok: true, count: items.length });
      } else {
        console.error(
          "[Getir Token Yakalayıcı] Pişirme önerileri kaydedilemedi:",
          response.status,
          text
        );
        sendResponse({ ok: false, error: text, status: response.status });
      }
    } catch (e) {
      console.error("[Getir Token Yakalayıcı] Pişirme önerileri API hatası:", e);
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();
  return true;
});

// Token yakalama - webRequest API kullanarak
chrome.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    let tokenType = null;
    let shouldCapture = false;
    
    // Getir Bayi Paneli token'ı (franchise-api-gateway) - sadece /stocks endpoint'i için
    if (details.url.includes("franchise-api-gateway.getirapi.com/stocks")) {
      tokenType = "franchise";
      shouldCapture = true;
    }
    
    // Getir Depo Paneli token'ı — ürün ve transfer istekleri
    if (
      details.url.includes("warehouse-panel-api-gateway.getirapi.com") &&
      (details.url.includes("/products") || /transfer/i.test(details.url))
    ) {
      tokenType = "warehouse";
      shouldCapture = true;
    }
    
    if (shouldCapture && tokenType) {
      // Authorization header'ını bul
      const authHeader = details.requestHeaders?.find(
        (header) => header.name.toLowerCase() === "authorization"
      );

      if (authHeader && authHeader.value) {
        const token = authHeader.value;
        
        // Bearer token formatını kontrol et
        if (token.startsWith("Bearer ")) {
          const bearerToken = token.substring(7); // "Bearer " kısmını çıkar
          
          // Token formatını kontrol et (eyJ ile başlamalı)
          if (bearerToken.startsWith("eyJ") && bearerToken.length > 50) {
            const panelName = tokenType === "franchise" ? "Bayi Paneli" : "Depo Paneli";
            console.log(`[Getir Token Yakalayıcı] ${panelName} token yakalandı:`, bearerToken.substring(0, 20) + "...");
            
            // Token'ı storage'a kaydet (local) - her panel için ayrı
            chrome.storage.local.set({ 
              [`lastToken_${tokenType}`]: bearerToken,
              [`lastCapturedAt_${tokenType}`]: new Date().toISOString()
            }, () => {
              console.log(`[Getir Token Yakalayıcı] ${panelName} token storage'a kaydedildi`);
            });
            
            // Token'ı API'ye gönder (type bilgisi ile)
            sendTokenToAPI(bearerToken, tokenType);

            // Gateway'in kullandığı Bearer gerçekten Keycloak access_token'ı mı?
            if (tokenType === "warehouse") {
              checkOidcBearerMatch(bearerToken);
            }
          } else {
            console.warn(`[Getir Token Yakalayıcı] Geçersiz token formatı:`, bearerToken.substring(0, 20) + "...");
          }
        }
      }
    }
  },
  {
    urls: [
      "https://franchise-api-gateway.getirapi.com/stocks*",
      "https://warehouse-panel-api-gateway.getirapi.com/*/products*",
      "https://warehouse-panel-api-gateway.getirapi.com/*transfer*"
    ]
  },
  ["requestHeaders"]
);

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

function extractWarehouseIdFromUrl(url) {
  const match = String(url || "").match(/\/warehouse\/([a-fA-F0-9]{24})(?:\/|\?|$)/);
  return match ? match[1] : null;
}

let lastPostedWarehouseId = null;

function captureWarehouseId(warehouseId) {
  if (!warehouseId || !OBJECT_ID_RE.test(warehouseId)) return;
  // Service worker yeniden başlayınca tekrar kaydet (local/prod API değişimi için)
  if (lastPostedWarehouseId === warehouseId) return;
  lastPostedWarehouseId = warehouseId;

  chrome.storage.local.set({
    lastWarehouseId: warehouseId,
    lastWarehouseIdCapturedAt: new Date().toISOString(),
  });
  console.log("[Getir Token Yakalayıcı] Depo ID yakalandı:", warehouseId);
  sendWarehouseIdToAPI(warehouseId);
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

async function sendWarehouseIdToAPI(warehouseId) {
  try {
    const response = await fetch(WAREHOUSE_ID_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warehouseId }),
    });
    if (response.ok) {
      console.log("[Getir Token Yakalayıcı] Depo ID kaydedildi:", warehouseId);
    } else {
      const error = await response.text();
      console.error("[Getir Token Yakalayıcı] Depo ID kaydedilemedi:", error);
      lastPostedWarehouseId = null;
    }
  } catch (error) {
    console.error("[Getir Token Yakalayıcı] Depo ID API hatası:", error);
    lastPostedWarehouseId = null;
  }
}

// Token'ı Next.js API'ye gönderme (type bilgisi ile)
async function sendTokenToAPI(token, type) {
  const endpoints = [API_ENDPOINT];
  if (!USE_LOCAL_API) {
    endpoints.push("http://localhost:3000/api/token/save");
  }
  const panelName = type === "franchise" ? "Bayi Paneli" : "Depo Paneli";
  const body = JSON.stringify({ token, type });
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
  const { oidcBearerMismatch } = await chrome.storage.local.get("oidcBearerMismatch");
  if (oidcBearerMismatch === true) return;
  await chrome.storage.local.set({
    lastToken_warehouse: accessToken,
    lastRefreshedAt_warehouse: new Date().toISOString(),
  });
  await sendTokenToAPI(accessToken, "warehouse");
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
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "WAREHOUSE_OIDC_TOKEN") return;
  (async () => {
    const stored = await storeOidcTokens(msg.data, "panel");
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

chrome.runtime.onStartup.addListener(() => {
  ensureRefreshAlarm();
});
chrome.runtime.onInstalled.addListener(() => {
  ensureRefreshAlarm();
});
ensureRefreshAlarm();

// Eklenti yüklendiğinde console'a bilgi ver
console.log("[Getir Token Yakalayıcı] Background service worker başlatıldı");

