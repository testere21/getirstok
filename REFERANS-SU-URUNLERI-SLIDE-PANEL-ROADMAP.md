# Referans Su Ürünleri — Sağ Kenar Butonu ve Sola Açılan Panel Yol Haritası



Bu doküman, ana ekranın **sağında** bir buton ile tıklanınca **soldan içeri kayarak** açılan küçük bir panelde **Erikli 5 L** ve **Kuzeyden 5 L** ürünlerinin **ürün görseli + barkod görseli** ile gösterilmesi için adım adım izlenecek yol haritasını içerir.



**Kapsam notu:** Tetikleyici ve panel **yalnızca masaüstü (PC) görünümünde**; mobilde gösterilmez.



Tamamlanan adımları işaretlemek için kutucukları `[ ]` → `[x]` şeklinde güncelleyin.



---



## Mevcut Durum ve Bağımlılıklar



- **Ana sayfa:** `app/page.tsx` — bu özellik **sadece bu sayfada** uygulanacak.

- **Barkod görseli:** `app/components/BarcodeImage.tsx` — JsBarcode ile barkod string’inden görsel üretir; bu panelde yeniden kullanılabilir.

- **Katalog verisi:** Ana sayfadaki ürün listesi `data/products.json` kaynağından gelir. Referans ürünler **sabit iki barkod** ile bu listeden eşlenir; böylece görsel ve tam isim katalogla uyumlu kalır.



| Ürün (katalog adı) | Sabit barkod (referans) |

|--------------------|-------------------------|

| Erikli Doğal Kaynak Suyu (5 L) | `8690793010502` |

| Kuzeyden Doğal Mineralli Su (5 L) | `8681763366613` |



*(Barkodları ileride değiştirmek gerekirse bu tabloyu ve kod içindeki sabit barkod dizisini güncellemek yeterli.)*



- **İstenen UX (PC):** Sağda tetikleyici → panel **sağ kenardan** açılıp **sola doğru** kayar (drawer / slide-over). Genişlik sabit dar sütun (örn. `w-80` / `max-w-sm`).



---



## Faz 0 — Kilit kararlar



**Amaç:** Uygulama öncesi verilen kararların dokümanda sabitlenmesi.



- [x] **0.1** Panel ve tetikleyici **yalnızca ana stok sayfasında** — `app/page.tsx` üzerinde; diğer route’lara taşınmaz (ilk sürüm).

- [x] **0.2** Ürünler **sürekli aynı iki çeşit** kalacak; veri **halihazırdaki ürün listesinden** çözülecek: sayfada yüklenen `products` (veya eşdeğer dizi) içinde **sabit barkodlarla** `find` / `filter` ile eşleştirme. Katalog güncellenirse görsel ve isim otomatik güncellenir; barkod sabitleri yukarıdaki tabloda.

- [x] **0.3** **Sadece PC görünümü:** Tetikleyici buton ve slide panel **`md:` (veya `lg:`) üstü breakpoint’te** görünsün; mobilde `hidden` / desktop’ta `md:flex` vb. ile tamamen gizlensin. Panel genişliği masaüstü için sabit dar sütun (`w-80` veya `max-w-sm`); mobil tam genişlik senaryosu **yok**.



**Çıktı:** Faz 1–6 bu üç karara göre ilerler.



---



## Faz 1 — Veri ve sabitler



**Amaç:** İki sabit barkod ve listeden çözülen kayıtlar tek mantıkta birleşsin.



- [x] **1.1** Sabit barkod dizisi: `REFERENCE_WATER_BARCODES` — `app/lib/referenceWaterProducts.ts` (`8690793010502`, `8681763366613`; `as const` + `ReferenceWaterBarcode` tipi).

- [x] **1.2** Yardımcı fonksiyon: `resolveReferenceWaterProducts(products)` → `ReferenceWaterResolvedRow[]` — `app/lib/referenceWaterProducts.ts`; `barcode` sabit; katalog eşleşmesi Faz 1.3 alanlarıyla birleşik.

- [x] **1.3** Kısa etiket: `REFERENCE_WATER_SHORT_LABEL_BY_BARCODE` — `8690793010502` → "Erikli 5 L", `8681763366613` → "Kuzeyden 5 L"; satırda `shortLabel` + isteğe bağlı `catalogFullName` (katalog `name`).



**Çıktı:** `page.tsx` veya panel bileşeni `products` + sabit barkodlarla iki satır üretebilir.



---



## Faz 2 — Sağ kenar tetikleyici buton (yalnızca PC)



**Amaç:** Geniş ekranda sağda tetikleyici; mobilde DOM’da yok veya görünmez.



- [x] **2.1** Sarmalayıcı: `hidden md:flex` — `app/page.tsx` sağ alt tetikleyici sarmalayıcı.

- [x] **2.2** `fixed` + `bottom-6` + `justify-end pr-4`; üst sağdaki SKT uyarısı ile çakışma yok.

- [x] **2.3** `Droplets` ikonu + `aria-label` / `title`: "Referans su ürünleri ve barkodlar".

