// src/services/noc.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RULES_CONFIG } from "./config";
import type { LoaderResult } from "./updates";
import localNoc from "../data/noc.2021.json";
import localCats from "../data/noc.categories.json";

// ---------- Types ----------
export type NocItem = { code: string; title: string; major_group?: string };
export type NocCategory = { key: string; label: string; noc_codes: string[] };

type CacheEnvelope<T> = {
  savedAt: number;
  meta: { last_checked?: string; [k: string]: any };
  data: T;
};

// ---------- Cache Keys + Network ----------
const NOC_CACHE_KEY = "ms_noc_cache_v1";
const NOC_CAT_CACHE_KEY = "ms_noc_categories_cache_v2";
const FETCH_MS = 12000;

// ---------- Small helpers (local copy to keep this file isolated) ----------
async function readCache<T>(key: string): Promise<CacheEnvelope<T> | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as CacheEnvelope<T>; } catch { return null; }
}
async function writeCache<T>(key: string, env: CacheEnvelope<T>) {
  await AsyncStorage.setItem(key, JSON.stringify(env));
}
async function fetchJson(url: string, ms = FETCH_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store", signal: controller.signal });
  clearTimeout(timer);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function pickMetaFromAny(raw: any): { last_checked?: string; [k: string]: any } {
  const meta = (raw && typeof raw === "object" && typeof raw.meta === "object") ? raw.meta : {};
  const last_checked = raw?.last_checked ?? meta?.last_checked;
  const source_url =
    Array.isArray(raw?.source_urls) ? raw.source_urls[0] :
    (raw?.source_url ?? meta?.source_url);
  return { ...meta, ...(last_checked ? { last_checked } : {}), ...(source_url ? { source_url } : {}) };
}

// ---------- Normalizers ----------
const normNoc = (json: any): NocItem[] => {
  const arr = Array.isArray(json?.items) ? json.items : (Array.isArray(json) ? json : []);
  return arr
    .map((x: any) => ({
      code: String(x?.code ?? ""),
      title: String(x?.title ?? ""),
      major_group: x?.major_group ? String(x.major_group) : undefined,
    }))
    // type the filter param so TS doesn’t squiggle
    .filter((x: NocItem) => x.code && x.title);
};

const normCats = (json: any): NocCategory[] => {
  const arr = Array.isArray(json?.categories) ? json.categories : (Array.isArray(json) ? json : []);
  return arr
    .map((c: any) => ({
      key: String(c?.key ?? ""),
      label: String(c?.label ?? c?.title ?? c?.name ?? c?.key ?? ""),
      // accept either "codes" (your JSON) or "noc_codes" (alt shape)
      noc_codes: Array.isArray(c?.noc_codes)
        ? c.noc_codes.map((s: any) => String(s))
        : Array.isArray(c?.codes)
        ? c.codes.map((s: any) => String(s))
        : [],
    }))
    // type the filter param so TS doesn’t squiggle
    .filter((c: NocCategory) => Boolean(c.key));
};


// ---------- Loaders (A4 contract) ----------
export async function loadNoc(): Promise<LoaderResult<NocItem[]>> {
  // 1) Remote
  try {
    const raw = await fetchJson(RULES_CONFIG.nocUrl);
    const data = normNoc(raw);
    if (!data.length) throw new Error("empty NOC");
    const meta = pickMetaFromAny(raw);
    const savedAt = Date.now();
    await writeCache<NocItem[]>(NOC_CACHE_KEY, { savedAt, meta, data });
    return { source: "remote", cachedAt: savedAt, meta, data };
  } catch { /* fall through */ }

  // 2) Cache
  try {
    const cached = await readCache<NocItem[]>(NOC_CACHE_KEY);
    if (cached?.data?.length) {
      return { source: "cache", cachedAt: cached.savedAt, meta: cached.meta || {}, data: cached.data };
    }
  } catch { /* ignore */ }

  // 3) Local
  const data = normNoc(localNoc as any);
  const meta = pickMetaFromAny(localNoc as any);
  return { source: "local", cachedAt: null, meta, data };
}

export async function loadNocCategories(): Promise<LoaderResult<NocCategory[]>> {
  // 1) Remote
  try {
    const raw = await fetchJson(RULES_CONFIG.nocCategoriesUrl);
    const data = normCats(raw);
    if (!data.length) throw new Error("empty categories");
    const meta = pickMetaFromAny(raw);
    const savedAt = Date.now();
    await writeCache<NocCategory[]>(NOC_CAT_CACHE_KEY, { savedAt, meta, data });
    return { source: "remote", cachedAt: savedAt, meta, data };
  } catch { /* fall through */ }

  // 2) Cache
  try {
    const cached = await readCache<NocCategory[]>(NOC_CAT_CACHE_KEY);
    if (cached?.data?.length) {
      return { source: "cache", cachedAt: cached.savedAt, meta: cached.meta || {}, data: cached.data };
    }
  } catch { /* ignore */ }

  // 3) Local
  const data = normCats(localCats as any);
  const meta = pickMetaFromAny(localCats as any);
  return { source: "local", cachedAt: null, meta, data };
}

// ---------- Tiny helpers ----------
export function makeNocIndex(items: NocItem[]): Record<string, NocItem> {
  return Object.fromEntries(items.map(i => [i.code, i]));
}
// Be tolerant to a few shapes: array of categories with { key, codes: [...] }
// or { key, items: [...] } or { key, noc_codes: [...] }, or even an
// object map like { stem: ["21231"], trades: ["62020"] }.
export function codesForCategory(key: string, cats: any): string[] {
  if (!key) return [];

  // Map/object form: { stem: [...], trades: [...] }
  if (cats && !Array.isArray(cats) && typeof cats === "object") {
    const raw = (cats as any)[key];
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === "object") return Object.keys(raw);
    if (typeof raw === "string") return raw.split(/[\s,;]+/).filter(Boolean);
    return [];
  }

  const arr = Array.isArray(cats) ? cats : [];
  const match = arr.find((c: any) => String(c?.key ?? c?.id ?? c?.slug ?? "") === key);
  if (!match) return [];

  const raw =
    match.codes ??      // raw JSON (your case before normalize)
    match.items ??
    match.noc_codes ??  // normalized field above
    match.values ??
    match.nocs ?? null;

  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "object") return Object.keys(raw);
  if (typeof raw === "string") return raw.split(/[\s,;]+/).filter(Boolean);
  return [];
}
