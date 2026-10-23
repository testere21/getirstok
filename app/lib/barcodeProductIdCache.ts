/** Bulunan eşleşme uzun, bulunamayan kısa süre tutulur (katalog sonradan eklenebilir) */
export const BARCODE_PRODUCT_ID_FOUND_TTL_MS = 6 * 60 * 60 * 1000;
export const BARCODE_PRODUCT_ID_MISSING_TTL_MS = 10 * 60 * 1000;

type Entry = { productId: string | null; at: number };

export type BarcodeProductIdCache = {
  resolve(barcodes: readonly string[]): Promise<Map<string, string>>;
};

/**
 * Barkod → ürün kimliği çözümlemesini bellekte tutar. Aynı anda gelen istekler aynı barkodu
 * ikinci kez çözdürmez.
 */
export function createBarcodeProductIdCache(
  resolveMany: (barcodes: string[]) => Promise<Map<string, string>>,
  now: () => number = Date.now
): BarcodeProductIdCache {
  const entries = new Map<string, Entry>();
  const inFlight = new Map<string, Promise<void>>();

  function fresh(barcode: string): Entry | null {
    const e = entries.get(barcode);
    if (!e) return null;
    const ttl = e.productId ? BARCODE_PRODUCT_ID_FOUND_TTL_MS : BARCODE_PRODUCT_ID_MISSING_TTL_MS;
    return now() - e.at < ttl ? e : null;
  }

  return {
    async resolve(barcodes) {
      const unique = [...new Set(barcodes)];
      const toFetch = unique.filter((b) => !fresh(b) && !inFlight.has(b));
      if (toFetch.length > 0) {
        const job = resolveMany(toFetch).then(
          (found) => {
            const at = now();
            for (const b of toFetch) entries.set(b, { productId: found.get(b) ?? null, at });
          },
          () => {
            /* hata önbelleğe yazılmaz; sonraki istek tekrar dener */
          }
        );
        const tracked = job.finally(() => {
          for (const b of toFetch) if (inFlight.get(b) === tracked) inFlight.delete(b);
        });
        for (const b of toFetch) inFlight.set(b, tracked);
      }
      await Promise.all(unique.map((b) => inFlight.get(b)).filter(Boolean));

      const result = new Map<string, string>();
      for (const b of unique) {
        const pid = entries.get(b)?.productId;
        if (pid) result.set(b, pid);
      }
      return result;
    },
  };
}
