// src/services/updates.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RULES_CONFIG } from "./config";
import localRounds from "../data/rounds.json";
import localFees from "../data/fees.json";

// ----- A4: Shared loader contract -----
export type Source = "remote" | "cache" | "local";

export type LoaderResult<T> = {
  source: Source;
  cachedAt: number | null; // ms epoch when saved; null for local
  meta: { last_checked?: string; [k: string]: any };
  data: T;
};

// What we persist in AsyncStorage
type CacheEnvelope<T> = {
  savedAt: number;
  meta: { last_checked?: string; [k: string]: any };
  data: T;
};

// Cache keys (per A4)
const ROUND_CACHE_KEY = "ms_rounds_cache_v2";
const FEES_CACHE_KEY  = "ms_fees_cache_v1";


// ----- Optional migration: clear legacy rounds cache v1 once -----
const LEGACY_ROUNDS_V1 = "ms_rounds_cache_v1";
const UPDATES_MIGRATION_FLAG = "ms_updates_migrated_v1";

export async function migrateUpdatesCachesOnce() {
  try {
    const done = await AsyncStorage.getItem(UPDATES_MIGRATION_FLAG);
    if (done) return;
    await AsyncStorage.removeItem(LEGACY_ROUNDS_V1);
    await AsyncStorage.setItem(UPDATES_MIGRATION_FLAG, "1");
  } catch {
    // ignore
  }
}

// Network timeout (same as A3/web rule)
const FETCH_MS = 12000;

// ----- A4 helpers: cache read/write + meta picker -----
async function readCache<T>(key: string): Promise<CacheEnvelope<T> | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as CacheEnvelope<T>; }
  catch { return null; }
}

async function writeCache<T>(key: string, envelope: CacheEnvelope<T>) {
  await AsyncStorage.setItem(key, JSON.stringify(envelope));
}

// Normalize a meta object from various shapes
  function pickMetaFromAny(raw: any): { last_checked?: string; [k: string]: any } {
  
  const meta = (raw && typeof raw === "object" && typeof raw.meta === "object") ? raw.meta : {};
  const last_checked = raw?.last_checked ?? meta?.last_checked;
  const source_url =
    Array.isArray(raw?.source_urls) ? raw.source_urls[0] :
    (raw?.source_url ?? meta?.source_url);

  return {
    ...meta,
    ...(last_checked ? { last_checked } : {}),
    ...(source_url ? { source_url } : {}),
  };
}
// Prefer cachedAt; if local (null), fall back to meta.last_checked (ISO → epoch ms)
export function pickDisplayTime<T>(r: LoaderResult<T>): number | null {
  if (r.cachedAt) return r.cachedAt;
  const iso = r.meta?.last_checked;
  return iso ? Date.parse(iso) : null;
}

export type Fee = {
  code: string;
  label: string;
  amount_cad: number;
};


export type Round = {
  date: string;
  category?: string;
  cutoff?: number;
  invitations?: number;
  draw_number?: number;
  source_url?: string;
};

