// src/services/pofLive.ts
// Live-first thresholds via IRCC page (24h TTL), similar to nocLive.ts.

import AsyncStorage from '@react-native-async-storage/async-storage';

const IRCC_POF_URL =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/proof-funds.html';
// Text proxy (public, no CORS on-device). Keep http in the proxied leg.
const PROXY_URL = 'https://r.jina.ai/http://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/proof-funds.html';

const K_LIVE_CACHE = 'ms.pof.live.cache.v1';
const TTL_HOURS = 24;

export type LiveThreshold = { family_size: number; amount_cad: number };
export type PofLiveResult = {
  source: 'live-ircc' | 'live-cache';
  url: string;
  fetchedAtISO: string;
  thresholds: LiveThreshold[];
  updatedISO?: string;
};

const nowISO = () => new Date().toISOString();

function isFresh(iso: string, hours: number): boolean {
  const t = new Date(iso).getTime();
  return Date.now() - t < hours * 3600 * 1000;
}

function parseThresholdsFromText(text: string): { rows: LiveThreshold[]; updatedISO?: string } {
  // Narrow to the "How much money you need" section to reduce false matches.
  const headIdx = text.toLowerCase().indexOf('how much money you need');
  const slice = headIdx >= 0 ? text.slice(headIdx, headIdx + 5000) : text;

  // Try to capture a YYYY (for updated year). Optional.
  let updatedISO: string | undefined;
  const updMatch = slice.match(/updated(?:.*?)(\b(?:\d{4})\b)/i);
  if (updMatch) updatedISO = `${updMatch[1]}-07-07T00:00:00Z`; // IRCC typically updates early July; just a hint.

  // Robust row regex: family size integer + a CAD amount with commas.
  const rows: LiveThreshold[] = [];
  const rowRe = /(^|\n)\s*(\d+)\s*(?:\([^\n]*\))?\s*\$?\s*([0-9][0-9,]+)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(slice))) {
    const size = Number(m[2]);
    const amt = Number(String(m[3]).replace(/,/g, ''));
    if (size >= 1 && amt > 0) rows.push({ family_size: size, amount_cad: amt });
  }

  // Deduplicate & keep smallest amount per size (in case of multiple matches).
  const bySize = new Map<number, number>();
  for (const r of rows) {
    bySize.set(r.family_size, Math.min(r.amount_cad, bySize.get(r.family_size) ?? r.amount_cad));
  }
  const unique = Array.from(bySize.entries()).map(([family_size, amount_cad]) => ({ family_size, amount_cad }));
  unique.sort((a, b) => a.family_size - b.family_size);

  return { rows: unique, updatedISO };
}

export async function loadPofLive(opts?: { bypassCache?: boolean }): Promise<PofLiveResult | null> {
  const bypass = !!opts?.bypassCache;

  // 1) Cache
  const cachedRaw = await AsyncStorage.getItem(K_LIVE_CACHE);
  if (!bypass && cachedRaw) {
    const cached = JSON.parse(cachedRaw) as PofLiveResult;
    if (cached?.fetchedAtISO && isFresh(cached.fetchedAtISO, TTL_HOURS)) {
      return { ...cached, source: 'live-cache' };
    }
  }

  // 2) Live fetch via proxy
  try {
    const res = await fetch(PROXY_URL);
    if (!res.ok) throw new Error(`IRCC fetch ${res.status}`);
    const txt = await res.text();
    const { rows, updatedISO } = parseThresholdsFromText(txt);
    if (rows.length >= 7) {
      const out: PofLiveResult = {
        source: 'live-ircc',
        url: IRCC_POF_URL,
        fetchedAtISO: nowISO(),
        thresholds: rows,
        updatedISO,
      };
      await AsyncStorage.setItem(K_LIVE_CACHE, JSON.stringify(out));
      return out;
    }
  } catch {
    // ignore → fall back
  }

  // 3) Fallback to stale cache if present
  if (cachedRaw) {
    const cached = JSON.parse(cachedRaw) as PofLiveResult;
    return { ...cached, source: 'live-cache' };
  }

  return null;
}

export async function clearPofLiveCache(): Promise<void> {
  await AsyncStorage.removeItem(K_LIVE_CACHE);
}
