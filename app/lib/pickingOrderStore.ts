import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { isPickingOrderExpired, type PickingOrder } from "./pickingOrders";

/** Doküman kimliği = Getir sipariş kimliği (aynı sipariş tekrar eklenirse güncellenir) */
const PICKING_ORDERS_COLLECTION = "picking_orders";

export async function savePickingOrder(order: PickingOrder): Promise<void> {
  await setDoc(doc(db, PICKING_ORDERS_COLLECTION, order.orderId), order);
}

export async function deletePickingOrder(orderId: string): Promise<void> {
  await deleteDoc(doc(db, PICKING_ORDERS_COLLECTION, orderId));
}

function parseOrder(data: unknown): PickingOrder | null {
  const d = data as Partial<PickingOrder> | null;
  if (!d || typeof d.orderId !== "string" || !Array.isArray(d.items) || typeof d.addedAt !== "string") return null;
  return {
    orderId: d.orderId,
    locations: Array.isArray(d.locations) ? d.locations.filter((l): l is string => typeof l === "string") : [],
    items: d.items,
    addedAt: d.addedAt,
  };
}

/** Eskiden yeniye sıralı liste; süresi dolanlar listelenmez ve silinir */
export function subscribePickingOrders(
  onData: (orders: PickingOrder[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    collection(db, PICKING_ORDERS_COLLECTION),
    (snap) => {
      const orders: PickingOrder[] = [];
      for (const d of snap.docs) {
        const order = parseOrder(d.data());
        if (!order) continue;
        if (isPickingOrderExpired(order)) {
          void deleteDoc(d.ref).catch(() => {});
          continue;
        }
        orders.push(order);
      }
      orders.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
      onData(orders);
    },
    (error) => onError?.(error instanceof Error ? error : new Error(String(error)))
  );
}
