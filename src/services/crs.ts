// src/services/crs.ts
// Remote-first CRS params with local fallback + simple cache.

import { RULES_CONFIG } from "./config";
import AsyncStorage from "@react-native-async-storage/async-storage";
// ---- Debug toggles (web-safe) ----------------------------------------------
const __WEB__ = typeof window !== 'undefined';
let __LS__: Storage | null = null;
try { __LS__ = typeof localStorage !== 'undefined' ? localStorage : null; } catch { __LS__ = null; }
const __DBG__ = __LS__?.getItem('ms_debug_rules') === '1';
const __FORCE_OFFLINE__ = __LS__?.getItem('ms_force_offline') === '1';
const __onLine = () => {
  try { return typeof navigator !== 'undefined' && 'onLine' in navigator ? (navigator as any).onLine : null; } catch { return null; }
};
const CRS_LOG = (...a: any[]) => { if (__DBG__) console.debug('[MS:CRS]', ...a); };


// Web-only offline check (safe on native)
function isWebOffline(): boolean {
  try {
    // @ts-ignore
    return typeof navigator !== "undefined" && navigator.onLine === false;
  } catch {
    return false;
  }
}

type EducationKey =
  | "secondary"
  | "one_year_postsecondary"
  | "bachelor"
  | "two_or_more"
  | "masters"
  | "professional_degree"
  | "phd";

// Local fallback (bundled)
const localParams: any = require("../data/crs.params.json");

// In-memory cache
let cache: any | null = null;
let lastSyncedISO: string | null = null;
const K_CRS = "ms_crs_params_cache_v1";
let crsCachedAtMs: number | null = null;
let crsSource: "remote" | "cache" | "local" = "local";


// Drop-in replacement for both files
async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    // bust caches without sending custom headers on web
    const u = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
    const isWeb = typeof window !== "undefined";

    // start from caller options
    const finalInit: RequestInit = {
      ...init,
      cache: "no-store",
      signal: ctrl.signal,
    };

    if (isWeb) {
      // IMPORTANT: do not send any custom headers on web, or it will trigger a CORS preflight
      if (finalInit.headers) delete (finalInit as any).headers;
      // default mode is "cors" – keep it; do NOT use "no-cors" (that would yield an opaque response)
    } else {
      // Native (RN iOS/Android) can keep explicit no-cache headers
      finalInit.headers = {
        ...(init?.headers as any),
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      };
    }

    return await fetch(u, finalInit);
  } finally {
    clearTimeout(timer);
  }
}






