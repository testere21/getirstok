"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeImageProps {
  barcode: string;
  width?: number;
  height?: number;
  className?: string;
}

export function BarcodeImage({ barcode, width = 2, height = 80, className = "" }: BarcodeImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Barkod boş veya geçersizse
    if (!barcode || typeof barcode !== "string") {
      setError("Barkod bulunamadı");
      return;
    }

    // Barkod formatını uzunluğa göre belirle
    const trimmedBarcode = barcode.trim();
    
    if (!trimmedBarcode) {
      setError("Barkod boş");
      return;
    }

    const barcodeLength = trimmedBarcode.length;
    const isNumeric = /^\d+$/.test(trimmedBarcode);
    
    // Format seçimi - daha esnek, birden fazla format dene
    let formatsToTry: string[] = [];
    
    if (isNumeric) {
      if (barcodeLength === 13) {
        formatsToTry = ["EAN13", "CODE128"];
      } else if (barcodeLength === 8) {
        formatsToTry = ["EAN8", "CODE128"];
      } else if (barcodeLength === 12) {
        // UPC-A benzeri - CODE128 ile dene
        formatsToTry = ["CODE128"];
      } else if (barcodeLength >= 6 && barcodeLength <= 18) {
        // Diğer sayısal barkodlar için CODE128 kullan
        formatsToTry = ["CODE128"];
      } else {
        formatsToTry = ["CODE128"];
      }
    } else {
      // Sayısal olmayan barkodlar için CODE128
      formatsToTry = ["CODE128"];
    }

    // Canvas'ı temizle
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }

    setError(null);

    // Formatları sırayla dene
    let success = false;
    for (const format of formatsToTry) {
      try {
        JsBarcode(canvasRef.current, trimmedBarcode, {
          format: format as any,
          width: width,
          height: height,
          displayValue: true,
          fontSize: 14,
          textMargin: 5,
          margin: 10,
        });
        success = true;
        setError(null);
        break; // Başarılı oldu, döngüden çık
      } catch (err) {
        // Bu format başarısız, bir sonrakini dene
        continue;
      }
    }

    // Hiçbir format çalışmadıysa
    if (!success) {
      console.error("Barkod oluşturulamadı. Barkod:", trimmedBarcode, "Uzunluk:", barcodeLength);
      setError("Barkod oluşturulamadı");
    }
  }, [barcode, width, height]);

  if (!barcode || typeof barcode !== "string" || !barcode.trim()) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="text-sm text-zinc-400 dark:text-zinc-500 p-4">
          Barkod bulunamadı
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <canvas ref={canvasRef} className="max-w-full" />
      {error && (
        <div className="mt-2 text-xs text-red-500 dark:text-red-400 text-center">
          {error}
        </div>
      )}
    </div>
  );
}
