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
    if (!looksLikeBakePayload(url, json)) return;
    window.postMessage({ source: "getirstok-bake-hook", url, json }, "*");
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

  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = async function (...args) {
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
    OrigXHR.prototype.open = function (method, url, ...rest) {
      this.__getirstokUrl = resolveUrl(url);
      this.__getirstokMethod = String(method || "GET").toUpperCase();
      return origOpen.call(this, method, url, ...rest);
    };
    OrigXHR.prototype.send = function (...args) {
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
        } catch {
          /* ignore */
        }
      });
      return origSend.apply(this, args);
    };
  }
})();
