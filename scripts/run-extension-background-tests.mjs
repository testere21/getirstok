// chrome-extension/background.js: token ve sevkiyat gönderiminde depo ataması (sahte chrome API'siyle)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const extDir = join(root, "chrome-extension");

const SOG = "6113e59fbb8549d0f20e65f5";
const BOS = "5dc32dc9734a192200caddfb";
const ULU = "60b4d307df4c67250e096bfb";
const TOKEN = "eyJ" + "a".repeat(80);
const TOKEN2 = "eyJ" + "b".repeat(80);

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

/** Arka plan betiğini sahte chrome API'siyle yükler */
function loadBackground({ stored = {}, tabs = {} } = {}) {
  const store = { ...stored };
  const fetches = [];
  const listeners = { headers: null, beforeRequest: null, messages: [] };

  const readKeys = (keys) => {
    const out = {};
    const list = keys == null ? Object.keys(store) : Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys);
    for (const k of list) if (k in store) out[k] = store[k];
    return out;
  };

  const chrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          const out = readKeys(keys);
          if (typeof cb === "function") cb(out);
          return Promise.resolve(out);
        },
        set: (obj, cb) => {
          Object.assign(store, obj);
          if (typeof cb === "function") cb();
          return Promise.resolve();
        },
        remove: (keys, cb) => {
          for (const k of [].concat(keys)) delete store[k];
          if (typeof cb === "function") cb();
          return Promise.resolve();
        },
      },
    },
    tabs: {
      get: async (id) => {
        if (!(id in tabs)) throw new Error("no tab");
        return { id, url: tabs[id] };
      },
      query: async () => [],
      onUpdated: { addListener() {} },
      onRemoved: { addListener() {} },
      create: async () => ({}),
      update: async () => ({}),
    },
    webRequest: {
      onBeforeSendHeaders: { addListener: (fn) => (listeners.headers = fn) },
      onBeforeRequest: { addListener: (fn) => (listeners.beforeRequest = fn) },
    },
    runtime: {
      onMessage: { addListener: (fn) => listeners.messages.push(fn) },
      onStartup: { addListener() {} },
      onInstalled: { addListener() {} },
    },
    alarms: {
      get: async () => null,
      create() {},
      onAlarm: { addListener() {} },
    },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
    scripting: { executeScript: async () => [] },
    windows: { update: async () => ({}) },
  };

  const context = {
    chrome,
    URL,
    URLSearchParams,
    setTimeout: () => 0, // 60 sn'lik yeniden deneme zamanlayıcıları test sırasında çalışmasın
    clearTimeout() {},
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    console: { log() {}, warn() {}, error() {} },
    fetch: async (url, init) => {
      fetches.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
      return { ok: true, status: 200, json: async () => ({ success: true }), text: async () => "" };
    },
  };
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);
  context.importScripts = (file) => vm.runInContext(readFileSync(join(extDir, file), "utf8"), context, { filename: file });
  vm.runInContext(readFileSync(join(extDir, "background.js"), "utf8"), context, { filename: "background.js" });

  const sendMessage = (msg, sender = {}) =>
    new Promise((resolve) => {
      let responded = false;
      const sendResponse = (r) => {
        responded = true;
        resolve({ handled: true, response: r });
      };
      let handled = false;
      for (const fn of listeners.messages) {
        if (fn(msg, sender, sendResponse) === true) handled = true;
      }
      if (!handled) setTimeout(() => resolve({ handled: false }), 20);
      else setTimeout(() => !responded && resolve({ handled: true, response: undefined }), 100);
    });

  const captureToken = (url, token, tabId = -1) =>
    listeners.headers({
      url,
      tabId,
      requestHeaders: [{ name: "Authorization", value: `Bearer ${token}` }],
    });

  return { store, fetches, listeners, sendMessage, captureToken };
}

const GATEWAY = "https://warehouse-panel-api-gateway.getirapi.com/orders/count";
const tokenPosts = (fetches) => fetches.filter((f) => f.url.endsWith("/api/token/save"));

