// src/services/nocRules.ts
// Fetch NOC (2021) Main duties from the rules repo (Remote JSON)
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LoaderResult } from './updates';

export type RulesNoc = {
  code: string;
  title?: string;
  teer?: string | number;
  mainDuties: string[];
  source?: string;           // raw URL (debug)
  sourceLabel?: string;      // "Source: Rules snapshot"
};


function normCode(x: any): string {
  const s = String(x ?? "").replace(/\D/g, "");
  return s ? s.padStart(5, "0") : "";
}
function teerFromCode(code5: string): string | undefined {
  return /^\d{5}$/.test(code5) ? code5[1] : undefined;
}


const DLOG = (...a: any[]) => __DEV__ && console.log('[NOC_RULES]', ...a);
// --- tolerant readers for title/teer/duties (handles nested shapes like {data:{...}}, {items:[...]}, etc.)
const _candidateObjs = (root: any) => [
  root,
  root?.data,
  root?.item,
  Array.isArray(root?.items) ? { mainDuties: root.items } : root?.items,
  root?.payload,
  root?.content,
  root?.noc,
];

const readTitle = (j: any): string | undefined => {
  for (const o of _candidateObjs(j)) {
    const t = o?.title ?? o?.noc_title ?? o?.name;
    if (t != null) return String(t);
  }
  return undefined;
};

const readTeer = (j: any, code5: string): string | undefined => {
  for (const o of _candidateObjs(j)) {
    const t = o?.teer ?? o?.TEER;
    if (t != null) return String(t);
  }
  return code5?.[1];
};

const readDuties = (j: any): string[] => {
  const keys = [
    'main_duties', 'mainDuties', 'main_duties_en', 'mainDutiesEn',
    'duties', 'tasks', 'MainDuties', 'MAIN_DUTIES'
  ];
  for (const o of _candidateObjs(j)) {
    if (!o || typeof o !== 'object') continue;
    for (const k of keys) {
      if (o[k] != null) {
        const v = o[k];
        const arr = Array.isArray(v) ? v : String(v).split(/\r?\n|•/g);
        return arr.map(s => String(s).replace(/^[•\-\u2022]\s*/, '').trim()).filter(Boolean);
      }
    }
  }
  return [];
};

async function tryFetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return null;
    const txt = await res.text();
    if (!txt || txt.length < 2) return null;
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

/**
 * Looks for JSON at common static endpoints in your maplesteps-rules repo.
 * Adjust the `CANDIDATE_BASES` or folder pattern later if needed.
 */
export async function fetchNocFromRules(code: string): Promise<RulesNoc | null> {
  const code5 = normCode(code);
  // --- Direct-file first: <base>/<code>.json — works even if manifest is stale ---
for (const base of RULES_BASES) {
  const url = `${base}/${code5}.json?v=${Date.now()}`;
  DLOG('try file', url);
  const j = await fetchJson(url);
  if (!j) { DLOG('miss file', url); continue; }

  const title = readTitle(j);
const teer  = readTeer(j, code5);
const mainDuties = readDuties(j);

  if (mainDuties.length) {
    DLOG('hit file', url, 'duties:', mainDuties.length);
    return { code: code5, title, teer, mainDuties, source: url, sourceLabel: 'Source: Rules snapshot' } as RulesNoc;
  } else {
    DLOG('empty duties in file', url);
  }
}



// (existing `return null` stays after this)

  if (!code5) return null;

  const manifest = await loadManifest();
DLOG('manifest loaded',
  manifest ? (Array.isArray(manifest) ? `array(${manifest.length})` : `object(${Object.keys(manifest).length})`) : 'null'
);

// Support both shapes: array of codes OR object map
let filename = `${code5}.json`;
if (!manifest) {
  DLOG('manifest is null → skipping manifest branch');
} else if (Array.isArray(manifest)) {
  if (!manifest.includes(code5)) {
    DLOG('manifest array does NOT include code', code5);
  } else {
    DLOG('manifest array includes code', code5);
  }
} else {
  // object map: { "21231": "21231.json" } or { "21231": true }
  filename = (manifest as any)[code5] || filename;
  DLOG('manifest object filename resolved to', filename);
}

for (const base of RULES_BASES) {
  const url = `${base}/${filename}?v=${Date.now()}`;
  DLOG('try manifest file', url);
  const j = await fetchJson(url);
  if (!j) { DLOG('miss manifest file', url); continue; }

  const title = readTitle(j);
const teer  = readTeer(j, code5);
const mainDuties = readDuties(j);


  if (mainDuties.length) {
    DLOG('hit manifest file', url, 'duties:', mainDuties.length);
    return { code: code5, title, teer, mainDuties, source: url, sourceLabel: 'Source: Rules snapshot' } as RulesNoc;
  } else {
    DLOG('empty duties in manifest file', url);
  }
}

  return null;
}

// At top (below types)
const RULES_BASES = [
  "https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/noc/2021",
  "https://cdn.jsdelivr.net/gh/Omerpq/maplesteps-rules@main/noc/2021",
] as const;







let manifestCache: Record<string, string> | null = null;
// allow other screens to clear the in-memory manifest
export function resetNocRulesCache() {
  manifestCache = null;
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { method: "GET" });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function loadManifest(): Promise<Record<string, string> | null> {
  if (manifestCache) return manifestCache;
  for (const base of RULES_BASES) {
    const url = `${base}/index.json`;
    const m = await fetchJson(url);
    if (m && typeof m === "object") {
      // ⬇️ THIS is “right after a manifest is found”
      console.log("[NOC_MANIFEST] using:", url, "codes:", Object.keys(m).length);
      manifestCache = m as Record<string, string>;
      return manifestCache;
    }
  }
  return null;
}

// --- NOC manifest loader for Updates screen card ---
export type NocManifest = {
  codes: string[];
  count: number;
  source_url?: string;
  last_checked?: string;
};

const NOC_MANIFEST_CACHE_KEY = 'ms_noc_manifest_v4';


export async function loadNocManifest(): Promise<LoaderResult<NocManifest>> {
  // 1) try remote (manifest is noc/2021/index.json in the rules repo)
  for (const base of RULES_BASES) {
    const url = `${base}/index.json`;
    const m = await fetchJson(url);
    if (m && typeof m === 'object') {
      const codes = Object.keys(m).filter(k => /^\d{5}$/.test(k)).sort();
      const data: NocManifest = {
        codes,
        count: codes.length,
        source_url: url,
        last_checked: new Date().toISOString().slice(0, 10),
      };
      const cached = {
        savedAt: Date.now(),
        meta: { source_url: url, last_checked: data.last_checked },
        data,
      };
      await AsyncStorage.setItem(NOC_MANIFEST_CACHE_KEY, JSON.stringify(cached));
      return { data, source: 'remote', meta: cached.meta, cachedAt: cached.savedAt };
    }
  }

  // 2) try cache
  try {
    const raw = await AsyncStorage.getItem(NOC_MANIFEST_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      return {
        data: cached.data as NocManifest,
        source: 'cache',
        meta: cached.meta,
        cachedAt: cached.savedAt,
      };
    }
  } catch {}

 // 3) local fallback
const data: NocManifest = { codes: [], count: 0 };
return { data, source: 'local' } as unknown as LoaderResult<NocManifest>;
}

