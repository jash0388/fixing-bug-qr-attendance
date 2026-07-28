import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { ScanQrBody } from "@workspace/api-zod";
import { authMiddleware, adminOnly } from "../middlewares/auth.js";

const router = Router();

const HOSTEL_DAY_START_HOUR_IST = 6;

function getHostelDate(baseDate = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(baseDate);

  const getPart = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hour = getPart("hour");

  const hostelDay = new Date(Date.UTC(year, month - 1, day));
  if (hour < HOSTEL_DAY_START_HOUR_IST) {
    hostelDay.setUTCDate(hostelDay.getUTCDate() - 1);
  }

  return hostelDay.toISOString().slice(0, 10);
}

async function getCurrentStatus(userId: number): Promise<"inside" | "left"> {
  const today = getHostelDate();
  const { data: records } = await supabase
    .from("qr_attendance")
    .select("entry_time, exit_time")
    .eq("user_id", userId)
    .eq("date", today)
    .order("last_scan_at", { ascending: false, nullsFirst: false })
    .limit(1);

  if (!records?.[0]) {
    return "left";
  }

  return getRecordStatus(records[0]);
}

function getRecordStatus(record: any): "inside" | "left" {
  if (!record?.exit_time) return "inside";
  
  // Handle the 9999-12-31 / 1970 sentinel dates or null
  const hasEntry = record.entry_time && !record.entry_time.startsWith("9999") && !record.entry_time.startsWith("1970");
  if (!hasEntry) return "left";

  const entryTime = new Date(record.entry_time).getTime();
  const exitTime = new Date(record.exit_time).getTime();
  return entryTime >= exitTime ? "inside" : "left";
}

function getLatestRecordsByUser(records: any[] = []): Map<number, any> {
  const latestByUserId = new Map<number, any>();
  for (const record of records) {
    if (!latestByUserId.has(record.user_id)) {
      latestByUserId.set(record.user_id, record);
    }
  }
  return latestByUserId;
}

function consolidateRecordsPerUserAndDate(records: any[] = []): any[] {
  const map = new Map<string, any>();

  for (const r of records) {
    if (!r.user_id || !r.date) continue;
    const key = `${r.user_id}_${r.date}`;

    if (!map.has(key)) {
      map.set(key, { ...r });
    } else {
      const existing = map.get(key)!;

      // 1. Keep earliest valid entry time
      if (r.entry_time && !isSentinel(r.entry_time)) {
        if (isSentinel(existing.entry_time) || new Date(r.entry_time).getTime() < new Date(existing.entry_time).getTime()) {
          existing.entry_time = r.entry_time;
        }
      }

      // 2. Keep latest valid exit time
      if (r.exit_time && !isSentinel(r.exit_time)) {
        if (isSentinel(existing.exit_time) || new Date(r.exit_time).getTime() > new Date(existing.exit_time).getTime()) {
          existing.exit_time = r.exit_time;
        }
      }

      // 3. Keep latest scan timestamp
      if (r.last_scan_at && (!existing.last_scan_at || new Date(r.last_scan_at).getTime() > new Date(existing.last_scan_at).getTime())) {
        existing.last_scan_at = r.last_scan_at;
      }

      // 4. Status priority: if any record is 'inside' without exit, student is currently on campus
      const existingStatus = getRecordStatus(existing);
      const rStatus = getRecordStatus(r);
      if (rStatus === "inside" || existingStatus === "inside") {
        if (rStatus === "inside") {
          existing.exit_time = null;
        }
      }

      existing.scan_count = Math.max(existing.scan_count || 1, r.scan_count || 1);
    }
  }

  return Array.from(map.values());
}


function isSentinel(ts: string | null | undefined): boolean {
  if (!ts) return true;
  return ts.startsWith("9999") || ts.startsWith("1970") || ts.startsWith("0001");
}

