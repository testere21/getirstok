/** Panel eksik kayıtları ile sevkiyat ürünlerinin kesişimi. Firestore yazılmaz. */

export type MissingMatchInput = {
  name: string;
  barcode: string;
  quantity: number;
  imageUrl?: string | null;
};

export type TransferMatchInput = {
  name: string | null;
  barcode: string | null;
  quantity: number | null;
  palletCodes: string[];
};

export type SevkiyatMatchRow = {
  displayName: string;
  missingQty: number;
  palletCodes: string[];
  transferQty: number | null;
  barcode: string | null;
  imageUrl: string | null;
};

export function normalizeSevkiyatBarcode(barcode: string): string {
  return barcode.trim();
}

export function normalizeSevkiyatName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

function transferKey(row: TransferMatchInput, index: number): string {
  const barcode = row.barcode ? normalizeSevkiyatBarcode(row.barcode) : "";
  if (barcode) return `b:${barcode}`;
  const name = row.name ? normalizeSevkiyatName(row.name) : "";
  if (name) return `n:${name}`;
  return `i:${index}`;
}

function mergeTransfers(rows: TransferMatchInput[]): TransferMatchInput {
  const palletCodes = [...new Set(rows.flatMap((row) => row.palletCodes))];
  let transferQty: number | null = null;
  for (const row of rows) {
    if (row.quantity == null) continue;
    transferQty = (transferQty ?? 0) + row.quantity;
  }
  const named = rows.find((row) => row.name?.trim());
  const barcoded = rows.find((row) => row.barcode?.trim());
  return {
    name: named?.name ?? rows[0]?.name ?? null,
    barcode: barcoded?.barcode ?? rows[0]?.barcode ?? null,
    quantity: transferQty,
    palletCodes,
  };
}

function toMatchRow(
  missingQty: number,
  missingName: string,
  transfer: TransferMatchInput,
  group: MissingGroup
): SevkiyatMatchRow {
  const displayName =
    missingName.trim() || transfer.name?.trim() || "İsimsiz ürün";
  const barcode =
    group.barcodeKey ||
    (transfer.barcode ? normalizeSevkiyatBarcode(transfer.barcode) : "") ||
    null;
  return {
    displayName,
    missingQty,
    palletCodes: [...transfer.palletCodes],
    transferQty: transfer.quantity,
    barcode,
    imageUrl: group.imageUrl,
  };
}

type MissingGroup = {
  missingQty: number;
  displayName: string;
  barcodeKey: string;
  nameKey: string;
  imageUrl: string | null;
};

function groupMissingItems(items: readonly MissingMatchInput[]): MissingGroup[] {
  const byBarcode = new Map<string, MissingGroup>();
  const byName = new Map<string, MissingGroup>();
  const nameless: MissingGroup[] = [];

  for (const item of items) {
    const qty = Number.isFinite(item.quantity) ? item.quantity : 0;
    const barcodeKey = normalizeSevkiyatBarcode(item.barcode || "");
    const nameKey = normalizeSevkiyatName(item.name || "");
    const displayName = item.name?.trim() || "";
    const imageUrl = item.imageUrl?.trim() || null;

    if (barcodeKey) {
      const existing = byBarcode.get(barcodeKey);
      if (existing) {
        existing.missingQty += qty;
        if (!existing.displayName && displayName) existing.displayName = displayName;
        if (!existing.imageUrl && imageUrl) existing.imageUrl = imageUrl;
        continue;
      }
      byBarcode.set(barcodeKey, {
        missingQty: qty,
        displayName,
        barcodeKey,
        nameKey,
        imageUrl,
      });
      continue;
    }

    if (nameKey) {
      const existing = byName.get(nameKey);
      if (existing) {
        existing.missingQty += qty;
        if (!existing.displayName && displayName) existing.displayName = displayName;
        if (!existing.imageUrl && imageUrl) existing.imageUrl = imageUrl;
        continue;
      }
      byName.set(nameKey, {
        missingQty: qty,
        displayName,
        barcodeKey: "",
        nameKey,
        imageUrl,
      });
      continue;
    }

    nameless.push({
      missingQty: qty,
      displayName,
      barcodeKey: "",
      nameKey: "",
      imageUrl,
    });
  }

  return [...byBarcode.values(), ...byName.values(), ...nameless];
}

