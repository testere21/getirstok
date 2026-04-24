/**
 * Depo Paneli → Raf etiketi tablosunun kullandığı API’yi tarayıcı konsolundan çağırır.
 *
 * Kullanım:
 * 1) https://warehouse.getir.com üzerinde giriş yapılmış bir sekmede F12 → Console.
 * 2) Network’te `warehouse-product-shelves/filter` isteğini seç → Headers →
 *    `Authorization: Bearer eyJ...` değerindeki JWT’yi (Bearer kelimesi OLMADAN veya
 *    komple Bearer ile — aşağıdaki TOKEN’a yapıştır).
 * 3) PRODUCT_IDS içine tablodaki "Ürün ID" değerlerini yaz.
 * 4) Bu dosyanın tamamını konsola yapıştırıp Enter.
 *
 * Not: Token sayfa JS’inden okunamaz; Keycloak yenilediği için süre dolunca yeniden kopyala.
 */

(async function depoRafEtiketiFilterCek() {
  /** @type {string} JWT — Network’ten kopyala (ör. eyJhbGciOi...) */
  const TOKEN = "BURAYA_JWT_YAPIŞTIR";

  /** Adres çubuğundaki /r/{id}/... ile otomatik; yoksa varsayılan depo */
  const WAREHOUSE_ID =
    (typeof location !== "undefined" &&
      location.pathname.match(/\/r\/([a-f0-9]{24})\//i)?.[1]) ||
    "5dc32d8b734a192200caddf8";

  /** Tablodan — örnek: Çilek Paket satırındaki Ürün ID */
  const PRODUCT_IDS = ["5e2705de9b7e779f000fb8ec"];

  const offset = 0;
  const limit = 20;

  if (!TOKEN || TOKEN === "BURAYA_JWT_YAPIŞTIR" || TOKEN.length < 50) {
    console.error(
      "Önce Network → warehouse-product-shelves/filter → Authorization Bearer token’ını TOKEN sabitine yapıştır."
    );
    return;
  }

  const bearer = TOKEN.startsWith("Bearer ") ? TOKEN : `Bearer ${TOKEN}`;

  const url = `https://warehouse-panel-api-gateway.getirapi.com/warehouse-product-shelves/filter?offset=${offset}&limit=${limit}`;

  const body = {
    warehouseId: WAREHOUSE_ID,
    productIds: PRODUCT_IDS,
  };

  console.log("[raf filter] POST", url);
  console.log("[raf filter] body", body);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: bearer,
      "Content-Type": "application/json",
      accept: "application/json",
      countrycode: "TR",
      language: "tr",
      "x-requester-client": "warehouse-panel-frontend",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  console.log("[raf filter] HTTP", res.status, res.statusText);
  console.log("[raf filter] yanıt:", data);

  /** Satır özetleri (JSON ağacı değişirse path’leri güncelle) */
  try {
    const items =
      data?.data?.data?.products ??
      data?.data?.products ??
      data?.products ??
      [];
    if (Array.isArray(items) && items.length) {
      console.table(
        items.map((p) => ({
          id: p.id ?? p._id,
          name: p.name ?? p.fullName,
          barcodes: Array.isArray(p.barcodes) ? p.barcodes.join(", ") : p.barcode,
        }))
      );
    }
  } catch (e) {
    console.warn("[raf filter] özet çıkarılamadı", e);
  }

  return data;
})();
