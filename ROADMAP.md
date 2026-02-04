# Stok Takip Paneli — Yol Haritası (ROADMAP)

Bu belge, panelin çalışma mantığı ve teknik spesifikasyonlarına dayanarak proje fazlarını tanımlar. Her görevi tamamladıkça `[ ]` işaretini `[x]` yaparak ilerleyeceğiz.

---

## Genel Özet

- **Ürün:** Açık erişimli (public) stok takip paneli — Auth/Login yok.
- **Erişim:** Linke sahip herkes ekleme, silme ve düzenleme yapabilir.
- **Teknoloji:** Next.js (App Router), Tailwind CSS, Firebase Cloud Firestore, Lucide-React, Netlify.

---

## Faz 1 — Proje ve Ortam Kurulumu

**Amaç:** Next.js projesi oluşturmak, gerekli bağımlılıkları eklemek ve Netlify'a uyumlu yapıyı hazırlamak.

- [x] Next.js projesi oluştur (App Router seçili)
- [x] Tailwind CSS kur ve yapılandır
- [x] Tailwind için responsive/mobil uyumlu temel ayarları yap
- [x] Firebase paketini kur (`firebase`)
- [x] `.env.local` dosyası oluştur ve Firebase config değişkenlerini ekle (API key, project ID vb.)
- [x] Firebase initialize ve Firestore instance için bir modül dosyası oluştur (içeriği Faz 2'de doldurulacak, şimdilik dosya yapısı hazırlansın)
- [x] Lucide-React paketini kur
- [x] Proje köküne `netlify.toml` ekle
- [x] `netlify.toml` içinde build komutu ve publish dizinini tanımla
- [x] `npm run build` ile projenin hatasız build olduğunu doğrula

**Çıktı:** Çalışan bir Next.js uygulaması, Tailwind + Firebase + Lucide entegre, Netlify'a deploy edilebilir temel yapı.

---

## Faz 2 — Firestore Veri Modeli ve Servis Katmanı

**Amaç:** Firestore koleksiyon yapısını netleştirmek ve real-time okuma/yazma için servis fonksiyonlarını tanımlamak.

- [x] Koleksiyon adını belirle (örn. `products` veya `stock_items`)
- [x] Doküman şemasını netleştir: `name`, `barcode`, `quantity`, `notes`, `type` ('missing' | 'extra'), `createdAt`
- [x] Firebase initialize kodunu yaz (env'den config okuyacak)
- [x] Firestore referansını (collection) tek bir modülde export et
- [x] Ekleme servisi yaz: yeni ürün dokümanı ekle (type ile eksik/fazla ayrımı)
- [x] Silme servisi yaz: doküman ID ile sil
- [x] Düzenleme servisi yaz: doküman ID ile güncelle (isteğe bağlı, ileride kullanılacak)
- [x] Real-time dinleme fonksiyonu yaz: `onSnapshot` ile tüm koleksiyonu dinle, callback ile veri döndür
- [x] Servisleri tek bir dosyada veya mantıklı modüllerde topla ve export et

**Çıktı:** Net veri modeli, merkezi Firestore client ve ekleme/silme/düzenleme + real-time listener kullanımına hazır servisler.

---

## Faz 3 — Sayfa Yapısı ve Üst Bölüm (Arama + Butonlar)

**Amaç:** Ana sayfanın iskeletini kurmak, sabit arama çubuğu ve "Eksik Ürün Ekle" / "Fazla Ürün Ekle" butonlarını yerleştirmek.

- [x] App Router'da `app/layout.tsx` içinde ana layout'u tanımla (container, temel HTML yapısı)
- [x] `app/page.tsx` ana sayfa route'unu oluştur
- [x] Sayfa üstünde "Eksik Ürün Ekle" ve "Fazla Ürün Ekle" için iki büyük buton yerleştir (arama çubuğunun üstünde)
- [x] İki buton için tıklanınca açılacak modal state'ini ekle (hangi modal açık: eksik / fazla / kapalı)
- [x] Arama çubuğu bileşenini oluştur (input, placeholder: ürün ismi veya barkod)
- [x] Arama çubuğunu sayfanın en üstünde sabit (sticky) konumda yerleştir
- [x] Arama input'unun değerini state'te tut; onChange ile güncelle
- [x] Butonlara tıklandığında ilgili modal'ı açacak handler'ları bağla (modal içeriği Faz 4'te eklenecek)

**Çıktı:** Çalışan sayfa iskeleti, sabit arama alanı ve modal tetikleyen iki buton.

---

## Faz 4 — Modal ve Form (Veri Girişi)

**Amaç:** Eksik/fazla ürün eklemek için modal içinde formu oluşturmak ve Firestore'a yazmak.

- [x] Modal bileşeni oluştur (açık/kapalı, overlay, kapatma butonu)
- [x] Modal'a `type` prop'u ekle: 'missing' veya 'extra' (başlık ve submit davranışı buna göre)
- [x] Form alanlarını ekle: Ürün İsmi (text input)
- [x] Form alanlarını ekle: Barkod (text/number input)
- [x] Form alanlarını ekle: Miktar (number input)
- [x] Form alanlarını ekle: Notlar (textarea)
- [x] Form submit handler yaz: validasyon (zorunlu alanlar, miktar sayı mı)
- [x] Validasyon hatalarında kullanıcıya mesaj göster
- [x] Submit'te Firestore ekleme servisini çağır (type: 'missing' veya 'extra')
- [x] Başarılı eklemeden sonra modal'ı kapat ve formu sıfırla
- [x] Hata durumunda kullanıcıya kısa geri bildirim göster

**Çıktı:** Eksik/fazla ürün ekleyen, Firestore'a kaydeden tam çalışan modal form.

---

## Faz 5 — İstatistik Kartları (Dinamik Özet)

**Amaç:** Sayfanın orta kısmında üç dinamik kartı göstermek; veri Firestore'dan real-time gelecek ve arama/filtreye göre güncellenecek.

- [x] Firestore'dan gelen listeyi (onSnapshot) ana sayfada state'te tut
- [x] Arama çubuğundaki değere göre listeyi filtreleyen bir fonksiyon/hesaplanmış veri yaz (ürün ismi veya barkod içinde arama)
- [x] Kart 1: Toplam Ürün Çeşidi — filtrelenmiş listedeki benzersiz ürün (kalem) sayısını hesapla ve göster
- [x] Kart 2: Toplam Eksik Ürün Miktarı — filtrelenmiş listede type === 'missing' olanların quantity toplamını hesapla ve göster
- [x] Kart 3: Toplam Fazla Ürün Miktarı — filtrelenmiş listede type === 'extra' olanların quantity toplamını hesapla ve göster
- [x] Üç kartı yan yana (grid/flex) sayfanın orta bölümünde yerleştir
- [x] Arama değiştiğinde kartların filtrelenmiş veriye göre anlık güncellendiğini doğrula

**Çıktı:** Arama ile senkron, anlık güncellenen üç istatistik kartı.

---

## Faz 6 — Sekmeli Listeler (Eksik / Fazla Ürünler)

**Amaç:** Sayfanın en altında iki sekmeli yapıda listeleme ve her satırda "Sil" ve "Düzenle" butonları sunmak.

- [x] Tabs bileşenini oluştur: iki sekme — "Eksik Ürünler" ve "Fazla Ürünler"
- [x] Aktif sekme state'ini tut; tıklanınca sekme değişsin
- [x] Sekme 1'de: type === 'missing' olan ürünleri listele (filtrelenmiş veriden)
- [x] Sekme 2'de: type === 'extra' olan ürünleri listele (filtrelenmiş veriden)
- [x] Her satırda göster: Ürün ismi, barkod, miktar, notlar (ve gerekirse createdAt)
- [x] Her satırın sağına "Sil" butonu ekle (Lucide ikonu kullan)
- [x] Sil butonuna tıklanınca Firestore silme servisini çağır (ilgili doküman ID ile)
- [x] Her satırın sağına "Düzenle" butonu ekle (Lucide ikonu kullan)
- [x] Düzenle butonuna tıklanınca AddProductModal'ı "edit" modunda aç (initialItem prop ile)
- [x] AddProductModal'ı edit moduna uyarla: başlık "Ürünü Düzenle", form alanları önceden doldurulmuş, submit'te updateStockItem çağrılır
- [x] Listelerin arama çubuğuna göre anlık filtrelenmesini bağla (zaten filtrelenmiş veri kullanılacak)

**Çıktı:** İki sekmeli, real-time ve filtrelenebilir liste; silme ve düzenleme işlemleri çalışır durumda.

---

## Faz 6.5 — Ürün Kataloğu Entegrasyonu

**Amaç:** Yeni ürün eklerken manuel giriş yerine Getir panelinden çekilen ürün kataloğundan seçim yapılmasını sağlamak.

- [x] `data/products.json` dosyası oluştur (Getir panelinden çekilen ürün kataloğu)
- [x] `app/api/products/route.ts` API route oluştur (products.json'ı okuyup döndürür)
- [x] `scripts/getir-console-scraper-simple.js` script'i oluştur (Getir panelinde tüm sayfaları otomatik dolaşır)
- [x] `app/api/products/save/route.ts` API route oluştur (POST ile products.json'a yazar, CORS desteği ile)
- [x] AddProductModal'da "add" modunda ürün kataloğunu `/api/products`'dan fetch et
- [x] Katalog listesini arama yapılabilir şekilde göster (ürün ismi veya barkod ile filtreleme)
- [x] Kullanıcı bir ürün seçtiğinde name ve barcode otomatik doldurulsun, sadece quantity ve notes girilebilir olsun
- [x] Edit modunda katalog gösterilmez (manuel düzenleme için)
- [x] Toplam **7722 benzersiz ürün** kataloğa eklendi

**Çıktı:** Yeni ürün eklerken katalogdan seçim yapılabilir; manuel giriş yerine hızlı ve hatasız ekleme.

---

## Faz 7 — Real-time Filtreleme ve UX İyileştirmeleri

**Amaç:** Arama ile tüm sayfanın tutarlı şekilde filtrelenmesini sağlamak ve kullanıcı deneyimini son haline getirmek.

**📋 Detaylı yol haritası için:** [`FAZ7-ROADMAP.md`](./FAZ7-ROADMAP.md) dosyasına bakın.

### Ana Görevler:

- [ ] **Filtreleme Tutarlılığı:** Tüm bileşenlerin aynı filtrelenmiş veriyi kullandığını doğrula
- [ ] **Loading State:** Skeleton UI ve loading göstergesi ekle
- [ ] **Boş Liste Durumları:** EmptyState bileşeni ile anlamlı mesajlar göster
- [ ] **Hata Yönetimi:** ErrorMessage bileşeni ve Firestore hata yakalama
- [ ] **Mobil Responsive:** Buton boyutları, sticky davranış, liste görünümü optimizasyonu
- [ ] **Performans:** useMemo optimizasyonları ve render performansı kontrolü
- [ ] **Erişilebilirlik:** ARIA labels, klavye navigasyonu desteği
- [ ] **Görsel İyileştirmeler:** Animasyonlar ve hover efektleri (opsiyonel)
- [ ] **Son Kontroller:** Tüm testler ve build kontrolü

**Çıktı:** Tutarlı real-time arama/filtreleme, profesyonel UX ve mobil uyumlu panel.

---

## Faz 8 — Netlify Dağıtımı ve Son Kontroller

**Amaç:** Projeyi Netlify'da yayına almak ve production ortamını doğrulamak.

- [ ] Next.js için Netlify adapter/plugin gerekiyorsa kur ve yapılandır (Next.js + Netlify dokümantasyonuna göre)
- [ ] `netlify.toml` içinde build komutunu ve environment'ı netleştir
- [ ] Netlify panelinde environment variables tanımla (Firebase API key, project ID, vb.)
- [ ] Projeyi Netlify'a bağla (Git repo veya manuel deploy)
- [ ] Production build ve deploy çalıştır
- [ ] Canlı sitede sayfanın açıldığını doğrula
- [ ] Canlı sitede Firestore bağlantısını test et (ekleme, listeleme, silme)
- [ ] Firestore Security Rules'u gözden geçir; panel public kalacak şekilde read/write kurallarını ayarla

**Çıktı:** Canlı Netlify URL'i; panel açık erişimle çalışır durumda.

---

## Özet Tablo

| Faz | İçerik | Ana çıktı |
|-----|--------|-----------|
| 1 | Proje + Next.js, Tailwind, Firebase, Lucide, Netlify hazırlık | Çalışan temel uygulama |
| 2 | Firestore şeması, servisler, onSnapshot | Veri katmanı hazır |
| 3 | Sayfa iskeleti, arama çubuğu, iki büyük buton, modal tetikleme | Üst bölüm + arama |
| 4 | Modal form (isim, barkod, miktar, notlar), Firestore'a ekleme | Eksik/fazla ürün girişi |
| 5 | 3 istatistik kartı, arama ile senkron | Dinamik özet paneli |
| 6 | İki sekmeli liste, Sil ve Düzenle butonları, filtreleme | Listeleme, silme ve düzenleme |
| 6.5 | Ürün kataloğu entegrasyonu (7722 ürün), API route'lar, scraper script | Katalogdan seçim ile ekleme |
| 7 | Real-time filtre tutarlılığı, UX/responsive | Son UX |
| 8 | Netlify deploy, env, production kontrol | Canlı panel |

---

*Tamamlanan her görevde `[ ]` işaretini `[x]` yaparak ilerleyeceğiz. "Harekete geç" dediğinde Faz 1'den itibaren kod adımlarına geçilecektir.*
