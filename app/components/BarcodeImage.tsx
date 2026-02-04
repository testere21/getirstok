"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeImageProps {
  barcode: string;
  width?: number;
  height?: number;
  className?: string;
}

export function BarcodeImage({ barcode, width = 2, height = 80, className = "" }: BarcodeImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !barcode) return;

    try {
      JsBarcode(canvasRef.current, barcode, {
        format: "EAN13",
        width: width,
        height: height,
        displayValue: true,
        fontSize: 14,
        textMargin: 5,
        margin: 10,
      });
    } catch (err) {
      console.error("Barcode oluşturulamadı:", err);
    }
  }, [barcode, width, height]);

  if (!barcode) return null;

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <canvas ref={canvasRef} className="max-w-full" />
    </div>
  );
}
