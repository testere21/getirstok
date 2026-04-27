# Hesaplama Sekmesi — Yol Haritası

Bu doküman, ana ekranda **Fırın ürünleri** sekmesinin yanına **Hesaplama** sekmesinin eklenmesi; **barkod ile arama**; yalnızca daha önce **eksik/fazla** olarak Firestore’a eklenmiş ürünler arasından seçim; seçilen ürünlerin **geçici** iki kolonlu listeye (eksik / fazla) eklenmesi ve **toplam eksik adet × birim fiyat** ile **toplam fazla adet × birim fiyat** karşılaştırması için fazları içerir.

**Veri referansları:** Firestore kayıtları (`type: 'missing' | 'extra'`), katalog `products.json` (`CatalogProduct`, isteğe bağlı `price`), çoklu barkod için `catalogProductMatchesBarcode` (`app/lib/catalogBarcodeMatch.ts`).

Tamamlanan adımları `[ ]` → `[x]` yaparak işaretleyin.

---

## Mevcut Durum Özeti

| Alan | Dosya / not |
|------|----------------|
| Eksik/fazla kayıtları | Firestore `items`; `item.type`, `barcode`, `quantity`, … — `app/page.tsx`, `AddProductModal` |
| Sekme yapısı | `TabType` içinde `"hesaplama"` — `app/page.tsx` |
| Fiyat | `CatalogProduct.price` (isteğe bağlı); Getir stok tarafında doldurulmuş olabilir (`app/lib/types.ts`) |
| Hesaplama kuralları (Faz 1+) | `app/lib/hesaplamaRules.ts` — aday süzüm, arama, oturum satırı, Firestore toplamları |

---

## Faz 1 — Veri modeli ve kurallar

**Amaç:** Hesaplamanın hangi veriye dayanacağını kilitlemek.

- [x] Hangi ürünlerin “hesaplamaya aday” sayılacağını netleştir (ör. bu barkod için Firestore’da `type === 'missing'` veya `type === 'extra'` olan en az bir kayıt).
- [x] Birim fiyat kaynağını sabitle: katalog `price`, yoksa Getir stok API’sinden doldurma veya “fiyat yok” uyarısı (ürün politikasına göre tek seçim).
- [x] Çoklu barkod (`barcodes[]`) için arama/eşleştirmede `catalogProductMatchesBarcode` ile tutarlı davranışı tanımla.
- [x] Miktar kaynağını tanımla: satıra eklerken Firestore’daki toplam eksik/fazla miktarını mı kullanılacak, kullanıcı düzenleyebilir mi, satır bazlı mı?

**Çıktı:** Tek bir tutarlı kural seti; implementasyon buna bağlanır.

**Karar özeti (`hesaplamaRules.ts`):**

| Konu | Karar |
|------|--------|
| Aday ürün | Firestore’da `missing` veya `extra` tipinde en az bir kayıt; katalog satırı bu kayıtların **herhangi bir barkoduyla** `catalogProductMatchesBarcode` ile eşleşmeli |
| Birim fiyat | Yalnızca `CatalogProduct.price`; geçersiz/eksikse `hasPrice: false` (UI sonraki fazda uyarı) |
| Çoklu barkod | Tüm eşleştirme `catalogProductMatchesBarcode` üzerinden |
| Miktar | Varsayılan: `getFirestoreMissingExtraTotalsForProduct` ile eksik/fazla toplamları; kullanıcı oturumda miktarı değiştirebilir (`HESAPLAMA_QUANTITY_POLICY`) |

---

## Faz 2 — Sekme ve yerleşim (UI iskeleti)

**Amaç:** Hesaplama görünümünün ana sayfada yer bulması.

- [x] Ana sekme state’ine `hesaplama` (veya seçilen sabit anahtar) ekle; Fırın’ın yanında **Hesaplama** sekmesi butonu.
- [x] `activeTab === 'hesaplama'` iken ilgili içerik alanında hesaplama düzenini göster (diğer sekmelerle çakışma yok).
- [x] Üstte: barkod arama alanı + (isteğe bağlı) “listeyi temizle” / oturumu sıfırla.
- [x] Altta: iki kolon — **Eksik tarafı** | **Fazla tarafı** (mobilde üst-alt veya accordion; masaüstünde yan yana).

**Çıktı:** Boş da olsa tam akışı gezilebilir sekme.

**Uygulama notları:** `TabType` genişletildi; `hesaplamaSearchQuery` state; sekme ikonu `Calculator` (mor vurgu). Alt liste bölümü artık koşulsuz render (önceki “tamamen boş sayfa” büyük empty state kaldırıldı) — böylece Firestore kaydı olmasa da **Hesaplama** sekmesine geçilebilir. İki kolon şimdilik “Liste boş.” placeholder; `displayItems` için `activeTab` yalnızca `missing`/`extra` iken dolar.

---

## Faz 3 — Barkod arama ve aday küme

**Amaç:** Sadece eksik/fazla geçmişi olan ürünlerde anlamlı arama.

