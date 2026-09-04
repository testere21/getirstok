export function isDocumentVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

/** Sekme öne gelince bir kez çalışır. */
export function onDocumentBecameVisible(handler: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const onChange = () => {
    if (document.visibilityState === "visible") handler();
  };
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