// --- helpers: url + number guards ---
const safeIrccUrl = (u?: string) => {
  if (!u) return undefined;
  try {
    const absolute = u.startsWith("http") ? u : `https://www.canada.ca${u}`;
    const url = new URL(absolute);
    if (url.protocol !== "https:") return undefined;
    // allow *.canada.ca
    if (!/\.?canada\.ca$/.test(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
};

const toNum = (v: any): number | undefined => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number.parseInt(v.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};




// const K_ROUNDS = "ms_rounds_cache_v2";
// const K_FEES   = "ms_fees_cache_v1";

async function fetchJson(url: string, ms = FETCH_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const res = await fetch(`${url}?t=${Date.now()}`, {
    cache: "no-store",
    signal: controller.signal,
  });
  clearTimeout(timer);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// NEW: Conditional JSON fetch with ETag / If-Modified-Since validators.
// - Reads validators from cache.meta (etag, last_modified)
// - On 304: returns without a body
// - On 200: returns body + fresh validators
async function conditionalFetchJson(
  url: string,
  validators?: { etag?: string | null; last_modified?: string | null },
  ms = FETCH_MS
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (validators?.etag) headers["If-None-Match"] = validators.etag!;
  if (validators?.last_modified) headers["If-Modified-Since"] = validators.last_modified!;

  const res = await fetch(url, {
    method: "GET",
    headers,
    // allow revalidation (do not use no-store here)
    cache: "no-cache",
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));

  const etag = res.headers.get("ETag");
  const lastModified = res.headers.get("Last-Modified");

  if (res.status === 304) {
    return { status: 304 as const, etag, lastModified };
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  return { status: 200 as const, json, etag, lastModified };
}



const normRounds = (json: any) => {
  
  const arr = Array.isArray(json?.rounds) ? json.rounds
    : Array.isArray(json?.entries) ? json.entries
    : (Array.isArray(json) ? json : []);

  const list = arr.map((r: any) => {
    // --- draw_number: normalize and drop NaN if unparsable ---
    const draw_number = (() => {
      const raw =
        r.draw_number ?? r.draw ?? r.drawNo ?? r.draw_num ?? r.drawNumber ?? null;

      if (typeof raw === "number") {
        return Number.isFinite(raw) ? raw : undefined;
      }
      if (typeof raw === "string") {
        const m = raw.match(/\d+/);        // first digit run only
        if (!m) return undefined;
        const n = Number.parseInt(m[0], 10);
        return Number.isFinite(n) ? n : undefined;
      }
      return undefined;
    })();

    // Prefer human IRCC page:
    // 1) from anchor html drawNumberURL / drawNumberUrl / draw_number_url
    const anchorHtml =
      (typeof r.drawNumberURL === "string" && r.drawNumberURL) ||
      (typeof r.drawNumberUrl === "string" && r.drawNumberUrl) ||
      (typeof r.draw_number_url === "string" && r.draw_number_url) ||
      undefined;

    let pageFromAnchor: string | undefined;
    if (anchorHtml) {
      const m = anchorHtml.match(/href=['"]([^'"]+)['"]/i);
      if (m?.[1]) pageFromAnchor = safeIrccUrl(m[1]);
    }

    // 2) or synthesize from draw_number (works for local/cache too)
    const pageFromNumber = draw_number
      ? safeIrccUrl(`/content/canadasite/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds/invitations.html?q=${draw_number}`)
      : undefined;

    // 3) else fallbacks (may be json links)
    const perEntry = safeIrccUrl(Array.isArray(r.source_urls) ? r.source_urls[0] : r.source_url);
    const root = safeIrccUrl(Array.isArray(json?.source_urls) ? json.source_urls[0] : json?.source_url);

    return {
      date: r.date ?? r.drawDate ?? r.round_date ?? r.Date ?? "",
      category: r.category ?? r.drawName ?? r.program ?? "General",
      cutoff: toNum(r.cutoff ?? r.crs_cutoff ?? r.drawCRS),
      invitations: toNum(r.invitations ?? r.drawSize ?? r.itas ?? r.invitations_issued),
      draw_number,
      source_url: pageFromAnchor ?? pageFromNumber ?? perEntry ?? root,
    };
  });

  // newest first: by date, fallback to draw_number
  list.sort((a: any, b: any) => {
  const ad = Date.parse(a.date || "");
  const bd = Date.parse(b.date || "");
  const va = Number.isFinite(ad);
  const vb = Number.isFinite(bd);

  // Valid dates come before invalid dates
  if (va && !vb) return -1;
  if (!va && vb) return 1;

  // Both valid: newest first
  if (va && vb && ad !== bd) return bd - ad;

  // Both invalid or same date: higher draw_number first
  return (b.draw_number ?? 0) - (a.draw_number ?? 0);
});


  return list;
};




const normFees = (json: any) => {
  const arr = Array.isArray(json?.fees) ? json.fees
    : Array.isArray(json?.entries) ? json.entries
    : (Array.isArray(json) ? json : []);
  return {
    list: arr.map((f: any) => ({
      code: f.code ?? "",
      label: f.label ?? "",
      amount_cad: Number(f.amount_cad ?? f.amount ?? 0),
    })),
    meta: {
      last_checked: json?.last_checked,
      source_url: Array.isArray(json?.source_urls) ? json.source_urls[0] : json?.source_url
    }
  };
};

export async function loadRounds(): Promise<LoaderResult<Round[]>> {
    // Pull validators from cache first (for ETag/Last-Modified)
  const cached = await readCache<Round[]>(ROUND_CACHE_KEY).catch(() => null);
  const validators = {
    etag: cached?.meta?.etag ?? null,
    last_modified: cached?.meta?.last_modified ?? null,
  };

    // 1) Remote (conditional)
  try {
    const res = await conditionalFetchJson(RULES_CONFIG.roundsUrl, validators);

    if (res.status === 304 && cached && Array.isArray(cached.data) && cached.data.length) {
      // Keep existing cache; surface 304 in meta (unchanged cachedAt)
      return {
        source: "cache",
        cachedAt: cached.savedAt,
        meta: { ...(cached.meta || {}), status: 304 },
        data: cached.data,
      };
    }

    if (res.status === 200) {
      const data = normRounds(res.json) as Round[];
      if (!data.length) throw new Error("empty rounds");

      const savedAt = Date.now();
      const metaFromBody = pickMetaFromAny(res.json);
      const meta = {
        ...metaFromBody,
        etag: res.etag ?? validators.etag ?? undefined,
        last_modified: res.lastModified ?? validators.last_modified ?? undefined,
        status: 200,
      };

      await writeCache<Round[]>(ROUND_CACHE_KEY, { savedAt, meta, data });
      return { source: "remote", cachedAt: savedAt, meta, data };
    }
  } catch {
    // fall through
  }


  // 2) Cache
  try {
    const cached = await readCache<Round[]>(ROUND_CACHE_KEY);
    if (cached && Array.isArray(cached.data) && cached.data.length) {
      return {
        source: "cache",
        cachedAt: cached.savedAt,
        meta: cached.meta || {},
        data: cached.data,
      };
    }
  } catch {
    // ignore
  }

  // 3) Local bundle
  const data = normRounds(localRounds as any) as Round[];
  const meta = pickMetaFromAny(localRounds as any);
  return { source: "local", cachedAt: null, meta, data };
}

export async function loadFees(): Promise<LoaderResult<Fee[]>> {
    // Pull validators from cache first (for ETag/Last-Modified)
  const cached = await readCache<Fee[]>(FEES_CACHE_KEY).catch(() => null);
  const validators = {
    etag: cached?.meta?.etag ?? null,
    last_modified: cached?.meta?.last_modified ?? null,
  };

    // 1) Remote (conditional)
  try {
    const res = await conditionalFetchJson(RULES_CONFIG.feesUrl, validators);

    if (res.status === 304 && cached && Array.isArray(cached.data) && cached.data.length) {
      return {
        source: "cache",
        cachedAt: cached.savedAt,
        meta: { ...(cached.meta || {}), status: 304 },
        data: cached.data,
      };
    }

    if (res.status === 200) {
      const { list, meta: normedMeta } = normFees(res.json);
      const data = list as Fee[];
      if (!data.length) throw new Error("empty fees");

      const savedAt = Date.now();
      const mergedMeta = {
        ...pickMetaFromAny(res.json),
        ...normedMeta,
        etag: res.etag ?? validators.etag ?? undefined,
        last_modified: res.lastModified ?? validators.last_modified ?? undefined,
        status: 200,
      };

      await writeCache<Fee[]>(FEES_CACHE_KEY, { savedAt, meta: mergedMeta, data });
      return { source: "remote", cachedAt: savedAt, meta: mergedMeta, data };
    }
  } catch {
    // fall through
  }


  // 2) Cache
  try {
    const cached = await readCache<Fee[]>(FEES_CACHE_KEY);
    if (cached && Array.isArray(cached.data) && cached.data.length) {
      return {
        source: "cache",
        cachedAt: cached.savedAt,
        meta: cached.meta || {},
        data: cached.data,
      };
    }
  } catch {
    // ignore
  }

  // 3) Local bundle
  const { list, meta } = normFees(localFees as any);
  const data = list as Fee[];
  const mergedMeta = { ...pickMetaFromAny(localFees as any), ...meta };

  return { source: "local", cachedAt: null, meta: mergedMeta, data };
}

export const __test__ = { normRounds };

// A5 — category detector (exported)
export const IS_CATEGORY_KEYS = ["stem","healthcare","trades","transport","agriculture","french"] as const;

export function isCategoryDraw(raw?: string): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s || ["general", "no program specified", "none"].includes(s)) return false;
  return IS_CATEGORY_KEYS.some(k => s.includes(k));
}

// TEMP sanity marker (to confirm the right file is being picked)
export const __A5_MARKER__ = "updates.ts::isCategoryDraw present";
