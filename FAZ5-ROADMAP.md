# Faz 5 — İstatistik Kartları (Dinamik Özet) — Detaylı Yol Haritası

Bu belge, Faz 5'in tüm adımlarını tek tek listeler. Her görevi tamamladıkça `[ ]` işaretini `[x]` yaparak ilerleyeceğiz.

**Amaç:** Sayfanın orta kısmında üç dinamik kartı göstermek; veri Firestore'dan real-time gelecek ve arama/filtreye göre güncellenecek.

---

## 1. Firestore Listesini Ana Sayfada Tutma

- [x] `subscribeStockItems` fonksiyonunu `app/lib/stockService.ts` dosyasından import et
- [x] `StockItemWithId` tipini import et (types veya stockService'ten)
- [x] Ana sayfada (`app/page.tsx`) stok listesi için state tanımla: `items: StockItemWithId[]`, başlangıç `[]`
- [x] `useEffect` içinde `subscribeStockItems((list) => setItems(list))` çağır
- [x] Cleanup: useEffect return'unda `subscribeStockItems`'ın döndürdüğü unsubscribe fonksiyonunu çağır
- [x] Sayfa yüklendiğinde veya Firestore'da değişiklik olduğunda `items` state'inin güncellendiğini doğrula (console.log veya geçici metin ile)

---

## 2. Arama ile Filtreleme

- [x] Ana sayfada mevcut `searchQuery` state'inin kullanıldığından emin ol (Faz 3'te eklendi)
- [x] Filtrelenmiş listeyi hesaplayan bir değişken veya fonksiyon yaz: `items` listesini `searchQuery`'e göre filtrele
- [x] Filtre mantığı: `searchQuery` boşsa tüm liste; doluysa ürün ismi (`name`) veya barkod (`barcode`) alanı arama metnini içersin (case-insensitive önerilir: `toLowerCase`, `includes`)
- [x] Filtrelenmiş listeyi `filteredItems` gibi bir isimle tut (useMemo ile hesaplanabilir — `items` ve `searchQuery` bağımlılıkları)
- [x] İstatistik kartları ve (Faz 6'daki) listeler bu `filteredItems` üzerinden veri alsın

---

## 3. Kart 1 — Toplam Ürün Çeşidi

- [x] "Toplam Ürün Çeşidi" değerini hesapla: filtrelenmiş listedeki **benzersiz ürün** sayısı
- [x] Benzersizlik: aynı isim + aynı barkod = bir çeşit kabul edilebilir; veya sadece doküman sayısı (her kayıt bir kalem). ROADMAP'te "kaç farklı kalem ürün" deniyor — doküman sayısı (`filteredItems.length`) veya `new Set(filteredItems.map(i => i.name + i.barcode)).size` gibi bir metrik kullan
- [x] Bu sayıyı ekranda gösterecek bir kart bileşeni veya div hazırla (başlık: "Toplam Ürün Çeşidi", değer: hesaplanan sayı)
- [x] Kartı sayfanın orta bölümüne (istatistikler section'ına) yerleştir

---

## 4. Kart 2 — Toplam Eksik Ürün Miktarı

- [x] "Toplam Eksik Ürün Miktarı" değerini hesapla: filtrelenmiş listede `type === 'missing'` olanların `quantity` toplamı
- [x] `filteredItems.filter(i => i.type === 'missing').reduce((sum, i) => sum + i.quantity, 0)`
- [x] Bu sayıyı ekranda gösterecek kart (başlık: "Toplam Eksik Ürün Miktarı", değer: hesaplanan toplam)
- [x] Kartı orta bölümde Kart 1'in yanına veya altına yerleştir

---

## 5. Kart 3 — Toplam Fazla Ürün Miktarı

- [x] "Toplam Fazla Ürün Miktarı" değerini hesapla: filtrelenmiş listede `type === 'extra'` olanların `quantity` toplamı
- [x] `filteredItems.filter(i => i.type === 'extra').reduce((sum, i) => sum + i.quantity, 0)`
- [x] Bu sayıyı ekranda gösterecek kart (başlık: "Toplam Fazla Ürün Miktarı", değer: hesaplanan toplam)
- [x] Kartı orta bölümde diğer kartlarla aynı satırda/gratta yerleştir

---

## 6. Üç Kartın Layout'u ve Stili

- [x] Üç kartı yan yana göstermek için grid veya flex kullan (örn. `grid grid-cols-1 sm:grid-cols-3 gap-4`)
- [x] Her kart için tutarlı stil: başlık (kart adı), büyük fontla sayı; border veya gölge ile ayrım
- [x] Kart 1 (çeşit) için nötr renk; Kart 2 (eksik) için kırmızı/uyarı tonu (--color-missing); Kart 3 (fazla) için yeşil tonu (--color-extra) — isteğe bağlı
- [x] Mobilde kartlar alt alta (grid-cols-1), masaüstünde yan yana (sm:grid-cols-3)
- [x] Ana sayfadaki "İstatistik kartları buraya" placeholder'ını kaldırıp bu üç kartı render et

---

## 7. Real-time ve Arama Senkronu Doğrulama

- [x] Firestore'da veri ekleyip/silince kartların anlık güncellendiğini doğrula (onSnapshot sayesinde)
- [x] Arama çubuğuna metin yazınca kartlardaki sayıların filtrelenmiş veriye göre değiştiğini doğrula
- [x] Arama boşaltılınca sayıların tekrar tam listeye göre döndüğünü doğrula

---

## Faz 5 Tamamlandığında

- [x] Tüm yukarıdaki maddeleri `[x]` yaptıktan sonra ana `ROADMAP.md` içindeki Faz 5 görevlerini de işaretle
- [x] Tarayıcıda test et: kartlar görünüyor, veri değişince ve arama yapınca güncelleniyor
- [x] Faz 6'ya geçmeye hazır olduğunu doğrula (sekmeli listeler)

---

*Bu dosya sadece Faz 5'e özeldir. Genel proje yol haritası için `ROADMAP.md` kullanılır.*
