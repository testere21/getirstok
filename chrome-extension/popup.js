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
      franchiseStatusDiv.innerHTML = "⚠ Bayi Paneli token henüz yakalanmadı<br><small>franchise-v2.getir.com'u açıp herhangi bir sayfaya girin</small>";
      franchiseTokenInfoDiv.style.display = "none";
      franchiseLastCapturedDiv.style.display = "none";
      franchiseTestButton.disabled = true;
    }

    if (result.lastWarehouseId) {
      franchiseWarehouseIdDiv.style.display = "block";
      const when = result.lastWarehouseIdCapturedAt
        ? ` (${new Date(result.lastWarehouseIdCapturedAt).toLocaleString("tr-TR")})`
        : "";
      const warehouseLabel = GETIRSTOK_WAREHOUSES.warehouseName(result.lastWarehouseId);
      franchiseWarehouseIdDiv.textContent = `Depo: ${warehouseLabel ? `${warehouseLabel} · ` : ""}${result.lastWarehouseId}${when}`;
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

// ---- Depo özellikleri (algılanan depo için, bu bilgisayara özel; parola ile korunur) ----
// Seçimler `featureOverrides` altında saklanır: { [depoKimliği]: { [özellik]: true | false } }.
// `chrome.storage.local` bu bilgisayardaki tarayıcıya özeldir: başka bilgisayara ya da hesaba geçmez.
// Seçilmeyen özellik depo varsayılanını kullanır. Token gönderimi, sevkiyat yakalama ve fırın istatistiği
// kilitlidir: bu pencerede gösterilmez ve depolanmış bir seçim olsa bile `warehouses.js` onu yok sayar.
// Parola yalnızca yanlışlıkla değişikliği önler (eklenti dosyaları okunabilir); güvenlik sınırı değildir.
const SETTINGS_PASSWORD_HASH = "cf2e709c876886c57926dfbc5d1b53b5b26c9933c66aca93ab400553ff5fd695";
const SETTINGS_PASSWORD_SALT = "getirstok-ayar:";
/** Ayarları düzenlenen depo: açık sekmedeki (yoksa son görülen) tanınan depo; yoksa null */
let settingsWarehouseId = null;

const settingsDetectedDiv = document.getElementById("settingsDetected");
const settingsLockDiv = document.getElementById("settingsLock");
const settingsPasswordInput = document.getElementById("settingsPassword");
const settingsUnlockButton = document.getElementById("settingsUnlockButton");
const settingsLockMsgDiv = document.getElementById("settingsLockMsg");
const settingsListDiv = document.getElementById("settingsList");
const settingsViewsDiv = document.getElementById("settingsViews");
const settingsNoteDiv = document.getElementById("settingsNote");
const settingsResetButton = document.getElementById("settingsResetButton");

let settingsOverrides = {};
let settingsPageViews = {};
let settingsUnlocked = false;
let settingsJustSaved = false;

function cleanOverrides(raw) {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

async function hashSettingsPassword(text) {
  const bytes = new TextEncoder().encode(SETTINGS_PASSWORD_SALT + text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function tryUnlockSettings() {
  const entered = settingsPasswordInput.value.trim();
  settingsPasswordInput.value = "";
  if (!entered) return;
  const hash = await hashSettingsPassword(entered);
  if (hash === SETTINGS_PASSWORD_HASH) {
    settingsUnlocked = true;
    settingsLockMsgDiv.textContent = "";
  } else {
    settingsUnlocked = false;
    settingsLockMsgDiv.className = "settings-note warn";
    settingsLockMsgDiv.textContent = "Parola yanlış. Ayarlar değiştirilmedi.";
  }
  renderSettings();
}

function settingsNote() {
  if (!settingsWarehouseId) {
    settingsNoteDiv.className = "settings-note";
    settingsNoteDiv.textContent = "";
    return;
  }
  const features = GETIRSTOK_WAREHOUSES.featuresFor(settingsWarehouseId, settingsOverrides);
  const warnings = [];
  if (!features.layout) {
    warnings.push("Sadeleştirilmiş görünüm kapalı: tüm sayfalar eski görünümde, aşağıdaki sayfa görünümleri uygulanmaz.");
  }
  if (features.picking && !features.barcodeSearch) {
    warnings.push("Toplama modu çalışması için barkod eşleştirme de açık olmalı.");
  }
  settingsNoteDiv.className = warnings.length ? "settings-note warn" : "settings-note";
  const base = settingsJustSaved
    ? "Kaydedildi. Değişiklik için açık Getir depo sayfalarını yenileyin."
    : "Değişiklikten sonra açık Getir depo sayfalarını yenileyin.";
  settingsNoteDiv.textContent = [...warnings, base].join(" ");
}

function renderSettings() {
  settingsLockDiv.style.display = settingsUnlocked ? "none" : "flex";
  if (settingsUnlocked) {
    settingsLockMsgDiv.className = "settings-note";
    settingsLockMsgDiv.textContent = "Kilit açık: popup kapanınca tekrar kilitlenir.";
  } else if (!settingsLockMsgDiv.textContent) {
    settingsLockMsgDiv.className = "settings-note";
    settingsLockMsgDiv.textContent = "Ayarları değiştirmek için parolayı girin.";
  }
  const editable = !!settingsWarehouseId && GETIRSTOK_WAREHOUSES.isEditableWarehouse(settingsWarehouseId);
  settingsResetButton.disabled = !settingsUnlocked || !editable;
  settingsListDiv.textContent = "";
  settingsViewsDiv.textContent = "";
  if (!editable) {
    settingsNote();
    return;
  }

  const defaults = GETIRSTOK_WAREHOUSES.WAREHOUSES[settingsWarehouseId].features;
  const mine = cleanOverrides(settingsOverrides[settingsWarehouseId]);
  for (const name of GETIRSTOK_WAREHOUSES.EDITABLE_FEATURE_NAMES) {
    const row = document.createElement("div");
    row.className = "feature-row";
    const label = document.createElement("span");
    label.textContent = GETIRSTOK_WAREHOUSES.FEATURE_LABELS[name] || name;
    const select = document.createElement("select");
    for (const [value, text] of [
      ["", `Varsayılan (${defaults[name] ? "açık" : "kapalı"})`],
      ["on", "Açık"],
      ["off", "Kapalı"],
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    }
    select.value = typeof mine[name] === "boolean" ? (mine[name] ? "on" : "off") : "";
    select.disabled = !settingsUnlocked;
    if (select.value) row.classList.add("changed");
    select.addEventListener("change", () => saveFeatureChoice(name, select.value));
    row.append(label, select);
    settingsListDiv.appendChild(row);
  }

  const chosenViews = cleanOverrides(settingsPageViews[settingsWarehouseId]);
  for (const page of GETIRSTOK_WAREHOUSES.PAGE_VIEWS) {
    const row = document.createElement("div");
    row.className = "feature-row";
    const label = document.createElement("span");
    label.textContent = page.label;
    const select = document.createElement("select");
    for (const mode of page.modes) {
      const option = document.createElement("option");
      option.value = mode;
      option.textContent = GETIRSTOK_WAREHOUSES.VIEW_MODE_LABELS[mode] || mode;
      select.appendChild(option);
    }
    const current = page.modes.includes(chosenViews[page.key]) ? chosenViews[page.key] : "new";
    select.value = current;
    select.disabled = !settingsUnlocked;
    if (current !== "new") row.classList.add("changed");
    select.addEventListener("change", () => savePageView(page.key, select.value));
    row.append(label, select);
    settingsViewsDiv.appendChild(row);
  }
  settingsNote();
}

function savePageView(pageKey, mode) {
  const warehouseId = settingsWarehouseId;
  if (!settingsUnlocked || !warehouseId || !GETIRSTOK_WAREHOUSES.isEditableWarehouse(warehouseId)) {
    renderSettings();
    return;
  }
  const page = GETIRSTOK_WAREHOUSES.PAGE_VIEWS.find((p) => p.key === pageKey);
  if (!page || !page.modes.includes(mode)) {
    renderSettings();
    return;
  }
  chrome.storage.local.get(["pageViews"], (result) => {
    const all = { ...cleanOverrides(result.pageViews) };
    const mine = { ...cleanOverrides(all[warehouseId]) };
    if (mode === "new") delete mine[pageKey];
    else mine[pageKey] = mode;
    if (Object.keys(mine).length > 0) all[warehouseId] = mine;
    else delete all[warehouseId];
    chrome.storage.local.set({ pageViews: all }, () => {
      settingsPageViews = all;
      settingsJustSaved = true;
      renderSettings();
    });
  });
}

function saveFeatureChoice(name, value) {
  // Kilit kapalıysa ya da depo değiştirilemezse hiçbir şey yazılmaz
  const warehouseId = settingsWarehouseId;
  if (
    !settingsUnlocked ||
    !warehouseId ||
    !GETIRSTOK_WAREHOUSES.isEditableWarehouse(warehouseId) ||
    GETIRSTOK_WAREHOUSES.LOCKED_FEATURES.includes(name)
  ) {
    renderSettings();
    return;
  }
  chrome.storage.local.get(["featureOverrides"], (result) => {
    const all = { ...cleanOverrides(result.featureOverrides) };
    const mine = { ...cleanOverrides(all[warehouseId]) };
    if (value === "on") mine[name] = true;
    else if (value === "off") mine[name] = false;
    else delete mine[name];
    if (Object.keys(mine).length > 0) all[warehouseId] = mine;
    else delete all[warehouseId];
    chrome.storage.local.set({ featureOverrides: all }, () => {
      settingsOverrides = all;
      settingsJustSaved = true;
      renderSettings();
    });
  });
}

function describeDetectedWarehouse(id, source) {
  if (!id) return "Depo algılanamadı. Getir depo paneli (warehouse.getir.com) sayfasını açın.";
  const name = GETIRSTOK_WAREHOUSES.warehouseName(id);
  const where = source === "tab" ? "Açık sekmedeki depo" : "Son görülen depo";
  return name
    ? `${where}: ${name}`
    : `${where}: tanınmayan depo (${id}). Yalnızca temel görünüm çalışır, panele veri gönderilmez.`;
}

function loadWarehouseSettings() {
  const finish = (tabWarehouseId) => {
    chrome.storage.local.get(["lastWarehouseId", "featureOverrides", "pageViews"], (result) => {
      settingsOverrides = cleanOverrides(result.featureOverrides);
      settingsPageViews = cleanOverrides(result.pageViews);
      const detectedId = tabWarehouseId || GETIRSTOK_WAREHOUSES.normalizeId(result.lastWarehouseId);
      settingsWarehouseId = detectedId && GETIRSTOK_WAREHOUSES.isEditableWarehouse(detectedId) ? detectedId : null;
      settingsDetectedDiv.textContent = describeDetectedWarehouse(detectedId, tabWarehouseId ? "tab" : "stored");
      renderSettings();
    });
  };
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      void chrome.runtime.lastError;
      finish(GETIRSTOK_WAREHOUSES.warehouseIdFromPageUrl(tabs && tabs[0] && tabs[0].url));
    });
  } catch {
    finish(null);
  }
}

settingsUnlockButton.addEventListener("click", tryUnlockSettings);
settingsPasswordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") tryUnlockSettings();
});

