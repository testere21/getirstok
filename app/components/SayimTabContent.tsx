"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ChevronDown, Package, Scale } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { SayimChangeModal } from "./SayimChangeModal";
import { formatTryPriceTRY } from "@/app/lib/utils";
import {
  SAYIM_DEFAULT_LOSS_LIMIT_TRY,
  matchSayimItems,
  summarizeSayimResult,
  type SayimCandidate,
  type SayimPair,
  type SayimSkipped,
} from "@/app/lib/sayimMatch";
import type { CatalogProduct, StockItemWithId } from "@/app/lib/types";

const LOSS_LIMIT_STORAGE_KEY = "getirstok.sayim.lossLimitTry";
const DEPTH_STORAGE_KEY = "getirstok.sayim.depth";

type SayimDepth = "main" | "sub";

interface SayimTabContentProps {
  missingItems: StockItemWithId[];
  extraItems: StockItemWithId[];
  /** Ana + alternatif barkodları içeren katalog haritası */
  catalogByBarcode: Map<string, CatalogProduct>;
  /** Onaylanan change'i uygular: iki kaydı da siler. Hata durumunda kendisi bildirir. */
  onApplyChange: (pair: SayimPair) => Promise<void>;
}

/** React key ve "uygulanıyor" takibi için çiftin kimliği */
function pairKey(pair: SayimPair): string {
  return `${pair.missing.id}-${pair.extra.id}`;
}

const SKIP_REASON_LABEL: Record<SayimSkipped["reason"], string> = {
  no_category: "kategorisi yok",
  no_price: "fiyatı yok",
  no_quantity: "adedi sıfır",
};

function normalizeBarcode(barcode: string): string {
  return barcode.trim().replace(/\s+/g, "");
}

/** Net tutar rengi: kâr yeşil, zarar kırmızı, başabaş nötr. */
function netToneClass(net: number): string {
  if (net > 0) return "text-emerald-600 dark:text-emerald-400";
  if (net < 0) return "text-red-600 dark:text-red-400";
  return "text-zinc-600 dark:text-zinc-300";
}

function formatNet(net: number): string {
  return net > 0 ? `+${formatTryPriceTRY(net)}` : formatTryPriceTRY(net);
}

/** Eşleşme kartındaki tek taraf (fazla veya eksik) */
function SayimSideRow({
  side,
  candidate,
}: {
  side: "extra" | "missing";
  candidate: SayimCandidate;
}) {
  const isExtra = side === "extra";
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {candidate.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- harici CDN ürün görseli
          <img
            src={candidate.imageUrl}
            alt=""
            className="size-9 shrink-0 rounded-md border border-zinc-200 object-contain dark:border-zinc-700"
          />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
            <Package className="size-4 text-zinc-400" aria-hidden />
          </span>
        )}
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
          style={{
            backgroundColor: isExtra
              ? "var(--color-extra)"
              : "var(--color-missing)",
          }}
        >
          {isExtra ? "Fazla" : "Eksik"}
        </span>
        <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {candidate.name || "İsimsiz ürün"}
        </span>
      </div>
      <span className="shrink-0 pl-1 text-xs tabular-nums text-zinc-600 sm:pl-0 sm:text-sm dark:text-zinc-300">
        {candidate.quantity} ad × {formatTryPriceTRY(candidate.unitPrice)} ={" "}
        <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
          {formatTryPriceTRY(candidate.total)}
        </strong>
      </span>
    </div>
  );
}

function SayimPairCard({
  pair,
  applying,
  onRequestChange,
}: {
  pair: SayimPair;
  applying: boolean;
  onRequestChange: (pair: SayimPair) => void;
}) {
  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
          {pair.category}
        </span>
        <span
          className={`shrink-0 text-sm font-bold tabular-nums ${netToneClass(pair.net)}`}
        >
          {formatNet(pair.net)}
        </span>
      </div>

      <div className="space-y-1.5">
        <SayimSideRow side="extra" candidate={pair.extra} />
        <SayimSideRow side="missing" candidate={pair.missing} />
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-zinc-100 pt-2.5 dark:border-zinc-700/60">
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          İki kayıt da tamamen kapanır
        </span>
        <button
          type="button"
          onClick={() => onRequestChange(pair)}
          disabled={applying}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          <ArrowLeftRight className="size-3.5" aria-hidden />
          {applying ? "Uygulanıyor…" : "Change yap"}
        </button>
      </div>
    </li>
  );
}

