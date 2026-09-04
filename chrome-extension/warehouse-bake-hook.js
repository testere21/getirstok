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

  function isWarehouseTransferUrl(url) {
    const u = String(url || "");
    return (
      u.includes("warehouse-panel-api-gateway.getirapi.com") &&
      /transfer/i.test(u)
    );
  }

  function stringifyFetchBody(body) {
    if (body == null) return null;
    if (typeof body === "string") return body.slice(0, 100000);
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
        preview: text.slice(0, 2500),
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
      const res = await origFetch.apply(this, args);
      try {
        const meta = getFetchMeta(args);
        const url = meta.url;
        if (
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
      this.addEventListener("load", function () {
        try {
          const url = this.__getirstokUrl || "";
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
              requestBody: null,
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