test("Soğukkuyu sekmesinden yakalanan depo token'ı Soğukkuyu kimliğiyle gider", async () => {
  const bg = loadBackground({ tabs: { 7: `https://warehouse.getir.com/r/${SOG}/dashboard` } });
  bg.captureToken(GATEWAY, TOKEN, 7);
  await tick();
  const posts = tokenPosts(bg.fetches);
  assert.ok(posts.length >= 1);
  for (const p of posts) {
    assert.deepEqual(p.body, { token: TOKEN, type: "warehouse", warehouseId: SOG });
  }
  assert.equal(bg.store.lastWarehouseId, SOG);
});

test("Bostanlı sekmesinden yakalanan depo token'ı Bostanlı kimliğiyle gider (Soğukkuyu'ya yazılmaz)", async () => {
  const bg = loadBackground({
    stored: { lastWarehouseId: SOG },
    tabs: { 9: `https://warehouse.getir.com/r/${BOS}/stock/stock-management/product/list` },
  });
  bg.captureToken(GATEWAY, TOKEN, 9);
  await tick();
  const posts = tokenPosts(bg.fetches);
  assert.ok(posts.length >= 1);
  for (const p of posts) assert.equal(p.body.warehouseId, BOS);
  assert.equal(bg.store.lastWarehouseId, BOS);
});

test("API adresindeki depo kimliği sekmeden önce gelir", async () => {
  const bg = loadBackground({ tabs: { 3: `https://warehouse.getir.com/r/${SOG}/dashboard` } });
  bg.captureToken(`https://warehouse-panel-api-gateway.getirapi.com/warehouse/${BOS}/products?x=1`, TOKEN, 3);
  await tick();
  for (const p of tokenPosts(bg.fetches)) assert.equal(p.body.warehouseId, BOS);
});

test("bilinmeyen depo sekmesinde depo token'ı hiçbir yere gönderilmez", async () => {
  const bg = loadBackground({
    stored: { lastWarehouseId: SOG },
    tabs: { 4: `https://warehouse.getir.com/r/${ULU}/dashboard` },
  });
  bg.captureToken(GATEWAY, TOKEN, 4);
  await tick();
  assert.equal(tokenPosts(bg.fetches).length, 0);
  assert.equal(bg.store.lastWarehouseId, SOG, "kayıtlı depo bozulmaz");
});

test("sekme bilinmiyorsa son görülen depo kullanılır; o da yoksa gönderilmez", async () => {
  const withStored = loadBackground({ stored: { lastWarehouseId: BOS } });
  withStored.captureToken(GATEWAY, TOKEN, -1);
  await tick();
  for (const p of tokenPosts(withStored.fetches)) assert.equal(p.body.warehouseId, BOS);
  assert.ok(tokenPosts(withStored.fetches).length >= 1);

  const empty = loadBackground();
  empty.captureToken(GATEWAY, TOKEN, -1);
  await tick();
  assert.equal(tokenPosts(empty.fetches).length, 0);
});

test("bayi token'ı depo kimliği olmadan gider", async () => {
  const bg = loadBackground();
  bg.captureToken("https://franchise-api-gateway.getirapi.com/stocks", TOKEN, 5);
  await tick();
  const posts = tokenPosts(bg.fetches);
  assert.ok(posts.length >= 1);
  for (const p of posts) assert.deepEqual(p.body, { token: TOKEN, type: "franchise" });
});

test("aynı token ikinci kez gönderilmez; yenisi gönderilir", async () => {
  const bg = loadBackground({ tabs: { 7: `https://warehouse.getir.com/r/${SOG}/dashboard` } });
  bg.captureToken(GATEWAY, TOKEN, 7);
  await tick();
  const first = tokenPosts(bg.fetches).length;
  bg.captureToken(GATEWAY, TOKEN, 7);
  await tick();
  assert.equal(tokenPosts(bg.fetches).length, first);
  bg.captureToken(GATEWAY, TOKEN2, 7);
  await tick();
  assert.equal(tokenPosts(bg.fetches).length, first * 2);
});

