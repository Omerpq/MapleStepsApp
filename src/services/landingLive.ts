// src/services/landingLive.ts
// Live verification for Landing (province) official links.
// Mirrors the 24h TTL + force refresh pattern used in irccLive.ts.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LandingGuide, LandingProvince } from "./landing";

type Source = "remote" | "cache";
export type LiveLink = {
  id: string;              // task id
  title: string;           // task title
  url: string;             // officialLink
  status: number | null;   // HTTP status or null on failure
  lastModified?: string | null;
};

export type LandingLiveResult = {
  source: Source;
  verifiedAtISO: string;   // when this set was verified
  province: string;        // province code
  links: LiveLink[];
};

const STATE_KEY = "ms.landing.live.cache.v1";   // envelope keyed by province code
const META_KEY  = "ms.landing.live.meta.v1";    // simple meta (TTL timestamps per province)
const TTL_MS    = 24 * 60 * 60 * 1000;          // 24h

type LiveCache = Record<string, LandingLiveResult>; // by province code
type LiveMeta  = Record<string, { verifiedAt: number }>;

function now(): number { return Date.now(); }
function isFresh(meta?: { verifiedAt: number }): boolean {
  if (!meta?.verifiedAt) return false;
  return now() - meta.verifiedAt < TTL_MS;
}

async function readCache(): Promise<LiveCache> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as LiveCache) : {};
  } catch { return {}; }
}

async function writeCache(cache: LiveCache): Promise<void> {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(cache));
}

async function readMeta(): Promise<LiveMeta> {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as LiveMeta) : {};
  } catch { return {}; }
}

async function writeMeta(meta: LiveMeta): Promise<void> {
  await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
}

// Mobile-safe: read as text once, parse if JSON, else just use status/header info
async function fetchStatus(url: string): Promise<{ status: number | null; lastModified?: string | null }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        // Keep it simple; many provincial sites don’t like HEAD.
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    // Drain body once (RN requires single read); ignore content
    try { await res.text(); } catch {}
    const lm = res.headers.get("Last-Modified");
    return { status: res.status ?? 0, lastModified: lm };
  } catch {
    return { status: null, lastModified: undefined };
  }
}

export async function verifyLandingLinksLive(
  guide: LandingGuide,
  provinceCode: string,
  forceRefresh: boolean
): Promise<LandingLiveResult> {
  const meta = await readMeta();
  const cache = await readCache();

  if (!forceRefresh && isFresh(meta[provinceCode]) && cache[provinceCode]) {
    // Serve cached (within TTL)
    return { ...cache[provinceCode], source: "cache" };
  }

  const prov = guide.provinces.find(p => p.code === provinceCode);
  if (!prov) throw new Error(`Landing live: province ${provinceCode} not found`);

  const links: LiveLink[] = [];
  for (const t of prov.tasks) {
    if (!t.officialLink) continue;
    const { status, lastModified } = await fetchStatus(t.officialLink);
    links.push({
      id: t.id,
      title: t.title,
      url: t.officialLink,
      status,
      lastModified: lastModified ?? null,
    });
  }

  const verifiedAt = now();
  const envelope: LandingLiveResult = {
    source: "remote",
    verifiedAtISO: new Date(verifiedAt).toISOString(),
    province: prov.code,
    links,
  };

  cache[provinceCode] = envelope;
  meta[provinceCode] = { verifiedAt };
  await writeCache(cache);
  await writeMeta(meta);

  return envelope;
}
