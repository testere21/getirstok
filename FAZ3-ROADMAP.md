# Faz 3 — Sayfa Yapısı ve Üst Bölüm (Arama + Butonlar) — Detaylı Yol Haritası

Bu belge, Faz 3'ün tüm adımlarını tek tek listeler. Her görevi tamamladıkça `[ ]` işaretini `[x]` yaparak ilerleyeceğiz.

**Amaç:** Ana sayfanın iskeletini kurmak, sabit arama çubuğu ve "Eksik Ürün Ekle" / "Fazla Ürün Ekle" butonlarını yerleştirmek.

---

## 1. Layout ve Sayfa İskeleti

- [x] `app/layout.tsx` dosyasını aç; mevcut yapıyı kontrol et (Faz 1'de main + container eklenmişti)
- [x] Ana içeriğin `app/page.tsx` içinde render edildiğinden emin ol
- [x] `app/page.tsx` içinde varsayılan Next.js demo içeriğini kaldır veya basit bir başlık/placeholder ile değiştir
- [x] Sayfa yapısını bölümlere ayır: üst bölüm (butonlar + arama), orta (ileride istatistik kartları), alt (ileride sekmeli listeler) — şimdilik boş div veya yorum ile alan bırak
- [x] Layout'un mobil uyumlu (responsive) kaldığını doğrula (mevcut max-w-7xl, px-4 vb.)

---

## 2. İki Büyük Buton (Eksik Ürün Ekle / Fazla Ürün Ekle)

- [x] Ana sayfada (arama çubuğunun **üstünde**) iki buton için bir container/satır oluştur
- [x] "Eksik Ürün Ekle" butonunu ekle (Lucide ikonu kullan: örn. `Minus` veya `PackageMinus`)
- [x] "Fazla Ürün Ekle" butonunu ekle (Lucide ikonu kullan: örn. `Plus` veya `PackagePlus`)
- [x] Butonları görsel olarak ayır: eksik için kırmızı/uyarı tonu, fazla için yeşil tonu (Tailwind veya globals.css'teki --color-missing, --color-extra)
- [x] Butonları büyük ve tıklanabilir yap (padding, font-size); mobilde yan yana veya alt alta responsive
- [x] İki butonun da tıklanabilir olduğunu ve şimdilik `console.log` veya alert ile test et

---

## 3. Modal Açma State'i

- [x] Ana sayfada (veya üst bölümü saran bileşende) bir state tanımla: hangi modal açık (örn. `null | 'missing' | 'extra'`)
- [x] State tipini TypeScript ile netleştir (örn. `type ModalType = null | 'missing' | 'extra'`)
- [x] "Eksik Ürün Ekle" tıklandığında state'i `'missing'` yapan handler yaz
- [x] "Fazla Ürün Ekle" tıklandığında state'i `'extra'` yapan handler yaz
- [x] Modal bileşenine (Faz 4'te oluşturulacak) state'i ve kapatma fonksiyonunu prop olarak geçecek yapıyı hazırla (örn. `openModal={modalType}` ve `onClose={() => setModalType(null)}`)

---

## 4. Modal Placeholder (Faz 4 Öncesi)

- [x] Basit bir modal bileşeni oluştur (örn. `app/components/AddProductModal.tsx` veya `app/components/Modal.tsx`)
- [x] Modal: overlay (arka plan karartma) + ortada kutu (içerik alanı) + kapatma butonu (X)
- [x] Modal açık/kapalı prop ile kontrol edilsin (örn. `isOpen` ve `onClose`)
- [x] İçerik kısmında şimdilik "Eksik Ürün" veya "Fazla Ürün" başlığı + "Form Faz 4'te eklenecek" gibi placeholder metin
- [x] Kapatma butonuna ve overlay tıklanınca `onClose` çağrılsın
- [x] Ana sayfada modal state'e göre bu bileşeni render et; butonlara tıklanınca modal açılsın, kapatınca kapansın

---

## 5. Arama Çubuğu Bileşeni

- [x] Arama çubuğu için bir bileşen oluştur (örn. `app/components/SearchBar.tsx`)
- [x] Bileşen bir `input` (type text) içersin; placeholder: "Ürün ismi veya barkod ile ara"
- [x] Controlled component yap: `value` ve `onChange` prop'ları alsın (ana sayfa state'i yönetecek)
- [x] Lucide `Search` ikonunu input'un solunda veya içinde göster (isteğe bağlı)
- [x] Tailwind ile stil ver: border, padding, rounded; focus ring
- [x] Bileşeni export et ve ana sayfada kullan

---

## 6. Arama Çubuğunun Konumu ve State

- [x] Ana sayfada arama metni için state tanımla (örn. `searchQuery` string, başlangıç `''`)
- [x] Arama çubuğunu sayfanın **en üstünde** (butonların altında) ve **sticky** konumda yerleştir (`position: sticky`, `top: 0`, `z-index` uygun)
- [x] Sticky alanın arka plan rengi ver (scroll'da içerik altında kalmaması için); gölge isteğe bağlı
- [x] SearchBar'a `value={searchQuery}` ve `onChange={(e) => setSearchQuery(e.target.value)}` bağla
- [x] Arama değerinin yazıldıkça güncellendiğini tarayıcıda doğrula (ileride bu state ile listeler filtrelenecek)

---

## 7. Buton–Modal Bağlantısı ve Sıra

- [x] Sayfa üstündeki sırayı netleştir: 1) İki büyük buton (en üst), 2) Sticky arama çubuğu, 3) Altında içerik alanı
- [x] Butonlara tıklandığında ilgili modal'ın açıldığını doğrula (eksik → missing başlıklı modal, fazla → extra başlıklı modal)
- [x] Modal kapatıldığında state'in `null` olduğunu ve modal'ın kaybolduğunu doğrula
- [x] Gerekirse keyboard ile Escape ile modal kapatmayı ekle (isteğe bağlı)

---

## Faz 3 Tamamlandığında

- [x] Tüm yukarıdaki maddeleri `[x]` yaptıktan sonra ana `ROADMAP.md` içindeki Faz 3 görevlerini de işaretle
- [x] Tarayıcıda sayfayı test et: butonlar, arama çubuğu, modal aç/kapa akışı çalışıyor olmalı
- [x] Faz 4'e geçmeye hazır olduğunu doğrula (modal içine form eklenecek)

---

*Bu dosya sadece Faz 3'e özeldir. Genel proje yol haritası için `ROADMAP.md` kullanılır.*
