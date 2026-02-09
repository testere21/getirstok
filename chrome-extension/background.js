// Background Service Worker - Token yakalama ve API'ye gönderme
// Hem Getir Bayi Paneli hem de Getir Depo Paneli token'larını yakalar

// API endpoint - Development için localhost, Production için netlify.app
// Not: Production'a deploy ederken bu URL'i güncelleyin
const API_ENDPOINT = "http://localhost:3000/api/token/save";
// Production URL: "https://getirstok.netlify.app/api/token/save"

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

