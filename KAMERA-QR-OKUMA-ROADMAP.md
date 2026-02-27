# Kamera ile QR/Barkod Okuma – Tüm Telefonlarda Uyumluluk Yol Haritası

Bu doküman, barkod tarayıcı özelliğinin bazı telefonlarda çalışıp bazılarında çalışmama sorununu gidermek için adım adım izlenecek yol haritasını içerir.

---

## Mevcut Durum Özeti

- **Kütüphane:** `html5-qrcode` (v2.3.8)
- **Bileşen:** `app/components/BarcodeScanner.tsx`
- **Özellikler:** Arka kamera tercihi, 1280x720 ideal çözünürlük, fps: 10, qrbox ile alan sınırı, bip sesi, hata mesajları
- **Sorun:** Bazı telefon modellerinde kamera açılmıyor veya barkod okuma düzgün çalışmıyor.

---

## Olası Nedenler (Tüm Telefonlarda Çalışmama)

| Neden | Açıklama |
|-------|----------|
| **Video constraints** | `ideal: 1280x720` bazı cihazlarda desteklenmiyor; istek reddediliyor. |
| **Kamera ID + constraints çakışması** | Hem `cameraId` hem `videoConstraints` gönderildiğinde bazı tarayıcılar hata verebiliyor. |
| **FPS** | Düşük performanslı cihazlarda 10 fps bile ağır olabilir. |
| **Arka kamera seçimi** | Cihaz etiketleri farklı dillerde (back/rear/umgebung/trasa) veya boş; yanlış kamera seçilebiliyor. |
| **Container boyutu** | Modal açılır açılmaz scanner başlatılıyor; bazı cihazlarda container henüz 0x0 olabiliyor. |
| **HTTPS / güvenli bağlam** | Kamera API’si çoğu cihazda sadece HTTPS veya localhost’ta çalışır. |
| **Tarayıcı farkları** | iOS Safari, Android Chrome, Samsung Internet farklı getUserMedia davranışları. |
| **Temizlik (cleanup)** | Önceki açılışta kamera düzgün kapatılmazsa sonraki açılışta “device in use” benzeri hatalar. |
| **Barkod formatları** | Varsayılan format listesi bazı cihazlarda eksik veya farklı olabilir. |

---

## Faz 1 — Teşhis ve Loglama

**Amaç:** Hangi cihaz/tarayıcıda neyin fail ettiğini netleştirmek.

- [x] **1.1** Tarayıcı ve cihaz bilgisini loglama  
  - `navigator.userAgent`, `navigator.mediaDevices` varlığı, `navigator.permissions?.query({ name: 'camera' })` (varsa).  
  - Bu bilgileri sadece geliştirme ortamında veya bir “Hata gönder” ile toplanacak şekilde kullan (gizlilik için production’da dikkatli ol).

- [x] **1.2** Kamera listesi loglama  
  - `Html5Qrcode.getCameras()` sonucunu (sayı, id’ler, label’lar) console’a yaz.  
  - Hangi kameranın seçildiğini (id veya “facingMode fallback”) logla.

- [x] **1.3** `getUserMedia` / scanner hata detayı  
  - `scanner.start()` catch içinde hata adı, mesajı ve (varsa) `err.name` logla.  
  - Mümkünse kullanıcıya “Gelişmiş bilgi” ile gösterme seçeneği (ör. “Hata kodu: NOT_FOUND_ERR”).

- [x] **1.4** Container boyutu kontrolü  
  - Scanner başlamadan hemen önce `scannerRef.current` için `clientWidth` / `clientHeight` logla.  
  - 0x0 ise “Container henüz hazır değil” benzeri bir not düş; Faz 2’de buna göre gecikme veya ResizeObserver ekleyeceğiz.

**Çıktı:** Hangi aşamada (izin, kamera listesi, start, container) fail olduğu netleşir; Faz 2–4’teki düzeltmeler buna göre yapılır.

---

## Faz 2 — Video Constraints Esnekleştirme

**Amaç:** Farklı cihazların desteklediği çözünürlük ve constraint’lere uyum.

