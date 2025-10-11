// src/services/landing.ts
// A4-style loader (Remote → Cache → Local[fallback optional]) for province-variant Landing guides.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { LANDING_GUIDES_URL } from "./config";

export type LoaderSource = "remote" | "cache" | "local";

export type A4Meta = {
  source: LoaderSource;
  status: 200 | 304;
  etag?: string | null;
  last_modified?: string | null;
  last_checked?: string | null; // ISO when we last validated (200 or 304)
  __cachedAt?: number | null;   // ms epoch when body was last saved
};

// ---- AsyncStorage keys ----
export const LANDING_GUIDES_CACHE_KEY = "ms.landing.guides.cache.v1";
export const LANDING_GUIDES_META_KEY  = "ms.landing.guides.meta.v1";
export const LANDING_STATE_KEY        = "ms.landing.state.v1";

// ---- Types ----
export type LandingTask = {
  id: string;
  title: string;
  required?: boolean;
  officialLink?: string;
};

export type LandingProvince = {
  code: string; // e.g., ON, BC
  name: string;
  tasks: LandingTask[];
};

export type LandingGuide = {
  id: "landing";
  version: string;
  title: string;
  provinces: LandingProvince[];
  global_tips?: string[];
};

// ---- Cache envelope ----
type CacheEnvelope<T> = {
  data: T;
  meta: A4Meta;
};

// ---- Helpers ----
async function readCache<T>(key: string): Promise<CacheEnvelope<T> | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as CacheEnvelope<T>; } catch { return null; }
}

async function writeCache<T>(key: string, env: CacheEnvelope<T>): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(env));
}

function nowISO() {
  return new Date().toISOString();
}
// Read as text once (RN fetch bodies are single-use), strip BOM/whitespace, then JSON.parse
async function safeParseJson<T>(res: Response): Promise<T> {
  const txt = await res.text();                  // read ONCE
  const cleaned = txt.replace(/^\uFEFF/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const preview = cleaned.slice(0, 200);
    throw new Error(`Landing guides: JSON parse failed. Preview: ${preview}`);
  }
}

// ---- Loader (Remote → Cache; Local optional) ----
export async function loadLandingGuides(): Promise<{
  source: LoaderSource;
  cachedAt: number | null;
  meta: A4Meta;
  data: LandingGuide;
}> {
  const cached = await readCache<LandingGuide>(LANDING_GUIDES_CACHE_KEY);

  // Remote fetch with validators if available
  let res: Response | null = null;
  try {
    res = await fetch(LANDING_GUIDES_URL, {
  // Some mobile stacks are stricter with caches/content-type; be explicit.
  headers: {
    Accept: "application/json, text/plain, */*",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    ...(cached?.meta?.etag ? { "If-None-Match": cached.meta.etag } : {}),
    ...(cached?.meta?.last_modified ? { "If-Modified-Since": cached.meta.last_modified } : {}),
  },
});

  } catch {
    res = null;
  }

  // Network failed → serve cache if present
  if (!res) {
    if (cached) {
      const meta: A4Meta = {
        ...(cached.meta || ({} as A4Meta)),
        source: "cache",
        status: cached.meta?.status ?? 304,
      };
      return { source: "cache", cachedAt: cached.meta?.__cachedAt ?? null, meta, data: cached.data };
    }
    throw new Error("Landing guides: remote unavailable and no cache present");
  }

  // 304 Not Modified → keep cached body, update last_checked
  if (res.status === 304 && cached) {
    const meta: A4Meta = {
      source: "cache",
      status: 304,
      etag: cached.meta?.etag ?? null,
      last_modified: cached.meta?.last_modified ?? null,
      last_checked: nowISO(),
      __cachedAt: cached.meta?.__cachedAt ?? null,
    };
    await writeCache(LANDING_GUIDES_CACHE_KEY, { data: cached.data, meta });
    await AsyncStorage.setItem(LANDING_GUIDES_META_KEY, JSON.stringify(meta));
    return { source: "cache", cachedAt: meta.__cachedAt ?? null, meta, data: cached.data };
  }

  // 200 OK → write fresh body + validators
  if (res.ok) {
    const body = await safeParseJson<LandingGuide>(res);

    const etag = res.headers.get("ETag");
    const last_modified = res.headers.get("Last-Modified");
    const cachedAt = Date.now();

    const meta: A4Meta = {
      source: "remote",
      status: 200,
      etag,
      last_modified,
      last_checked: nowISO(),
      __cachedAt: cachedAt,
    };

    const envelope: CacheEnvelope<LandingGuide> = { data: body, meta };
    await writeCache(LANDING_GUIDES_CACHE_KEY, envelope);
    await AsyncStorage.setItem(LANDING_GUIDES_META_KEY, JSON.stringify(meta));

    return { source: "remote", cachedAt, meta, data: body };
  }

  // Other statuses → fall back to cache if available
  if (cached) {
    const meta: A4Meta = {
      ...(cached.meta || ({} as A4Meta)),
      source: "cache",
      status: cached.meta?.status ?? 304,
    };
    return { source: "cache", cachedAt: cached.meta?.__cachedAt ?? null, meta, data: cached.data };
  }

  throw new Error(`Landing guides: unexpected response ${res.status}`);
}

// ---- Persisted state for checkmarks per province ----
// Shape: { [provinceCode: string]: { [taskId: string]: boolean } }
export async function getLandingState(): Promise<Record<string, Record<string, boolean>>> {
  const raw = await AsyncStorage.getItem(LANDING_STATE_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export async function setLandingState(next: Record<string, Record<string, boolean>>): Promise<void> {
  await AsyncStorage.setItem(LANDING_STATE_KEY, JSON.stringify(next));
}
