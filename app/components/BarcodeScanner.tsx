"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Html5QrcodeSupportedFormats } from "html5-qrcode";
import { ZXingHtml5QrcodeDecoder } from "html5-qrcode/esm/zxing-html5-qrcode-decoder";
import { ErrorMessage } from "./ErrorMessage";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (barcode: string) => void;
}

/**
 * Barkod tarayıcı. Kamera görüntüsü kendi <video> öğemizde gösterilir (kutuyu dolduracak şekilde,
 * oran bozulmaz); okuma, görüntünün ortadaki bölgesinin TAM ÇÖZÜNÜRLÜKLÜ kesitinden yapılır:
 *   1) Tarayıcıda yerleşik BarcodeDetector varsa (Android Chrome vb.) o, yoksa
 *   2) ZXing (html5-qrcode içindeki kod çözücü).
 * Eski sürüm html5-qrcode'un kendi görüntü/kutu düzenini kullanıyordu: kare oran istendiği için bazı
 * telefonlarda görüntü yarım kalıyor, kutu ekran boyutunda küçültülmüş kesit okuduğu için de bazı
 * telefonlarda barkod okunmuyordu.
 */

const CAMERA_START_TIMEOUT_MS = 15000;
const SCAN_INTERVAL_MS = 110;
/** Kesit genişliği (piksel) üst sınırı: okuma ayrıntısı korunur, yavaş telefonlar yorulmaz */
const MAX_SCAN_WIDTH_PX = 1100;
/** Hedef kutusu, görünen alanın oranları (barkodlar geniştir) */
const BOX_WIDTH_RATIO = 0.9;
const BOX_HEIGHT_RATIO = 0.42;

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.QR_CODE,
];

/** Tarayıcıdaki BarcodeDetector için biçim adları (desteklenmeyenler çalışma anında elenir) */
const NATIVE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "code_93",
  "itf",
  "codabar",
  "qr_code",
];

interface NativeDetectedBarcode {
  rawValue: string;
  boundingBox: { width: number; height: number };
}
interface NativeBarcodeDetector {
  detect(source: CanvasImageSource): Promise<NativeDetectedBarcode[]>;
}
interface NativeBarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

const silentLogger = {
  log() {},
  warn() {},
  logError() {},
  logErrors() {},
};

/** Kod çözücü: önce yerleşik BarcodeDetector, olmazsa/başarısızsa ZXing. Okunan metin ya da null döner. */
/**
 * Görüntüyü Otsu eşiğiyle saf siyah-beyaza çevirir. ZXing, arka planı orta gri ya da gölgeli/yansımalı
 * karelerde ham görüntüyü okuyamayabiliyor; eşiklenmiş kopya bu durumları çözer.
 */
function binarizeInto(src: HTMLCanvasElement, dst: HTMLCanvasElement, trim: boolean): boolean {
  const w = src.width;
  const h = src.height;
  const sctx = src.getContext("2d");
  const dctx = dst.getContext("2d");
  if (!sctx || !dctx || w === 0 || h === 0) return false;
  if (dst.width !== w) dst.width = w;
  if (dst.height !== h) dst.height = h;
  const img = sctx.getImageData(0, 0, w, h);
  const d = img.data;
  const lum = new Uint8Array(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
    const l = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
    lum[i] = l;
    hist[l]++;
  }
  const total = lum.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  // 1 = siyah, 0 = beyaz
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < bin.length; i++) bin[i] = lum[i] > threshold ? 0 : 1;
  if (trim) for (let y = 0; y < h; y++) trimRowEdges(bin, y * w, w);
  for (let i = 0, j = 0; i < bin.length; i++, j += 4) {
    const v = bin[i] ? 0 : 255;
    d[j] = d[j + 1] = d[j + 2] = v;
    d[j + 3] = 255;
  }
  dctx.putImageData(img, 0, 0);
  return true;
}

