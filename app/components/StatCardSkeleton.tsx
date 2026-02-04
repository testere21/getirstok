/**
 * İstatistik kartları için skeleton loading component.
 * 3 adet kartı yan yana gösterir.
 */
export function StatCardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
        >
          <div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="mt-3 h-8 w-16 animate-pulse rounded bg-zinc-300 dark:bg-zinc-600 sm:mt-4 sm:h-9 sm:w-20" />
        </div>
      ))}
    </div>
  );
}
