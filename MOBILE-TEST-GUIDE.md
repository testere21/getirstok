# Mobil Test Rehberi

Bu rehber, projeyi telefonunuzda test etmek için adımları içerir.

## Yöntem 1: Yerel Ağ Üzerinden Test (Hızlı)

### Gereksinimler
- PC ve telefon aynı WiFi ağına bağlı olmalı
- Windows Firewall'un port 3000'i engellemediğinden emin olun

### Adımlar

1. **Development server'ı network üzerinden başlat:**
   ```bash
   npm run dev:network
   ```

2. **PC'nin IP adresini bul:**
   - Windows: `ipconfig` komutunu çalıştırın
   - "Wireless LAN adapter Wi-Fi" bölümündeki "IPv4 Address" değerini not edin
   - Örnek: `192.168.1.121`

3. **Telefondan bağlan:**
   - Telefonunuzun tarayıcısını açın
   - Adres çubuğuna şunu yazın: `http://192.168.1.121:3000`
   - PC'nizin IP adresini kullanın (yukarıdaki örnekteki gibi)

### Notlar
- ⚠️ **Kamera için HTTPS gerekebilir:** Bazı tarayıcılar kamera erişimi için HTTPS gerektirir
- Eğer kamera çalışmıyorsa, Yöntem 2'yi (ngrok) kullanın
- Windows Firewall uyarısı çıkarsa "Erişime izin ver" seçeneğini seçin

---

## Yöntem 2: ngrok ile HTTPS Tunnel (Kamera için Önerilen)

### Gereksinimler
- ngrok hesabı (ücretsiz): https://ngrok.com/
- ngrok kurulumu

### Adımlar

1. **ngrok'u kurun:**
   - https://ngrok.com/download adresinden indirin
   - veya: `choco install ngrok` (Chocolatey ile)
   - veya: `winget install ngrok`

2. **ngrok hesabı oluşturun ve auth token alın:**
   - https://dashboard.ngrok.com/get-started/setup
   - Token'ı kaydedin

3. **ngrok'u yapılandırın:**
   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```

4. **Development server'ı başlatın:**
   ```bash
   npm run dev
   ```

5. **ngrok tunnel oluşturun:**
   ```bash
   ngrok http 3000
   ```

6. **ngrok'un verdiği HTTPS URL'ini kullanın:**
   - ngrok terminalinde görünen URL'i kopyalayın
   - Örnek: `https://abc123.ngrok-free.app`
   - Bu URL'i telefonunuzdan açın

### Avantajlar
- ✅ HTTPS desteği (kamera için gerekli)
- ✅ İnternet üzerinden erişim (farklı ağlardan bile)
- ✅ Güvenli bağlantı

---

## Yöntem 3: LocalTunnel (Alternatif)

### Adımlar

1. **LocalTunnel'ı kurun:**
   ```bash
   npm install -g localtunnel
   ```

2. **Development server'ı başlatın:**
   ```bash
   npm run dev
   ```

3. **Tunnel oluşturun:**
   ```bash
   lt --port 3000
   ```

4. **Verilen URL'i telefonunuzdan açın**

---

## Sorun Giderme

### Kamera çalışmıyor
- HTTPS kullanın (ngrok veya LocalTunnel)
- Tarayıcı izinlerini kontrol edin
- Kamera başka bir uygulama tarafından kullanılıyor olabilir

### Bağlantı hatası
- PC ve telefon aynı WiFi ağında mı kontrol edin
- Windows Firewall'un port 3000'i engellemediğinden emin olun
- PC'nin IP adresinin doğru olduğundan emin olun

### Yavaş yükleme
- Development mode'da Hot Module Replacement aktif, bu normal
- Production build için: `npm run build && npm start`

---

## Hızlı Başlangıç

**En kolay yöntem (kamera için HTTPS gerekli):**
```bash
# Terminal 1: Development server
npm run dev

# Terminal 2: ngrok tunnel
ngrok http 3000
```

ngrok'un verdiği HTTPS URL'ini telefonunuzdan açın!

