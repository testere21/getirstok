// warehouse.getir.com MAIN world — pişirme önerisi API yanıtlarını yakala
(function () {
  function looksLikeBakePayload(url, json) {
    const u = String(url || "");
    if (/bak(e|ing)|oven|suggest|recommend|fresh-bak|pisirme|pişir/i.test(u)) {
      return true;
    }
    try {
      const s = JSON.stringify(json);
      if (s.length > 2_000_000) return false;
      return /08:00|20:00|12:00|16:00|bake|oven|suggest|Pişir|pisir|baking/i.test(
        s
      );
    } catch {
      return false;
    }
  }

  function publish(url, json) {
    publishHeatingEstimations(url, json);
    if (!looksLikeBakePayload(url, json)) return;
    window.postMessage({ source: "getirstok-bake-hook", url, json }, "*");
  }

  // Pişirme Önerileri sayfasının verisi (dilim başına öneri + Raf/Donuk stokları).
  // Cevap içerik betiği hazır olmadan gelebildiği için sessionStorage'a da yazılır.
  function publishHeatingEstimations(url, json) {
    if (!/\/heating-estimations(\?|$)/.test(String(url || ""))) return;
    if (!json || !Array.isArray(json.data)) return;
    lastHeatingAt = Date.now();
    try {
      sessionStorage.setItem("getirstok.heatingEstimations", JSON.stringify(json));
    } catch {
      /* depolama dolu / kapalı */
    }
    window.postMessage({ source: "getirstok-heating-estimations", json }, window.location.origin);
  }

  // Keycloak token endpoint'i: hem giriş hem yenileme cevapları buradan geçer
  function isOidcTokenUrl(url) {
    return /\/protocol\/openid-connect\/token(\?|$)/.test(String(url || ""));
  }

  function publishOidcToken(url, json) {
    if (!json || typeof json !== "object") return;
    if (typeof json.access_token !== "string") return;
    if (typeof json.refresh_token !== "string") return;
    window.postMessage(
      {
        source: "getirstok-oidc-hook",
        url: String(url || ""),
        data: {
          access_token: json.access_token,
          refresh_token: json.refresh_token,
          expires_in: json.expires_in,
          refresh_expires_in: json.refresh_expires_in,
        },
      },
      window.location.origin
    );
  }

  function isWarehouseTransferUrl(url) {
    const u = String(url || "");
    if (!u.includes("warehouse-panel-api-gateway.getirapi.com")) return false;
    if (/receiving-windows|transfer-orders/i.test(u)) return false;
    if (/\/inbound\/transfer(\/|\?|$)/i.test(u)) return true;
    return /\/inbound\//i.test(u) && /product|item|sku|pallet|line/i.test(u);
  }

  function stringifyFetchBody(body) {
    if (body == null) return null;
    if (typeof body === "string") return body.slice(0, 100000);
    if (typeof Uint8Array !== "undefined" && body instanceof Uint8Array) {
      try {
        return new TextDecoder().decode(body).slice(0, 100000);
      } catch {
        return null;
      }
    }
    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
      return body.toString().slice(0, 100000);
    }
    if (typeof Blob !== "undefined" && body instanceof Blob) return null;
    if (typeof FormData !== "undefined" && body instanceof FormData) return null;
    if (typeof body === "object") {
      try {
        return JSON.stringify(body).slice(0, 100000);
      } catch {
        return null;
      }
    }
    return null;
  }

  function resolveUrl(url) {
    try {
      return new URL(String(url || ""), window.location.href).href;
    } catch {
      return String(url || "");
    }
  }

  function getFetchMeta(args) {
    const req = args[0];
    const init = args[1] && typeof args[1] === "object" ? args[1] : {};
    let url = "";
    let method = "GET";
    let requestBody = null;
    if (typeof req === "string") {
      url = resolveUrl(req);
      method = String(init.method || "GET").toUpperCase();
      requestBody = stringifyFetchBody(init.body);
    } else if (req && typeof req === "object") {
      url = resolveUrl(req.url || "");
      method = String(req.method || init.method || "GET").toUpperCase();
      requestBody = stringifyFetchBody(init.body);
    }
    return { url, method, requestBody };
  }

  function summarizeJson(json) {
    try {
      const text = JSON.stringify(json);
      return {
        byteLength: text.length,
        preview: text.slice(0, 12000),
        topKeys:
          json && typeof json === "object" && !Array.isArray(json)
            ? Object.keys(json).slice(0, 40)
            : [],
      };
    } catch {
      return { byteLength: 0, preview: "", topKeys: [] };
    }
  }

  function publishTransfer(meta, json) {
    if (!isWarehouseTransferUrl(meta.url)) return;
    window.postMessage(
      {
        source: "getirstok-transfer-hook",
        url: meta.url,
        method: meta.method,
        requestBody: meta.requestBody,
        summary: summarizeJson(json),
      },
      "*"
    );
  }

  function extractProductBarcodesFromNode(node, out) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) extractProductBarcodesFromNode(item, out);
      return;
    }
    const name =
      typeof node.name === "string"
        ? node.name
        : typeof node.productName === "string"
          ? node.productName
          : typeof node.fullName === "string"
            ? node.fullName
            : null;
    const barcode =
      typeof node.barcode === "string" && node.barcode.trim()
        ? node.barcode.trim()
        : typeof node.clientProductId === "string" && /^\d{6,}$/.test(node.clientProductId.trim())
          ? node.clientProductId.trim()
          : Array.isArray(node.barcodes) && node.barcodes.length > 0 && typeof node.barcodes[0] === "string"
            ? node.barcodes[0].trim()
            : null;

    if (name && barcode) {
      const cleanName = name.replace(/\s+/g, " ").trim();
      out[cleanName] = barcode;
      out[cleanName.toLowerCase()] = barcode;
    }

    for (const v of Object.values(node)) {
      if (v && typeof v === "object") {
        extractProductBarcodesFromNode(v, out);
      }
    }
  }

  function publishOrderBarcodes(json) {
    if (!json || typeof json !== "object") return;
    const barcodes = {};
    extractProductBarcodesFromNode(json, barcodes);
    if (Object.keys(barcodes).length > 0) {
      window.postMessage(
        {
          source: "getirstok-order-barcodes",
          barcodes,
        },
        "*"
      );
    }
  }

  // ── Pişirme önerilerini sayfa açılmadan da çek ──
  // Getir isteği depoyu başlıklarla seçiyor (adreste depo yok); bu yüzden panelin kendi
  // gateway isteklerinin başlıkları kopyalanır. Token'ı panel yeniledikçe son başlıklar da yenilenir.
  const GATEWAY_HOST = "warehouse-panel-api-gateway.getirapi.com";
  const HEATING_URL = `https://${GATEWAY_HOST}/heating-estimations`;
  const HEATING_HEADERS_KEY = "getirstok.heatingHeaders";
  const HEATING_POLL_MS = 60 * 1000;
  const SKIPPED_HEADERS = new Set(["content-type", "content-length"]);
  let lastGatewayHeaders = null;
  let lastHeatingAt = 0;
  let heatingPollBusy = false;

  function plainHeaders(headers) {
    const out = {};
    if (!headers) return out;
    try {
      if (typeof Headers !== "undefined" && headers instanceof Headers) {
        headers.forEach((v, k) => (out[k.toLowerCase()] = v));
      } else if (Array.isArray(headers)) {
        for (const [k, v] of headers) out[String(k).toLowerCase()] = String(v);
      } else if (typeof headers === "object") {
        for (const [k, v] of Object.entries(headers)) {
          if (v != null) out[k.toLowerCase()] = String(v);
        }
      }
    } catch {
      /* okunamayan başlık */
    }
    return out;
  }

  function rememberGatewayHeaders(url, headers) {
    if (!String(url || "").includes(GATEWAY_HOST)) return;
    if (!headers || !headers.authorization) return;
    const clean = {};
    for (const [k, v] of Object.entries(headers)) {
      if (!SKIPPED_HEADERS.has(k)) clean[k] = v;
    }
    const first = !lastGatewayHeaders;
    lastGatewayHeaders = clean;
    if (/\/heating-estimations(\?|$)/.test(String(url))) {
      const template = { ...clean };
      delete template.authorization;
      try {
        localStorage.setItem(HEATING_HEADERS_KEY, JSON.stringify(template));
      } catch {
        /* depolama kapalı */
      }
    }
    if (first) setTimeout(pollHeating, 2000);
  }

  function heatingHeaders() {
    let template = {};
    try {
      template = JSON.parse(localStorage.getItem(HEATING_HEADERS_KEY) || "{}") || {};
    } catch {
      template = {};
    }
    return { ...template, ...lastGatewayHeaders };
  }

  async function pollHeating() {
    if (heatingPollBusy || !lastGatewayHeaders) return;
    // 00:00–08:00 arası pişirme dilimi yok
    if (new Date().getHours() < 8) return;
    // Getir az önce kendisi çektiyse (Pişirme Önerileri sayfası açık) tekrar sorma
    if (Date.now() - lastHeatingAt < HEATING_POLL_MS / 2) return;
    heatingPollBusy = true;
    try {
      const res = await origFetch(HEATING_URL, {
        method: "GET",
        headers: heatingHeaders(),
        credentials: "include",
      });
      if (res.ok) publishHeatingEstimations(HEATING_URL, await res.json());
    } catch {
      /* ağ hatası: bir sonraki turda tekrar */
    } finally {
      heatingPollBusy = false;
    }
  }

  setInterval(pollHeating, HEATING_POLL_MS);

  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = async function (...args) {
      try {
        const req = args[0];
        const init = args[1] && typeof args[1] === "object" ? args[1] : {};
        const headers = {
          ...(req && typeof req === "object" ? plainHeaders(req.headers) : {}),
          ...plainHeaders(init.headers),
        };
        rememberGatewayHeaders(resolveUrl(typeof req === "string" ? req : req?.url), headers);
      } catch {
        /* ignore */
      }
      let capturedBody = null;
      try {
        const req = args[0];
        const init = args[1] && typeof args[1] === "object" ? args[1] : {};
        capturedBody = stringifyFetchBody(init.body);
        if (!capturedBody && req && typeof req === "object" && typeof req.clone === "function") {
          capturedBody = stringifyFetchBody(req.body);
          if (!capturedBody) {
            capturedBody = (await req.clone().text()).slice(0, 100000);
          }
        }
      } catch {
        capturedBody = null;
      }
      const res = await origFetch.apply(this, args);
      try {
        const meta = getFetchMeta(args);
        if (!meta.requestBody && capturedBody) meta.requestBody = capturedBody;
        const url = meta.url;
        if (isOidcTokenUrl(url)) {
          res
            .clone()
            .json()
            .then((json) => publishOidcToken(url, json))
            .catch(() => {});
        } else if (
          url.includes("warehouse-panel-api-gateway.getirapi.com") ||
          /bak(e|ing)|oven|suggest|recommend/i.test(url)
        ) {
          const clone = res.clone();
          clone
            .json()
            .then((json) => {
              publish(url, json);
              publishTransfer(meta, json);
              publishOrderBarcodes(json);
            })
            .catch(() => {});
        }
      } catch {
        /* ignore */
      }
      return res;
    };
  }

  const OrigXHR = window.XMLHttpRequest;
  if (OrigXHR) {
    const origOpen = OrigXHR.prototype.open;
    const origSend = OrigXHR.prototype.send;
    const origSetRequestHeader = OrigXHR.prototype.setRequestHeader;
    OrigXHR.prototype.open = function (method, url, ...rest) {
      this.__getirstokUrl = resolveUrl(url);
      this.__getirstokMethod = String(method || "GET").toUpperCase();
      this.__getirstokHeaders = {};
      return origOpen.call(this, method, url, ...rest);
    };
    OrigXHR.prototype.setRequestHeader = function (name, value) {
      try {
        if (this.__getirstokHeaders) this.__getirstokHeaders[String(name).toLowerCase()] = String(value);
      } catch {
        /* ignore */
      }
      return origSetRequestHeader.call(this, name, value);
    };
    OrigXHR.prototype.send = function (...args) {
      try {
        rememberGatewayHeaders(this.__getirstokUrl, this.__getirstokHeaders);
      } catch {
        /* ignore */
      }
      const rawBody = args[0];
      this.__getirstokRequestBody =
        typeof rawBody === "string"
          ? rawBody.slice(0, 100000)
          : stringifyFetchBody(rawBody);
      this.addEventListener("load", function () {
        try {
          const url = this.__getirstokUrl || "";
          if (isOidcTokenUrl(url)) {
            publishOidcToken(url, JSON.parse(this.responseText));
            return;
          }
          if (
            !url.includes("warehouse-panel-api-gateway.getirapi.com") &&
            !/bak(e|ing)|oven|suggest|recommend/i.test(url)
          ) {
            return;
          }
          const json = JSON.parse(this.responseText);
          publish(url, json);
          publishTransfer(
            {
              url,
              method: this.__getirstokMethod || "GET",
              requestBody: this.__getirstokRequestBody || null,
            },
            json
          );
          publishOrderBarcodes(json);
        } catch {
          /* ignore */
        }
      });
      return origSend.apply(this, args);
    };
  }
})();