test("token gönderimi kilitli: kayıtlı 'kapalı' seçimi olsa bile depo token'ı gider", async () => {
  const bg = loadBackground({
    stored: { featureOverrides: { [BOS]: { tokenSync: false } } },
    tabs: { 9: `https://warehouse.getir.com/r/${BOS}/dashboard` },
  });
  bg.captureToken(GATEWAY, TOKEN, 9);
  await tick();
  assert.ok(tokenPosts(bg.fetches).length > 0);
});

test("sevkiyat yakalama: depo kimliğiyle gider, bilinmeyen depoda gitmez; seçimle kapatılamaz", async () => {
  const url = "https://warehouse-panel-api-gateway.getirapi.com/inbound/transfer?offset=1";
  const msg = (extra = {}) => ({ type: "WAREHOUSE_TRANSFER_CAPTURE", url, method: "GET", requestBody: null, summary: null, ...extra });
  const captures = (bg) => bg.fetches.filter((f) => f.url.endsWith("/api/warehouse-transfer/capture"));

  const bos = loadBackground({ tabs: { 9: `https://warehouse.getir.com/r/${BOS}/dashboard` } });
  await bos.sendMessage(msg({ warehouseId: BOS }), { tab: { id: 9 } });
  await tick();
  assert.ok(captures(bos).length >= 1);
  for (const c of captures(bos)) assert.equal(c.body.warehouseId, BOS);

  const fromTab = loadBackground({ tabs: { 9: `https://warehouse.getir.com/r/${SOG}/dashboard` } });
  await fromTab.sendMessage(msg(), { tab: { id: 9 } });
  await tick();
  for (const c of captures(fromTab)) assert.equal(c.body.warehouseId, SOG);
  assert.ok(captures(fromTab).length >= 1);

  const unknown = loadBackground({ tabs: { 9: `https://warehouse.getir.com/r/${ULU}/dashboard` } });
  await unknown.sendMessage(msg({ warehouseId: ULU }), { tab: { id: 9 } });
  await tick();
  assert.equal(captures(unknown).length, 0);

  const off = loadBackground({
    stored: { featureOverrides: { [BOS]: { transferCapture: false } } },
    tabs: { 9: `https://warehouse.getir.com/r/${BOS}/dashboard` },
  });
  await off.sendMessage(msg({ warehouseId: BOS }), { tab: { id: 9 } });
  await tick();
  assert.ok(captures(off).length >= 1, "transferCapture kilitli: kayıtlı seçim yok sayılır");
});

test("pişirme önerisi yükleme kaldırıldı: mesaj işlenmez, sunucuya istek gitmez", async () => {
  const bg = loadBackground();
  const r = await bg.sendMessage({ type: "BAKERY_SUGGESTIONS_SAVE", items: [{ name: "x", slots: { "08-12": 1 } }] });
  assert.equal(r.handled, false);
  assert.equal(bg.fetches.filter((f) => f.url.includes("bakery-suggestions")).length, 0);
});

test("barkod düzeltme senkronu Bostanlı'da sunucuya gitmez, Soğukkuyu'da gider", async () => {
  const bos = loadBackground({ stored: { lastWarehouseId: BOS } });
  const r1 = await bos.sendMessage({ type: "GETIRSTOK_BARCODE_OVERRIDES_REFRESH" });
  assert.equal(r1.response?.skipped, true);
  assert.equal(bos.fetches.length, 0);

  const sog = loadBackground({ stored: { lastWarehouseId: SOG } });
  await sog.sendMessage({ type: "GETIRSTOK_BARCODE_OVERRIDES_REFRESH" });
  assert.ok(sog.fetches.some((f) => f.url.includes("/api/order-barcode-overrides")));
});