- [x] **2.1** “Önce esnek, gerekirse sıkı” stratejisi  
  - İlk denemede **sadece** `facingMode: "environment"` kullan (width/height verme).  
  - Başarısız olursa ikinci denemede `ideal` veya `min` ekle (ör. 640x480, 1280x720).

- [x] **2.2** Kamera ID kullanırken constraints’i sadeleştirme  
  - `cameraId` (string) ile başlatırken `videoConstraints` içinde **sadece** `facingMode` kullan; width/height ekleme.  
  - Sadece `facingMode` ile başlatırken esnek width/height (ideal veya min/max) kullan.

- [x] **2.3** Çözünürlük fallback zinciri (isteğe bağlı)  
  - Sırayla dene: (1) constraints yok, (2) ideal 1280x720, (3) ideal 640x480, (4) min 320x240.  
  - İlk başarılı denemeyi kullan; diğerlerini deneme.

- [x] **2.4** FPS’i cihaza göre ayarlama  
  - Varsayılanı 10’dan 5–7’ye düşür (özellikle “yavaş” veya “eski cihaz” tespiti yapılıyorsa).  
  - İsteğe bağlı: ilk start hatasında ikinci denemeyi daha düşük FPS ile yap.

**Çıktı:** Birçok modelde “constraint not satisfied” veya “overconstrained” hataları azalır.

---

## Faz 3 — Kamera Seçimi ve Başlatma Sırası

**Amaç:** Doğru kameranın seçilmesi ve başlatma sırasının cihazlara uyumlu olması.

- [x] **3.1** Arka kamera tespitini güçlendirme  
  - Daha fazla etiket: "back", "rear", "environment", "facing back", "trasa", "umgebung", "후면", "后", "trasera" vb.  
  - `getCapabilities()` veya benzeri API varsa (tarayıcı destekliyorsa) facing bilgisini oradan da kullan.

- [x] **3.2** Başlatma sırası: önce facingMode, gerekirse kamera ID  
  - Bazı cihazlarda önce `facingMode: "environment"` ile denemek daha stabil.  
  - Başarısız olursa kamera listesinden “arka” adayını seçip ID ile dene.

- [x] **3.3** “İlk kamera” varsayımını kaldırma  
  - İlk kamera her zaman arka olmayabilir (özellikle ön kameranın default olduğu cihazlar).  
  - Sadece “arka” veya “arka adayı” yoksa ve tek kamera varsa ilk kamerayı kullan; çok kameralı cihazda ön kamerayı açıkça atlama.

- [x] **3.4** Timeout ve tekrar deneme  
  - `start()` için makul bir timeout (ör. 15 saniye); timeout’ta “Kamera yanıt vermiyor” mesajı ve (isteğe bağlı) “Tekrar dene” butonu.  
  - “Tekrar dene” tıklanınca önceki instance’ı temizleyip (stop + clear) kısa gecikmeyle yeniden başlat.

**Çıktı:** Farklı marka/modelde doğru kamera açılır; takılı kalmaya karşı kullanıcı “Tekrar dene” ile devam edebilir.

---

## Faz 4 — DOM / Container ve Zamanlama

**Amaç:** Scanner’ın her cihazda “görünür ve boyutlu” bir container’da başlaması.

- [x] **4.1** Container boyutu garanti  
  - Scanner başlamadan önce `scannerRef.current.clientWidth > 0 && clientHeight > 0` kontrolü.  
  - Değilse 100–300 ms bekleyip tekrar kontrol et; birkaç denemeden sonra hata ver.

- [x] **4.2** ResizeObserver (isteğe bağlı)  
  - Container büyüdüğünde (örn. yön değişimi) html5-qrcode’un resize/applyVideoConstraints benzeri bir API’si varsa çağır; yoksa en azından layout’un sabit olduğu anda başlattığımızdan emin ol.

- [x] **4.3** Modal açılış gecikmesi  
  - Modal `isOpen` true olduktan sonra scanner’ı 300 ms sonra başlatıyoruz; gerekirse 400–500 ms yap veya “container hazır” olana kadar beklet.

**Çıktı:** 0x0 container kaynaklı hatalar azalır; özellikle yavaş render eden mobil tarayıcılarda iyileşme olur.

---

## Faz 5 — Temizlik ve Tekrar Açılış

