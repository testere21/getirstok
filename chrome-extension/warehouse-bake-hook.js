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

  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = async function (...args) {
      const res = await origFetch.apply(this, args);
      try {
        const req = args[0];
        const url = String(
          typeof req === "string" ? req : req && req.url ? req.url : ""
        );
        if (
          url.includes("warehouse-panel-api-gateway.getirapi.com") ||
          /bak(e|ing)|oven|suggest|recommend/i.test(url)
        ) {
          const clone = res.clone();
          clone
            .json()
            .then((json) => publish(url, json))
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
      this.__getirstokUrl = String(url || "");
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
        } catch {
          /* ignore */
        }
      });
      return origSend.apply(this, args);
    };
  }
})();
