"use client";

import { useEffect } from "react";
import { readSelectedWarehouseId, subscribeSelectedWarehouse } from "@/app/lib/selectedWarehouse";
import { WAREHOUSE_THEME_ATTRIBUTE, warehouseThemeOf } from "@/app/lib/warehouseTheme";

/**
 * Seçili depoya göre kök elemente `data-warehouse` yazar (depo değişince tema anında değişir).
 * İlk boyamadaki doğru tema `app/layout.tsx` içindeki satır içi betikle zaten verilir.
 */
export function WarehouseThemeSync() {
  useEffect(() => {
    const apply = () => {
      document.documentElement.setAttribute(
        WAREHOUSE_THEME_ATTRIBUTE,
        warehouseThemeOf(readSelectedWarehouseId())
      );
    };
    apply();
    return subscribeSelectedWarehouse(apply);
  }, []);
  return null;
}
