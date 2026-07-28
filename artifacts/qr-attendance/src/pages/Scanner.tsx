import { useEffect, useRef, useState } from "react";
import { useScanQr, getGetDashboardStatsQueryKey, getGetTodayAttendanceQueryKey, getGetCurrentlyInsideQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, QrCode, Camera, ArrowLeft, Volume2, VolumeX, Play } from "lucide-react";
import { Link } from "wouter";

type ScanResult = {
  success: boolean;
  message: string;
  userName?: string;
  uniqueId?: string;
  role?: string;
  action?: string;
};

export default function Scanner() {
  const scannerRef = useRef<HTMLDivElement>(null);
  const scannerInstanceRef = useRef<any>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [volume, setVolume] = useState<number>(() => {
    if (typeof window === "undefined") return 0.7;
    const saved = window.localStorage.getItem("qr_scanner_volume");
    const n = saved == null ? 0.7 : parseFloat(saved);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.7;
  });
  const resultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScanRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const isProcessingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const queryClient = useQueryClient();
  const scanMutation = useScanQr();

  const ensureAudio = () => {
    if (audioCtxRef.current) return audioCtxRef.current;
    try {
      const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      audioCtxRef.current = new Ctor();
      return audioCtxRef.current;
    } catch {
      return null;
    }
  };

  const playTone = (
    ctx: AudioContext,
    freq: number,
    durationMs: number,
    startOffsetMs: number,
    type: OscillatorType = "sine",
    peakGain = 0.25,
  ) => {
    const startTime = ctx.currentTime + startOffsetMs / 1000;
    const stopTime = startTime + durationMs / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(stopTime + 0.02);
  };

  const playBeep = (success: boolean) => {
    if (volume <= 0) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") ctx.resume();
    } catch {}
    try {
      if (success) {
        playTone(ctx, 880, 120, 0, "sine", 0.3 * volume);
        playTone(ctx, 1320, 180, 130, "sine", 0.3 * volume);
      } else {
        playTone(ctx, 220, 180, 0, "sawtooth", 0.25 * volume);
        playTone(ctx, 180, 220, 200, "sawtooth", 0.25 * volume);
      }
    } catch {}
  };

  const handleVolumeChange = (next: number) => {
    setVolume(next);
    try { window.localStorage.setItem("qr_scanner_volume", String(next)); } catch {}
  };

  const testSound = async () => {
    const ctx = ensureAudio();
    try { if (ctx && ctx.state === "suspended") await ctx.resume(); } catch {}
    playBeep(true);
  };

  const safePauseScanner = () => {
    try {
      const inst = scannerInstanceRef.current;
      if (inst && typeof inst.pause === "function") {
        const state = typeof inst.getState === "function" ? inst.getState() : null;
        if (state === 2) {
          inst.pause(true);
        }
      }
    } catch {}
  };

  const safeResumeScanner = () => {
    try {
      const inst = scannerInstanceRef.current;
      if (inst && typeof inst.resume === "function") {
        const state = typeof inst.getState === "function" ? inst.getState() : null;
        if (state === 3) {
          inst.resume();
        }
      }
    } catch {}
  };

  const clearResult = () => {
    if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
    resultTimeoutRef.current = null;
    setResult(null);
    isProcessingRef.current = false;
    safeResumeScanner();
  };

  const showResult = (r: ScanResult) => {
    if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
    setResult(r);
    playBeep(r.success);
    if (r.success) {
      try { window.navigator?.vibrate?.(200); } catch {}
    } else {
      try { window.navigator?.vibrate?.([100, 60, 100]); } catch {}
    }
    resultTimeoutRef.current = setTimeout(() => {
      setResult(null);
      isProcessingRef.current = false;
      resultTimeoutRef.current = null;
      safeResumeScanner();
    }, 1000);
  };

  const handleScan = (decodedText: string) => {
    if (isProcessingRef.current || scanMutation.isPending) return;

    const uid = (decodedText ?? "").trim();
    if (!uid) return;

    const now = Date.now();
    if (lastScanRef.current.text === uid && now - lastScanRef.current.at < 4000) {
      return;
    }
    lastScanRef.current = { text: uid, at: now };
    isProcessingRef.current = true;
    safePauseScanner();

    scanMutation.mutate(
      { data: { uniqueId: uid } },
      {
        onSuccess: (data: any) => {
          showResult({
            success: data.action !== "ignored",
            message: data.message,
            userName: data.user?.name,
            uniqueId: data.user?.uniqueId,
            role: data.user?.role,
            action: data.action,
          });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTodayAttendanceQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetCurrentlyInsideQueryKey() });
        },
        onError: (err: any) => {
          showResult({
            success: false,
            message: err?.data?.error ?? err?.message ?? "Invalid QR code",
          });
        },
      }
    );
  };

  const startScanner = async () => {
    setCameraError("");
    setScanning(true);

    // Prime the audio context inside the user-gesture handler so beeps
    // are allowed to play later (browsers block autoplay otherwise).
    const ctx = ensureAudio();
    try { if (ctx && ctx.state === "suspended") await ctx.resume(); } catch {}

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (!scannerRef.current) return;

      const scanner = new Html5Qrcode("qr-reader");
      scannerInstanceRef.current = scanner;

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras.length) {
        setCameraError("No cameras found. Please connect a camera.");
        setScanning(false);
        return;
      }

      const cameraId = cameras.find((c) => c.label.toLowerCase().includes("back"))?.id ?? cameras[cameras.length - 1].id;

      await scanner.start(
        cameraId,
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => { handleScan(text); },
        undefined
      );
    } catch (err: any) {
      console.error(err);
      setCameraError("Camera access denied. Please allow camera access and try again.");
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    try {
      const inst = scannerInstanceRef.current;
      if (inst) {
        const state = typeof inst.getState === "function" ? inst.getState() : null;
        if (state === 2 || state === 3) {
          await inst.stop();
        }
        scannerInstanceRef.current = null;
      }
    } catch {}
    setScanning(false);
    isProcessingRef.current = false;
  };

  useEffect(() => {
    return () => {
      stopScanner();
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-4">
        <div className="flex items-center gap-3 max-w-md mx-auto">
          <Link href="/dashboard">
            <button
              data-testid="back-button"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <QrCode className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">QR Scanner</h1>
            <p className="text-xs text-slate-400">Scan student ID card to mark attendance</p>
          </div>
        </div>
      </div>

      {/* Main Scanner Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 max-w-md mx-auto w-full">
        {/* Scan result overlay */}
        {result && (
          <div
            data-testid={result.success ? "scan-success" : "scan-error"}
            className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 transition-all ${
              result.success
                ? result.action === "exit"
                  ? "bg-orange-950/95"
                  : "bg-green-950/95"
                : "bg-red-950/95"
            }`}
          >
            {result.success ? (
              <CheckCircle className={`w-20 h-20 mb-4 ${result.action === "exit" ? "text-orange-400" : "text-green-400"}`} />
            ) : (
              <XCircle className="w-20 h-20 text-red-400 mb-4" />
            )}
            <p className={`text-3xl font-extrabold mb-3 uppercase tracking-wide ${result.success ? (result.action === "exit" ? "text-orange-400" : "text-green-400") : "text-amber-400"}`}>
              {result.success
                ? result.action === "exit"
                  ? "Left Campus"
                  : result.action === "entry"
                  ? "On Campus"
                  : "Recorded"
                : "Already Scanned"}
            </p>
            {result.userName && (
              <div className="my-2 px-6 py-3 bg-slate-900/90 border-2 border-amber-400/80 rounded-2xl shadow-2xl text-center">
                <p className="text-4xl sm:text-5xl font-black text-amber-300 tracking-wide leading-tight drop-shadow-lg uppercase">
                  {result.userName}
                </p>
              </div>
            )}
            {result.uniqueId && (
              <p className="text-lg font-mono text-slate-200 mb-2 tracking-wider">
                ID: {result.uniqueId}
              </p>
            )}
            {result.role && (
              <span className={`mb-3 px-3 py-0.5 rounded-full text-xs font-semibold uppercase ${
                result.role === "student" ? "bg-blue-800 text-blue-200" : "bg-purple-800 text-purple-200"
              }`}>
                {result.role}
              </span>
            )}
            <p className="text-sm text-slate-300 text-center mt-1 px-4">{result.message}</p>
            {result.action && (
              <span className={`mt-4 px-4 py-1.5 rounded-full text-sm font-semibold ${
                result.action === "entry" ? "bg-green-800 text-green-200" : result.action === "exit" ? "bg-orange-800 text-orange-200" : "bg-slate-800 text-slate-200"
              }`}>
                {result.action === "entry" ? "✓ Checked In" : result.action === "exit" ? "✓ Checked Out" : "Recorded"}
              </span>
            )}
            <button
              onClick={clearResult}
              className="mt-8 px-6 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
            >
              Continue Scanning
            </button>
          </div>
        )}

        {/* Scanner viewport */}
        <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-6">
          <div
            id="qr-reader"
            ref={scannerRef}
            className={`w-full aspect-square ${scanning ? "" : "hidden"}`}
          />
          {!scanning && (
            <div className="w-full aspect-square flex flex-col items-center justify-center bg-slate-800/50">
              <div className="w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center mb-4">
                <Camera className="w-12 h-12 text-slate-400" />
              </div>
              <p className="text-sm text-slate-400 text-center px-6">
                Camera is off. Press Start to begin scanning.
              </p>
            </div>
          )}
        </div>

        {cameraError && (
          <div className="w-full mb-4 px-4 py-3 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm text-center">
            {cameraError}
          </div>
        )}

        {/* Controls */}
        <div className="w-full flex gap-3">
          {!scanning ? (
            <button
              data-testid="start-scanner"
              onClick={startScanner}
              className="flex-1 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-base font-bold flex items-center justify-center gap-3 transition-colors shadow-lg shadow-blue-900/30"
            >
              <Camera className="w-5 h-5" />
              Start Scanner
            </button>
          ) : (
            <button
              data-testid="stop-scanner"
              onClick={stopScanner}
              className="flex-1 py-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-base font-bold flex items-center justify-center gap-3 transition-colors"
            >
              Stop Scanner
            </button>
          )}
        </div>

        {/* Volume control */}
        <div className="mt-6 w-full bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => handleVolumeChange(volume > 0 ? 0 : 0.7)}
              className="text-slate-300 hover:text-white transition-colors"
              title={volume > 0 ? "Mute" : "Unmute"}
              data-testid="toggle-mute"
            >
              {volume > 0 ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5 text-slate-500" />}
            </button>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-400">Beep volume</span>
                <span className="text-xs font-mono text-slate-500">{Math.round(volume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
                data-testid="volume-slider"
              />
            </div>
            <button
              onClick={testSound}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors border border-slate-700"
              title="Play test beep"
              data-testid="test-sound"
            >
              <Play className="w-3.5 h-3.5" />
              Test
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-4 w-full space-y-2">
          {[
            "Point camera at QR code on ID card",
            "Hold steady until scan is detected",
            "Scan again after the confirmation to mark the student inside",
          ].map((tip, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="w-5 h-5 rounded-full bg-blue-900/60 text-blue-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-slate-400">{tip}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