/**
 * Eksik listedeki ürünlerden sevkiyatta da olanlar.
 * Barkod (trim) önce; yoksa / uyuşmazsa ad (tr, boşluk sıkıştırılmış).
 * Aynı ada birden fazla farklı sevkiyat SKU’su → eşleşme yok.
 */
export function matchMissingWithTransferProducts(
  missingItems: readonly MissingMatchInput[],
  transferProducts: readonly TransferMatchInput[]
): SevkiyatMatchRow[] {
  const consumed = new Set<number>();
  const byBarcode = new Map<string, number[]>();
  const byName = new Map<string, number[]>();

  transferProducts.forEach((row, index) => {
    const barcode = row.barcode ? normalizeSevkiyatBarcode(row.barcode) : "";
    if (barcode) {
      const list = byBarcode.get(barcode) ?? [];
      list.push(index);
      byBarcode.set(barcode, list);
    }
    const name = row.name ? normalizeSevkiyatName(row.name) : "";
    if (name) {
      const list = byName.get(name) ?? [];
      list.push(index);
      byName.set(name, list);
    }
  });

  function unusedIndices(indices: number[] | undefined): number[] {
    return (indices ?? []).filter((index) => !consumed.has(index));
  }

  function distinctTransferKeys(indices: number[]): string[] {
    return [
      ...new Set(indices.map((index) => transferKey(transferProducts[index], index))),
    ];
  }

  function takeTransfer(indices: number[]): TransferMatchInput | null {
    if (indices.length === 0) return null;
    if (distinctTransferKeys(indices).length !== 1) return null;
    indices.forEach((index) => consumed.add(index));
    return mergeTransfers(indices.map((index) => transferProducts[index]));
  }

  function matchByName(nameKey: string): TransferMatchInput | null {
    if (!nameKey) return null;
    const indices = unusedIndices(byName.get(nameKey));
    if (indices.length === 0) return null;
    if (distinctTransferKeys(indices).length !== 1) return null;
    return takeTransfer(indices);
  }

  const rows: SevkiyatMatchRow[] = [];

  for (const group of groupMissingItems(missingItems)) {
    if (group.missingQty <= 0) continue;

    let transfer: TransferMatchInput | null = null;
    if (group.barcodeKey) {
      transfer = takeTransfer(unusedIndices(byBarcode.get(group.barcodeKey)));
    }
    if (!transfer) {
      transfer = matchByName(group.nameKey);
    }
    if (!transfer) continue;

    rows.push(toMatchRow(group.missingQty, group.displayName, transfer, group));
  }

  return rows;
}

export function formatMissingMatchLine(row: SevkiyatMatchRow): string {
  const base = `${row.displayName} (${row.missingQty} eksik)`;
  if (row.palletCodes.length === 0) return base;
  return `${base} · ${row.palletCodes.join(", ")} paletinde var`;
}

export function sortIncomingProducts(
  rows: readonly TransferMatchInput[]
): TransferMatchInput[] {
  return [...rows].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "tr-TR", { sensitivity: "base" })
  );
}

export function summarizeIncomingProducts(rows: readonly TransferMatchInput[]): {
  skuCount: number;
  totalQty: number;
  missingQtyCount: number;
} {
  let totalQty = 0;
  let missingQtyCount = 0;
  for (const row of rows) {
    if (row.quantity == null) missingQtyCount += 1;
    else totalQty += row.quantity;
  }
  return { skuCount: rows.length, totalQty, missingQtyCount };
}

export function formatIncomingProductLine(row: TransferMatchInput): string {
  const name = row.name?.trim() || "İsimsiz";
  const barcode = row.barcode?.trim() || "barkod yok";
  const qty = row.quantity != null ? String(row.quantity) : "—";
  const pallets =
    row.palletCodes.length > 0 ? row.palletCodes.join(", ") : "";
  return pallets
    ? `${name} · ${barcode} · ${qty} · ${pallets}`
    : `${name} · ${barcode} · ${qty}`;
}

export function turkishToAscii(str: string): string {
  return str
    .replace(/ğ/g, "g")
    .replace(/Ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/Ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/Ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ö/g, "o")
    .replace(/Ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "c")
    .toLowerCase();
}