function formatRecord(record: any, user?: any) {
  const hasRealEntry = !isSentinel(record.entry_time);
  const hasRealExit = !isSentinel(record.exit_time);

  const durationMinutes =
    hasRealEntry && hasRealExit
      ? Math.floor(Math.abs(new Date(record.entry_time).getTime() - new Date(record.exit_time).getTime()) / 60000)
      : null;

  const status = getRecordStatus(record);

  return {
    id: record.id,
    userId: record.user_id,
    date: record.date,
    entryTime: hasRealEntry ? record.entry_time : null,
    exitTime: hasRealExit ? record.exit_time : null,
    scanCount: record.scan_count,
    durationMinutes,
    status,
    ...(user ? {
      user: {
        id: user.id,
        name: user.name,
        uniqueId: user.unique_id,
        role: user.role,
        section: user.section ?? null,
        createdAt: user.created_at,
      }
    } : {}),
  };
}

function extractUniqueId(body: any): string | null {
  if (!body) return null;

  // Direct shape: { uniqueId: "..." }
  if (typeof body.uniqueId === "string" && body.uniqueId.trim()) {
    return body.uniqueId.trim();
  }
  // Some clients send { qrText } or { code } or { id }
  for (const key of ["qrText", "code", "id", "data", "value", "text"]) {
    const v = body[key];
    if (typeof v === "string" && v.trim()) {
      return tryExtractFromString(v.trim());
    }
  }
  // Body is itself a raw string (sometimes happens with text/plain)
  if (typeof body === "string") {
    return tryExtractFromString(body.trim());
  }
  return null;
}

function tryExtractFromString(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // If it looks like JSON, try to parse and pick uniqueId
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === "object" && typeof (obj as any).uniqueId === "string") {
        return (obj as any).uniqueId.trim();
      }
    } catch {
      /* fall through */
    }
  }
  // If it looks like a URL, try to extract a uniqueId path/query param
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const q = u.searchParams.get("uniqueId") || u.searchParams.get("uid");
      if (q) return q.trim();
      const last = u.pathname.split("/").filter(Boolean).pop();
      if (last) return decodeURIComponent(last).trim();
    } catch {
      /* fall through */
    }
  }
  return trimmed;
}

// sentinel far-past timestamp used when entry_time is unknown (student leaving first)
const SENTINEL_ENTRY = "1970-01-01T00:00:00.000Z";
const GENESIS_HASH = "GENESIS_HASH_00000000000000000000000000000000000000000000000000000000";

function sha256Sync(ascii: string): string {
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i: number, j: number;
  let result = "";

  const words: number[] = [];
  const asciiLength = ascii.length * 8;

  let hash = (sha256Sync as any).h = (sha256Sync as any).h || [];
  let k = (sha256Sync as any).k = (sha256Sync as any).k || [];
  let primeCounter = k.length;

  const isPrime = (candidate: number) => {
    for (let factor = 2; factor * factor <= candidate; factor++) {
      if (candidate % factor === 0) return false;
    }
    return true;
  };

  const getFractionalBits = (n: number) => Math.floor((n - Math.floor(n)) * maxWord);

  if (!primeCounter) {
    for (let n = 2; primeCounter < 64; n++) {
      if (isPrime(n)) {
        if (primeCounter < 8) {
          hash[primeCounter] = getFractionalBits(mathPow(n, 1 / 2));
        }
        k[primeCounter] = getFractionalBits(mathPow(n, 1 / 3));
        primeCounter++;
      }
    }
  }

  hash = hash.slice(0);
  ascii += "\x80";
  while ((ascii.length % 64) - 56) ascii += "\x00";
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return "";
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words.length] = (asciiLength / maxWord) | 0;
  words[words.length] = asciiLength | 0;

  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];

      const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & hash[5]) ^ (~e & hash[6]);
      const temp1 = hash[7] + s1 + ch + k[i] + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3)) + w[i - 7] + (((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10))) | 0);
      const maj = (a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 = s0 + maj;

      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
      hash.pop();
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }
  return result;
}

const processedBatches = new Set<string>();

