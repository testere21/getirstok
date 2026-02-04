# Faz 6 — Sekmeli Listeler (Eksik / Fazla Ürünler) — Detaylı Yol Haritası

Bu belge, Faz 6'nın tüm adımlarını tek tek listeler. Her görevi tamamladıkça `[ ]` işaretini `[x]` yaparak ilerleyeceğiz.

**Amaç:** Sayfanın en altında iki sekmeli yapıda listeleme sunmak; her satırda ürün bilgileri ve "Sil" butonu olacak. Veri `filteredItems` üzerinden gelecek, arama ile senkron çalışacak.

---

## 1. Sekme Yapısı ve State

- [x] Ana sayfada (`app/page.tsx`) aktif sekme için state tanımla: `activeTab: 'missing' | 'extra'`, başlangıç değeri `'missing'`
- [x] İki sekme başlığı oluştur: "Eksik Ürünler" ve "Fazla Ürünler"
- [x] Sekme başlıklarını tıklanabilir yap (button veya role="tab"); tıklanınca `setActiveTab('missing')` veya `setActiveTab('extra')` çağrılsın
- [x] Aktif sekmeyi görsel olarak ayırt et (alt çizgi, arka plan rengi veya border — örn. `--color-missing` / `--color-extra` ile tutarlı)
- [x] Erişilebilirlik: `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls` (isteğe bağlı) kullan

---

## 2. Filtrelenmiş Veriyi Tipe Göre Ayırma

- [x] `filteredItems`'tan eksik ürün listesini hesapla: `filteredItems.filter(i => i.type === 'missing')`
- [x] `filteredItems`'tan fazla ürün listesini hesapla: `filteredItems.filter(i => i.type === 'extra')`
- [x] Bu iki listeyi `useMemo` ile türet; bağımlılık: `[filteredItems]` (örn. `missingItems`, `extraItems`)
- [x] Aktif sekmeye göre gösterilecek listeyi seç: `activeTab === 'missing' ? missingItems : extraItems`

---

## 3. Liste Görünümü — Satır Yapısı

- [x] Liste için bir container kullan (ul/ol veya div; semantik tercih: list role'ları veya div + aria-label)
- [x] Her satırda gösterilecek alanları netleştir: **Ürün ismi** (name), **Barkod** (barcode), **Miktar** (quantity), **Notlar** (notes)
- [x] İsteğe bağlı: **Oluşturulma tarihi** (createdAt) — kısa tarih formatında (örn. `toLocaleDateString('tr-TR')`)
- [x] Mobilde satırların okunabilir olması için: grid veya flex; küçük ekranda alt alta veya wrap
- [x] Başlık satırı (thead benzeri) ekle: "Ürün", "Barkod", "Miktar", "Notlar", "İşlem" (veya sadece liste satırları)

---

## 4. Sekme 1 — Eksik Ürünler Listesi

- [x] `activeTab === 'missing'` iken `missingItems` listesini render et
- [x] Her öğe için bir satır bileşeni veya tekrarlanan JSX kullan
- [x] Liste boşsa "Eksik ürün bulunmuyor." (veya arama sonucu boşsa "Arama sonucu yok.") mesajı göster
- [x] Listeyi mevcut "Ürün listeleri" section'ına yerleştir; placeholder metni kaldır

---

## 5. Sekme 2 — Fazla Ürünler Listesi

- [x] `activeTab === 'extra'` iken `extraItems` listesini render et
- [x] Aynı satır yapısını kullan (kod tekrarını önlemek için ortak bir satır render fonksiyonu veya bileşen tercih edilebilir)
- [x] Liste boşsa "Fazla ürün bulunmuyor." / "Arama sonucu yok." mesajı göster

---

## 6. Sil Butonu ve Silme İşlemi

- [x] Her satırın sağına (veya "İşlem" sütununa) "Sil" butonu ekle
- [x] Lucide ikonu kullan: `Trash2` veya `Trash`; buton metni "Sil" veya sadece ikon + `aria-label="Ürünü sil"`
- [x] `deleteStockItem` fonksiyonunu `app/lib/stockService.ts` dosyasından import et
- [x] Sil butonuna tıklanınca `deleteStockItem(item.id)` çağır
- [x] İsteğe bağlı: Silmeden önce `confirm('Bu ürünü silmek istediğinize emin misiniz?')` ile onay al
- [x] Silme sırasında butonu disable etmek veya loading göstermek (isteğe bağlı); hata durumunda kullanıcıya kısa mesaj (Faz 7'de genişletilebilir)

---

## 6b. Düzenle Butonu ve Düzenleme İşlemi

- [x] Her satırın "İşlem" sütununa "Düzenle" butonu ekle (Lucide `Pencil` ikonu, `aria-label="Ürünü düzenle"`)
- [x] Düzenle'ye tıklanınca düzenlenecek ürünü state'te tut (`editingItem: StockItemWithId | null`)
- [x] Mevcut modalı (AddProductModal) düzenleme modunda aç: `initialItem` prop'u ile ürün bilgilerini forma doldur, başlık "Ürünü Düzenle", submit butonu "Güncelle"
- [x] Modal submit'te `updateStockItem(item.id, { name, barcode, quantity, notes })` çağır; başarıda modalı kapat
- [x] `updateStockItem` fonksiyonunu `stockService`'ten import et ve modal içinde kullan

---

## 7. Sekmelerin ve Listenin Layout'u

- [x] Sekme başlıklarını yatay hizalı yerleştir (flex veya grid); mobilde aynı kalabilir
- [x] Sekme ile liste içeriği arasında net ayrım (border veya boşluk)
- [x] Liste alanına max-height + overflow-y (isteğe bağlı) verilebilir; uzun listelerde kaydırma
- [x] Ana sayfadaki "Eksik / Fazla ürün listeleri buraya" placeholder'ını kaldırıp sekmeli listeyi render et

---

## 8. Real-time ve Arama Senkronu Doğrulama

- [x] Arama çubuğuna metin yazıldığında her iki sekme listesinin de filtrelenmiş veriye göre güncellendiğini doğrula
- [x] Sil butonuna basıldığında Firestore'dan silindiğini ve listelerin (onSnapshot ile) anında güncellendiğini doğrula
- [x] Sekme değiştirildiğinde doğru listenin (eksik / fazla) görüntülendiğini doğrula

---

## Faz 6 Tamamlandığında

- [x] Tüm yukarıdaki maddeleri `[x]` yaptıktan sonra ana `ROADMAP.md` içindeki Faz 6 görevlerini de işaretle
- [x] Tarayıcıda test et: sekmeler çalışıyor, listeler doğru, silme işlemi çalışıyor, arama ile liste güncelleniyor
- [x] Faz 7'ye geçmeye hazır olduğunu doğrula (real-time filtre tutarlılığı, loading/boş liste/hata mesajları)

---

*Bu dosya sadece Faz 6'ya özeldir. Genel proje yol haritası için `ROADMAP.md` kullanılır.*
