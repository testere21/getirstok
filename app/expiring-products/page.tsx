"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2, Calendar, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";
import { ExpiringProductModal } from "@/app/components/ExpiringProductModal";
import { Toast, type ToastType } from "@/app/components/Toast";
import type { ExpiringProductWithId } from "@/app/lib/types";

type FilterType = "all" | "today" | "past" | "future";
type SortField = "removalDate" | "productName" | "expiryDate";
type SortDirection = "asc" | "desc";

interface ToastState {
  message: string;
  type: ToastType;
}

export default function ExpiringProductsPage() {
  const [products, setProducts] = useState<ExpiringProductWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortField, setSortField] = useState<SortField>("removalDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [editingProduct, setEditingProduct] = useState<ExpiringProductWithId | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Yaklaşan SKT kayıtlarını yükle
  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/expiring-products");
        const data = await response.json();

        if (data.success && Array.isArray(data.products)) {
          setProducts(data.products);
        } else {
          setError(data.error || "Kayıtlar yüklenemedi");
        }
      } catch (err) {
        console.error("Yaklaşan SKT kayıtları yüklenirken hata:", err);
        setError("Bağlantı hatası. Lütfen tekrar deneyin.");
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, []);

  // Filtreleme ve sıralama
  const filteredAndSortedProducts = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];

    let filtered = products;

    // Filtreleme
    if (filter === "today") {
      filtered = products.filter((p) => p.removalDate === today);
    } else if (filter === "past") {
      filtered = products.filter((p) => p.removalDate < today);
    } else if (filter === "future") {
      filtered = products.filter((p) => p.removalDate > today);
    }

    // Sıralama
    const sorted = [...filtered].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      if (sortField === "removalDate" || sortField === "expiryDate") {
        aValue = a[sortField];
        bValue = b[sortField];
      } else {
        aValue = a.productName.toLowerCase();
        bValue = b.productName.toLowerCase();
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [products, filter, sortField, sortDirection]);

  // Durum belirleme
  const getStatus = (removalDate: string): { label: string; color: string } => {
    const today = new Date().toISOString().split("T")[0];
    if (removalDate === today) {
      return { label: "Bugün", color: "text-orange-600 dark:text-orange-400" };
    } else if (removalDate < today) {
      return { label: "Geçmiş", color: "text-red-600 dark:text-red-400" };
    } else {
      return { label: "Gelecek", color: "text-green-600 dark:text-green-400" };
    }
  };

  // Sıralama handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Silme handler
  const handleDelete = async (id: string) => {
    if (!confirm("Bu kaydı silmek istediğinize emin misiniz?")) return;

    setDeletingId(id);
    try {
      const response = await fetch(`/api/expiring-products/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        setProducts(products.filter((p) => p.id !== id));
        setToast({ message: "Kayıt başarıyla silindi.", type: "success" });
      } else {
        throw new Error(data.error || "Silme başarısız");
      }
    } catch (err) {
      console.error("Kayıt silinirken hata:", err);
      setToast({
        message: err instanceof Error ? err.message : "Kayıt silinirken bir hata oluştu.",
        type: "error",
      });
    } finally {
      setDeletingId(null);
    }
  };

  // İstatistikler
  const stats = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return {
      total: products.length,
      today: products.filter((p) => p.removalDate === today).length,
      past: products.filter((p) => p.removalDate < today).length,
      future: products.filter((p) => p.removalDate > today).length,
    };
  }, [products]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block size-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="text-zinc-600 dark:text-zinc-400">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Yaklaşan SKT Yönetimi
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Son kullanma tarihi yaklaşan ürünleri görüntüleyin ve yönetin
          </p>
        </div>
      </div>

      {/* İstatistikler */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Toplam</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {stats.total}
          </p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
          <p className="text-sm font-medium text-orange-700 dark:text-orange-300">Bugün</p>
          <p className="mt-1 text-2xl font-semibold text-orange-900 dark:text-orange-100">
            {stats.today}
          </p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">Geçmiş</p>
          <p className="mt-1 text-2xl font-semibold text-red-900 dark:text-red-100">
            {stats.past}
          </p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
          <p className="text-sm font-medium text-green-700 dark:text-green-300">Gelecek</p>
          <p className="mt-1 text-2xl font-semibold text-green-900 dark:text-green-100">
            {stats.future}
          </p>
        </div>
      </div>

      {/* Filtreleme ve Sıralama */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              filter === "all"
                ? "bg-blue-600 text-white dark:bg-blue-500"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
            }`}
          >
            Tümü
          </button>
          <button
            type="button"
            onClick={() => setFilter("today")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              filter === "today"
                ? "bg-orange-600 text-white dark:bg-orange-500"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
            }`}
          >
            Bugün
          </button>
          <button
            type="button"
            onClick={() => setFilter("past")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              filter === "past"
                ? "bg-red-600 text-white dark:bg-red-500"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
            }`}
          >
            Geçmiş
          </button>
          <button
            type="button"
            onClick={() => setFilter("future")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              filter === "future"
                ? "bg-green-600 text-white dark:bg-green-500"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
            }`}
          >
            Gelecek
          </button>
        </div>
      </div>

      {/* Hata Mesajı */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Liste */}
      {filteredAndSortedProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-200 bg-white p-12 dark:border-zinc-700 dark:bg-zinc-800">
          <Calendar className="mb-4 size-12 text-zinc-400 dark:text-zinc-500" />
          <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
            {filter === "all"
              ? "Henüz yaklaşan SKT kaydı yok"
              : filter === "today"
              ? "Bugün çıkılması gereken ürün yok"
              : filter === "past"
              ? "Geçmiş tarihli kayıt yok"
              : "Gelecek tarihli kayıt yok"}
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Ana sayfadan ürün seçip "Yaklaşan SKT Olarak İşaretle" butonunu kullanarak kayıt ekleyebilirsiniz.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
          <table className="w-full">
            <thead className="bg-zinc-50 dark:bg-zinc-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <button
                    type="button"
                    onClick={() => handleSort("productName")}
                    className="flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-300"
                  >
                    Ürün Adı
                    {sortField === "productName" &&
                      (sortDirection === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      ))}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Barkod
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <button
                    type="button"
                    onClick={() => handleSort("expiryDate")}
                    className="flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-300"
                  >
                    SKT Tarihi
                    {sortField === "expiryDate" &&
                      (sortDirection === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      ))}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <button
                    type="button"
                    onClick={() => handleSort("removalDate")}
                    className="flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-300"
                  >
                    Çıkılması Gereken Tarih
                    {sortField === "removalDate" &&
                      (sortDirection === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      ))}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Durum
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  İşlemler
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
              {filteredAndSortedProducts.map((product) => {
                const status = getStatus(product.removalDate);
                return (
                  <tr
                    key={product.id}
                    className="transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {product.productName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {product.barcode}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {product.expiryDate}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {product.removalDate}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span className={`font-medium ${status.color}`}>{status.label}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingProduct(product)}
                          className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                          aria-label="Düzenle"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(product.id)}
                          disabled={deletingId === product.id}
                          className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/30 dark:hover:text-red-200"
                          aria-label="Sil"
                        >
                          {deletingId === product.id ? (
                            <div className="size-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent"></div>
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Düzenleme Modal */}
      {editingProduct && (
        <ExpiringProductModal
          isOpen={true}
          onClose={() => setEditingProduct(null)}
          product={{
            barcode: editingProduct.barcode,
            name: editingProduct.productName,
          }}
          existingProduct={editingProduct}
          onSuccess={(message) => {
            setToast({ message, type: "success" });
            setEditingProduct(null);
            // Listeyi yeniden yükle
            fetch("/api/expiring-products")
              .then((res) => res.json())
              .then((data) => {
                if (data.success && Array.isArray(data.products)) {
                  setProducts(data.products);
                }
              })
              .catch(console.error);
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

