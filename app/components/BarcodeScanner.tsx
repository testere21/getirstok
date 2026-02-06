"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { ErrorMessage } from "./ErrorMessage";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (barcode: string) => void;
}

export function BarcodeScanner({
  isOpen,
  onClose,
  onScanSuccess,
}: BarcodeScannerProps) {
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef(false); // Tekrar okumayı önlemek için
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Modal açıldığında focus yönetimi
  useEffect(() => {
    if (isOpen) {
      // Önceki aktif elementi kaydet
      previousActiveElementRef.current =
        (document.activeElement as HTMLElement) || null;

      // Modal içindeki ilk focusable elemente focus ver
      const firstFocusable = modalRef.current?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement | null;
      firstFocusable?.focus();
    }
  }, [isOpen]);

  // Modal kapandığında focus'u geri ver
  useEffect(() => {
    if (!isOpen && previousActiveElementRef.current) {
      previousActiveElementRef.current.focus();
      previousActiveElementRef.current = null;
    }
  }, [isOpen]);

  // Escape tuşu ile kapatma
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  // Bip sesi çalma fonksiyonu (Web Audio API)
  const playBeepSound = () => {
    try {
      // AudioContext oluştur (eğer yoksa)
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const audioContext = audioContextRef.current;

      // Eğer suspended durumdaysa resume et (kullanıcı etkileşimi gerekebilir)
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      // Oscillator ve GainNode oluştur
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      // Ses ayarları
      oscillator.type = "sine"; // Sinüs dalgası (yumuşak bip)
      oscillator.frequency.value = 800; // 800 Hz (orta ton)
      
      // Ses seviyesi (volume)
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime); // %30 ses seviyesi
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1); // Hızlı fade-out

      // Bağlantıları yap
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Ses çal (100ms süre)
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);

      // Cleanup
      oscillator.onended = () => {
        // Gerekirse AudioContext'i kapat (ama genelde açık tutmak daha iyi)
      };
    } catch (err) {
      // Ses çalma hatası sessizce görmezden gel
      console.warn("Bip sesi çalınamadı:", err);
    }
  };

  // Kamera başlatma ve durdurma
  useEffect(() => {
    // Modal kapalıysa scanner'ı temizle
    if (!isOpen) {
      isScanningRef.current = false; // Flag'i sıfırla
      setError(null); // Hata mesajını temizle
      setIsLoading(false); // Loading'i kaldır
      if (html5QrcodeRef.current) {
        const scanner = html5QrcodeRef.current;
        html5QrcodeRef.current = null;
        scanner
          .stop()
          .then(() => {
            scanner.clear();
          })
          .catch(() => {
            // Stop hatası görmezden gel
          });
      }
      return;
    }

    // Modal açıldığında flag'i sıfırla
    isScanningRef.current = false;

    // Modal açıldığında kamera başlat
    if (!scannerRef.current) return;

    // Hata mesajını temizle ve loading başlat
    setError(null);
    setIsLoading(true);

    const startScanning = async () => {
      try {
        // Container'a benzersiz ID ver
        const elementId = `barcode-scanner-${Date.now()}`;
        scannerRef.current!.id = elementId;

        // Html5Qrcode instance oluştur
        const scanner = new Html5Qrcode(elementId);
        html5QrcodeRef.current = scanner;

        // Responsive qrbox boyutu hesapla
        const containerWidth = scannerRef.current?.clientWidth || 300;
        const containerHeight = scannerRef.current?.clientHeight || 300;
        const qrboxSize = Math.min(
          Math.max(200, Math.floor(Math.min(containerWidth, containerHeight) * 0.8)),
          300
        );

        // Kamera ayarları - mobil performans için optimize edildi
        const config = {
          fps: 10, // Frames per second (mobil için optimize)
          qrbox: { width: qrboxSize, height: qrboxSize }, // Responsive tarama alanı
          aspectRatio: 1.0, // 1:1 aspect ratio
          // Mobil performans için ideal çözünürlük
          videoConstraints: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };

        // Önce mevcut kameraları listele ve arka kamerayı bul
        let cameraId: string | { facingMode: "environment" } | null = null;
        
        try {
          const cameras = await Html5Qrcode.getCameras();
          if (cameras && cameras.length > 0) {
            // Arka kamerayı bul (label'da "back", "rear", "environment" gibi kelimeler)
            const backCamera = cameras.find(
              (cam) =>
                cam.label &&
                (cam.label.toLowerCase().includes("back") ||
                  cam.label.toLowerCase().includes("rear") ||
                  cam.label.toLowerCase().includes("environment") ||
                  cam.label.toLowerCase().includes("facing back"))
            );
            
            if (backCamera) {
              cameraId = backCamera.id;
              console.log("Arka kamera bulundu:", backCamera.label);
            } else {
              // Arka kamera bulunamazsa, ön kamera olmayan ilk kamerayı dene
              const nonFrontCamera = cameras.find(
                (cam) =>
                  cam.label &&
                  !cam.label.toLowerCase().includes("front") &&
                  !cam.label.toLowerCase().includes("user") &&
                  !cam.label.toLowerCase().includes("facing user")
              );
              
              if (nonFrontCamera) {
                cameraId = nonFrontCamera.id;
                console.log("Arka kamera adayı bulundu:", nonFrontCamera.label);
              } else {
                // Hiçbiri bulunamazsa, ilk kamerayı dene (genellikle arka kamera)
                cameraId = cameras[0].id;
                console.log("İlk kamera kullanılıyor:", cameras[0].label);
              }
            }
          }
        } catch (err) {
          console.warn("Kamera listesi alınamadı, facingMode kullanılacak:", err);
        }

        // Kamerayı başlat - önce kamera ID ile, yoksa facingMode ile
        const cameraConfig = cameraId 
          ? (typeof cameraId === "string" ? cameraId : { facingMode: "environment" })
          : { facingMode: "environment" };

        // Video constraints'e de facingMode ekle (ekstra garanti)
        const configWithConstraints = {
          ...config,
          videoConstraints: {
            ...config.videoConstraints,
            facingMode: "environment" as const,
          },
        };

        await scanner.start(
          cameraConfig,
          configWithConstraints,
          (decodedText) => {
            // Kamera başarıyla başlatıldı, loading'i kaldır
            setIsLoading(false);
            // Hata mesajını temizle (başarılı okuma)
            setError(null);
            // Barkod okunduğunda
            if (isScanningRef.current) return; // Zaten işleniyorsa atla
            
            // Barkod formatını kontrol et
            if (!decodedText || decodedText.trim().length === 0) {
              return; // Geçersiz barkod
            }

            const barcode = decodedText.trim();
            
            // Minimum uzunluk kontrolü (barkodlar genellikle en az 8 karakter)
            if (barcode.length < 3) {
              return; // Çok kısa, muhtemelen hatalı okuma
            }

            // Tekrar okumayı önle
            isScanningRef.current = true;

            // Bip sesi çal
            playBeepSound();

            // Scanner'ı durdur
            scanner
              .stop()
              .then(() => {
                scanner.clear();
                html5QrcodeRef.current = null;
                
                // Callback'i çağır ve modal'ı kapat
                onScanSuccess(barcode);
                onClose();
                
                // Flag'i sıfırla (gelecekte tekrar açılabilmesi için)
                setTimeout(() => {
                  isScanningRef.current = false;
                }, 1000);
              })
              .catch((err) => {
                console.error("Scanner durdurma hatası:", err);
                // Hata olsa bile callback'i çağır
                onScanSuccess(barcode);
                onClose();
                setTimeout(() => {
                  isScanningRef.current = false;
                }, 1000);
              });
          },
          (errorMessage) => {
            // Tarama hataları için - sessizce devam et (normal durum)
            // Sadece kritik hataları göster
          }
        );
      } catch (err: any) {
        console.error("Kamera başlatma hatası:", err);
        html5QrcodeRef.current = null;
        
        // Hata mesajını belirle
        let errorMsg = "Kamera başlatılamadı. Lütfen izinleri kontrol edin.";
        
        if (err?.message) {
          const errMsg = err.message.toLowerCase();
          
          if (errMsg.includes("permission") || errMsg.includes("izin")) {
            errorMsg = "Kamera erişimi reddedildi. Lütfen tarayıcı ayarlarından kamera iznini verin.";
          } else if (errMsg.includes("not found") || errMsg.includes("bulunamadı")) {
            errorMsg = "Kamera bulunamadı. Lütfen cihazınızda bir kamera olduğundan emin olun.";
          } else if (errMsg.includes("not allowed") || errMsg.includes("izin verilmedi")) {
            errorMsg = "Kamera erişimi için izin gerekli. Lütfen tarayıcı ayarlarından izin verin.";
          }
        }
        
        setError(errorMsg);
        setIsLoading(false); // Hata durumunda loading'i kaldır
      }
    };

    // Kısa bir gecikme ile başlat (DOM hazır olması için)
    const timer = setTimeout(() => {
      startScanning();
    }, 300);

    // Cleanup
    return () => {
      clearTimeout(timer);
      if (html5QrcodeRef.current) {
        const scanner = html5QrcodeRef.current;
        html5QrcodeRef.current = null;
        scanner
          .stop()
          .then(() => {
            scanner.clear();
          })
          .catch(() => {
            // Stop hatası görmezden gel
          });
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scanner-title"
    >
      {/* Overlay — tıklanınca kapat */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 transition-opacity duration-300"
        aria-label="Modalı kapat"
      />

      {/* İçerik kutusu — tıklama overlay'e gitmesin */}
      {/* Mobilde tam ekran, desktop'ta merkezi modal */}
      <div
        ref={modalRef}
        className="relative w-full h-full max-h-screen overflow-y-auto bg-white shadow-lg dark:bg-zinc-900 sm:h-auto sm:max-w-lg sm:rounded-xl sm:p-6 p-4 transition-all duration-300 flex flex-col"
        style={{
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? "scale(1)" : "scale(0.95)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2
            id="scanner-title"
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Barkod Tarayıcı
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Kapat"
            title="Kapat (Esc)"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Hata mesajı */}
        {error && (
          <div className="mb-4">
            <ErrorMessage
              message={error}
              onDismiss={() => setError(null)}
              ariaLive="assertive"
            />
          </div>
        )}

        {/* Kamera container */}
        <div
          ref={scannerRef}
          className="w-full flex-1 sm:flex-none aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-lg overflow-hidden min-h-[200px] sm:min-h-[300px] max-h-[70vh] sm:max-h-none relative"
        >
          {/* Loading göstergesi */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-100/90 dark:bg-zinc-800/90 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="size-8 animate-spin rounded-full border-4 border-zinc-300 border-t-[var(--color-primary)] dark:border-zinc-600 dark:border-t-[var(--color-primary)]" />
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Kamera açılıyor...
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Kullanım talimatları */}
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 text-center">
            Barkodu kameraya gösterin
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
            Barkod otomatik olarak okunacak ve arama yapılacaktır
          </p>
        </div>
      </div>
    </div>
  );
}

