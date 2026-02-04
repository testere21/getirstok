# Faz 4 — Modal ve Form (Veri Girişi) — Detaylı Yol Haritası

Bu belge, Faz 4'ün tüm adımlarını tek tek listeler. Her görevi tamamladıkça `[ ]` işaretini `[x]` yaparak ilerleyeceğiz.

**Amaç:** Eksik/fazla ürün eklemek için modal içinde formu oluşturmak ve Firestore'a yazmak.

---

## 1. Mevcut Modal ve Type Prop

- [x] `app/components/AddProductModal.tsx` dosyasının mevcut olduğunu ve `isOpen`, `onClose`, `type` prop'larını aldığını doğrula
- [x] `type` prop'unun `'missing'` veya `'extra'` olduğunda başlığın doğru göründüğünü doğrula (Eksik Ürün / Fazla Ürün)
- [x] Form eklenecek alanı belirle: placeholder metni kaldırıp form bileşenleri eklenecek

---

## 2. Form State ve Alanları — Ürün İsmi, Barkod

- [x] Modal içinde form state'i tanımla: `name`, `barcode`, `quantity`, `notes` (hepsi string; quantity submit öncesi number'a çevrilecek)
- [x] Başlangıç değerleri: boş string (veya `quantity` için `'0'` / `''`)
- [x] **Ürün İsmi** alanı ekle: `<input type="text">`, label "Ürün İsmi", `value` ve `onChange` state'e bağla
- [x] **Barkod** alanı ekle: `<input type="text">` (barkod sayı da olabilir, text yeterli), label "Barkod", `value` ve `onChange` state'e bağla
- [x] Her iki alanı da erişilebilir yap (label + id veya aria-label)

---

## 3. Form Alanları — Miktar, Notlar

- [x] **Miktar** alanı ekle: `<input type="number" min="0">` veya `type="text"` + sayı validasyonu, label "Miktar", state'te string tut (submit'te number yap)
- [x] **Notlar** alanı ekle: `<textarea>`, label "Notlar (opsiyonel)", `value` ve `onChange` state'e bağla
- [x] Form açıldığında veya kapandığında state'i sıfırlayacak mantığı planla (onClose veya başarılı submit sonrası)

---

## 4. Form Layout ve Stil

- [x] Form alanlarını düzenli bir layout'ta göster (örn. her alan alt alta, label üstte)
- [x] Tailwind ile input/textarea stilleri ver: border, padding, rounded, focus ring
- [x] Submit butonu ekle: "Ekle" veya "Kaydet" metni; formun altında
- [x] Gerekirse loading state için butonu disable etme veya "Kaydediliyor..." metni (submit sırasında)

---

## 5. Validasyon

- [x] Submit handler'da **Ürün İsmi** zorunlu kontrolü: boşsa hata mesajı
- [x] **Barkod** zorunlu kontrolü: boşsa hata mesajı (veya opsiyonel bırakılabilir; ROADMAP'e göre zorunlu kabul edelim)
- [x] **Miktar** kontrolü: sayı mı, 0'dan büyük mü (veya ≥ 0); değilse hata mesajı
- [x] Notlar opsiyonel; validasyon gerekmez
- [x] Hata mesajlarını state'te tut (örn. `validationError: string | null`) ve form üstünde veya ilgili alanın yanında göster

---

## 6. Firestore Ekleme Servisi Entegrasyonu

- [x] `addStockItem` fonksiyonunu `app/lib/stockService.ts` dosyasından import et
- [x] Submit handler'da validasyon geçtikten sonra `addStockItem({ name, barcode, quantity: Number(quantity), notes, type })` çağır
- [x] Çağrıyı `async` yap; `await addStockItem(...)` kullan
- [x] Başarılı eklemeden hemen sonra `onClose()` çağır ve form state'ini sıfırla (name, barcode, quantity, notes, validationError)
- [x] Modal kapandığında formun sıfırlanmış açılması için: modal açılırken (isOpen true olduğunda) state'i resetleyebilirsin veya sadece submit sonrası sıfırla

---

## 7. Hata ve Başarı Geri Bildirimi

- [x] `try/catch` ile `addStockItem` çağrısını sar
- [x] Hata yakalandığında kullanıcıya kısa mesaj göster (örn. "Kayıt eklenirken bir hata oluştu" + catch'teki error.message isteğe bağlı)
- [x] Hata mesajını form üstünde (validationError benzeri) veya toast/alert ile göster; state'te `submitError` tutulabilir
- [x] Başarılı eklemede isteğe bağlı kısa "Eklendi" mesajı (örn. 1–2 saniye gösterip kapat); zorunlu değil, modal kapatmak yeterli

---

## 8. Form Sıfırlama ve Modal Kapatma

- [x] Submit başarılı olduğunda tüm form alanlarını ve hata mesajlarını sıfırla
- [x] `onClose()` çağrıldığında parent state (modalType) null olacak; modal kapandığında bir sonraki açılışta form temiz açılsın diye isteğe bağlı: `useEffect` ile `isOpen` true olduğunda state'i resetle
- [x] Kullanıcı X veya overlay ile kapatırsa form sıfırlanması isteğe bağlı (bir sonraki açılışta reset için useEffect yeterli)

---

## Faz 4 Tamamlandığında

- [x] Tüm yukarıdaki maddeleri `[x]` yaptıktan sonra ana `ROADMAP.md` içindeki Faz 4 görevlerini de işaretle
- [x] Tarayıcıda test et: modal aç, formu doldur, kaydet; Firestore'da doküman oluştuğunu doğrula (Firebase Console veya liste ekranı)
- [x] Faz 5'e geçmeye hazır olduğunu doğrula (istatistik kartları)

---

*Bu dosya sadece Faz 4'e özeldir. Genel proje yol haritası için `ROADMAP.md` kullanılır.*
