// Popup script - İki panelin token durumunu ayrı ayrı gösterir

const franchiseStatusDiv = document.getElementById("franchiseStatus");
const franchiseTokenInfoDiv = document.getElementById("franchiseTokenInfo");
const franchiseLastCapturedDiv = document.getElementById("franchiseLastCaptured");
const franchiseWarehouseIdDiv = document.getElementById("franchiseWarehouseId");
const franchiseTestButton = document.getElementById("franchiseTestButton");

const warehouseStatusDiv = document.getElementById("warehouseStatus");
const warehouseTokenInfoDiv = document.getElementById("warehouseTokenInfo");
const warehouseLastCapturedDiv = document.getElementById("warehouseLastCaptured");
const warehouseTestButton = document.getElementById("warehouseTestButton");
const warehouseSessionDiv = document.getElementById("warehouseSession");
const warehouseRefreshButton = document.getElementById("warehouseRefreshButton");
const extensionVersionEl = document.getElementById("extensionVersion");
if (extensionVersionEl) {
  extensionVersionEl.textContent = `Sürüm ${chrome.runtime.getManifest().version}`;
}

// Local test: true → localhost:3000 | Netlify deploy sonrası false yap
const USE_LOCAL_API = false;
const API_BASE = USE_LOCAL_API
  ? "http://localhost:3000"
  : "https://getirware.netlify.app";
const API_ENDPOINT = `${API_BASE}/api/token/save`;

// Bayi Paneli (Franchise) token durumunu yükle
function loadFranchiseTokenStatus() {
  chrome.storage.local.get(
    ["lastToken_franchise", "lastCapturedAt_franchise", "lastWarehouseId", "lastWarehouseIdCapturedAt"],
    (result) => {
    if (result.lastToken_franchise) {
      // Token var
      franchiseStatusDiv.className = "status success";
      franchiseStatusDiv.innerHTML = "✓ Bayi Paneli token yakalandı!";
      
      franchiseTokenInfoDiv.style.display = "block";
      franchiseTokenInfoDiv.textContent = `Token: ${result.lastToken_franchise.substring(0, 30)}...`;
      
      if (result.lastCapturedAt_franchise) {
        const date = new Date(result.lastCapturedAt_franchise);
        franchiseLastCapturedDiv.style.display = "block";
        franchiseLastCapturedDiv.textContent = `Yakalanma: ${date.toLocaleString("tr-TR")}`;
      }
      
      franchiseTestButton.disabled = false;
    } else {
      // Token yok
      franchiseStatusDiv.className = "status error";
      franchiseStatusDiv.innerHTML = "⚠ Bayi Paneli token henüz yakalanmadı<br><small>franchise.getir.com'da stocks sayfasını açın</small>";
      franchiseTokenInfoDiv.style.display = "none";
      franchiseLastCapturedDiv.style.display = "none";
      franchiseTestButton.disabled = true;
    }

    if (result.lastWarehouseId) {
      franchiseWarehouseIdDiv.style.display = "block";
      const when = result.lastWarehouseIdCapturedAt
        ? ` (${new Date(result.lastWarehouseIdCapturedAt).toLocaleString("tr-TR")})`
        : "";
      franchiseWarehouseIdDiv.textContent = `Depo ID: ${result.lastWarehouseId}${when}`;
    } else {
      franchiseWarehouseIdDiv.style.display = "none";
    }
  }
  );
}

// Depo Paneli (Warehouse) token durumunu yükle
function loadWarehouseTokenStatus() {
  chrome.storage.local.get(
    ["lastToken_warehouse", "lastCapturedAt_warehouse", "lastRefreshedAt_warehouse"],
    (result) => {
    if (result.lastToken_warehouse) {
      // Token var
      warehouseStatusDiv.className = "status success";
      warehouseStatusDiv.innerHTML = "✓ Depo Paneli token yakalandı!";
      
      warehouseTokenInfoDiv.style.display = "block";
      warehouseTokenInfoDiv.textContent = `Token: ${result.lastToken_warehouse.substring(0, 30)}...`;
      
      const stamps = [result.lastCapturedAt_warehouse, result.lastRefreshedAt_warehouse]
        .filter(Boolean)
        .map((s) => new Date(s))
        .filter((d) => !Number.isNaN(d.getTime()))
        .sort((a, b) => b - a);
      if (stamps.length > 0) {
        warehouseLastCapturedDiv.style.display = "block";
        warehouseLastCapturedDiv.textContent = `Güncelleme: ${stamps[0].toLocaleString("tr-TR")}`;
      }

      warehouseTestButton.disabled = false;
    } else {
      // Token yok
      warehouseStatusDiv.className = "status error";
      warehouseStatusDiv.innerHTML = "⚠ Depo Paneli token henüz yakalanmadı<br><small>warehouse.getir.com açıkken sayfayı yenileyin veya Transfer Teslimat Listesi / ürün listesini açın</small>";
      warehouseTokenInfoDiv.style.display = "none";
      warehouseLastCapturedDiv.style.display = "none";
      warehouseTestButton.disabled = true;
    }
    }
  );
}

