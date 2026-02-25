## Arama Performansı İyileştirme — Yol Haritası

Bu belge, arama kutusuna yazarken oluşan donmaları azaltmak ve daha akıcı bir deneyim sağlamak için yapılacak adımları listeler. Her görevi tamamladıkça `[ ]` işaretini `[x]` yaparak ilerleyeceğiz.

---

## Faz 1 — Mevcut Arama Davranışını Analiz Etme

**Amaç:** Donmanın tam olarak nerede ve neden oluştuğunu netleştirmek.

- [x] `app/page.tsx` içinde arama state'ini ve filtreleme mantığını tespit et
  - [x] `searchQuery` (veya eşdeğeri) state'in nerede tanımlandığını bul
  - [x] Arama input'unun `onChange` handler'ını ve hangi fonksiyonu çağırdığını incele
  - [x] `filteredCatalogProducts`, `displayItems` vb. arama ile ilgili `useMemo` ve fonksiyonları tespit et
- [x] Arama esnasında yapılan ağır işlemleri belirle
  - [x] Her tuş vuruşunda büyük bir dizi üzerinde `filter`/`includes` çalışıyor mu kontrol et
  - [x] Her tuş vuruşunda API isteği (Firestore / Getir) yapılıyor mu kontrol et
  - [x] Liste render'ını yavaşlatan bileşenleri (örneğin `BarcodeImage`) not et
- [x] Donmanın en çok hissedildiği senaryoları not et
  - [x] Tek harf yazıldığında kaç ms/sn sürdüğünü gözlemle (örnek: 3–10 saniye)
  - [x] 2–3 harf yazıldığında davranışı karşılaştır

---

## Faz 2 — Minimum Karakter Eşiği Eklemek

**Amaç:** Çok kısa aramalarda (örneğin tek harf) filtreleme yapmayarak gereksiz yükü azaltmak.

- [x] Minimum arama uzunluğunu belirle
  - [x] `MIN_SEARCH_LENGTH` sabitini ekle (örneğin `2` veya `3`)
  - [x] Bu değeri kolay değiştirilebilir bir yerde tut (sayfanın üst kısmında sabit olarak)
- [x] Filtreleme mantığına minimum uzunluk kuralını uygula
  - [x] `filteredCatalogProducts` / `displayItems` hesaplanırken:
  - [x] `searchQuery.trim().length < MIN_SEARCH_LENGTH` ise listeyi boş döndür veya filtrelemeyi atla
  - [ ] Çok ağırsa, `searchQuery` boşken de (uzun liste render'ını önlemek için) başlangıçta boş liste göstermeyi değerlendir
- [x] Kullanıcıya minimum karakter uyarısı göster
  - [x] Eğer `searchQuery.length > 0` ve `< MIN_SEARCH_LENGTH` ise:
  - [x] Liste alanında “En az X karakter yazın” şeklinde küçük bir bilgi kutusu göster
- [ ] Değişiklikleri test et
  - [ ] 1 harf yazıldığında:
    - [ ] Filtreleme ve ağır işlemler tetiklenmiyor mu kontrol et
    - [ ] Donmanın belirgin şekilde azaldığını doğrula
  - [ ] 2–3 harf yazıldığında sonuçların geldiğini ve kabul edilebilir sürede yüklendiğini kontrol et

---

## Faz 3 — Debounce ile Gereksiz Hesaplamaları Azaltmak

**Amaç:** Kullanıcı her tuşa bastığında değil, kısa bir beklemeden sonra arama yaparak performansı artırmak.

- [x] Basit bir `useDebounce` hook'u yaz
  - [x] Parametreler: `value`, `delay` (örneğin 300–400 ms)
  - [x] Çıktı: Gecikmeli güncellenen `debouncedValue`
  - [x] `setTimeout` / `clearTimeout` ile klasik debounce mantığını uygula
- [x] Aramayı debounced değer üzerinden çalıştır
  - [x] Filtreleme/arama `searchQuery` yerine `debouncedSearchQuery` ile yapılsın
  - [x] Input anında güncellensin ama ağır hesaplamalar sadece `debouncedSearchQuery` değiştiğinde tetiklensin
- [x] Debounce süresini ayarla
  - [x] 300 ms ile başla, cihaz performansına göre 400–500 ms'ye çekmeyi değerlendir
  - [ ] Çok yavaş hissettiriyorsa süreyi tekrar düşür
- [ ] Gerekirse basit bir "Aranıyor..." göstergesi ekle
  - [ ] Debounce bekleme süresinde küçük bir loading metni/icon'u opsiyonel olarak göster

---

## Faz 4 — Büyük Veri Seti ile Test ve İnce Ayar

**Amaç:** Gerçek veri miktarıyla (on binlerce ürün) performansı doğrulamak ve son ayarları yapmak.

- [ ] Gerçek `products.json` (tüm ürünler) ile test yap
  - [ ] 1 harf yaz → hiçbir filtreleme/sonuç hesaplanmamalı, sayfa donmamalı
  - [ ] 2–3 harf yaz → 0.5–1 saniye gibi kabul edilebilir bir sürede sonuçlar gelmeli
  - [ ] Hızlıca birkaç harf yazıp silme senaryosunda arka arkaya debounce'ların performansını gözlemle
- [ ] Minimum karakter ve debounce değerlerini ince ayar yap
  - [ ] Gerekirse `MIN_SEARCH_LENGTH` değerini 2 ↔ 3 arasında değiştirerek deney yap
  - [ ] Debounce süresini kullanıcı deneyimi ve performans dengesine göre güncelle
- [ ] Ek optimizasyonları değerlendir (gerekirse)
  - [ ] İsim araması yerine öncelikli olarak barkod araması kullanmak (daha hızlı ve net eşleşme)
  - [ ] Çok sık kullanılan alanlar için önceden lowerCase cache'lemek (örneğin, `nameLower`, `barcodeLower` alanları oluşturmak)
  - [ ] Liste render performansı hâlâ sorunluysa:
    - [ ] Sanal listeleme (virtualization) gibi ileri teknikleri yol haritasına eklemek

---

## Faz 5 — Son Kontrol ve Dokümantasyon

**Amaç:** Yapılan iyileştirmeleri kalıcı hale getirmek ve gelecekteki geliştirmeler için net bir referans bırakmak.

- [ ] Kod içinde kritik noktalara kısa yorumlar ekle (özellikle minimum karakter ve debounce logic)
- [ ] Bu dosyada tamamlanan görevleri `[x]` işaretiyle güncelle
- [ ] Arama performansındaki iyileştirmeyi (önce/sonra hissiyatı) kısaca not al


