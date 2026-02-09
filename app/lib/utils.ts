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

