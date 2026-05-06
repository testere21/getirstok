// Background Service Worker - Token yakalama ve API'ye gönderme
// Hem Getir Bayi Paneli hem de Getir Depo Paneli token'larını yakalar

// API endpoint - Production URL (farklı bilgisayarlarda çalışması için)
// Development için localhost kullanmak isterseniz bu satırı değiştirin:
// const API_ENDPOINT = "http://localhost:3000/api/token/save";
const API_ENDPOINT = "https://getirstok.netlify.app/api/token/save";

const PANEL_URL_PATTERNS = [
  "https://getirstok.netlify.app/*",
  "http://localhost:3000/*",
  "http://127.0.0.1:3000/*",
];

function buildPanelUrlWithQuery(query) {
  const base = "https://getirstok.netlify.app/";
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
    
    // Getir Depo Paneli token'ı (warehouse-panel-api-gateway) - /products endpoint'i için
    if (details.url.includes("warehouse-panel-api-gateway.getirapi.com") && 
        details.url.includes("/products")) {
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
      "https://warehouse-panel-api-gateway.getirapi.com/*/products*"
    ]
  },
  ["requestHeaders"]
);

// Token'ı Next.js API'ye gönderme (type bilgisi ile)
async function sendTokenToAPI(token, type) {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        token,
        type: type // "franchise" veya "warehouse"
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const panelName = type === "franchise" ? "Bayi Paneli" : "Depo Paneli";
      console.log(`[Getir Token Yakalayıcı] ${panelName} token başarıyla kaydedildi:`, data);
      
      // Badge'e başarı işareti göster
      chrome.action.setBadgeText({ text: "✓" });
      chrome.action.setBadgeBackgroundColor({ color: "#10b981" }); // Yeşil
      
      // 3 saniye sonra badge'i temizle
      setTimeout(() => {
        chrome.action.setBadgeText({ text: "" });
      }, 3000);
    } else {
      const error = await response.text();
      const panelName = type === "franchise" ? "Bayi Paneli" : "Depo Paneli";
      console.error(`[Getir Token Yakalayıcı] ${panelName} token kaydedilemedi:`, error);
      
      // Badge'e hata işareti göster
      chrome.action.setBadgeText({ text: "✗" });
      chrome.action.setBadgeBackgroundColor({ color: "#ef4444" }); // Kırmızı
      
      setTimeout(() => {
        chrome.action.setBadgeText({ text: "" });
      }, 3000);
    }
  } catch (error) {
    const panelName = type === "franchise" ? "Bayi Paneli" : "Depo Paneli";
    console.error(`[Getir Token Yakalayıcı] ${panelName} API hatası:`, error);
    
    // Badge'e hata işareti göster
    chrome.action.setBadgeText({ text: "✗" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
    
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "" });
    }, 3000);
  }
}

// Eklenti yüklendiğinde console'a bilgi ver
console.log("[Getir Token Yakalayıcı] Background service worker başlatıldı");