settingsResetButton.addEventListener("click", () => {
  const warehouseId = settingsWarehouseId;
  if (!settingsUnlocked || !warehouseId) return;
  chrome.storage.local.get(["featureOverrides", "pageViews"], (result) => {
    const all = { ...cleanOverrides(result.featureOverrides) };
    delete all[warehouseId];
    const views = { ...cleanOverrides(result.pageViews) };
    delete views[warehouseId];
    chrome.storage.local.set({ featureOverrides: all, pageViews: views }, () => {
      settingsOverrides = all;
      settingsPageViews = views;
      settingsJustSaved = true;
      renderSettings();
    });
  });
});

loadWarehouseSettings();

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
  
  chrome.storage.local.get(["lastToken_warehouse", "lastWarehouseId"], async (result) => {
    if (!result.lastToken_warehouse) {
      alert("Depo Paneli token bulunamadı!");
      warehouseTestButton.disabled = false;
      warehouseTestButton.textContent = "Token Test Et";
      return;
    }
    // Depo token'ı depo kimliğiyle gider; kimlik yoksa panel yanlış depoya yazmasın diye gönderilmez
    const warehouseId = GETIRSTOK_WAREHOUSES.normalizeId(result.lastWarehouseId);
    if (!warehouseId || !GETIRSTOK_WAREHOUSES.isKnownWarehouse(warehouseId)) {
      alert("Depo algılanamadı. Depo paneli (warehouse.getir.com) sayfasını açıp tekrar deneyin.");
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
          type: "warehouse",
          warehouseId
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