/**
 * Ürün adı, barkod veya palet kodu üzerinden esnek Türkçe arama.
 * Büyük/küçük harf ve Türkçe karakter toleranslıdır.
 */
export function searchMatchesIncomingProduct(
  product: {
    name: string | null;
    barcode: string | null;
    palletCodes?: string[];
  },
  query: string
): boolean {
  const q = query.trim();
  if (!q) return true;

  const qLower = q.toLocaleLowerCase("tr-TR");
  const qAscii = turkishToAscii(q);

  const name = product.name || "";
  const barcode = product.barcode || "";
  const pallets = (product.palletCodes || []).join(" ");

  const nameLower = name.toLocaleLowerCase("tr-TR");
  const nameAscii = turkishToAscii(name);
  const barcodeLower = barcode.toLowerCase();
  const palletsLower = pallets.toLowerCase();

  return (
    nameLower.includes(qLower) ||
    nameAscii.includes(qAscii) ||
    barcodeLower.includes(qLower) ||
    palletsLower.includes(qLower)
  );
}

/**
 * Gelen ürünleri palet koduna göre sıralar.
 * Paletli ürünler alfabetik/sayısal palet sırasına göre önce gelir,
 * aynı paletteki ürünler ada göre sıralanır.
 * Paletsiz ürünler en sona yerleştirilir.
 */
export function sortIncomingProductsByPallet(
  rows: readonly TransferMatchInput[]
): TransferMatchInput[] {
  return [...rows].sort((a, b) => {
    const palA = a.palletCodes && a.palletCodes.length > 0 ? a.palletCodes[0].trim() : "";
    const palB = b.palletCodes && b.palletCodes.length > 0 ? b.palletCodes[0].trim() : "";

    if (palA && !palB) return -1;
    if (!palA && palB) return 1;

    if (palA && palB && palA !== palB) {
      const cmp = palA.localeCompare(palB, "tr-TR", { numeric: true, sensitivity: "base" });
      if (cmp !== 0) return cmp;
    }

    return (a.name || "").localeCompare(b.name || "", "tr-TR", { sensitivity: "base" });
  });
}

export type IncomingPalletGroup = {
  palletCode: string;
  displayName: string;
  isNoPallet: boolean;
  products: TransferMatchInput[];
  skuCount: number;
  totalQty: number;
};

/**
 * Gelen ürünleri palet kodlarına göre gruplar.
 * Her palet için ürün listesi, SKU sayısı ve toplam miktar hesaplanır.
 * Paletsiz ürünler varsa listenin sonuna "Palet Kodu Yok" grubu olarak eklenir.
 */
export function groupIncomingProductsByPallet(
  rows: readonly TransferMatchInput[]
): IncomingPalletGroup[] {
  const palletMap = new Map<string, TransferMatchInput[]>();
  const noPalletProducts: TransferMatchInput[] = [];

  for (const row of rows) {
    if (row.palletCodes && row.palletCodes.length > 0) {
      for (const code of row.palletCodes) {
        const trimmed = code.trim();
        if (!trimmed) continue;
        const list = palletMap.get(trimmed) ?? [];
        list.push(row);
        palletMap.set(trimmed, list);
      }
    } else {
      noPalletProducts.push(row);
    }
  }

  const sortedCodes = [...palletMap.keys()].sort((a, b) =>
    a.localeCompare(b, "tr-TR", { numeric: true, sensitivity: "base" })
  );

  const groups: IncomingPalletGroup[] = sortedCodes.map((code) => {
    const products = sortIncomingProducts(palletMap.get(code)!);
    let totalQty = 0;
    for (const p of products) {
      if (p.quantity != null) totalQty += p.quantity;
    }
    return {
      palletCode: code,
      displayName: code,
      isNoPallet: false,
      products,
      skuCount: products.length,
      totalQty,
    };
  });

  if (noPalletProducts.length > 0) {
    const products = sortIncomingProducts(noPalletProducts);
    let totalQty = 0;
    for (const p of products) {
      if (p.quantity != null) totalQty += p.quantity;
    }
    groups.push({
      palletCode: "__NO_PALLET__",
      displayName: "Palet Kodu Yok",
      isNoPallet: true,
      products,
      skuCount: products.length,
      totalQty,
    });
  }

  return groups;
}