router.post("/scan/batch", async (req: any, res: any) => {
  const scans = req.body?.scans;
  const batchId = typeof req.body?.batchId === "string" ? req.body.batchId : null;
  const batchDeviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId : null;

  if (!Array.isArray(scans) || scans.length === 0) {
    res.status(400).json({ error: "scans must be a non-empty array" });
    return;
  }
  if (scans.length > 500) {
    res.status(400).json({ error: "batch too large (max 500)" });
    return;
  }

  // Replay protection check
  if (batchId && processedBatches.has(batchId)) {
    res.json({ results: [], syncReceipt: "ALREADY_PROCESSED", alreadyProcessed: true });
    return;
  }
  if (batchId) {
    processedBatches.add(batchId);
    if (processedBatches.size > 2000) {
      const first = processedBatches.values().next().value;
      if (first) processedBatches.delete(first);
    }
  }

  const results: any[] = [];
  const batchStatusCache = new Map<number, { status: "inside" | "left"; recordId?: number; scanCount: number; lastScanAt?: string }>();
  let lastSeqNo: number | null = null;

  for (const item of scans) {
    const clientScanId = String(item?.clientScanId ?? "");
    const uniqueId = extractUniqueId(item) ?? (typeof item?.uniqueId === "string" ? item.uniqueId.trim() : null);
    const itemDeviceId = typeof item?.deviceId === "string" ? item.deviceId : batchDeviceId || "unknown_device";
    const scannedAtRaw = item?.scannedAt;
    const scannedAt = (() => {
      const d = scannedAtRaw ? new Date(scannedAtRaw) : new Date();
      return isNaN(d.getTime()) ? new Date() : d;
    })();

    const hash = typeof item?.hash === "string" ? item.hash : null;
    const prevHash = typeof item?.prevHash === "string" ? item.prevHash : null;
    const seqNo = typeof item?.seqNo === "number" ? item.seqNo : null;

    let hashVerified = false;
    let sequenceGapDetected = false;

    if (seqNo !== null && lastSeqNo !== null) {
      if (seqNo !== lastSeqNo + 1) {
        sequenceGapDetected = true;
      }
    }
    if (seqNo !== null) {
      lastSeqNo = seqNo;
    }

    if (hash && prevHash && seqNo !== null) {
      const computedHash = sha256Sync(`${clientScanId}:${uniqueId}:${scannedAtRaw || scannedAt.toISOString()}:${seqNo}:${prevHash}`);
      hashVerified = computedHash === hash;
    } else if (hash && prevHash) {
      const computedHash = sha256Sync(`${clientScanId}:${uniqueId}:${scannedAtRaw || scannedAt.toISOString()}:${prevHash}`);
      hashVerified = computedHash === hash;
    }

    // Compute additive risk score for anomaly review
    let riskScore = 0;
    if (hash && !hashVerified) riskScore += 50;
    if (sequenceGapDetected) riskScore += 40;
    const riskLevel = riskScore >= 50 ? "HIGH" : riskScore >= 20 ? "MEDIUM" : "LOW";

    if (!uniqueId) {
      results.push({ clientScanId, status: "invalid", error: "Missing uniqueId", hashVerified });
      continue;
    }

    try {
      const { data: users, error: userError } = await supabase
        .from("qr_users")
        .select("*")
        .eq("unique_id", uniqueId)
        .limit(1);

      if (userError || !users?.[0]) {
        results.push({ clientScanId, status: "user_not_found", error: "Invalid QR code — user not found" });
        continue;
      }
      const user = users[0];
      const date = getHostelDate(scannedAt);
      const ts = scannedAt.toISOString();

      let current: { status: "inside" | "left"; recordId?: number; scanCount: number; lastScanAt?: string };
      if (batchStatusCache.has(user.id)) {
        current = batchStatusCache.get(user.id)!;
      } else {
        const { data: existingRecords } = await supabase
          .from("qr_attendance")
          .select("*")
          .eq("user_id", user.id)
          .eq("date", date)
          .order("last_scan_at", { ascending: false, nullsFirst: false })
          .limit(1);
        const existing = existingRecords?.[0];
        current = {
          status: existing ? getRecordStatus(existing) : "left",
          recordId: existing?.id,
          scanCount: existing?.scan_count ?? 0,
          lastScanAt: existing?.last_scan_at,
        };
      }

      if (current.lastScanAt) {
        const lastScanTime = new Date(current.lastScanAt).getTime();
        const timeDiff = scannedAt.getTime() - lastScanTime;
        if (timeDiff >= 0 && timeDiff < 20 * 60 * 1000) {
          results.push({
            clientScanId,
            status: "ok",
            action: current.status === "inside" ? "entry" : "exit",
            user: { id: user.id, name: user.name, uniqueId: user.unique_id, role: user.role },
            cooldown: true,
          });
          continue;
        }
      }

      if (current.status === "left") {
        // Entry scan (student entering campus / checking in)
        const { data: inserted, error: insertError } = await supabase
          .from("qr_attendance")
          .insert({ user_id: user.id, date, entry_time: ts, exit_time: null, scan_count: 1, last_scan_at: ts })
          .select()
          .single();
        if (insertError) throw insertError;
        const recordId = inserted.id;
        batchStatusCache.set(user.id, { status: "inside", recordId, scanCount: 1, lastScanAt: ts });
        results.push({
          clientScanId,
          status: "ok",
          action: "entry",
          user: { id: user.id, name: user.name, uniqueId: user.unique_id, role: user.role },
          recordId,
        });
      } else {
        // Exit scan (student leaving campus / checking out)
        if (current.recordId) {
          const nextScanCount = current.scanCount + 1;
          const { error: updateError } = await supabase
            .from("qr_attendance")
            .update({ exit_time: ts, scan_count: nextScanCount, last_scan_at: ts })
            .eq("id", current.recordId);
          if (updateError) throw updateError;
          batchStatusCache.set(user.id, { status: "left", recordId: current.recordId, scanCount: nextScanCount, lastScanAt: ts });
          results.push({
            clientScanId,
            status: "ok",
            action: "exit",
            user: { id: user.id, name: user.name, uniqueId: user.unique_id, role: user.role },
            recordId: current.recordId,
          });
        } else {
          const { data: inserted, error: insertError } = await supabase
            .from("qr_attendance")
            .insert({ user_id: user.id, date, exit_time: ts, entry_time: SENTINEL_ENTRY, scan_count: 1, last_scan_at: ts })
            .select()
            .single();
          if (insertError) throw insertError;
          const recordId = inserted.id;
          batchStatusCache.set(user.id, { status: "left", recordId, scanCount: 1, lastScanAt: ts });
          results.push({
            clientScanId,
            status: "ok",
            action: "exit",
            user: { id: user.id, name: user.name, uniqueId: user.unique_id, role: user.role },
            recordId,
          });
        }
      }
    } catch (err: any) {
      results.push({ clientScanId, status: "error", error: "Server error processing scan" });
    }
  }

  const syncReceipt = sha256Sync(`RECEIPT:${batchId || Date.now()}:${results.length}:${new Date().toISOString()}`);
  res.json({ results, syncReceipt, processedAt: new Date().toISOString() });
});