/**
 * Satırın baş ve sonundaki "barkoda ait olamayacak kadar yalnız" siyah çizgileri (kenardaki gölge, masa,
 * el, etiket kenarı) beyaza çevirir. ZXing, satır barkoddan önce siyahla başlıyorsa (5 px bile olsa)
 * başlangıç kalıbını bulamıyor; bu temizlik o durumu çözer. Barkodun kendi başlangıç çizgisinin
 * ardından hemen dar bir boşluk gelir, o yüzden korunur.
 */
function trimRowEdges(bin: Uint8Array, off: number, w: number) {
  // Üç ardışık çizgi (siyah-beyaz-siyah) birbirine benziyorsa barkod başlangıcıdır.
  const similar = (p: number, q: number, r: number) => Math.max(p, q, r) <= 4 * Math.min(p, q, r);
  // soldan
  let x = 0;
  while (x < w) {
    while (x < w && bin[off + x] === 0) x++;
    if (x >= w) return;
    const a = x;
    while (x < w && bin[off + x] === 1) x++;
    const b = x;
    while (x < w && bin[off + x] === 0) x++;
    if (x >= w) break;
    const e = x;
    while (x < w && bin[off + x] === 1) x++;
    if (similar(b - a, e - b, x - e)) break;
    bin.fill(0, off + a, off + b);
    x = b;
  }
  // sağdan
  x = w - 1;
  while (x >= 0) {
    while (x >= 0 && bin[off + x] === 0) x--;
    if (x < 0) return;
    const b = x + 1;
    while (x >= 0 && bin[off + x] === 1) x--;
    const a = x + 1;
    while (x >= 0 && bin[off + x] === 0) x--;
    if (x < 0) break;
    const e = x + 1;
    while (x >= 0 && bin[off + x] === 1) x--;
    if (similar(b - a, a - e, e - (x + 1))) break;
    bin.fill(0, off + a, off + b);
    x = a - 1;
  }
}

async function createDecoder(): Promise<(canvas: HTMLCanvasElement) => Promise<string | null>> {
  const zxing = new ZXingHtml5QrcodeDecoder(BARCODE_FORMATS, false, silentLogger);
  const binaryCanvas = document.createElement("canvas");
  binaryCanvas.getContext("2d", { willReadFrequently: true });
  let zxingFrame = 0;
  const zxingTry = async (canvas: HTMLCanvasElement) => {
    try {
      const result = await zxing.decodeAsync(canvas);
      return result?.text ?? null;
    } catch {
      return null; // bu karede barkod yok (normal durum)
    }
  };
  // Kareler sırayla ham, eşiklenmiş ve kenarları temizlenmiş görüntüyle denenir
  // (her kare tek deneme: yavaş telefonlar yorulmaz)
  const zxingDecode = async (canvas: HTMLCanvasElement) => {
    zxingFrame++;
    const phase = zxingFrame % 3;
    if (phase === 1) return zxingTry(canvas);
    return binarizeInto(canvas, binaryCanvas, phase === 0) ? zxingTry(binaryCanvas) : null;
  };

  let nativeDetector: NativeBarcodeDetector | null = null;
  try {
    const Ctor = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorConstructor }).BarcodeDetector;
    if (Ctor) {
      const supported = Ctor.getSupportedFormats ? await Ctor.getSupportedFormats() : NATIVE_FORMATS;
      const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
      if (formats.length > 0) nativeDetector = new Ctor({ formats });
    }
  } catch {
    nativeDetector = null;
  }
  if (!nativeDetector) return zxingDecode;

  const detector = nativeDetector;
  let nativeBroken = false;
  return async (canvas) => {
    if (!nativeBroken) {
      try {
        const found = await detector.detect(canvas);
        if (found.length > 0) {
          const largest = found.reduce((a, b) =>
            b.boundingBox.width * b.boundingBox.height > a.boundingBox.width * a.boundingBox.height ? b : a
          );
          if (largest.rawValue) return largest.rawValue;
        }
        return null;
      } catch {
        nativeBroken = true; // yerleşik dedektör çalışmıyor: bundan sonra ZXing
      }
    }
    return zxingDecode(canvas);
  };
}

