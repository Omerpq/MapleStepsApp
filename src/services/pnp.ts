// src/services/pnp.ts
// A4-style loader for PNP guides (Rules repo) + simple profile→stream matcher.
// Remote → Cache → Local (no Local bundle yet; remote+cache only). Uses conditional GET (ETag/Last-Modified).

import { PNP_GUIDES_URL } from "./config";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ---------- AsyncStorage keys ----------
const CACHE_KEY = "ms.pnp.guides.cache.v1";
const META_KEY  = "ms.pnp.guides.meta.v1";

// ---------- Types ----------
export type PnpCategoryId =
  | "express_entry" | "job_offer_opt" | "tech" | "health" | "trades"
  | "french" | "intl_student" | "in_demand" | "connection";

export interface PnpCategory {
  id: PnpCategoryId;
  title: string;
}

export interface PnpStream {
  id: string;
  province: string;
  title: string;
  categories: PnpCategoryId[];
  hints?: string[];
  officialUrl: string; // always link out to official sources
}

export interface PnpGuides {
  version: string;
  categories: PnpCategory[];
  streams: PnpStream[];
}

// LoaderResult (local copy; matches your Updates A4 shape where practical)
export type Source = "remote" | "cache" | "local";
export interface LoaderMeta {
  etag?: string;
  last_modified?: string;
  status?: 200 | 304;          // 200 = updated; 304 = validated (from A4)
  last_checked?: string;       // ISO of the attempt time
  __cachedAt?: number | null;  // ms epoch when cache was written
}
export interface LoaderResult<T> {
  ok: boolean;
  source: Source;
  data: T | null;
  meta?: LoaderMeta;
  error?: string;
}

// ---------- Internal helpers ----------
async function readCache(): Promise<LoaderResult<PnpGuides> | null> {
  try {
    const [dataRaw, metaRaw] = await AsyncStorage.multiGet([CACHE_KEY, META_KEY]);
    const dataJson = dataRaw?.[1] ? JSON.parse(dataRaw[1]!) as PnpGuides : null;
    const metaJson = metaRaw?.[1] ? JSON.parse(metaRaw[1]!) as LoaderMeta : undefined;
    if (dataJson) {
      return { ok: true, source: "cache", data: dataJson, meta: metaJson };
    }
    return null;
  } catch {
    return null;
  }
}

async function writeCache(data: PnpGuides, meta: LoaderMeta) {
  const withTs = { ...meta, __cachedAt: Date.now() };
  await AsyncStorage.multiSet([
    [CACHE_KEY, JSON.stringify(data)],
    [META_KEY, JSON.stringify(withTs)],
  ]);
}

// ---------- Public loader ----------
export async function loadPnpGuides(): Promise<LoaderResult<PnpGuides>> {
  // Read existing meta for validators
  let prevMeta: LoaderMeta | undefined;
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    prevMeta = raw ? JSON.parse(raw) : undefined;
  } catch {}

  // Attempt remote with validators
  try {
    const headers: Record<string, string> = {};
    if (prevMeta?.etag) headers["If-None-Match"] = prevMeta.etag;
    if (prevMeta?.last_modified) headers["If-Modified-Since"] = prevMeta.last_modified;

    const res = await fetch(PNP_GUIDES_URL, { headers });
    const nowIso = new Date().toISOString();

    if (res.status === 304) {
      // Not modified → serve cache
      const cache = await readCache();
      if (cache?.data) {
        const meta: LoaderMeta = {
          ...prevMeta,
          status: 304,
          last_checked: nowIso,
        };
        return { ok: true, source: "cache", data: cache.data, meta };
      }
      // No cache despite 304: fall through to full fetch without validators
    }

    if (res.ok) {
      const data = (await res.json()) as PnpGuides;
      const meta: LoaderMeta = {
        etag: res.headers.get("ETag") ?? undefined,
        last_modified: res.headers.get("Last-Modified") ?? undefined,
        status: 200,
        last_checked: nowIso,
      };
      await writeCache(data, meta);
      return { ok: true, source: "remote", data, meta };
    }

    // Remote failed → try cache
    const cache = await readCache();
    if (cache?.data) {
      return cache;
    }
    return { ok: false, source: "local", data: null, error: `HTTP ${res.status}` };
  } catch (e: any) {
    // Network error → try cache
    const cache = await readCache();
    if (cache?.data) return cache;
    return { ok: false, source: "local", data: null, error: e?.message || "network_error" };
  }
}

// ---------- Profile → Categories mapping ----------
export interface PnpProfileInput {
  hasExpressEntryProfile?: boolean; // EE-aligned streams
  hasJobOffer?: boolean;            // employer-driven / job offer
  isTech?: boolean;                 // tech/IT occupation/experience
  isHealth?: boolean;               // nurses, other health professions
  isTrades?: boolean;               // skilled trades
  isFrancophone?: boolean;          // French CLB ≥ 7 typically
  isIntlStudentOrGrad?: boolean;    // international student/graduate in Canada
  hasProvincialTies?: boolean;      // relatives, study/work in province, invitations, etc.
  isOccupationInDemand?: boolean;   // user says their NOC is in-demand / targeted
}

export function profileToCategoryFlags(p: PnpProfileInput): Set<PnpCategoryId> {
  const out = new Set<PnpCategoryId>();
  if (p.hasExpressEntryProfile) out.add("express_entry");
  if (p.hasJobOffer) out.add("job_offer_opt");
  if (p.isTech) out.add("tech");
  if (p.isHealth) out.add("health");
  if (p.isTrades) out.add("trades");
  if (p.isFrancophone) out.add("french");
  if (p.isIntlStudentOrGrad) out.add("intl_student");
  if (p.hasProvincialTies) out.add("connection");
  if (p.isOccupationInDemand) out.add("in_demand");
  return out;
}

// Basic scorer: count of overlapping categories (ties broken by more specific streams first)
export interface RankedStream extends PnpStream {
  score: number;
  matched: PnpCategoryId[];
}

export function matchStreams(guides: PnpGuides, profile: PnpProfileInput, max = 12): RankedStream[] {
  const wants = profileToCategoryFlags(profile);
  const entries: RankedStream[] = guides.streams.map((s) => {
    const matched = s.categories.filter(c => wants.has(c));
    return { ...s, score: matched.length, matched };
  });

  // Sort: score desc → more specific (shorter category list) → province alpha → title
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.categories.length !== b.categories.length) return a.categories.length - b.categories.length;
    const pa = a.province.localeCompare(b.province);
    if (pa !== 0) return pa;
    return a.title.localeCompare(b.title);
  });

  // If user provided nothing, just show all (alphabetical by province→title)
  const anyFlag = wants.size > 0;
  const list = anyFlag ? entries.filter(e => e.score > 0) : entries;
  return list.slice(0, max);
}