/** Load remote params if URL is set; fall back to local JSON. */
export async function primeCrsParams(): Promise<any> {
  const __t0 = Date.now();
  let __branch: "remote" | "cache" | "local" | "unknown" = "unknown";
  const baseUrl = (RULES_CONFIG.crsParamsUrl || "").trim();
  const offline = !!__FORCE_OFFLINE__ || isWebOffline();
  const onLine = __onLine();
  const fetchUrl = !!baseUrl && !offline ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}t=${Date.now()}` : "";
  CRS_LOG && CRS_LOG("prime() start", { baseUrl: !!baseUrl, offline, onLine });

  // 1) REMOTE
if (fetchUrl) {
  try {
    CRS_LOG && CRS_LOG("REMOTE try", { url: fetchUrl });

    const res = await fetchWithTimeout(fetchUrl, undefined, 12000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const remote = await res.json(); // <-- parse JSON (bug fix)

    cache = remote;                   // <-- store parsed JSON
    lastSyncedISO = new Date().toISOString();
    crsCachedAtMs = Date.now();
    crsSource = "remote";

    try {
      await AsyncStorage.setItem(K_CRS, JSON.stringify({ json: remote, ts: crsCachedAtMs })); // <-- save JSON
    } catch {}

    CRS_LOG && CRS_LOG("REMOTE success", { tookMs: Date.now() - __t0, savedAt: crsCachedAtMs });
    return cache;
  } catch (e) {
    CRS_LOG && CRS_LOG("REMOTE fail -> will try CACHE", { error: String(e) });
  }
} else {
  CRS_LOG && CRS_LOG("REMOTE skipped", { offline, onLine });
}


  // 2) CACHE
  try {
    const raw = await AsyncStorage.getItem(K_CRS);
    if (raw) {
      const { json, ts } = JSON.parse(raw);
      if (json) {
        cache = json;
        lastSyncedISO = "cache" as any;
        crsCachedAtMs = typeof ts === "number" ? ts : null;
        crsSource = "cache";
        __branch = "cache";
        CRS_LOG && CRS_LOG("CACHE hit", { savedAt: crsCachedAtMs });
        return cache;
      }
    }
  } catch (e) {
    CRS_LOG && CRS_LOG("CACHE read failed", { error: String(e) });
  }

  // 3) LOCAL
  cache = localParams;
  lastSyncedISO = null;
  crsCachedAtMs = null;
  crsSource = "local";
  __branch = "local";
  CRS_LOG && CRS_LOG("LOCAL used", { tookMs: Date.now() - __t0 });
  return cache;
}





function getParamsSync(): any {
  // If primeCrsParams() hasn't run yet, use cache or local instantly.
  return cache || localParams;
}

export function getCrsVersion(): string {
  const p = getParamsSync();
  return p?.version ?? "unknown";
}

export function getCrsLastSynced(): string {
  // Returns ISO string if remote loaded; "local" when using bundled JSON.
  return lastSyncedISO ?? "local";
}

function getAgePoints(age: number): number {
  const rows: Array<{ min: number; max: number; points: number }> =
    getParamsSync().age_single || [];
  const row = rows.find((r) => age >= r.min && age <= r.max);
  return row ? row.points : 0;
}

function getEducationPoints(education: EducationKey): number {
  const t = getParamsSync().education_single || {};
  return Number(t[education] ?? 0);
}

function perAbilityFromClb(clb: number): number {
  const table: Record<string, number> =
    getParamsSync().language_primary_per_ability || {};
  const thresholds = Object.keys(table)
    .map(Number)
    .sort((a, b) => b - a);
  for (const thr of thresholds) {
    if (clb >= thr) return table[String(thr)];
  }
  return 0;
}

/** Synchronous calculator (uses whatever is in cache or local fallback). */
export function calculateCrs(input: {
  age: number;
  clb: number;
  education: EducationKey;
}): number {
  let score = 0;
  score += getAgePoints(input.age);
  score += getEducationPoints(input.education);
  score += perAbilityFromClb(input.clb) * 4; // 4 abilities
  return score;
}

export function getCrsSource(): "remote" | "cache" | "local" {
  return crsSource;
}

export function getCrsCachedAt(): number | null {
  return crsCachedAtMs ?? null;
}

// --- B6: Additional CRS (session + stub math) -------------------------------

export type CRSAdditionalInputs = {
  hasPNP: boolean;              // Provincial Nomination
  hasSibling: boolean;          // Sibling in Canada
  frenchCLB: number;            // 0–10
  study: 'none' | '1-2' | '2+'; // Canadian study length
};

const __DEFAULT_EXTRAS: CRSAdditionalInputs = {
  hasPNP: false,
  hasSibling: false,
  frenchCLB: 0,
  study: 'none',
};

// In-memory (per app run) session cache for Score screen.
// (Intentional: do NOT use AsyncStorage per “state persisted per screen session”.)
let __scoreExtrasSession: CRSAdditionalInputs | null = null;

export function loadCRSSessionExtras(): CRSAdditionalInputs {
  return __scoreExtrasSession ? { ...__scoreExtrasSession } : { ...__DEFAULT_EXTRAS };
}

export function saveCRSSessionExtras(extras: CRSAdditionalInputs): void {
  __scoreExtrasSession = { ...extras };
}

// Stub math (B6): PNP +600; sibling +15; French +25/+50; study +15/+30.
// French rule: CLB ≥7 → +50; CLB 5–6 → +25; else 0.
export function computeAdditionalCRS(extras: CRSAdditionalInputs): number {
  let add = 0;
  if (extras.hasPNP) add += 600;
  if (extras.hasSibling) add += 15;
  if (extras.frenchCLB >= 7) add += 50;
  else if (extras.frenchCLB >= 5) add += 25;
  if (extras.study === '1-2') add += 15;
  else if (extras.study === '2+') add += 30;
  return add;
}

// Convenience combiner for consumers
export function withAdditionalCRS(baseTotal: number, extras: CRSAdditionalInputs) {
  const additional = computeAdditionalCRS(extras);
  return { additional, total: baseTotal + additional };
}
