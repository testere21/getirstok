// Content script - getirstok panel sayfasında çalışır.
// Background'tan gelen arama isteğini React uygulamasına iletir.

chrome.runtime.onMessage.addListener((msg) => {
  try {
    if (!msg || msg.type !== "GETIRSTOK_SEARCH") return;
    const query = typeof msg.query === "string" ? msg.query : "";
    window.postMessage(
      { source: "getirstok-extension", type: "SEARCH", query },
      "*"
    );
  } catch {
    // sessizce yut
  }
});

