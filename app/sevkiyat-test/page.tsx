"use client";

import { useState } from "react";
import Link from "next/link";

type TransferRow = {
  id: string | null;
  transferOrderNumber: string | null;
  inboundDeliveryId: string | null;
  palletStatus: string | null;
  skuCount: number | null;
  palletCodes: string[];
};

type ProductRow = {
  name: string | null;
  barcode: string | null;
  quantity: number | null;
  palletCodes: string[];
};

type TestResult = {
  success: boolean;
  step?: string;
  error?: string;
  transferCount?: number;
  productCount?: number;
  transfers?: TransferRow[];
  products?: ProductRow[];
  detailError?: string | null;
  listCapture?: { url: string; method: string; capturedAt: string } | null;
  detailCapture?: { url: string; method: string; capturedAt: string } | null;
};

export default function SevkiyatTestPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function runTest() {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/warehouse-transfer/test");
      const json = (await response.json()) as TestResult;
      setResult(json);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "İstek atılamadı",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          ← Panele dön
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50 sm:text-2xl">
          Sevkiyat test
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Panel entegrasyonundan önce depo API&apos;sinin transfer ürünlerini
          getirip getirmediğini kontrol eder. Sonuç yeşilse sonraki adımda
          Sevkiyat kontrol butonunu panele bağlarız.
        </p>
      </div>

      <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
        <li>
          Chrome eklentisini <strong>1.2.3</strong> sürümüne güncelleyip
          (chrome://extensions → yenile) warehouse sekmesini yenileyin.
        </li>
        <li>
          Depo panelinde <strong>Transfer Teslimat Listesi</strong>ni açın,
          tarihi seçip Uygula&apos;ya basın.
        </li>
        <li>
          Ürün testi için bir satırdaki <strong>+</strong> ile detayı açıp{" "}
          <strong>Ürünler</strong> bölümünü genişletin.
        </li>
        <li>Bu sayfada Testi çalıştır&apos;a basın.</li>
      </ol>

      <button
        type="button"
        onClick={() => void runTest()}
        disabled={loading}
        className="w-fit rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {loading ? "Çalışıyor…" : "Testi çalıştır"}
      </button>

      {result && (
        <div className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
          <p
            className={`text-sm font-medium ${
              result.success && (result.productCount || 0) > 0
                ? "text-emerald-700 dark:text-emerald-400"
                : result.success
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-red-700 dark:text-red-400"
            }`}
          >
            {result.success && (result.productCount || 0) > 0
              ? `Ürünler geldi (${result.productCount} satır).`
              : result.success && result.step === "need_detail_capture"
                ? `Liste geldi (${result.transferCount} teslimat). Ürün için + detayını açın.`
                : result.error || result.detailError || "Kısmi sonuç"}
          </p>

          {result.listCapture && (
            <p className="break-all text-xs text-zinc-500">
              Liste: {result.listCapture.method} {result.listCapture.url}
            </p>
          )}
          {result.detailCapture && (
            <p className="break-all text-xs text-zinc-500">
              Detay: {result.detailCapture.method} {result.detailCapture.url}
            </p>
          )}

          {result.transfers && result.transfers.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Teslimatlar</h2>
              <ul className="space-y-1 text-sm">
                {result.transfers.map((row, i) => (
                  <li key={`${row.id || i}`} className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-800">
                    {row.transferOrderNumber || row.id || "—"}
                    {row.skuCount != null ? ` · SKU ${row.skuCount}` : ""}
                    {row.palletStatus ? ` · ${row.palletStatus}` : ""}
                    {row.palletCodes.length > 0
                      ? ` · ${row.palletCodes.join(", ")}`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.products && result.products.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Ürünler</h2>
              <ul className="space-y-1 text-sm">
                {result.products.map((row, i) => (
                  <li key={`${row.barcode || row.name || i}`} className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-800">
                    {row.name || "İsimsiz"}
                    {row.quantity != null ? ` (${row.quantity})` : ""}
                    {row.barcode ? ` · ${row.barcode}` : ""}
                    {row.palletCodes.length > 0
                      ? ` · ${row.palletCodes.join(", ")}`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