**Amaç:** Kamera kaynağının düzgün bırakılması; ikinci açılışta “cihaz meşgul” hatası olmaması.

- [x] **5.1** Stop + clear sırası ve tek instance  
  - Modal kapanırken veya unmount’ta mutlaka `scanner.stop()` → sonra `scanner.clear()` çağrılsın.  
  - Aynı anda sadece bir `Html5Qrcode` instance’ı kullanıldığından emin ol (yeni başlatmadan önce eski ref’i stop/clear et).

- [x] **5.2** Başlatmadan önce eski instance temizliği  
  - `startScanning()` içinde, yeni scanner oluşturmadan önce `html5QrcodeRef.current` varsa stop + clear + ref = null yap; kısa bir gecikme (100–200 ms) sonra yeni scanner’ı başlat.

- [x] **5.3** AbortController / “isMounted” kontrolü  
  - Async `start()` tamamlanmadan modal kapatılırsa, callback’lerin artık çalışmaması için bir “isMounted” veya request-id ref’i kullan; cleanup’ta bu flag’i set et.

**Çıktı:** Özellikle “ikinci kez açınca çalışmıyor” ve “kamera hâlâ kullanımda” şikayetleri azalır.

---

## Faz 6 — Barkod Formatları ve Kütüphane Ayarları

**Amaç:** Okunacak barkod tiplerinin (EAN-13, CODE_128 vb.) tüm cihazlarda tutarlı çalışması.

- [ ] **6.1** html5-qrcode’da format listesi  
  - Dokümantasyona göre `config` içinde `formatsToSupport` veya benzeri bir seçenek var mı kontrol et.  
  - Varsa: EAN_13, EAN_8, CODE_128, UPC_A, UPC_E gibi ihtiyaç duyulan formatları açıkça belirt.

- [ ] **6.2** Gereksiz formatları kapatma (performans)  
  - Sadece 1D barkod kullanıyorsak, 2D (QR, Aztec vb.) kapatılabilirse dene; bazı cihazlarda performans artar.

- [ ] **6.3** Kütüphane güncellemesi  
  - html5-qrcode’un son sürümünde cihaz uyumluluğu ile ilgili patch’ler var mı kontrol et; güncelleme yapılabilir ve breaking change’ler varsa roadmap’e not düş.

**Çıktı:** Okuma oranı ve cihaz uyumluluğu artar; gereksiz işlem azalır.

---

## Faz 7 — Hata Mesajları ve Kullanıcı Yönlendirmesi

**Amaç:** Kullanıcının ne yapması gerektiğini anlaması ve gerekirse alternatif yöntem kullanması.

- [ ] **7.1** Cihaza/hataya özel mesajlar  
  - İzin reddedildi → “Kamera erişimi reddedildi. Tarayıcı ayarlarından kamerayı açın.”  
  - Kamera bulunamadı → “Kamera bulunamadı. Cihazınızda kamera ve kamera izni olduğundan emin olun.”  
  - Overconstrained / NotSupportedError → “Bu cihazda kamera ayarları desteklenmiyor. ‘Barkodu yazarak ara’ seçeneğini kullanabilirsiniz.”  
  - Timeout → “Kamera açılamadı. İnternet bağlantısı ve tarayıcı izinlerini kontrol edip tekrar deneyin.”

- [ ] **7.2** “Barkodu elle gir” / “Barkodu yazarak ara” vurgusu  
  - Tarayıcı zaten arama kutusu sunuyorsa, kamera hatası durumunda “Barkodu arama kutusuna yazarak da arayabilirsiniz” mesajı ve mümkünse ilgili alana focus.

- [ ] **7.3** “Tekrar dene” butonu  
  - Kamera açılamadığında veya timeout’ta tekrar deneme butonu; tıklanınca Faz 5’e uygun tam cleanup + yeniden başlatma.

**Çıktı:** Kullanıcı ne yapacağını bilir; kamera çalışmayan cihazlarda bile uygulama kullanılabilir kalır.

---

## Faz 8 — Güvenli Bağlam ve Ortam Kontrolü

**Amaç:** Kamera API’sinin sadece güvenli bağlamda çalıştığını garanti etmek ve yanlış ortamda net mesaj vermek.

