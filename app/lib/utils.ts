/**
 * Tarih/saat formatlama yardımcı fonksiyonları
 */

/**
 * ISO string formatındaki tarihi Türkçe formatına çevirir.
 * Format: "15.01.2024, 14:30"
 * @param dateString ISO string formatında tarih (örn: "2024-01-15T14:30:00.000Z")
 * @returns Formatlanmış tarih/saat string'i
 */
export function formatDateTime(dateString: string): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  // Geçersiz tarih kontrolü
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** YYYY-MM-DD → 20.08.2026 */
export function formatYmdToTr(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd.trim();
  return `${m[3]}.${m[2]}.${m[1]}`;
}

