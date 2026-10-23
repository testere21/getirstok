import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BARCODE_PRODUCT_ID_FOUND_TTL_MS,
  BARCODE_PRODUCT_ID_MISSING_TTL_MS,
  createBarcodeProductIdCache,
} from "./barcodeProductIdCache";

function fakeResolver(known: Record<string, string>) {
  const calls: string[][] = [];
  const resolveMany = async (barcodes: string[]) => {
    calls.push([...barcodes]);
    return new Map(barcodes.filter((b) => known[b]).map((b) => [b, known[b]] as const));
  };
  return { calls, resolveMany };
}

test("çözülen ve bulunamayan barkodlar tekrar sorulmaz", async () => {
  const { calls, resolveMany } = fakeResolver({ a: "pa" });
  const cache = createBarcodeProductIdCache(resolveMany);
  assert.deepEqual([...(await cache.resolve(["a", "b"]))], [["a", "pa"]]);
  assert.deepEqual([...(await cache.resolve(["a", "b", "c"]))], [["a", "pa"]]);
  assert.deepEqual(calls, [["a", "b"], ["c"]]);
});

test("aynı anda gelen istekler aynı barkodu bir kez çözdürür", async () => {
  const { calls, resolveMany } = fakeResolver({ a: "pa", b: "pb" });
  const cache = createBarcodeProductIdCache(resolveMany);
  const [r1, r2] = await Promise.all([cache.resolve(["a", "b"]), cache.resolve(["b", "a"])]);
  assert.equal(r1.get("b"), "pb");
  assert.equal(r2.get("a"), "pa");
  assert.equal(calls.length, 1);
});

test("bulunamayan kısa, bulunan uzun süre tutulur", async () => {
  let t = 0;
  const { calls, resolveMany } = fakeResolver({ a: "pa" });
  const cache = createBarcodeProductIdCache(resolveMany, () => t);
  await cache.resolve(["a", "b"]);
  t = BARCODE_PRODUCT_ID_MISSING_TTL_MS + 1;
  await cache.resolve(["a", "b"]);
  t = BARCODE_PRODUCT_ID_FOUND_TTL_MS + 1;
  await cache.resolve(["a"]);
  assert.deepEqual(calls, [["a", "b"], ["b"], ["a"]]);
});

test("hata önbelleğe yazılmaz", async () => {
  let fail = true;
  const cache = createBarcodeProductIdCache(async (barcodes) => {
    if (fail) throw new Error("ağ");
    return new Map(barcodes.map((b) => [b, `p${b}`] as const));
  });
  assert.equal((await cache.resolve(["a"])).size, 0);
  fail = false;
  assert.equal((await cache.resolve(["a"])).get("a"), "pa");
});
