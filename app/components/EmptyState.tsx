import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  title: string;
  message: string;
  icon?: LucideIcon;
}

/**
 * Boş durumlar için bileşen (empty state).
 * Liste boş olduğunda veya arama sonucu bulunamadığında gösterilir.
 */
export function EmptyState({ title, message, icon: Icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      {Icon && (
        <Icon
          className="mb-4 size-12 text-zinc-400 dark:text-zinc-500"
          aria-hidden="true"
        />
      )}
      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 sm:text-lg">
        {title}
      </h3>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 sm:text-base">
        {message}
      </p>
    </div>
  );
}
