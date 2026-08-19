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
  chrome.storage.local.get(["lastToken_warehouse", "lastCapturedAt_warehouse"], (result) => {
    if (result.lastToken_warehouse) {
      // Token var
      warehouseStatusDiv.className = "status success";
      warehouseStatusDiv.innerHTML = "✓ Depo Paneli token yakalandı!";
      
      warehouseTokenInfoDiv.style.display = "block";
      warehouseTokenInfoDiv.textContent = `Token: ${result.lastToken_warehouse.substring(0, 30)}...`;
      
      if (result.lastCapturedAt_warehouse) {
        const date = new Date(result.lastCapturedAt_warehouse);
        warehouseLastCapturedDiv.style.display = "block";
        warehouseLastCapturedDiv.textContent = `Yakalanma: ${date.toLocaleString("tr-TR")}`;
      }
      
      warehouseTestButton.disabled = false;
    } else {
      // Token yok
      warehouseStatusDiv.className = "status error";
      warehouseStatusDiv.innerHTML = "⚠ Depo Paneli token henüz yakalanmadı<br><small>warehouse.getir.com'da products sayfasını açın</small>";
      warehouseTokenInfoDiv.style.display = "none";
      warehouseLastCapturedDiv.style.display = "none";
      warehouseTestButton.disabled = true;
    }
  });
}

// İlk yükleme
loadFranchiseTokenStatus();
loadWarehouseTokenStatus();

// Storage değişikliklerini dinle (token yakalandığında otomatik güncelle)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") {
    if (changes.lastToken_franchise || changes.lastCapturedAt_franchise || changes.lastWarehouseId) {
      loadFranchiseTokenStatus();
    }
    if (changes.lastToken_warehouse || changes.lastCapturedAt_warehouse) {
      loadWarehouseTokenStatus();
    }
  }
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