- [x] **2.4** Tıklanınca `setReferencePanelOpen(true)`; kapatma: `ReferenceWaterProductsPanel` içinde `Escape`, backdrop, X (Faz 3).

- [x] **2.5** Tetikleyici `z-[48]` — toast `z-50`, başarı modal `z-[60]`; panel Faz 3’te `z-[55]`–`z-[59]` aralığı planlanabilir.



**Çıktı:** Sadece masaüstünde sağda erişilebilir tetikleyici.



---



## Faz 3 — Sola kayan panel (drawer) kabuğu



**Amaç:** PC’de sağdan giren slide-over; animasyon ve kapanma.



- [x] **3.1** State: `referencePanelOpen` — `app/page.tsx`; panel `ReferenceWaterProductsPanel`.

- [x] **3.2** Kök: `fixed inset-0 z-[56] hidden md:block` — `md` altında render yok.

- [x] **3.3** Backdrop: `bg-black/40`, tıklanınca `onClose`.

- [x] **3.4** Panel: `absolute right-0 top-0 h-dvh max-w-sm`, border + tema arka planı.

- [x] **3.5** Animasyon: `globals.css` `@keyframes ref-water-slide-in` + `.ref-water-drawer-panel`; `prefers-reduced-motion`’da animasyon kapalı.

- [x] **3.6** Kapat: başlık satırında `X`; `Escape` bileşen içi `useEffect`.

- [x] **3.7** Body scroll: uygulanmadı (roadmap isteğe bağlı; overlay yeterli).



**Çıktı:** Masaüstünde drawer davranışı tam.



---



## Faz 4 — Panel içeriği: iki ürün + barkod



**Amaç:** Her satırda katalog görseli + `BarcodeImage`.



- [x] **4.1** Kabuk: `ReferenceWaterProductsPanel.tsx` (`open`, `onClose`, `children`); içerik: `ReferenceWaterProductsPanelContent.tsx` (`catalogProducts`).

- [x] **4.2** `resolveReferenceWaterProducts` + iki satır: `shortLabel` + `BarcodeImage`; `catalogFullName` / ürün fotoğrafı yok (minimal).

- [x] **4.3** Barkod alanı: `max-w-full overflow-x-auto` + `BarcodeImage` içinde `max-w-full` canvas.

- [x] **4.4** Barkod metni ayrıca gösterilmiyor (minimal kapsam; istenirse sonra eklenir).



**Çıktı:** Erikli / Kuzeyden 5 L referansı net.



---



## Faz 5 — Masaüstü kalite ve erişilebilirlik



**Amaç:** PC kullanımı için cilalama (mobil senaryo yok).



- [x] **5.1** İçerik alanı: `min-h-0 flex-1 overflow-y-auto overscroll-y-contain`; `aside` için `min-h-0` + `h-dvh` (dar/kısa pencerede dikey kaydırma).

- [x] **5.2** `Escape` ile kapatma; açılışta kapat butonuna `requestAnimationFrame` ile odak, kapanırken önceki odağa dönüş (`isConnected` kontrolü).

- [x] **5.3** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` + ekran okuyucu için `aria-describedby` ve `sr-only` kısa açıklama.

- [x] **5.4** Kapat: `h-10 min-h-10 min-w-10` (~40px); metin `text-zinc-700` / koyu modda `text-zinc-200`; backdrop `bg-black/45`; `focus-visible:outline` (sky).



**Çıktı:** Üretime uygun PC deneyimi.



---



## Faz 6 — Entegrasyon ve doğrulama



**Amaç:** Sadece `app/page.tsx` hattında birleştirme ve test.



- [ ] **6.1** `app/page.tsx` içinde Faz 2 butonu + Faz 3–4 bileşeni; `products` state’ini Faz 1 çözümleyiciye geçir.

- [ ] **6.2** `npm run build` temiz.

- [ ] **6.3** Manuel test (masaüstü): aç/kapat, backdrop, ESC, tema; tarayıcı penceresini daraltınca breakpoint altında buton/panelin **görünmediğini** doğrula; mobil emülasyon veya dar viewport’ta özellik yok.



**Çıktı:** Özellik tamam; Netlify deploy ile uyumlu.



---



## Özet tablo



| Faz | Konu |

|-----|------|

| 0 | Kilit kararlar: sadece `page.tsx`, sabit barkod + listeden çözüm, sadece PC |

| 1 | Sabit barkodlar + `products` içinden eşleme |

| 2 | Sağ tetikleyici, yalnızca `md+` |

| 3 | Drawer, overlay, animasyon, kapatma |

| 4 | İki kart: görsel + BarcodeImage |

| 5 | PC kalite, a11y, dar pencere scroll |

| 6 | `page.tsx` entegrasyonu, build, masaüstü/mobil görünürlük testi |



**Dosya odakları (tahmini):** `app/page.tsx`, `app/components/ReferenceWaterProductsPanel.tsx`, `app/lib/referenceWaterProducts.ts`, mevcut `BarcodeImage.tsx`.



---



*Son güncelleme: Faz 0 kararları (yalnızca `app/page.tsx`, katalogdan sabit barkodla çözüm, yalnızca PC) dokümana işlendi.*

