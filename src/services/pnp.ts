// src/services/pnp.ts
// A4 loader (Remote → Cache) with ETag/Last-Modified; 304-fallback via body equality.
// Also exports matching helpers & types used by PNPMapper.tsx.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { PNP_GUIDES_URL } from "./config";

/** ───────────────── Types ───────────────── **/
export type LoaderSource = "remote" | "cache" | "local";

type PnpMeta = {
  status: 200 | 304;
  etag?: string;
  last_modified?: string;
  __cachedAt?: number;        // when body was last written to cache
  last_checked?: string;      // ISO when we last validated (200 or 304)
};

export type PnpStream = {
  id: string;
  province: string;
  title: string;
  categories: string[];
  hints?: string[];
  officialUrl: string;
};

export type PnpGuides = {
  version?: string;
  categories?: { id: string; title: string }[];
  streams: PnpStream[];
};

export type PnpResult = {
  source: LoaderSource;
  data: PnpGuides;
  cachedAt: number | null;
  meta: PnpMeta;
};

// Profile → categories toggles used by the mapper
export type PnpProfileInput = {
  hasExpressEntryProfile: boolean;
  hasJobOffer: boolean;
  isTech: boolean;
  isHealth: boolean;
  isTrades: boolean;
  isFrancophone: boolean;
  isIntlStudent: boolean;
  hasTies: boolean;
  inDemand: boolean;
};

// Ranked output shown on the screen
export type RankedStream = PnpStream & {
  score: number;
  matched: string[];     // which profile signals matched this stream
};

/** ──────────────── Storage keys ──────────────── **/
const CACHE_KEY = "ms.pnp.guides.cache.v1";
const META_KEY  = "ms.pnp.guides.meta.v1";

/** ──────────────── Small cache utils ──────────────── **/
async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}
async function writeCache<T>(key: string, val: T): Promise<void> {
  try { await AsyncStorage.setItem(key, JSON.stringify(val)); } catch {}
}

/** ──────────────── A4 loader ──────────────── **/
export async function loadPnpGuides(): Promise<PnpResult> {
  const [cached, meta0] = await Promise.all([
    readCache<PnpGuides>(CACHE_KEY),
    readCache<PnpMeta>(META_KEY),
  ]);

  const headers: Record<string, string> = {};
  if (meta0?.etag)          headers["If-None-Match"] = meta0.etag;
  if (meta0?.last_modified) headers["If-Modified-Since"] = meta0.last_modified;

  let res: Response | null = null;
  try {
    // cache:"no-cache" ensures validators actually hit the network
    res = await fetch(PNP_GUIDES_URL, { headers, cache: "no-cache", mode: "cors" as RequestMode });
  } catch {
    if (cached) {
      const meta: PnpMeta = {
        ...(meta0 ?? { status: 200 }),
        last_checked: new Date().toISOString(),
      };
      return { source: "cache", data: cached, cachedAt: meta.__cachedAt ?? null, meta };
    }
    return {
      source: "local",
      data: { streams: [] },
      cachedAt: null,
      meta: { status: 200, last_checked: new Date().toISOString() },
    };
  }

  // Real 304 path
  if (res.status === 304 && cached) {
    const nextMeta: PnpMeta = {
      ...(meta0 ?? { status: 304 }),
      status: 304,
      last_checked: new Date().toISOString(),
    };
    await writeCache(META_KEY, nextMeta);
    return {
      source: "cache",
      data: cached,
      cachedAt: nextMeta.__cachedAt ?? null,
      meta: nextMeta,
    };
  }

  // 200 path
  if (res.ok) {
    const json = (await res.json()) as PnpGuides;
    const etag = res.headers.get("etag") ?? undefined;
    const last_modified = res.headers.get("last-modified") ?? undefined;

    // ── 304 fallback: if server didn’t expose validators but body is unchanged, treat as validated
    if (cached && !etag && !last_modified) {
      try {
        const same = JSON.stringify(json) === JSON.stringify(cached);
        if (same) {
          const nextMeta: PnpMeta = {
            ...(meta0 ?? { status: 304 }),
            status: 304,
            __cachedAt: meta0?.__cachedAt, // keep original cachedAt
            last_checked: new Date().toISOString(),
          };
          await writeCache(META_KEY, nextMeta);
          return {
            source: "cache",
            data: cached,
            cachedAt: nextMeta.__cachedAt ?? null,
            meta: nextMeta,
          };
        }
      } catch {}
    }

    // Fresh content (or validators present) → cache it
    const now = Date.now();
    const nextMeta: PnpMeta = {
      status: 200,
      etag,
      last_modified,
      __cachedAt: now,
      last_checked: new Date().toISOString(),
    };

    await Promise.all([
      writeCache(CACHE_KEY, json),
      writeCache(META_KEY, nextMeta),
    ]);

    return { source: "remote", data: json, cachedAt: now, meta: nextMeta };
  }

  // non-200/304 — fall back to cache if possible
  if (cached) {
    const meta: PnpMeta = {
      ...(meta0 ?? { status: 200 }),
      last_checked: new Date().toISOString(),
    };
    return { source: "cache", data: cached, cachedAt: meta.__cachedAt ?? null, meta };
  }

  // final fallback
  return {
    source: "local",
    data: { streams: [] },
    cachedAt: null,
    meta: { status: 200, last_checked: new Date().toISOString() },
  };
}

/** ──────────────── Matching helper ──────────────── **/
export function matchStreams(profile: PnpProfileInput, guides: PnpGuides): RankedStream[] {
  const out: RankedStream[] = [];

  for (const s of guides.streams ?? []) {
    let score = 0;
    const matched: string[] = [];

    const has = (tag: string) => s.categories?.includes(tag);

    if (profile.hasExpressEntryProfile && has("express_entry")) { score += 3; matched.push("Express Entry–aligned"); }
    if (profile.hasJobOffer && has("job_offer_opt"))           { score += 2; matched.push("Job offer"); }

    if (profile.isTech && has("tech"))       { score += 2; matched.push("Tech/IT"); }
    if (profile.isHealth && has("health"))   { score += 2; matched.push("Health"); }
    if (profile.isTrades && has("trades"))   { score += 2; matched.push("Trades"); }

    if (profile.isFrancophone && has("franco"))   { score += 2; matched.push("Francophone"); }
    if (profile.isIntlStudent && has("student"))  { score += 1; matched.push("Intl student"); }
    if (profile.hasTies && has("ties"))           { score += 1; matched.push("Ties"); }
    if (profile.inDemand && has("in_demand"))     { score += 1; matched.push("In-demand"); }

    // Bonus for multiple matches
    score += Math.max(0, matched.length - 1);

    out.push({ ...s, score, matched });
  }

  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.province !== b.province) return a.province.localeCompare(b.province);
    return a.title.localeCompare(b.title);
  });

  return out;
}
