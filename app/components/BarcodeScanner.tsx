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

const SCANNER_START_TIMEOUT_MS = 15000; // Faz 3.4: kamera başlatma timeout (ms)
const MODAL_OPEN_DELAY_MS = 450; // Faz 4.3: modal açıldıktan sonra scanner başlatma gecikmesi (yavaş cihazlarda layout için)
const CLEANUP_BEFORE_START_DELAY_MS = 150; // Faz 5.2: eski instance stop+clear sonrası gecikme (100–200 ms)

export function BarcodeScanner({
  isOpen,
  onClose,
  onScanSuccess,
}: BarcodeScannerProps) {
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null); // Faz 4.2
  const isMountedRef = useRef(true); // Faz 5.3: modal açık mı; cleanup'ta false, callback'lerde kontrol
  const isScanningRef = useRef(false); // Tekrar okumayı önlemek için
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0);
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
      setError(null);
      setErrorDetail(null);
      setIsLoading(false);
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

    // Modal açıldığında flag'leri sıfırla (Faz 5.3: mounted işareti)
    isScanningRef.current = false;
    isMountedRef.current = true;

    // Modal açıldığında kamera başlat
    if (!scannerRef.current) return;

    // Hata mesajını temizle ve loading başlat
    setError(null);
    setIsLoading(true);

    const startScanning = async () => {
      try {
        // Faz 5.1 / 5.2: Başlatmadan önce eski instance varsa stop → clear → ref=null, sonra kısa gecikme
        if (html5QrcodeRef.current) {
          const oldScanner = html5QrcodeRef.current;
          html5QrcodeRef.current = null;
          try {
            await oldScanner.stop();
            oldScanner.clear();
          } catch {
            // Eski instance stop/clear hatası görmezden gel
          }
          await new Promise((r) => setTimeout(r, CLEANUP_BEFORE_START_DELAY_MS));
        }

        // Faz 1.1: Tarayıcı ve cihaz bilgisini logla (sadece development)
        if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
          const hasMediaDevices = !!(navigator.mediaDevices);
          const mediaDevicesKeys = hasMediaDevices
            ? Object.keys(navigator.mediaDevices).join(", ")
            : "yok";
          let cameraPermission: string = "bilinmiyor";
          try {
            if (navigator.permissions?.query) {
              const status = await navigator.permissions.query({ name: "camera" as PermissionName });
              cameraPermission = status.state;
            }
          } catch {
            cameraPermission = "query desteklenmiyor";
          }
          console.log("[BarcodeScanner Teşhis 1.1]", {
            userAgent: navigator.userAgent,
            mediaDevicesVar: hasMediaDevices,
            mediaDevicesKeys,
            cameraPermission,
            isSecureContext: window.isSecureContext,
            platform: navigator.platform,
          });
        }

        // Faz 4.1: Container boyutu garanti – 0x0 ise kısa bekle, birkaç denemeden sonra hata ver
        const CONTAINER_WAIT_MS = 200;
        const CONTAINER_MAX_ATTEMPTS = 5;
        let containerW = scannerRef.current?.clientWidth ?? 0;
        let containerH = scannerRef.current?.clientHeight ?? 0;
        for (let attempt = 1; attempt <= CONTAINER_MAX_ATTEMPTS; attempt++) {
          if (containerW > 0 && containerH > 0) break;
          if (attempt < CONTAINER_MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, CONTAINER_WAIT_MS));
            containerW = scannerRef.current?.clientWidth ?? 0;
            containerH = scannerRef.current?.clientHeight ?? 0;
          }
        }
        if (containerW === 0 || containerH === 0) {
          setIsLoading(false);
          setError("Tarayıcı alanı henüz hazır değil. Lütfen sayfayı yenileyip tekrar deneyin.");
          setErrorDetail("Container boyutu 0x0");
          return;
        }
        if (process.env.NODE_ENV === "development") {
          console.log("[BarcodeScanner Teşhis 1.4] Container boyutu", { width: containerW, height: containerH });
        }

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

        // Kamera ayarları - Faz 2.4: Varsayılan FPS 7 (yavaş cihazlarda daha stabil)
        const config = {
          fps: 7,
          qrbox: { width: qrboxSize, height: qrboxSize },
          aspectRatio: 1.0,
        };

        // Faz 2.1 / 2.3: Esnek config ve çözünürlük fallback zinciri
        const configEsnek = {
          ...config,
          videoConstraints: { facingMode: "environment" as const },
        };
        // Faz 2.4: Fallback denemelerinde daha düşük FPS (5) - ilk start hatasında yükü azalt
        const configDusukFps = { ...config, fps: 5 };
        const config1280 = {
          ...configDusukFps,
          videoConstraints: {
            facingMode: "environment" as const,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };
        const config640 = {
          ...configDusukFps,
          videoConstraints: {
            facingMode: "environment" as const,
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        };
        const configMin = {
          ...configDusukFps,
          videoConstraints: {
            facingMode: "environment" as const,
            width: { min: 320 },
            height: { min: 240 },
          },
        };
        const configFallbackZinciri = [configEsnek, config1280, config640, configMin];

        // Önce mevcut kameraları listele ve arka kamerayı bul
        let cameraId: string | { facingMode: "environment" } | null = null;
        let selectedCameraLabel: string | null = null;

        try {
          const cameras = await Html5Qrcode.getCameras();

          // Faz 1.2: Kamera listesi loglama (sadece development)
          if (process.env.NODE_ENV === "development") {
            const list = cameras?.length
              ? cameras.map((c) => ({ id: c.id, label: c.label || "(etiket yok)" }))
              : [];
            console.log("[BarcodeScanner Teşhis 1.2] Kamera listesi", {
              kameraSayisi: cameras?.length ?? 0,
              kameralar: list,
            });
          }

          if (cameras && cameras.length > 0) {
            // Faz 3.1: Arka kamera tespiti – çok dilli etiketler
            const arkaKameraEtiketleri = [
              "back",
              "rear",
              "environment",
              "facing back",
              "trasa",
              "umgebung",
              "rück",
              "trasera",
              "posterior",
              "후면",   // Kore: arka
              "后",    // Çince: arka
              "背面",  // Çince: arka yüz
              "env",
              "rear camera",
              "back camera",
            ];
            const isArkaKamera = (label: string) => {
              const lower = label.toLowerCase();
              return arkaKameraEtiketleri.some((k) => lower.includes(k.toLowerCase()));
            };
            const onKameraEtiketleri = [
              "front",
              "user",
              "facing user",
              "selfie",
              "frontal",
              "przednia",
              "vorder",
              "delanter",
              "전면",
              "前",
              "前置",
            ];
            const isOnKamera = (label: string) => {
              const lower = label.toLowerCase();
              return onKameraEtiketleri.some((k) => lower.includes(k.toLowerCase()));
            };

            const backCamera = cameras.find((cam) => cam.label && isArkaKamera(cam.label));

            if (backCamera) {
              cameraId = backCamera.id;
              selectedCameraLabel = backCamera.label;
            } else {
              // Arka kamera bulunamazsa, ön kamera olmayan ilk kamerayı dene
              const nonFrontCamera = cameras.find(
                (cam) => cam.label && !isOnKamera(cam.label)
              );

              if (nonFrontCamera) {
                cameraId = nonFrontCamera.id;
                selectedCameraLabel = nonFrontCamera.label;
              } else if (cameras.length === 1) {
                // Faz 3.3: Sadece tek kamera varsa ilk (ve tek) kamerayı kullan; çok kameralı cihazda ön kamerayı zorlama
                cameraId = cameras[0].id;
                selectedCameraLabel = cameras[0].label ?? null;
              }
              // Çok kameralı cihazda arka/arka adayı yoksa cameraId = null kalır; facingMode ile başlatılır
            }
          }
        } catch (err) {
          console.warn("Kamera listesi alınamadı, facingMode kullanılacak:", err);
        }

        // Faz 1.2: Seçilen kamerayı logla (sadece development)
        if (process.env.NODE_ENV === "development") {
          console.log("[BarcodeScanner Teşhis 1.2] Seçilen kamera", {
            secim: cameraId
              ? (typeof cameraId === "string" ? "kameraId" : "facingMode")
              : "facingMode fallback",
            kameraId: typeof cameraId === "string" ? cameraId : undefined,
            label: selectedCameraLabel ?? undefined,
          });
        }

        const onScanSuccessInner = (decodedText: string) => {
            // Faz 5.3: Modal kapatıldıysa callback çalıştırma
            if (!isMountedRef.current) return;
            // Kamera başarıyla başlatıldı, loading'i kaldır
            setIsLoading(false);
            setError(null);
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
                if (!isMountedRef.current) return;
                scanner.clear();
                html5QrcodeRef.current = null;
                onScanSuccess(barcode);
                onClose();
                setTimeout(() => {
                  isScanningRef.current = false;
                }, 1000);
              })
              .catch((err) => {
                console.error("Scanner durdurma hatası:", err);
                if (!isMountedRef.current) return;
                onScanSuccess(barcode);
                onClose();
                setTimeout(() => {
                  isScanningRef.current = false;
                }, 1000);
              });
          };
        const onScanError = () => {
          // Tarama hataları için - sessizce devam et (normal durum)
        };

        // Faz 3.2: Önce facingMode ile dene, başarısız olursa kamera ID ile dene
        const usingCameraId = typeof cameraId === "string";
        const cameraConfigFacingMode = { facingMode: "environment" as const };

        // Faz 3.4: Tüm başlatma denemeleri için tek timeout
        const startAttempt = async () => {
          let lastErr: any = null;
          for (const configToTry of configFallbackZinciri) {
            try {
              await scanner.start(cameraConfigFacingMode, configToTry, onScanSuccessInner, onScanError);
              lastErr = null;
              return;
            } catch (e: any) {
              lastErr = e;
              if (process.env.NODE_ENV === "development") {
                console.log("[BarcodeScanner Faz 2.3] Deneme başarısız, sonraki çözünürlük deneniyor", e?.message);
              }
            }
          }
          if (lastErr && usingCameraId) {
            if (process.env.NODE_ENV === "development") {
              console.log("[BarcodeScanner Faz 3.2] facingMode başarısız, kamera ID ile deneniyor");
            }
            await scanner.start(cameraId as string, configEsnek, onScanSuccessInner, onScanError);
            return;
          }
          if (lastErr) throw lastErr;
        };
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(Object.assign(new Error("Kamera yanıt vermiyor"), { isTimeout: true })), SCANNER_START_TIMEOUT_MS)
        );
        await Promise.race([startAttempt(), timeoutPromise]);

        // Faz 4.2: Container boyutu değişince (örn. yön değişimi) applyVideoConstraints çağır
        const containerEl = scannerRef.current;
        const scannerInstance = html5QrcodeRef.current;
        if (containerEl && scannerInstance && typeof ResizeObserver !== "undefined") {
          resizeObserverRef.current = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry || !html5QrcodeRef.current?.isScanning) return;
            const w = Math.round(entry.contentRect.width);
            const h = Math.round(entry.contentRect.height);
            if (w > 0 && h > 0 && typeof html5QrcodeRef.current?.applyVideoConstraints === "function") {
              html5QrcodeRef.current
                .applyVideoConstraints({ width: { ideal: w }, height: { ideal: h } })
                .catch(() => {});
            }
          });
          resizeObserverRef.current.observe(containerEl);
        }
      } catch (err: any) {
        html5QrcodeRef.current = null;
        if (!isMountedRef.current) return; // Faz 5.3: Modal kapatıldıysa setState yapma

        // Faz 1.3: getUserMedia / scanner hata detayı loglama
        const errName = err?.name ?? "Unknown";
        const errMessage = err?.message ?? String(err);
        if (process.env.NODE_ENV === "development") {
          console.log("[BarcodeScanner Teşhis 1.3] Kamera başlatma hatası", {
            name: errName,
            message: errMessage,
            fullError: err,
          });
        } else {
          console.error("Kamera başlatma hatası:", errName, errMessage);
        }

        // Kullanıcıya gelişmiş bilgi (hata kodu) göster
        const detail = `${errName}${errMessage ? ` — ${errMessage}` : ""}`;
        setErrorDetail(detail);

        // Hata mesajını belirle (Faz 3.4: timeout mesajı)
        let errorMsg = "Kamera başlatılamadı. Lütfen izinleri kontrol edin.";
        if (err?.isTimeout || err?.message === "Kamera yanıt vermiyor") {
          errorMsg = "Kamera yanıt vermiyor. Tekrar denemek için aşağıdaki butonu kullanın.";
        } else if (err?.message) {
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
        setIsLoading(false);
      }
    };

    // Faz 4.3: Modal açıldıktan sonra gecikme – container layout için (300→450 ms)
    const timer = setTimeout(() => {
      startScanning();
    }, MODAL_OPEN_DELAY_MS);

    // Cleanup (Faz 5.1 + Faz 5.3: isMounted false, sonra ResizeObserver/scanner temizliği)
    return () => {
      isMountedRef.current = false;
      clearTimeout(timer);
      if (resizeObserverRef.current && scannerRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (html5QrcodeRef.current) {
        const scanner = html5QrcodeRef.current;
        html5QrcodeRef.current = null;
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {});
      }
    };
  }, [isOpen, retryTrigger]);

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
          <div className="mb-4 space-y-2">
            <ErrorMessage
              message={error}
              onDismiss={() => {
                setError(null);
                setErrorDetail(null);
              }}
              ariaLive="assertive"
            />
            {errorDetail && (
              <p className="rounded bg-zinc-100 px-3 py-2 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                Gelişmiş bilgi: {errorDetail}
              </p>
            )}
            {/* Faz 3.4: Timeout'ta "Tekrar dene" butonu */}
            {error.includes("Kamera yanıt vermiyor") && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setErrorDetail(null);
                  setRetryTrigger((prev) => prev + 1);
                }}
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Tekrar dene
              </button>
            )}
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

