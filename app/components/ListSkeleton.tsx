/**
 * Liste için skeleton loading component.
 * 5-6 satır skeleton gösterir.
 */
export function ListSkeleton() {
  return (
    <div className="min-h-[120px]">
      <div className="max-h-[55vh] min-h-[8rem] overflow-auto">
        {/* Başlık satırı */}
        <div
          className="sticky top-0 z-[1] grid gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400 sm:gap-4 sm:px-4 sm:py-3 sm:text-sm"
          style={{ gridTemplateColumns: "3rem minmax(0,1fr) minmax(8rem,10rem) minmax(3rem,4rem) minmax(0,1fr) minmax(5rem,6rem)" }}
        >
          <span></span>
          <span>Ürün</span>
          <span>Barkod</span>
          <span>Miktar</span>
          <span>Notlar</span>
          <span className="text-right">İşlem</span>
        </div>
        {/* Skeleton satırları */}
        <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="grid gap-2 px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3"
              style={{ gridTemplateColumns: "3rem minmax(0,1fr) minmax(8rem,10rem) minmax(3rem,4rem) minmax(0,1fr) minmax(5rem,6rem)" }}
            >
              <div className="size-10 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="h-5 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="h-5 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="h-5 w-12 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="h-5 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="flex items-center justify-end gap-1">
                <div className="h-8 w-8 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-8 w-8 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
