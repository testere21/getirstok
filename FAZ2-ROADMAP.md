# Faz 2 — Firestore Veri Modeli ve Servis Katmanı (Detaylı Yol Haritası)

Bu belge, Faz 2'nin tüm adımlarını tek tek listeler. Her görevi tamamladıkça `[ ]` işaretini `[x]` yaparak ilerleyeceğiz.

**Amaç:** Firestore koleksiyon yapısını netleştirmek ve real-time okuma/yazma için servis fonksiyonlarını tanımlamak.

---

## 1. Koleksiyon Adı ve Doküman Şeması

- [x] Koleksiyon adını karar ver (örn. `products` veya `stock_items`) ve projede tutarlı kullan
- [x] Doküman alanlarını netleştir: `name` (string) — ürün ismi
- [x] Doküman alanlarını netleştir: `barcode` (string) — barkod
- [x] Doküman alanlarını netleştir: `quantity` (number) — miktar
- [x] Doküman alanlarını netleştir: `notes` (string) — notlar (opsiyonel)
- [x] Doküman alanlarını netleştir: `type` ('missing' | 'extra') — eksik veya fazla
- [x] Doküman alanlarını netleştir: `createdAt` (Firestore Timestamp veya ISO string) — oluşturulma zamanı
- [x] TypeScript için bir tip/interface tanımla (örn. `StockItem` veya `Product`) ve tüm alanları içersin
- [x] Bu tipi servislerde ve ileride UI'da kullanmak üzere export et (örn. `lib/types.ts` veya firestore servis dosyasında)

---

## 2. Firebase Initialize ve Config (Env)

- [x] `app/lib/firebase.ts` dosyasını aç
- [x] `firebaseConfig` objesinin tüm alanlarının `process.env.NEXT_PUBLIC_FIREBASE_*` ile okunduğunu doğrula
- [x] TypeScript hatası varsa: config tipini `FirebaseOptions` veya uygun tip ile tanımla; env değerleri undefined olabileceği için build/çalışma zamanında kontrol gerekebilir
- [x] Çift initialize'ı önleyen `getApps().length > 0` kontrolünün kaldığını doğrula
- [x] `db` (Firestore instance) export'unun kaldığını doğrula

---

## 3. Firestore Koleksiyon Referansı

- [x] `app/lib/firebase.ts` içinde veya ayrı bir servis dosyasında (örn. `app/lib/firestore.ts`) koleksiyon referansı oluştur
- [x] `collection(db, "KoleksiyonAdı")` ile referansı al (1. maddede seçilen isim)
- [x] Bu referansı export et (örn. `stockItemsCollectionRef`) — ekleme ve onSnapshot bu referansı kullanacak

---

## 4. Ekleme Servisi (Add)

- [x] Servis dosyasını oluştur veya mevcut modüle ekle (örn. `app/lib/firestore.ts` veya `app/lib/stockService.ts`)
- [x] Ekleme fonksiyonu için parametre tipini belirle: `name`, `barcode`, `quantity`, `notes?`, `type` ('missing' | 'extra')
- [x] `addDoc` import et (firebase/firestore)
- [x] `createdAt` alanını eklerken `serverTimestamp()` veya `new Date().toISOString()` kullan
- [x] `addDoc(collectionRef, { name, barcode, quantity, notes: notes ?? '', type, createdAt })` ile doküman ekle
- [x] Fonksiyonu async yap; eklenen doküman ID'sini veya void döndür; hata durumunda throw et
- [x] Fonksiyonu export et (örn. `addStockItem`)

---

## 5. Silme Servisi (Delete)

- [x] `deleteDoc` ve `doc` import et (firebase/firestore)
- [x] Silme fonksiyonu yaz: parametre olarak doküman ID (string) al
- [x] `doc(db, "KoleksiyonAdı", id)` ile doküman referansı oluştur
- [x] `deleteDoc(docRef)` ile sil
- [x] Fonksiyonu async yap; hata durumunda throw et
- [x] Fonksiyonu export et (örn. `deleteStockItem`)

---

## 6. Düzenleme Servisi (Update) — İsteğe Bağlı

- [x] `updateDoc` ve `doc` import et (firebase/firestore)
- [x] Güncelleme fonksiyonu yaz: parametre olarak doküman ID ve güncellenecek alanlar (kısmi obje) al
- [x] `doc(db, "KoleksiyonAdı", id)` ile doküman referansı oluştur
- [x] `updateDoc(docRef, { ...fields })` ile güncelle (sadece gönderilen alanlar güncellensin)
- [x] Fonksiyonu async yap; hata durumunda throw et
- [x] Fonksiyonu export et (örn. `updateStockItem`)

---

## 7. Real-time Dinleme (onSnapshot)

- [x] `onSnapshot` ve `query` (gerekirse `orderBy`) import et (firebase/firestore)
- [x] Dinleme fonksiyonu yaz: parametre olarak bir callback al (snapshot veya doküman listesi + ID'ler ile çağrılacak)
- [x] Koleksiyon referansı üzerinde `onSnapshot(collectionRef, (snapshot) => { ... })` kullan
- [x] Callback içinde snapshot.docs'u map'le; her doc için `id: doc.id`, `...doc.data()` şeklinde obje oluştur
- [x] Oluşan listeyi (ve tipini) callback'e parametre olarak ver
- [x] Unsubscribe fonksiyonu döndür (cleanup için: useEffect içinde return () => unsubscribe())
- [x] Fonksiyonu export et (örn. `subscribeStockItems` veya `onStockItemsSnapshot`)

---

## 8. Servisleri Toplama ve Export

- [x] Tüm servislerin tek bir modülde (örn. `app/lib/stockService.ts`) veya firestore.ts + stockService.ts ayrımıyla toplandığını doğrula
- [x] Tip tanımının (StockItem/Product) aynı modülde veya `lib/types.ts`'de export edildiğini doğrula
- [x] Ekleme, silme, düzenleme ve onSnapshot fonksiyonlarının dışarıdan import edilebilir olduğunu doğrula
- [x] Bu dosyayı henüz herhangi bir sayfa veya bileşende import etme; Faz 3+ ile kullanılacak

---

## Faz 2 Tamamlandığında

- [x] Tüm yukarıdaki maddeleri `[x]` yaptıktan sonra ana `ROADMAP.md` içindeki Faz 2 görevlerini de işaretle
- [x] Firebase Console'da ilgili projede Firestore veritabanı oluşturulduğunu ve test verisi ile ekleme/silme/dinlemenin çalıştığını (isteğe bağlı) doğrula
- [x] Faz 3'e geçmeye hazır olduğunu doğrula

---

*Bu dosya sadece Faz 2'ye özeldir. Genel proje yol haritası için `ROADMAP.md` kullanılır.*
