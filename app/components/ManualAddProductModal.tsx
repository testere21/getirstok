"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";

export interface ManualAddProductInitial {
  name?: string;
  barcode?: string;
}

interface ManualAddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  initial?: ManualAddProductInitial;
  onSaved: (product: { name: string; barcode: string; imageUrl?: string }) => void;
}

function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const max = 720;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > max || h > max) {
        const scale = Math.min(max / w, max / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Görsel işlenemedi."));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Görsel okunamadı."));
    };
    img.src = objectUrl;
  });
}

export function ManualAddProductModal({
  isOpen,
  onClose,
  initial,
  onSaved,
}: ManualAddProductModalProps) {
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(initial?.name?.trim() ?? "");
    setBarcode(initial?.barcode?.trim() ?? "");
    setImageDataUrl("");
    setError(null);
    setSaving(false);
  }, [isOpen, initial?.name, initial?.barcode]);

  if (!isOpen) return null;

  const handleImage = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Lütfen bir görsel dosyası seçin.");
      return;
    }
    try {
      const dataUrl = await compressImageFile(file);
      setImageDataUrl(dataUrl);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Görsel yüklenemedi.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    const trimmedBarcode = barcode.trim().replace(/\s/g, "");
    if (trimmedName.length < 2) {
      setError("Ürün adı en az 2 karakter olmalı.");
      return;
    }
    if (!/^\d{6,18}$/.test(trimmedBarcode)) {
      setError("Barkod 6–18 haneli rakam olmalı.");
      return;
    }
    if (!imageDataUrl) {
      setError("Ürün görseli ekleyin (kamera veya dosya).");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/catalog/manual-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          barcode: trimmedBarcode,
          imageDataUrl,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        product?: { name: string; barcode: string; imageUrl?: string };
      };
      if (!res.ok || !data.success || !data.product) {
        throw new Error(data.error || "Ürün kaydedilemedi.");
      }
      onSaved(data.product);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ürün kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-add-product-title"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
        aria-label="Kapat"
      />
      <div
        className="relative max-h-[90vh] w-full max-w-md overflow-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2
            id="manual-add-product-title"
            className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Yeni Ürün Ekleme
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Kapat"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Ürün görseli
            </p>
            {imageDataUrl ? (
              <img
                src={imageDataUrl}
                alt="Ürün önizleme"
                className="mb-2 h-36 w-full rounded-lg object-contain bg-zinc-100 dark:bg-zinc-800"
              />
            ) : (
              <div className="mb-2 flex h-36 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-500 dark:border-zinc-600 dark:bg-zinc-800/50">
                Görsel seçilmedi
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                <Camera className="size-4" aria-hidden />
                Kamera
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                <ImagePlus className="size-4" aria-hidden />
                Dosyadan seç
              </button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                void handleImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void handleImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Ürün adı
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="Örn: Hasata Bulgur 1 kg"
              autoComplete="off"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Barkod
            </span>
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 tabular-nums text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="Barkod numarası"
              autoComplete="off"
            />
          </label>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
