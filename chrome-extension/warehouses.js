// Depo tablosu ve özellik bayrakları — tek eklenti iki depoyu (Soğukkuyu, Bostanlı) kapsar.
//
// Bu dosya hem içerik betiğinde (manifest `content_scripts`, content.js'ten önce) hem de arka plan
// servis çalışanında (`importScripts`) yüklenir; ikisi de aynı kuralı kullanır.
//
// Depo, açık sayfanın adresindeki `/r/{24 hane}/` kimliğinden algılanır; kullanıcıya elle depo
// seçtirilmez. Tabloda olmayan (ya da hiç algılanamayan) depoda yalnızca temel özellikler açıktır.
//
// Her özelliğin depodaki varsayılanı aşağıdaki tabloda; ayarlar penceresi (Adım 9) kullanıcının
// "Açık / Kapalı" seçimini `chrome.storage.local` içindeki `featureOverrides` alanına yazar:
//   featureOverrides = { [depoKimliği]: { [özellik]: true | false } }   (yoksa depo varsayılanı)
(function (root) {
  const SOGUKKUYU_ID = "6113e59fbb8549d0f20e65f5";
  const BOSTANLI_ID = "5dc32dc9734a192200caddfb";

  /**
   * layout          Sadeleştirilmiş depo paneli görünümü (sekmeler, kartlar, tablo sayfaları, sayım penceresi)
   * boardSearch     Kontrol Paneli'nde paket arama kutusu (BNK kodu, kurye, toplayıcı, ürün içeriği)
   * bakery          Pişirme Önerileri sayfası, "Fırın" sekme rozeti ve sesli uyarı
   * bakeryStats     Pişirme istatistiği kaydı (depo başına, panele gönderilir)
   * barcodeSearch   Sipariş penceresinde barkod eşleştirme/gösterme ve "panelde ara" oku
   * picking         Sipariş penceresinden toplama listesine gönderme (TM düğmesi)
   * expiryStock     Sayım görevinde SKT kayıtlarından stok sütunu ve sistem stoğu yedeği
   * tokenSync       Depo paneli token'ı ve oturum yenileme bilgisini panele gönderme
   * transferCapture Sevkiyat için transfer listesi isteğini panele yakalama
   */
  const FEATURE_NAMES = [
    "layout",
    "boardSearch",
    "bakery",
    "bakeryStats",
    "barcodeSearch",
    "picking",
    "expiryStock",
    "tokenSync",
    "transferCapture",
  ];

  /**
   * Kilitli (kritik) özellikler: panele veri gönderen, bizim için zorunlu olanlar. Ayarlar penceresinde
   * gösterilmez ve kayıtlı bir seçim olsa bile yok sayılır; tanınan her depoda depo varsayılanı
   * (açık) geçerlidir. Tanınmayan depoda yine kapalıdır (panele veri gitmez).
   */
  const LOCKED_FEATURES = ["bakeryStats", "tokenSync", "transferCapture"];
  /** Kullanıcının bilgisayara özel açıp kapatabildiği özellikler */
  const EDITABLE_FEATURE_NAMES = FEATURE_NAMES.filter((name) => !LOCKED_FEATURES.includes(name));

  const FEATURE_LABELS = {
    layout: "Sadeleştirilmiş görünüm",
    boardSearch: "Ana ekranda paket arama kutusu",
    bakery: "Pişirme önerileri (rozet ve ses)",
    bakeryStats: "Pişirme istatistiği",
    barcodeSearch: "Barkod eşleştirme ve arama",
    picking: "Toplama modu",
    expiryStock: "Sayımda stok sütunu (SKT)",
    tokenSync: "Token gönderimi",
    transferCapture: "Sevkiyat yakalama",
  };

  /**
   * Sayfa/bölüm görünümleri (ayarlar penceresindeki "Sayfa Görünümleri"). Yalnızca "layout"
   * (Sadeleştirilmiş görünüm) açıkken geçerlidir; kapalıyken hepsi eski görünümdür.
   *   new     Eklentinin yeni (sadeleştirilmiş) görünümü
   *   old     Getir'in kendi eski görünümü (eklenti o sayfaya dokunmaz)
   *   hidden  Sayfanın içeriği gizlenir, yerinde kısa bir not görünür (yalnızca modes içinde "hidden" olanlar)
   * Seçimler `chrome.storage.local` içindeki `pageViews` alanında: { [depoKimliği]: { [sayfa]: mod } }
   */
  const VIEW_MODES = ["new", "old", "hidden"];
  const VIEW_MODE_LABELS = { new: "Yeni görünüm", old: "Eski görünüm", hidden: "Gizli" };
  const PAGE_VIEWS = [
    { key: "sidebar", label: "Sol menü", modes: ["new", "old"] },
    { key: "tabs", label: "Kontrol Paneli üst sekmeleri", modes: ["new", "old"] },
    { key: "board", label: "Sipariş panosu (sütunlar, kartlar)", modes: ["new", "old"] },
    { key: "courier", label: "Kurye / toplayıcı paneli", modes: ["new", "old"] },
    { key: "orderModal", label: "Sipariş detayı penceresi", modes: ["new", "old"] },
    { key: "removal", label: "Satıştan Kaldırma sayfası", modes: ["new", "old", "hidden"] },
    { key: "expiration", label: "Ürün Son Kullanma Tarihleri sayfası", modes: ["new", "old", "hidden"] },
    { key: "inventoryList", label: "Sayım Listesi sayfası", modes: ["new", "old", "hidden"] },
    { key: "returns", label: "İade Siparişler sayfası", modes: ["new", "old", "hidden"] },
    { key: "inventoryTask", label: "Sayım detayı penceresi", modes: ["new", "old"] },
  ];

  const WAREHOUSES = {
    [SOGUKKUYU_ID]: {
      id: SOGUKKUYU_ID,
      name: "Soğukkuyu",
      // Her iki depo da bu bilgisayara özel özelleştirilebilir (kilitli özellikler hariç, bkz. LOCKED_FEATURES)
      editable: true,
      features: {
        layout: true,
        boardSearch: true,
        bakery: true,
        bakeryStats: true,
        barcodeSearch: true,
        picking: true,
        expiryStock: true,
        tokenSync: true,
        transferCapture: true,
      },
    },
    [BOSTANLI_ID]: {
      id: BOSTANLI_ID,
      name: "Bostanlı",
      editable: true,
      features: {
        layout: true,
        boardSearch: true,
        bakery: true,
        bakeryStats: true,
        barcodeSearch: false,
        picking: false,
        expiryStock: false,
        tokenSync: true,
        transferCapture: true,
      },
    },
  };

  /** Depo algılanamadığında ya da tabloda olmadığında */
  const BASIC_FEATURES = {
    layout: true,
    boardSearch: false,
    bakery: false,
    bakeryStats: false,
    barcodeSearch: false,
    picking: false,
    expiryStock: false,
    tokenSync: false,
    transferCapture: false,
  };

  const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

  function normalizeId(id) {
    return typeof id === "string" && OBJECT_ID_RE.test(id.trim()) ? id.trim().toLowerCase() : null;
  }

  function isKnownWarehouse(id) {
    const key = normalizeId(id);
    return !!key && Object.prototype.hasOwnProperty.call(WAREHOUSES, key);
  }

  /** Ayarlar penceresinden özellikleri değiştirilebilen depo mu (tanınan her depo) */
  function isEditableWarehouse(id) {
    const key = normalizeId(id);
    return !!key && isKnownWarehouse(key) && WAREHOUSES[key].editable === true;
  }

  function warehouseName(id) {
    const key = normalizeId(id);
    return key && isKnownWarehouse(key) ? WAREHOUSES[key].name : null;
  }

  /** Sayfa adresi (yol): `/r/{24 hane}/...` → depo kimliği */
  function warehouseIdFromPath(pathname) {
    const match = String(pathname || "").match(/\/r\/([a-f0-9]{24})(?:\/|$)/i);
    return match ? match[1].toLowerCase() : null;
  }

  /** Tam adres: depo paneli sayfası (`/r/{id}/`) */
  function warehouseIdFromPageUrl(url) {
    try {
      return warehouseIdFromPath(new URL(String(url || "")).pathname);
    } catch {
      return null;
    }
  }

  /** Depo paneli API adresi: `.../warehouse/{24 hane}/...` → depo kimliği */
  function warehouseIdFromGatewayUrl(url) {
    const match = String(url || "").match(/\/warehouse\/([a-f0-9]{24})(?:\/|\?|$)/i);
    return match ? match[1].toLowerCase() : null;
  }

  /**
   * Depo için özelliklerin son hali: önce kullanıcının seçimi, yoksa depo varsayılanı.
   * Tabloda olmayan depoda ve kilitli özelliklerde (token, sevkiyat, fırın istatistiği) seçim dikkate alınmaz.
   */
  function featuresFor(warehouseId, overrides) {
    const key = normalizeId(warehouseId);
    const known = !!key && isKnownWarehouse(key);
    const base = known ? WAREHOUSES[key].features : BASIC_FEATURES;
    const chosen =
      known && WAREHOUSES[key].editable === true && overrides && typeof overrides === "object"
        ? overrides[key]
        : null;
    const out = {};
    for (const name of FEATURE_NAMES) {
      const value = chosen && typeof chosen === "object" && !LOCKED_FEATURES.includes(name) ? chosen[name] : undefined;
      out[name] = typeof value === "boolean" ? value : base[name] === true;
    }
    return out;
  }

  function featureEnabled(warehouseId, name, overrides) {
    return featuresFor(warehouseId, overrides)[name] === true;
  }

  function pageViewSpec(pageKey) {
    return PAGE_VIEWS.find((p) => p.key === pageKey) || null;
  }

  /**
   * Bir sayfanın görünümü: "new" | "old" | "hidden". Varsayılan "new".
   * Kullanıcı seçimi yalnızca değiştirilebilir (editable) depoda ve sayfanın izin verdiği modlarda geçerlidir;
   * tanınmayan depoda her zaman "new".
   */
  function pageViewFor(warehouseId, pageKey, pageViews) {
    const spec = pageViewSpec(pageKey);
    if (!spec) return "new";
    const key = normalizeId(warehouseId);
    if (!key || !isKnownWarehouse(key) || WAREHOUSES[key].editable !== true) return "new";
    const chosen = pageViews && typeof pageViews === "object" ? pageViews[key] : null;
    const value = chosen && typeof chosen === "object" ? chosen[pageKey] : undefined;
    return typeof value === "string" && spec.modes.includes(value) ? value : "new";
  }

  const api = {
    SOGUKKUYU_ID,
    BOSTANLI_ID,
    FEATURE_NAMES,
    LOCKED_FEATURES,
    EDITABLE_FEATURE_NAMES,
    FEATURE_LABELS,
    WAREHOUSES,
    BASIC_FEATURES,
    normalizeId,
    isKnownWarehouse,
    isEditableWarehouse,
    warehouseName,
    warehouseIdFromPath,
    warehouseIdFromPageUrl,
    warehouseIdFromGatewayUrl,
    featuresFor,
    featureEnabled,
    VIEW_MODES,
    VIEW_MODE_LABELS,
    PAGE_VIEWS,
    pageViewFor,
  };

  root.GETIRSTOK_WAREHOUSES = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