router.post("/scan", async (req: any, res: any) => {
  const uniqueId = extractUniqueId(req.body);
  if (!uniqueId) {
    res.status(400).json({ error: "Invalid QR code — missing identifier" });
    return;
  }
  try {
    const { data: users, error: userError } = await supabase
      .from("qr_users")
      .select("*")
      .eq("unique_id", uniqueId)
      .limit(1);

    if (userError || !users?.[0]) {
      res.status(404).json({ error: "Invalid QR code — user not found" });
      return;
    }
    const user = users[0];
    const date = getHostelDate();
    const now = new Date().toISOString();

    const { data: existingRecords } = await supabase
      .from("qr_attendance")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", date)
      .order("last_scan_at", { ascending: false, nullsFirst: false })
      .limit(1);

    const record = existingRecords?.[0];

    if (record && record.last_scan_at) {
      const lastScanTime = new Date(record.last_scan_at).getTime();
      const timeDiff = Date.now() - lastScanTime;
      if (timeDiff >= 0 && timeDiff < 20 * 60 * 1000) {
        const currentStatus = getRecordStatus(record);
        return res.json({
          success: true,
          action: currentStatus === "inside" ? "entry" : "exit",
          message: `${user.name} is already scanned.`,
          user: { id: user.id, name: user.name, uniqueId: user.unique_id, role: user.role },
          cooldown: true,
        });
      }
    }

    const currentStatus = record ? getRecordStatus(record) : "left";

    if (currentStatus === "left") {
      req.log.info({ userId: user.id, name: user.name }, "Student checked in / arrived on campus");
      const { data: inserted, error: insertError } = await supabase
        .from("qr_attendance")
        .insert({ user_id: user.id, date, entry_time: now, exit_time: null, scan_count: 1, last_scan_at: now })
        .select()
        .single();

      if (insertError) {
        req.log.error({ insertError }, "Insert error on entry scan");
        return res.status(500).json({ error: "DB error", detail: insertError.message, code: insertError.code });
      }

      return res.json({
        success: true,
        action: "entry",
        message: `${user.name} has Checked In / Arrived on Campus.`,
        user: { id: user.id, name: user.name, uniqueId: user.unique_id, role: user.role },
        recordId: inserted.id,
      });
    } else {
      req.log.info({ userId: user.id, name: user.name }, "Student checked out / leaving campus");
      const nextScanCount = (record?.scan_count ?? 0) + 1;
      const { data: updated, error: updateError } = await supabase
        .from("qr_attendance")
        .update({ exit_time: now, scan_count: nextScanCount, last_scan_at: now })
        .eq("id", record.id)
        .select()
        .single();

      if (updateError) {
        req.log.error({ updateError }, "Update error on exit scan");
        return res.status(500).json({ error: "DB error", detail: updateError.message, code: updateError.code });
      }

      return res.json({
        success: true,
        action: "exit",
        message: `${user.name} has Checked Out / Left Campus.`,
        user: { id: user.id, name: user.name, uniqueId: user.unique_id, role: user.role },
        recordId: updated.id,
      });
    }
  } catch (err: any) {
    req.log.error({ err }, "Scan error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/attendance/recent", async (req: any, res: any) => {
  const limitRaw = req.query.limit as string | undefined;
  const limit = limitRaw && /^\d+$/.test(limitRaw) ? Math.min(Number(limitRaw), 100) : 30;
  try {
    const { data: records, error } = await supabase
      .from("qr_attendance")
      .select("*, qr_users(*)")
      .order("last_scan_at", { ascending: false, nullsFirst: false })
      .order("entry_time", { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json(records.map((r: any) => formatRecord(r, r.qr_users)));
  } catch (err: any) {
    req.log.error({ err }, "Recent scans error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/attendance/today", authMiddleware, async (req: any, res: any) => {
  const today = getHostelDate();
  try {
    let records: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("qr_attendance")
        .select("*, qr_users(*)")
        .eq("date", today)
        .order("last_scan_at", { ascending: false, nullsFirst: false })
        .range(from, from + 999);

      if (error) throw error;
      if (!data || data.length === 0) break;
      records = records.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }

    // Deduplicate: keep only the latest record per user
    const latestByUser = getLatestRecordsByUser(records ?? []);
    const deduped = Array.from(latestByUser.values());

    res.json(deduped.map((r: any) => formatRecord(r, r.qr_users)));
  } catch (err: any) {
    req.log.error({ err }, "Today attendance error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/attendance/currently-inside", authMiddleware, async (req: any, res: any) => {
  try {
    const today = getHostelDate();

    // Get all users and today's outing records in parallel
    let allUsers: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from("qr_users").select("*").range(from, from + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allUsers = allUsers.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }

    let todayRecords: any[] = [];
    let fromRec = 0;
    while (true) {
      const { data, error } = await supabase
        .from("qr_attendance")
        .select("*")
        .eq("date", today)
        .order("last_scan_at", { ascending: false, nullsFirst: false })
        .range(fromRec, fromRec + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      todayRecords = todayRecords.concat(data);
      if (data.length < 1000) break;
      fromRec += 1000;
    }

    const recordsByUserId = getLatestRecordsByUser(todayRecords ?? []);
    const outUserIds = new Set(
      Array.from(recordsByUserId.values()).filter((r: any) => getRecordStatus(r) === "left").map((r: any) => r.user_id)
    );

    const insideRecords = allUsers
      .filter(u => {
        const record = recordsByUserId.get(u.id);
        return record && getRecordStatus(record) === "inside";
      })
      .map(u => {
        const record = recordsByUserId.get(u.id)!;
        return formatRecord(record, u);
      });

    req.log.info({ insideCount: insideRecords.length }, "Calculated currently-inside");
    res.json(insideRecords);
  } catch (err: any) {
    req.log.error({ err }, "Currently inside error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/attendance/dashboard-stats", authMiddleware, async (req: any, res: any) => {
  const today = getHostelDate();
  try {
    let todayRecords: any[] = [];
    let fromRec = 0;
    while (true) {
      const { data, error } = await supabase
        .from("qr_attendance")
        .select("user_id, entry_time, exit_time, last_scan_at")
        .eq("date", today)
        .order("last_scan_at", { ascending: false, nullsFirst: false })
        .range(fromRec, fromRec + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      todayRecords = todayRecords.concat(data);
      if (data.length < 1000) break;
      fromRec += 1000;
    }

    const [
      { count: totalUsers },
      { count: totalStudents },
      { count: totalStaff },
      { data: recentResult }
    ] = await Promise.all([
      supabase.from("qr_users").select("*", { count: "exact", head: true }),
      supabase.from("qr_users").select("*", { count: "exact", head: true }).eq("role", "student"),
      supabase.from("qr_users").select("*", { count: "exact", head: true }).eq("role", "staff"),
      supabase.from("qr_attendance").select("*, qr_users(*)").eq("date", today).order("last_scan_at", { ascending: false, nullsFirst: false }).limit(10),
    ]);

    const latestRecordsByUserId = getLatestRecordsByUser(todayRecords ?? []);
    const currentlyInsideCount = Array.from(latestRecordsByUserId.values()).filter((r: any) => getRecordStatus(r) === "inside").length;

    res.json({
      totalUsers: totalUsers || 0,
      totalStudents: totalStudents || 0,
      totalStaff: totalStaff || 0,
      todayAttendanceCount: latestRecordsByUserId.size,
      currentlyInsideCount,
      recentActivity: recentResult ? recentResult.map((r: any) => formatRecord(r, r.qr_users)) : [],
    });
  } catch (err: any) {
    req.log.error({ err }, "Dashboard stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/attendance/user/:userId", authMiddleware, async (req: any, res: any) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  const { from, to, month } = req.query as Record<string, string>;
  try {
    const { data: user, error: userError } = await supabase
      .from("qr_users")
      .select("*")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    let query = supabase.from("qr_attendance").select("*").eq("user_id", userId);

    if (from) query = query.gte("date", from);
    if (to) query = query.lte("date", to);
    if (month) {
      const [year, mon] = month.split("-");
      const start = `${year}-${mon}-01`;
      const endDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
      const end = `${year}-${mon}-${String(endDay).padStart(2, "0")}`;
      query = query.gte("date", start).lte("date", end);
    }

    const { data: records, error: recordError } = await query.order("date", { ascending: false });
    if (recordError) throw recordError;

    const lateHour = 21; // Assuming 9 PM is late for returning to the hostel
    let totalDuration = 0;
    let durationCount = 0;
    let lateCount = 0;
    // Deduplicate records per date (keep latest per date)
    const uniqueDates = new Set<string>();
    for (const r of records) {
      uniqueDates.add(r.date);
      const hasRealEntry = !isSentinel(r.entry_time);
      const hasRealExit = !isSentinel(r.exit_time);
      if (hasRealEntry && hasRealExit) {
        const dur = Math.abs(new Date(r.entry_time).getTime() - new Date(r.exit_time).getTime());
        totalDuration += dur;
        durationCount++;
      }
      if (hasRealEntry && new Date(r.entry_time).getHours() >= lateHour) {
        lateCount++;
      }
    }
    const summary = {
      totalDaysPresent: uniqueDates.size,
      averageMinutesSpent: durationCount > 0 ? Math.floor(totalDuration / durationCount / 60000) : 0,
      lateEntriesCount: lateCount,
      totalDaysChecked: uniqueDates.size,
    };
    res.json({
      user: { id: user.id, name: user.name, uniqueId: user.unique_id, role: user.role, createdAt: user.created_at },
      records: records.map((r: any) => formatRecord(r, user)),
      summary,
    });
  } catch (err: any) {
    req.log.error({ err }, "User attendance error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/attendance/bulk-delete", authMiddleware, adminOnly, async (req: any, res: any) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids must be a non-empty array" });
    return;
  }
  const numericIds = ids
    .map((v: any) => (typeof v === "number" ? v : parseInt(String(v), 10)))
    .filter((n: number) => Number.isFinite(n));
  if (numericIds.length === 0) {
    res.status(400).json({ error: "ids must contain valid numbers" });
    return;
  }
  try {
    const { error, count } = await supabase
      .from("qr_attendance")
      .delete({ count: "exact" })
      .in("id", numericIds);
    if (error) throw error;
    res.json({ deletedCount: count ?? 0 });
  } catch (err: any) {
    req.log.error({ err }, "Bulk delete attendance error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/attendance/all", authMiddleware, adminOnly, async (req: any, res: any) => {
  const { from, to } = req.query as Record<string, string>;
  try {
    let query = supabase.from("qr_attendance").delete({ count: "exact" }).gte("id", 0);
    if (from) query = query.gte("date", from);
    if (to) query = query.lte("date", to);
    const { error, count } = await query;
    if (error) throw error;
    res.json({ deletedCount: count ?? 0 });
  } catch (err: any) {
    req.log.error({ err }, "Delete all attendance error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/attendance", authMiddleware, async (req: any, res: any) => {
  const { from, to, role, month, raw } = req.query as Record<string, string>;
  try {
    let allResults: any[] = [];
    let pageFrom = 0;
    while (true) {
      let query = supabase.from("qr_attendance").select("*, qr_users(*)");

      if (from) query = query.gte("date", from);
      if (to) query = query.lte("date", to);
      if (month) {
        const [year, mon] = month.split("-");
        const start = `${year}-${mon}-01`;
        const endDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
        const end = `${year}-${mon}-${String(endDay).padStart(2, "0")}`;
        query = query.gte("date", start).lte("date", end);
      }

      if (role) {
        query = query.eq("qr_users.role", role);
      }

      const { data: results, error } = await query
        .order("date", { ascending: false })
        .order("entry_time", { ascending: false })
        .range(pageFrom, pageFrom + 999);

      if (error) throw error;
      if (!results || results.length === 0) break;
      allResults = allResults.concat(results);
      if (results.length < 1000) break;
      pageFrom += 1000;
    }

    // Filter out records where join failed if role was provided
    let filtered = allResults;
    if (role) {
      filtered = allResults.filter((r: any) => r.qr_users !== null);
    }

    if (raw === "true") {
      return res.json(filtered.map((r: any) => formatRecord(r, r.qr_users)));
    }

    const consolidated = consolidateRecordsPerUserAndDate(filtered);
    res.json(consolidated.map((r: any) => formatRecord(r, r.qr_users)));
  } catch (err: any) {
    req.log.error({ err }, "List attendance error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