- [ ] **8.1** Secure context kontrolü  
  - `window.isSecureContext` (HTTPS veya localhost) kontrolü.  
  - false ise scanner butonunu gizleyebilir veya “Kamera kullanımı için sayfanın güvenli (HTTPS) bağlamda açılması gerekir” mesajı gösterebilirsin.

- [ ] **8.2** mediaDevices varlığı  
  - `navigator.mediaDevices == null` ise “Tarayıcınız kamera erişimini desteklemiyor” benzeri mesaj.

**Çıktı:** HTTP’de veya eski tarayıcıda kullanıcı neden kamera açılmadığını anlar.

---

## Faz 9 — Test Matrisi ve Doğrulama

**Amaç:** Değişikliklerin farklı cihaz/tarayıcı kombinasyonlarında doğrulanması.

- [ ] **9.1** Test listesi  
  - Android: Chrome, Samsung Internet, Firefox (en az 2 farklı marka/model).  
  - iOS: Safari, Chrome (iOS’ta WebKit kullanır).  
  - Mümkünse: düşük segment telefon (düşük RAM, eski Android) ve orta segment.

- [ ] **9.2** Senaryolar  
  - İlk açılış: izin ver → kamera açılsın, barkod okunsun.  
  - İzin reddet → uygun mesaj.  
  - Tarayıcıyı kapatıp tekrar aç → izin zaten verilmiş → kamera açılsın.  
  - Scanner’ı kapatıp tekrar aç → ikinci açılışta da kamera düzgün açılsın.  
  - Yön değiştir (portrait ↔ landscape) → mümkünse görüntü bozulmasın veya hata vermesin.

- [ ] **9.3** Dokümantasyon  
  - Hangi cihaz/tarayıcıda test edildiği ve bilinen sınırlamalar kısa bir “Barkod tarayıcı – destek” notu olarak README veya bu roadmap’in sonuna eklenebilir.

**Çıktı:** Yayına alınan davranış farklı ortamlarda doğrulanmış olur.

---

## Faz 10 — İsteğe Bağlı İyileştirmeler

- [ ] **10.1** Dosyadan barkod okuma (file input)  
  - Bazı tarayıcılar canlı kamerayı iyi desteklemiyor; “Fotoğraf yükle” ile galeriden görsel seçip aynı kütüphane ile decode etmek fallback olarak eklenebilir.

- [ ] **10.2** Karanlık mod / düşük ışık  
  - Sadece bilgilendirme: “Barkodu iyi aydınlatılmış ortamda tutun” metni eklenebilir.

- [ ] **10.3** Erişilebilirlik  
  - Kamera alanı için uygun `aria-label`, “Barkod tarayıcı kamera görüntüsü” gibi.

---

## Uygulama Sırası Önerisi

1. **Faz 1** (Teşhis) – Önce loglama ile hangi cihazda nerede fail ettiğini topla.  
2. **Faz 2** (Constraints) – En sık “constraint” hatalarını azaltır.  
3. **Faz 5** (Temizlik) – İkinci açılış sorunlarını çözer.  
4. **Faz 4** (Container) – 0 boyutlu container kaynaklı hataları azaltır.  
5. **Faz 3** (Kamera seçimi) – Doğru kameranın açılmasını sağlar.  
6. **Faz 6** (Formatlar) – Okuma başarısını artırır.  
7. **Faz 7** (Mesajlar) – Kullanıcı deneyimini iyileştirir.  
8. **Faz 8** (Secure context) – Hızlı kontrol, az kod.  
9. **Faz 9** (Test) – Tüm değişiklikler sonrası doğrulama.

Faz 10 isteğe bağlıdır; zaman ve ihtiyaca göre eklenebilir.

---

## Notlar

- Bu roadmap’teki maddeler tamamlandıkça `- [ ]` ifadeleri `- [x]` olarak işaretlenebilir.
- Her faz için ayrı branch veya commit kullanmak, geri dönüşü kolaylaştırır.
- Production’da teşhis loglarını (Faz 1) sadece hata durumunda ve kullanıcı onayı ile toplamak gizlilik için daha uygundur.