function cameraErrorMessage(err: unknown): { message: string; detail: string } {
  const e = err as { name?: string; message?: string; isTimeout?: boolean } | null;
  const name = e?.name ?? "Unknown";
  const msg = e?.message ?? String(err);
  const detail = `${name}${msg ? ` — ${msg}` : ""}`;
  if (e?.isTimeout) {
    return { message: "Kamera yanıt vermiyor. Tekrar denemek için aşağıdaki butonu kullanın.", detail };
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return {
      message: "Kamera erişimi reddedildi. Lütfen tarayıcı ayarlarından kamera iznini verin.",
      detail,
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return { message: "Kamera bulunamadı. Lütfen cihazınızda bir kamera olduğundan emin olun.", detail };
  }
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return {
      message: "Kamera açılamadı; başka bir uygulama kullanıyor olabilir. Diğer uygulamaları kapatıp tekrar deneyin.",
      detail,
    };
  }
  return { message: "Kamera başlatılamadı. Lütfen izinleri kontrol edin.", detail };
}

export function BarcodeScanner({ isOpen, onClose, onScanSuccess }: BarcodeScannerProps) {
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  // Callback'ler her çizimde değişebilir; kamera döngüsü yeniden başlamasın diye ref'te tutulur
  const onCloseRef = useRef(onClose);
  const onScanSuccessRef = useRef(onScanSuccess);
  useEffect(() => {
    onCloseRef.current = onClose;
    onScanSuccessRef.current = onScanSuccess;
  }, [onClose, onScanSuccess]);

  // Modal açıldığında focus yönetimi
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = (document.activeElement as HTMLElement) || null;
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
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  // Bip sesi (Web Audio API)
  const playBeepSound = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new Ctx();
      }
      const audioContext = audioContextRef.current;
      if (audioContext.state === "suspended") void audioContext.resume();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 800;
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (err) {
      console.warn("Bip sesi çalınamadı:", err);
    }
  }, []);

  // Kamera başlatma, okuma döngüsü ve temizlik
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setErrorDetail(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let scanTimer: ReturnType<typeof setTimeout> | null = null;
    const video = videoRef.current;
    if (!video) return;

    const stopCamera = () => {
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = null;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      video.pause();
      video.srcObject = null;
    };

    const start = async () => {
      setError(null);
      setErrorDetail(null);
      setIsLoading(true);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error("Kamera API'si yok (sayfa HTTPS ile açılmalı)"), {
            name: "NotFoundError",
          });
        }

        // Önce yüksek çözünürlük (küçük barkodlar için ayrıntı), olmazsa sırayla daha esnek istekler
        const attempts: MediaTrackConstraints[] = [
          { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          { facingMode: { ideal: "environment" } },
          {},
        ];
        const open = async () => {
          let lastErr: unknown = null;
          for (const constraints of attempts) {
            try {
              return await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
            } catch (e) {
              lastErr = e;
              const name = (e as { name?: string })?.name;
              // İzin reddi/güvenlik hatasında daha esnek istek denemenin anlamı yok
              if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
                throw e;
              }
            }
          }
          throw lastErr;
        };
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(Object.assign(new Error("Kamera yanıt vermiyor"), { isTimeout: true })),
            CAMERA_START_TIMEOUT_MS
          )
        );
        const opened = await Promise.race([open(), timeout]);
        if (cancelled) {
          opened.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = opened;

        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        await video.play().catch(() => {
          /* otomatik oynatma engellenirse görüntü yine de akar; döngü kareyi bekler */
        });

        // Sürekli otomatik odak (destekleyen telefonlarda; olmazsa sessizce geçilir)
        try {
          const track = stream.getVideoTracks()[0];
          const caps = track?.getCapabilities?.() as { focusMode?: string[] } | undefined;
          if (caps?.focusMode?.includes("continuous")) {
            await track.applyConstraints({
              advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
            });
          }
        } catch {
          /* odak ayarı desteklenmiyor */
        }

        const decode = await createDecoder();
        if (cancelled) return;
        setIsLoading(false);

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });        let handled = false;

        const tick = async () => {
          if (cancelled || handled) return;
          try {
            const frame = frameRef.current;
            if (ctx && frame && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
              const cw = frame.clientWidth;
              const ch = frame.clientHeight;
              const vw = video.videoWidth;
              const vh = video.videoHeight;
              if (cw > 0 && ch > 0) {
                // <video> object-fit: cover ile gösteriliyor: görünen kısmı ve hedef kutusunu video pikseline çevir
                const scale = Math.max(cw / vw, ch / vh);
                const visibleW = cw / scale;
                const visibleH = ch / scale;
                const boxW = Math.min(visibleW * BOX_WIDTH_RATIO, vw);
                const boxH = Math.min(visibleH * BOX_HEIGHT_RATIO, vh);
                const sx = (vw - boxW) / 2;
                const sy = (vh - boxH) / 2;
                const outW = Math.round(Math.min(boxW, MAX_SCAN_WIDTH_PX));
                const outH = Math.max(1, Math.round((boxH * outW) / boxW));
                if (canvas.width !== outW) canvas.width = outW;
                if (canvas.height !== outH) canvas.height = outH;
                ctx.drawImage(video, sx, sy, boxW, boxH, 0, 0, outW, outH);

                const text = (await decode(canvas))?.trim();
                if (text && text.length >= 3 && !cancelled && !handled) {
                  handled = true;
                  stopCamera();
                  playBeepSound();
                  onScanSuccessRef.current(text);
                  onCloseRef.current();
                  return;
                }
              }
            }
          } catch {
            /* bu karede okunamadı; sonraki kareyle devam */
          }
          if (!cancelled && !handled) scanTimer = setTimeout(tick, SCAN_INTERVAL_MS);
        };
        scanTimer = setTimeout(tick, SCAN_INTERVAL_MS);
      } catch (err) {
        stopCamera();
        if (cancelled) return;
        const { message, detail } = cameraErrorMessage(err);
        console.error("Kamera başlatma hatası:", detail);
        setErrorDetail(detail);
        setError(message);
        setIsLoading(false);
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, retryTrigger, playBeepSound]);

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

      {/* İçerik kutusu — mobilde tam ekran, masaüstünde ortada pencere */}
      <div
        ref={modalRef}
        className="relative flex h-full max-h-[100dvh] w-full flex-col overflow-y-auto bg-white p-4 shadow-lg dark:bg-zinc-900 sm:h-auto sm:max-w-lg sm:rounded-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 id="scanner-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Barkod Tarayıcı
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Barkodu çerçevenin içine getirin; otomatik okunur.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
            aria-label="Kapat"
            title="Kapat (Esc)"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Hata mesajı */}
        {error && (
          <div className="mb-3 space-y-2">
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
          </div>
        )}

        {/* Kamera alanı: sabit oranlı kutu, görüntü kutuyu doldurur (object-cover), cihaza göre değişmez */}
        <div
          ref={frameRef}
          data-testid="scanner-frame"
          className="relative mx-auto aspect-[3/4] max-h-[62dvh] w-full overflow-hidden rounded-lg bg-black sm:aspect-[4/3] sm:max-h-none"
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 h-full w-full object-cover"
          />

          {/* Hedef çerçevesi: dışı karartılır, içi okunan bölgedir */}
          {!isLoading && !error && (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
              style={{ width: `${BOX_WIDTH_RATIO * 100}%`, height: `${BOX_HEIGHT_RATIO * 100}%` }}
            >
              <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 animate-pulse rounded bg-red-500/80" />
            </div>
          )}

          {/* Yükleniyor */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="size-8 animate-spin rounded-full border-4 border-zinc-400 border-t-white" />
                <p className="text-sm font-medium text-white">Kamera açılıyor...</p>
              </div>
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
          Okumazsa telefonu biraz uzaklaştırıp barkodu ışıklı bir yerde tutun.
        </p>
      </div>
    </div>
  );
}
