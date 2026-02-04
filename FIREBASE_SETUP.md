# Firebase Kurulum Rehberi

Bu dosya, Firebase Firestore'un düzgün çalışması için yapılması gerekenleri açıklar.

## 1. Firebase Projesi Oluşturma

1. [Firebase Console](https://console.firebase.google.com/)'a gidin
2. Yeni bir proje oluşturun veya mevcut projeyi seçin
3. Proje ayarlarından "Web uygulaması ekle" seçeneğini seçin
4. Firebase config değerlerini kopyalayın

## 2. Environment Variables (.env.local)

Proje kökünde `.env.local` dosyasına şu değerleri ekleyin:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key-here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

**Önemli:** `.env.local` dosyası `.gitignore`'da olduğu için Git'e commit edilmez. Her geliştirici kendi Firebase config'ini eklemelidir.

## 3. Firestore Veritabanı Oluşturma

1. Firebase Console'da "Firestore Database" sekmesine gidin
2. "Create database" butonuna tıklayın
3. "Start in test mode" seçeneğini seçin (güvenlik kuralları için sonraki adıma bakın)
4. Lokasyon seçin (örn: `europe-west1`)

## 4. Firestore Security Rules

Firebase Console'da "Firestore Database" > "Rules" sekmesine gidin ve şu kuralları ekleyin:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // stock_items koleksiyonu için kurallar
    match /stock_items/{itemId} {
      // Herkes okuyabilir (public read)
      allow read: if true;
      
      // Herkes yazabilir (public write) - Auth yok, açık erişimli panel
      allow create: if true;
      allow update: if true;
      allow delete: if true;
    }
    
    // Diğer koleksiyonlar için varsayılan: erişim yok
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**Önemli:** Bu kurallar herkesin okuma/yazma yapmasına izin verir. Production'da daha güvenli kurallar kullanılmalıdır (örneğin rate limiting, domain kontrolü vb.).

## 5. Koleksiyon Oluşturma

Firestore Console'da `stock_items` koleksiyonunu manuel olarak oluşturmanıza gerek yok. İlk kayıt eklendiğinde otomatik olarak oluşturulur.

## 6. Test Etme

1. Development server'ı başlatın: `npm run dev`
2. Tarayıcı konsolunu açın (F12)
3. Bir ürün ekleyin
4. Konsolda şu mesajları görmelisiniz:
   - `✅ Firebase config yüklendi`
   - `📡 Firestore subscription başlatılıyor...`
   - `📦 Firestore'dan X kayıt alındı`
   - `✅ Ürün Firestore'a eklendi: [id]`

## 7. Sorun Giderme

### Veriler kayboluyor / Sayfa yenilendiğinde sıfırlanıyor

**Olası nedenler:**
1. **Firebase config eksik:** `.env.local` dosyasında tüm değerler tanımlı mı?
2. **Firestore Security Rules yanlış:** Rules sekmesinde `stock_items` için read/write izinleri var mı?
3. **Firestore bağlantı hatası:** Tarayıcı konsolunda hata mesajı var mı?

**Kontrol adımları:**
1. Tarayıcı konsolunu açın (F12)
2. Hata mesajlarını kontrol edin
3. Network sekmesinde Firestore isteklerini kontrol edin
4. Firebase Console'da Firestore Database sekmesinde kayıtların göründüğünü kontrol edin

### Firebase config hatası

Eğer konsolda `⚠️ Firebase config eksik!` mesajı görüyorsanız:
1. `.env.local` dosyasını kontrol edin
2. Tüm `NEXT_PUBLIC_FIREBASE_*` değişkenlerinin tanımlı olduğundan emin olun
3. Development server'ı yeniden başlatın (`npm run dev`)

### Firestore bağlantı hatası

Eğer konsolda `❌ Firestore subscription hatası` mesajı görüyorsanız:
1. Firebase Console'da Firestore Database'in aktif olduğundan emin olun
2. Security Rules'un doğru olduğunu kontrol edin
3. Internet bağlantınızı kontrol edin

## 8. Production Deployment

Netlify'a deploy ederken:
1. Netlify Dashboard > Site Settings > Environment Variables
2. Tüm `NEXT_PUBLIC_FIREBASE_*` değişkenlerini ekleyin
3. Deploy'u yeniden başlatın

