import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import {
  CheckCircle, XCircle, Camera, History as HistoryIcon, ArrowLeft,
  ShieldCheck, Wifi, WifiOff, RefreshCw, CloudUpload, Download, Clock,
} from "lucide-react";
import {
  refreshUserCache, findUserLocal, getCachedUsers, getCacheFetchedAt,
  getCooldownMsRemaining, markScannedLocally,
  enqueueScan, getQueue, syncQueue, getLastSyncAt,
  type CachedUser, type PendingScan,
} from "../lib/offlineScanner";

type ScanReply =
  | { ok: true; action: "queued"; user: CachedUser; queued: number }
  | { ok: false; message: string };

const POPUP_MS = 1000; // 1 second display duration
const SYNC_INTERVAL_MS = 3_000; // sync every 3 seconds for near-real-time updates

function formatAgo(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${s}s`;
}

export default function SecurityApp() {
  const scannerRef = useRef<HTMLDivElement>(null);
  const scannerInstanceRef = useRef<any>(null);
  const [scanning, setScanning] = useState(false);
  const [popup, setPopup] = useState<ScanReply | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const popupTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const lastScanRef = useRef<{ text: string; at: number } | null>(null);

  const [unlocked, setUnlocked] = useState(false); // always locked on fresh open
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState("");

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === "038899") {
      setUnlocked(true);
      setPasscodeError("");
    } else {
      setPasscodeError("Invalid passcode. Please try again.");
    }
  };

  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [cachedCount, setCachedCount] = useState<number>(getCachedUsers().length);
  const [cachedAt, setCachedAt] = useState<number | null>(getCacheFetchedAt());
  const [queue, setQueue] = useState<PendingScan[]>(getQueue());
  const [lastSync, setLastSync] = useState<number | null>(getLastSyncAt());
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [installPromptEvt, setInstallPromptEvt] = useState<any>(null);
  const [tick, setTick] = useState(0);

  // ---------- Audio feedback (Web Audio API) ----------
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ensureCtx = () => {
    if (!audioCtxRef.current && typeof window !== "undefined") {
      try {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (Ctx) audioCtxRef.current = new Ctx();
      } catch {}
    }
    return audioCtxRef.current;
  };
  const beep = (kind: "ok" | "err") => {
    const ctx = ensureCtx();
    if (!ctx) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      const vol = 0.15;
      if (kind === "ok") {
        o.frequency.setValueAtTime(880, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
      } else {
        o.frequency.setValueAtTime(220, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.18);
      }
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      o.start();
      o.stop(ctx.currentTime + 0.24);
    } catch {}
  };

  // ---------- Online/offline tracking + install prompt ----------
  useEffect(() => {
    const goOn = () => setOnline(true);
    const goOff = () => setOnline(false);
    window.addEventListener("online", goOn);
    window.addEventListener("offline", goOff);
    const onInstall = (e: any) => { e.preventDefault(); setInstallPromptEvt(e); };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => {
      window.removeEventListener("online", goOn);
      window.removeEventListener("offline", goOff);
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, []);

  // ---------- Cache students on mount ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRefreshing(true);
      const r = await refreshUserCache(false);
      if (cancelled) return;
      setCachedCount(r.count);
      setCachedAt(getCacheFetchedAt());
      setRefreshing(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const refreshCacheNow = async () => {
    setRefreshing(true);
    const r = await refreshUserCache(true);
    setCachedCount(r.count);
    setCachedAt(getCacheFetchedAt());
    setRefreshing(false);
  };

  // ---------- Background sync loop ----------
  const runSync = useCallback(async () => {
    if (!navigator.onLine) return;
    if (getQueue().length === 0) return;
    setSyncing(true);
    try {
      await syncQueue();
      setQueue(getQueue());
      setLastSync(getLastSyncAt());
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => { runSync(); }, SYNC_INTERVAL_MS);
    const onOnline = () => { runSync(); };
    window.addEventListener("online", onOnline);
    runSync();
    return () => {
      clearInterval(id);
      window.removeEventListener("online", onOnline);
    };
  }, [runSync]);

  // 1Hz tick for "x seconds ago" labels and cooldown countdowns
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ---------- Popup helper ----------
  const showPopup = (r: ScanReply) => {
    if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
    setPopup(r);
    if (r.ok) {
      beep("ok");
      try { window.navigator?.vibrate?.(120); } catch {}
    } else {
      beep("err");
      try { window.navigator?.vibrate?.([60, 40, 60]); } catch {}
    }
    popupTimeoutRef.current = setTimeout(() => setPopup(null), POPUP_MS);
  };

  // ---------- LOCAL scan handling (instant, no network) ----------
  const handleScan = (decodedText: string) => {
    const text = decodedText.trim();
    if (!text) return;

    const last = lastScanRef.current;
    if (last && last.text === text && Date.now() - last.at < 10_000) return; // ignore same QR for 10s
    lastScanRef.current = { text, at: Date.now() };

    const uid = text;
    const user = findUserLocal(uid);
    if (!user) {
      showPopup({ ok: false, message: `Unknown QR code: ${uid}` });
      return;
    }

    const cdRemaining = getCooldownMsRemaining(uid);
    if (cdRemaining > 0) {
      showPopup({
        ok: false,
        message: `${user.name} already scanned. Wait ${formatRemaining(cdRemaining)}.`,
      });
      return;
    }

    enqueueScan(uid);
    markScannedLocally(uid);
    const newQueue = getQueue();
    setQueue(newQueue);
    showPopup({ ok: true, action: "queued", user, queued: newQueue.length });

    // Immediately sync to server when online—don't wait for the interval
    if (navigator.onLine) {
      runSync();
    }
  };

  // ---------- Camera ----------
  const startScanner = async () => {
    setCameraError("");
    setScanning(true);
    ensureCtx();
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (!scannerRef.current) return;
      const scanner = new Html5Qrcode("sec-qr-reader");
      scannerInstanceRef.current = scanner;
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras.length) {
        setCameraError("No cameras found.");
        setScanning(false);
        return;
      }
      const cameraId =
        cameras.find((c) => c.label.toLowerCase().includes("back"))?.id ??
        cameras[cameras.length - 1].id;
      await scanner.start(
        cameraId,
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => { handleScan(text); },
        undefined,
      );
    } catch (err) {
      console.error(err);
      setCameraError("Camera access denied. Please allow camera permission.");
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    try {
      if (scannerInstanceRef.current) {
        await scannerInstanceRef.current.stop();
        scannerInstanceRef.current = null;
      }
    } catch {}
    setScanning(false);
  };

  useEffect(() => {
    return () => {
      stopScanner();
      if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
    };
  }, []);

  const installApp = async () => {
    if (!installPromptEvt) return;
    try {
      installPromptEvt.prompt();
      await installPromptEvt.userChoice;
    } catch {}
    setInstallPromptEvt(null);
  };

  const queueLen = queue.length;

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 font-sans text-slate-100">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-orange-650/10 border border-orange-500/20 flex items-center justify-center mb-4">
              <ShieldCheck className="w-8 h-8 text-orange-500" />
            </div>
            <h1 className="text-xl font-bold text-white text-center">Scanner Lock</h1>
            <p className="text-xs text-slate-450 mt-1.5 text-center">
              Please enter the passcode to access the security scanner.
            </p>
          </div>

          <form onSubmit={handleUnlock} className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl">
            <div className="mb-5">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Passcode
              </label>
              <input
                type="password"
                placeholder="••••••"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-700 text-center font-mono tracking-widest text-lg focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                autoFocus
              />
              {passcodeError && (
                <p className="text-red-500 text-xs font-semibold mt-2.5 text-center">{passcodeError}</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm transition-colors active:scale-[0.98] shadow-lg shadow-orange-950/20"
            >
              Unlock Scanner
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-3 max-w-md mx-auto">
          <div className="w-9 h-9 rounded-lg bg-orange-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-bold">Security Scanner</h1>
            <p className="text-xs text-slate-400">Offline-ready · validates locally · syncs later</p>
          </div>
          <button
            data-testid="open-history"
            onClick={() => setShowHistory(true)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            title="Pending queue"
          >
            <HistoryIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="bg-slate-900/60 border-b border-slate-800 px-4 py-2">
        <div className="max-w-md mx-auto flex items-center justify-between text-xs">
          <div className={`flex items-center gap-1.5 ${online ? "text-emerald-400" : "text-amber-400"}`}>
            {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="font-medium">{online ? "Online" : "Offline"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <CloudUpload className={`w-3.5 h-3.5 ${syncing ? "animate-pulse text-blue-400" : ""}`} />
            <span>{queueLen > 0 ? `${queueLen} pending` : "All synced"}</span>
            {lastSync && <span className="text-slate-600">· {formatAgo(lastSync)}</span>}
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <Download className="w-3.5 h-3.5" />
            <span>{cachedCount} students</span>
          </div>
        </div>
      </div>

      {installPromptEvt && (
        <div className="bg-orange-600/10 border-b border-orange-700/40 px-4 py-2">
          <div className="max-w-md mx-auto flex items-center justify-between gap-3">
            <p className="text-xs text-orange-200">Install this app to your home screen for offline scanning.</p>
            <button
              onClick={installApp}
              data-testid="install-app"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white"
            >
              Install
            </button>
          </div>
        </div>
      )}

      {/* Result popup */}
      {popup && (
        <div
          data-testid={popup.ok ? "scan-success" : "scan-error"}
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 ${
            popup.ok ? "bg-green-950/95" : "bg-red-950/95"
          }`}
        >
          {popup.ok ? (
            <CheckCircle className="w-24 h-24 text-green-400 mb-4" />
          ) : (
            <XCircle className="w-24 h-24 text-red-400 mb-4" />
          )}
          <p className={`text-3xl font-extrabold mb-2 uppercase tracking-wide ${popup.ok ? "text-green-400" : "text-amber-400"}`}>
            {popup.ok ? "Access Granted" : "Already Scanned"}
          </p>
          {popup.ok && (
            <>
              <div className="my-2 px-6 py-3 bg-slate-900/90 border-2 border-amber-400/80 rounded-2xl shadow-2xl text-center">
                <p className="text-4xl sm:text-5xl font-black text-amber-300 tracking-wide leading-tight drop-shadow-lg uppercase">
                  {popup.user.name}
                </p>
              </div>
              <p className="text-base font-semibold text-slate-200 mt-1">{popup.user.uniqueId} · {popup.user.role}</p>
              <span className="mt-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-800 text-blue-200">
                Saved locally · {popup.queued} pending sync
              </span>
            </>
          )}
          {!popup.ok && (
            <p className="text-sm text-slate-300 text-center mt-2">{popup.message}</p>
          )}
        </div>
      )}

      {/* Scanner */}
      <div className="flex-1 flex flex-col items-center px-4 py-5 max-w-md mx-auto w-full">
        <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-5">
          <div
            id="sec-qr-reader"
            ref={scannerRef}
            className={`w-full aspect-square ${scanning ? "" : "hidden"}`}
          />
          {!scanning && (
            <div className="w-full aspect-square flex flex-col items-center justify-center bg-slate-800/50">
              <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center mb-3">
                <Camera className="w-10 h-10 text-slate-400" />
              </div>
              <p className="text-sm text-slate-400 text-center px-6">Press Start to open the camera.</p>
              {cachedCount === 0 && (
                <p className="mt-2 text-xs text-amber-400 px-6 text-center">
                  No students cached yet — connect once to download.
                </p>
              )}
            </div>
          )}
        </div>

        {cameraError && (
          <div className="w-full mb-4 px-4 py-2 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm text-center">
            {cameraError}
          </div>
        )}

        <div className="w-full flex gap-3">
          {!scanning ? (
            <button
              data-testid="security-start-scanner"
              onClick={startScanner}
              disabled={cachedCount === 0}
              className="flex-1 py-4 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-base font-bold flex items-center justify-center gap-2 shadow-lg shadow-orange-900/30"
            >
              <Camera className="w-5 h-5" /> Start Scanner
            </button>
          ) : (
            <button
              data-testid="security-stop-scanner"
              onClick={stopScanner}
              className="flex-1 py-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-base font-bold"
            >
              Stop Scanner
            </button>
          )}
        </div>

        <div className="w-full mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={refreshCacheNow}
            disabled={refreshing || !online}
            data-testid="refresh-students"
            className="py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh student list
          </button>
          <button
            onClick={runSync}
            disabled={syncing || queueLen === 0 || !online}
            data-testid="sync-now"
            className="py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2"
          >
            <CloudUpload className={`w-3.5 h-3.5 ${syncing ? "animate-pulse text-blue-400" : ""}`} />
            Sync now ({queueLen})
          </button>
        </div>

        <div className="w-full mt-4 px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
          {cachedAt ? (
            <>Student cache updated {formatAgo(cachedAt)} · 20-min duplicate cooldown enforced locally.</>
          ) : (
            <>Student cache empty — refresh once with internet to enable offline scanning.</>
          )}
        </div>
      </div>

      {/* Pending queue modal */}
      {showHistory && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg sm:rounded-2xl bg-slate-900 border-t sm:border border-slate-800 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  data-testid="close-history"
                  onClick={() => setShowHistory(false)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-sm font-semibold text-white">Pending sync ({queueLen})</h2>
              </div>
              <button
                onClick={runSync}
                disabled={syncing || queueLen === 0 || !online}
                className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </div>
            <div data-testid="history-list" className="flex-1 overflow-y-auto divide-y divide-slate-800">
              {queueLen === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm">
                  No pending scans — everything is already on the dashboard.
                </div>
              ) : (
                queue.slice().reverse().map((s) => {
                  const u = findUserLocal(s.uniqueId);
                  return (
                    <div key={s.clientScanId} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-200 flex-shrink-0">
                        {(u?.name ?? s.uniqueId).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{u?.name ?? "Unknown"}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {s.uniqueId} · <Clock className="inline w-3 h-3 -mt-0.5" /> {new Date(s.scannedAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-900/50 text-amber-300">
                        Queued
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            {lastSync && (
              <div className="px-4 py-2 border-t border-slate-800 text-xs text-slate-500 text-center">
                Last sync {formatAgo(lastSync)} · auto-syncs every 3s when online
              </div>
            )}
          </div>
        </div>
      )}

      {/* tick is referenced so React re-renders timestamps each second */}
      <span className="hidden">{tick}</span>
    </div>
  );
}