- [x] Firestore’daki `items` ile senkron listeden, eksik veya fazla kaydı olan **benzersiz barkod** kümesini türet (`useMemo` veya mevcut filtre mantığına paralel).
- [x] Arama kutusu: kullanıcı yazdıkça bu aday kümedeki katalog ürünlerini filtrele (isim + birincil barkod + `barcodes`).
- [x] Sonuç listesinde özet: ad, barkod, isteğe bağlı “toplam eksik X / toplam fazla Y” (Firestore özetinden).
- [x] Sonuçtan seçim UX’i: ürünü **eksik listesine** mi **fazla listesine** mi ekleyeceği (ör. iki ayrı aksiyon butonu veya tek seçim sonrası net adım).

**Çıktı:** Arama → seçim döngüsü çalışır durumda.

**Uygulama:** `filterCatalogProductsForHesaplama` + `filterHesaplamaCandidatesBySearch` (`hesaplamaRules.ts`); `hesaplamaCandidateProducts` / `hesaplamaSearchResults` `useMemo`; minimum karakter `MIN_SEARCH_LENGTH` (2); alt kolonlarda geçici satırlar `upsertHesaplamaSessionLine` ile (aynı barkoda tekrar eklemede miktar toplanır); varsayılan miktar `getDefaultHesaplamaQuantityForSide`.

---

## Faz 4 — Geçici listeler ve satır işlemleri

**Amaç:** Oturumluk hesaplama listeleri.

- [x] Geçici state: eksik tarafı için `{ barcode, quantity, … }[]`, fazla için ayrı dizi (sekme değişince veya sıfırlayınca politika net olsun).
- [x] Aynı ürünü iki kez ekleme politikası: birleştir (miktar topla) veya ayrı satırlar — seçim ve uygulama.
- [x] Satır silme ve miktar düzenleme; toplamların güncellenmesi.
- [x] (İsteğe bağlı) Firestore özet miktarını satıra “varsayılan doldur” kısayolu.

**Çıktı:** İki kolon listesi tam işlevli.

**Uygulama notları:** Sekme değişiminde listeler **silinmez**; yalnızca **Oturumu sıfırla** temizler. Birleştirme: `HESAPLAMA_LINE_MERGE_POLICY` + `upsertHesaplamaSessionLine`. Satırda sayısal miktar (min 1, geçersiz → 1), **Kayıt toplamı** (`findCatalogProductByBarcode` + `getDefaultHesaplamaQuantityForSide`), çöp ile sil (`removeHesaplamaSessionLine`). Yardımcılar: `setHesaplamaSessionLineQuantity`.

---

## Faz 5 — Toplamlar ve karşılaştırma

**Amaç:** TL cinsinden özet ve kıyas.

- [x] Her satır: `satır tutarı = miktar × birimFiyat` (fiyat yoksa 0 veya belirlenen uyarı davranışı).
- [x] **Toplam eksik TL** ve **toplam fazla TL**; özet kart veya üst bantta gösterim.
- [x] Karşılaştırma özeti: fark, “hangi taraf daha büyük” bilgisi; mevcut tema renkleriyle (`--color-missing` / `--color-extra`) uyum.
- [x] Para biçimi: örn. `tr-TR`, ondalık kuralları.

**Çıktı:** Rakamsal doğruluk ve okunabilir özet.

**Uygulama:** `getHesaplamaUnitPriceForBarcode`, `getHesaplamaLineValueTry`, `sumHesaplamaSessionLinesTry` (`hesaplamaRules.ts`); birim fiyat için `catalogPriceByBarcode` + `findCatalogProductByBarcode`; satırda “Satır: …” veya “Fiyat yok”; iki kart + durum şeridi; `formatTryPriceTRY` (`tr-TR`).

---

## Faz 6 — Kalite ve operasyon

**Amaç:** Üretim kalitesi.

- [x] Edge case: fiyatı olmayan ürünlerde net mesaj; isteğe bağlı manuel fiyat girişi.
- [x] Erişilebilirlik: sekme/liste için temel klavye ve `prefers-reduced-motion` uyumu.
- [x] `npx tsc --noEmit` ve proje lint kuralları temiz.

**Çıktı:** Birleştirilebilir, sürdürülebilir kod.

**Uygulama:** `HesaplamaSessionLine.manualUnitPriceTry`; `getEffectiveHesaplamaUnitPrice` / `getHesaplamaLinePricingSource`; `setHesaplamaSessionLineManualUnitPrice`; satırda “Listeye ekle” / Hesaplama sekmesi / arama / oturum sıfırlama için `focus-visible:ring`; `motion-safe:transition-*`. `npm run lint` projede önceden var uyarılar çıkarabilir; `tsc` temiz.

---

## Faz 7 — (İsteğe bağlı) Kalıcılık ve entegrasyon

- [ ] Oturumu `sessionStorage` ile sayfa yenilemesinde korumak.
- [ ] Ana sayfadaki arama / istatistik / Firestore dinleyicisi ile çakışma kontrolü.

**Çıktı:** İstenen ek konfor ve tutarlılık.