// Depo oturumunun otomatik yenileme durumu
function formatMinutes(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  return `${hours} sa ${minutes % 60} dk`;
}

function loadWarehouseSessionStatus() {
  chrome.storage.local.get(
    ["oidcRefreshToken", "oidcExpiresAt", "oidcRefreshExpiresAt", "oidcSessionEndedAt"],
    (result) => {
      const now = Date.now();
      const refreshExpiresAt = Number(result.oidcRefreshExpiresAt) || 0;
      const hasSession = !!result.oidcRefreshToken && refreshExpiresAt > now;

      warehouseRefreshButton.disabled = !hasSession;
      warehouseSessionDiv.style.display = "block";

      if (!hasSession) {
        warehouseSessionDiv.textContent = result.oidcSessionEndedAt
          ? "Oturum sonlandı — depo paneline tekrar giriş yapın"
          : "Otomatik yenileme pasif — depo paneline giriş yapın";
        return;
      }

      const expiresAt = Number(result.oidcExpiresAt) || 0;
      const tokenLeft = expiresAt > now ? formatMinutes(expiresAt - now) : "süresi doldu";
      warehouseSessionDiv.textContent = `Otomatik yenileme aktif · Token: ${tokenLeft} · Oturum: ${formatMinutes(
        refreshExpiresAt - now
      )}`;
    }
  );
}

// İlk yükleme
loadFranchiseTokenStatus();
loadWarehouseTokenStatus();
loadWarehouseSessionStatus();

// Storage değişikliklerini dinle (token yakalandığında otomatik güncelle)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") {
    if (changes.lastToken_franchise || changes.lastCapturedAt_franchise || changes.lastWarehouseId) {
      loadFranchiseTokenStatus();
    }
    if (
      changes.lastToken_warehouse ||
      changes.lastCapturedAt_warehouse ||
      changes.lastRefreshedAt_warehouse
    ) {
      loadWarehouseTokenStatus();
    }
    if (changes.oidcExpiresAt || changes.oidcRefreshToken || changes.oidcSessionEndedAt) {
      loadWarehouseSessionStatus();
    }
  }
});

// Depo token'ını elle yenile
warehouseRefreshButton.addEventListener("click", () => {
  warehouseRefreshButton.disabled = true;
  warehouseRefreshButton.textContent = "Yenileniyor...";
  chrome.runtime.sendMessage({ type: "WAREHOUSE_TOKEN_REFRESH_NOW" }, (res) => {
    warehouseRefreshButton.textContent = "Token'ı Şimdi Yenile";
    if (chrome.runtime.lastError) {
      alert(`Yenileme kanalı hatası: ${chrome.runtime.lastError.message}`);
    } else if (!res || !res.ok) {
      alert(`Token yenilenemedi.\n\n${(res && res.detail) || "Bilinmeyen hata"}`);
    }
    loadWarehouseTokenStatus();
    loadWarehouseSessionStatus();
  });
});

// Bayi Paneli test butonu
franchiseTestButton.addEventListener("click", async () => {
  franchiseTestButton.disabled = true;
  franchiseTestButton.textContent = "Gönderiliyor...";
  
  chrome.storage.local.get(["lastToken_franchise"], async (result) => {
    if (!result.lastToken_franchise) {
      alert("Bayi Paneli token bulunamadı!");
      franchiseTestButton.disabled = false;
      franchiseTestButton.textContent = "Token Test Et";
      return;
    }
    
    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          token: result.lastToken_franchise,
          type: "franchise"
        }),
      });
      
      if (response.ok) {
        alert("Bayi Paneli token başarıyla gönderildi!");
      } else {
        const error = await response.text();
        alert(`Hata: ${error}`);
      }
    } catch (error) {
      alert(`Hata: ${error.message}`);
    } finally {
      franchiseTestButton.disabled = false;
      franchiseTestButton.textContent = "Token Test Et";
    }
  });
});

// Depo Paneli test butonu
warehouseTestButton.addEventListener("click", async () => {
  warehouseTestButton.disabled = true;
  warehouseTestButton.textContent = "Gönderiliyor...";
  
  chrome.storage.local.get(["lastToken_warehouse"], async (result) => {
    if (!result.lastToken_warehouse) {
      alert("Depo Paneli token bulunamadı!");
      warehouseTestButton.disabled = false;
      warehouseTestButton.textContent = "Token Test Et";
      return;
    }
    
    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          token: result.lastToken_warehouse,
          type: "warehouse"
        }),
      });
      
      if (response.ok) {
        alert("Depo Paneli token başarıyla gönderildi!");
      } else {
        const error = await response.text();
        alert(`Hata: ${error}`);
      }
    } catch (error) {
      alert(`Hata: ${error.message}`);
    } finally {
      warehouseTestButton.disabled = false;
      warehouseTestButton.textContent = "Token Test Et";
    }
  });
});