/** Katlanır alt bölüm — varsayılan kapalı */
function CollapsibleSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700/50"
      >
        <span>
          {title}{" "}
          <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
            ({count})
          </span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function PlainCandidateList({
  candidates,
  side,
}: {
  candidates: SayimCandidate[];
  side: "missing" | "extra";
}) {
  return (
    <ul className="space-y-1">
      {candidates.map((c) => (
        <li
          key={c.id}
          className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs dark:bg-zinc-900/40"
        >
          <span className="min-w-0 truncate text-zinc-800 dark:text-zinc-200">
            <span
              className="mr-1.5 font-semibold"
              style={{
                color:
                  side === "extra"
                    ? "var(--color-extra)"
                    : "var(--color-missing)",
              }}
            >
              {side === "extra" ? "Fazla" : "Eksik"}
            </span>
            {c.name || "İsimsiz ürün"}
          </span>
          <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
            {c.quantity} ad · {formatTryPriceTRY(c.total)} · {c.category}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SayimTabContent({
  missingItems,
  extraItems,
  catalogByBarcode,
  onApplyChange,
}: SayimTabContentProps) {
  const [lossLimit, setLossLimit] = useState(SAYIM_DEFAULT_LOSS_LIMIT_TRY);
  const [depth, setDepth] = useState<SayimDepth>("sub");
  const [confirmPair, setConfirmPair] = useState<SayimPair | null>(null);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);

  // Ayarlar mount sonrası okunur; sunucu render'ı ile uyumsuzluk olmasın.
  useEffect(() => {
    try {
      const storedLimit = window.localStorage.getItem(LOSS_LIMIT_STORAGE_KEY);
      if (storedLimit != null) {
        const parsed = Number(storedLimit);
        if (Number.isFinite(parsed) && parsed >= 0) setLossLimit(parsed);
      }
      const storedDepth = window.localStorage.getItem(DEPTH_STORAGE_KEY);
      if (storedDepth === "main" || storedDepth === "sub") setDepth(storedDepth);
    } catch {
      /* localStorage kapalı olabilir */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LOSS_LIMIT_STORAGE_KEY, String(lossLimit));
      window.localStorage.setItem(DEPTH_STORAGE_KEY, depth);
    } catch {
      /* yok sayılır */
    }
  }, [lossLimit, depth]);

  const result = useMemo(() => {
    const lookup = (barcode: string) =>
      catalogByBarcode.get(barcode) ??
      catalogByBarcode.get(normalizeBarcode(barcode));

    // Kaydın kendi görseli yoksa katalogdakini kullan
    const withImage = (items: StockItemWithId[]) =>
      items.map((item) =>
        item.imageUrl
          ? item
          : { ...item, imageUrl: lookup(item.barcode)?.imageUrl ?? null }
      );

    return matchSayimItems(withImage(missingItems), withImage(extraItems), {
      categoryOf: (barcode) => {
        const product = lookup(barcode);
        if (!product) return null;
        if (depth === "sub") {
          return product.subCategory ?? product.category ?? null;
        }
        return product.category ?? null;
      },
      priceOf: (barcode) => lookup(barcode)?.price ?? null,
      lossLimitTry: lossLimit,
    });
  }, [missingItems, extraItems, catalogByBarcode, depth, lossLimit]);

  const summary = useMemo(() => summarizeSayimResult(result), [result]);

  const withinLimitPairs = useMemo(
    () => result.pairs.filter((p) => !p.exceedsLimit),
    [result.pairs]
  );
  const exceedingPairs = useMemo(
    () => result.pairs.filter((p) => p.exceedsLimit),
    [result.pairs]
  );

  const applyConfirmedPair = async (pair: SayimPair) => {
    setApplyingKey(pairKey(pair));
    try {
      await onApplyChange(pair);
    } finally {
      setApplyingKey(null);
    }
  };

  const hasAnyInput = missingItems.length > 0 || extraItems.length > 0;

  return (
    <div className="flex max-h-[55vh] min-h-[8rem] flex-col overflow-hidden">
      {/* Ayarlar */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/50">
        <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200">
          Zarar sınırı
          <input
            type="number"
            min={0}
            step={5}
            value={lossLimit}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              setLossLimit(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
            }}
            className="w-20 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs tabular-nums text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            aria-label="Zarar sınırı (TL)"
          />
          <span className="text-zinc-500 dark:text-zinc-400">TL</span>
        </label>

        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Kategori derinliği"
        >
          {(
            [
              ["main", "Ana kategori"],
              ["sub", "Alt kategori"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setDepth(value)}
              aria-pressed={depth === value}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                depth === value
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs text-zinc-600 dark:text-zinc-300">
          <strong className="tabular-nums">{summary.withinLimitCount}</strong>{" "}
          çift · net{" "}
          <strong className={`tabular-nums ${netToneClass(summary.netTotal)}`}>
            {formatNet(summary.netTotal)}
          </strong>
        </span>
      </div>

      {/* Eşleşmeler */}
      <div className="flex-1 overflow-auto">
        {withinLimitPairs.length === 0 ? (
          <EmptyState
            title={
              hasAnyInput
                ? "Eşleşen çift bulunamadı"
                : "Sayım için kayıt yok"
            }
            message={
              hasAnyInput
                ? "Aynı kategoride, zarar sınırı içinde kalan bir eksik/fazla çifti çıkmadı. Zarar sınırını artırabilir veya aşağıdaki bölümlere bakabilirsiniz."
                : "Eksik ve fazla ürün ekledikçe aynı kategorideki kayıtlar burada karşılaştırılır."
            }
            icon={Scale}
          />
        ) : (
          <ul className="space-y-2 p-3">
            {withinLimitPairs.map((pair) => (
              <SayimPairCard
                key={pairKey(pair)}
                pair={pair}
                applying={applyingKey === pairKey(pair)}
                onRequestChange={setConfirmPair}
              />
            ))}
          </ul>
        )}

        <CollapsibleSection
          title="Zarar sınırını aşan çiftler"
          count={exceedingPairs.length}
        >
          <ul className="space-y-2">
            {exceedingPairs.map((pair) => (
              <SayimPairCard
                key={pairKey(pair)}
                pair={pair}
                applying={applyingKey === pairKey(pair)}
                onRequestChange={setConfirmPair}
              />
            ))}
          </ul>
        </CollapsibleSection>

        <CollapsibleSection
          title="Eşleşme bulunamayan kayıtlar"
          count={result.unmatchedMissing.length + result.unmatchedExtra.length}
        >
          <div className="space-y-2">
            <PlainCandidateList
              candidates={result.unmatchedMissing}
              side="missing"
            />
            <PlainCandidateList
              candidates={result.unmatchedExtra}
              side="extra"
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Sayıma giremeyen kayıtlar"
          count={result.skipped.length}
        >
          <ul className="space-y-1">
            {result.skipped.map((s) => (
              <li
                key={`${s.type}-${s.id}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs dark:bg-amber-950/30"
              >
                <span className="min-w-0 truncate text-zinc-800 dark:text-zinc-200">
                  <span
                    className="mr-1.5 font-semibold"
                    style={{
                      color:
                        s.type === "extra"
                          ? "var(--color-extra)"
                          : "var(--color-missing)",
                    }}
                  >
                    {s.type === "extra" ? "Fazla" : "Eksik"}
                  </span>
                  {s.name || "İsimsiz ürün"}
                </span>
                <span className="shrink-0 font-medium text-amber-700 dark:text-amber-400">
                  {SKIP_REASON_LABEL[s.reason]}
                </span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      </div>

      <SayimChangeModal
        pair={confirmPair}
        applying={confirmPair !== null && applyingKey === pairKey(confirmPair)}
        onClose={() => setConfirmPair(null)}
        onConfirm={() => {
          if (!confirmPair) return;
          const pair = confirmPair;
          void applyConfirmedPair(pair).then(() => setConfirmPair(null));
        }}
      />
    </div>
  );
}
