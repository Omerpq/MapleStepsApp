// src/services/pof.ts
// Proof of Funds: Rules-repo FIRST thresholds (conditional GET) → Live IRCC fallback (24h TTL) → Local.
// Guides file (fund types/notes) still uses the standard Remote→Cache→Local contract.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { POF_GUIDES_URL, POF_THRESHOLDS_URL } from './config';
import { loadPofLive, clearPofLiveCache } from './pofLive';

// -------------------------
// AsyncStorage keys
// -------------------------
const K_POF_STATE = 'ms.pof.state.v1';

const K_POF_GUIDES_CACHE = 'ms.pof.guides.cache.v1';
const K_POF_GUIDES_META = 'ms.pof.guides.meta.v1';

const K_POF_THRESHOLDS_CACHE = 'ms.pof.thresholds.cache.v1';
const K_POF_THRESHOLDS_META  = 'ms.pof.thresholds.meta.v1';

// -------------------------
// Types
// -------------------------
export type LoaderSource = 'remote' | 'cache' | 'local' | 'live-ircc' | 'live-cache';
export type LoaderMeta = { etag?: string; last_modified?: string; status?: 200 | 304; tag?: string };
export type LoaderResult<T> = { source: LoaderSource; cachedAt: string; meta?: LoaderMeta; data: T };

export type PofThreshold = { family_size: number; amount_cad: number };
type PofThresholdsDoc = { version: string; updated?: string; thresholds: PofThreshold[] };

export type FundTypeId =
  | 'cash' | 'savings' | 'chequing' | 'fixed_deposit' | 'mutual_fund'
  | 'stock' | 'bond' | 'rrsp' | 'tfsa'
  | 'gift' | 'crypto' | 'property' | 'vehicle' | 'gold' | 'borrowed' | string;

export type PofGuides = {
  version: string;
  updated: string; // ISO
  thresholds: PofThreshold[]; // sorted by family_size asc
  fund_types: Array<{ id: FundTypeId; label: string; eligible: boolean; notes?: string }>;
  notes?: string[];
};

export type MonthEntry = {
  yyyyMm: string; // e.g., "2025-09"
  entries: Array<{ amount_cad: number; typeId: FundTypeId }>;
};
export type PofState = {
  familySize: number;     // 1..N
  months: MonthEntry[];   // last 6 calendar months
  updatedAt: string;      // ISO
};

// -------------------------
// Helpers
// -------------------------
const nowISO = () => new Date().toISOString();

function sortThresholds(th: PofThreshold[]): PofThreshold[] {
  return [...(th || [])].sort((a,b) => (a.family_size||0) - (b.family_size||0));
}
function requiredForFamily(size: number, th: PofThreshold[]): number {
  const sorted = sortThresholds(th);
  let req = 0;
  for (const t of sorted) {
    if (size <= t.family_size) { req = t.amount_cad; break; }
    req = t.amount_cad;
  }
  return req;
}
function addMonths(y:number,m:number,delta:number){ const d=new Date(Date.UTC(y,m-1,1)); d.setUTCMonth(d.getUTCMonth()+delta); return {y:d.getUTCFullYear(), m:d.getUTCMonth()+1}; }
function fmtYyyyMm(y:number,m:number){ return `${y}-${String(m).padStart(2,'0')}`; }

// -------------------------
// Guides loader (Remote→Cache→Local)
// -------------------------
export async function loadPofGuides(): Promise<LoaderResult<PofGuides>> {
  try {
    const metaRaw = await AsyncStorage.getItem(K_POF_GUIDES_META);
    const meta = metaRaw ? (JSON.parse(metaRaw) as LoaderMeta) : {};
    const headers: Record<string, string> = {};
    if (meta.etag) headers['If-None-Match'] = meta.etag;
    if (meta.last_modified) headers['If-Modified-Since'] = meta.last_modified;

    const res = await fetch(POF_GUIDES_URL, { headers });
    if (res.status === 304) {
      const cachedRaw = await AsyncStorage.getItem(K_POF_GUIDES_CACHE);
      if (cachedRaw) {
        const { data, cachedAt } = JSON.parse(cachedRaw) as LoaderResult<PofGuides>;
        return { source: 'cache', cachedAt, meta: { ...meta, status: 304 }, data };
      }
    }
    if (res.ok) {
      const data = (await res.json()) as PofGuides;
      const etag = res.headers.get('ETag') ?? undefined;
      const last_modified = res.headers.get('Last-Modified') ?? undefined;
      const out: LoaderResult<PofGuides> = {
        source: 'remote',
        cachedAt: nowISO(),
        meta: { etag, last_modified, status: 200 },
        data,
      };
      await AsyncStorage.multiSet([
        [K_POF_GUIDES_CACHE, JSON.stringify(out)],
        [K_POF_GUIDES_META, JSON.stringify(out.meta)],
      ]);
      return out;
    }
  } catch { /* ignore */ }

  const cachedRaw = await AsyncStorage.getItem(K_POF_GUIDES_CACHE);
  if (cachedRaw) {
    const { data, cachedAt, meta } = JSON.parse(cachedRaw) as LoaderResult<PofGuides>;
    return { source: 'cache', cachedAt, meta, data };
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const data = require('../data/guides/pof.json') as PofGuides;
  return { source: 'local', cachedAt: nowISO(), data };
}

// -------------------------
// Thresholds loader (Rules → Cache → Local) with validators
// -------------------------
async function loadPofThresholds(): Promise<LoaderResult<PofThresholdsDoc>> {
  try {
    const metaRaw = await AsyncStorage.getItem(K_POF_THRESHOLDS_META);
    const meta = metaRaw ? (JSON.parse(metaRaw) as LoaderMeta) : {};
    const headers: Record<string, string> = {};
    if (meta.etag) headers['If-None-Match'] = meta.etag;
    if (meta.last_modified) headers['If-Modified-Since'] = meta.last_modified;

    const res = await fetch(POF_THRESHOLDS_URL, { headers });
    if (res.status === 304) {
      const cachedRaw = await AsyncStorage.getItem(K_POF_THRESHOLDS_CACHE);
      if (cachedRaw) {
        const { data, cachedAt } = JSON.parse(cachedRaw) as LoaderResult<PofThresholdsDoc>;
        return { source: 'cache', cachedAt, meta: { ...meta, status: 304 }, data };
      }
    }
    if (res.ok) {
      const data = (await res.json()) as PofThresholdsDoc;
      const etag = res.headers.get('ETag') ?? undefined;
      const last_modified = res.headers.get('Last-Modified') ?? undefined;
      const out: LoaderResult<PofThresholdsDoc> = {
        source: 'remote',
        cachedAt: nowISO(),
        meta: { etag, last_modified, status: 200 },
        data,
      };
      await AsyncStorage.multiSet([
        [K_POF_THRESHOLDS_CACHE, JSON.stringify(out)],
        [K_POF_THRESHOLDS_META, JSON.stringify(out.meta)],
      ]);
      return out;
    }
  } catch { /* ignore */ }

  const cachedRaw = await AsyncStorage.getItem(K_POF_THRESHOLDS_CACHE);
  if (cachedRaw) {
    const { data, cachedAt, meta } = JSON.parse(cachedRaw) as LoaderResult<PofThresholdsDoc>;
    return { source: 'cache', cachedAt, meta, data };
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const data = require('../data/pof.thresholds.json') as PofThresholdsDoc;
  return { source: 'local', cachedAt: nowISO(), data };
}

// -------------------------
// Combined loader
// -------------------------
export async function loadPof(bypassLiveCache = false): Promise<LoaderResult<PofGuides>> {
  // Always load guides (fund types/notes + ultimate fallback)
  const guidesRes = await loadPofGuides();

  // If caller passed `true`, prefer Live IRCC first (used by "Refresh from IRCC" button)
  if (bypassLiveCache) {
    const live = await loadPofLive({ bypassCache: true });
    if (live?.thresholds?.length) {
      const merged: PofGuides = {
        ...guidesRes.data,
        thresholds: live.thresholds.map(t => ({ family_size: t.family_size, amount_cad: t.amount_cad })),
        updated: live.updatedISO || guidesRes.data.updated,
      };
      return {
        source: live.source, // 'live-ircc' | 'live-cache'
        cachedAt: live.fetchedAtISO,
        meta: { status: 200, tag: 'live-ircc' },
        data: merged,
      };
    }
    // if live fails, continue below to rules-first
  }

  // Rules-repo FIRST for thresholds (mirrors rounds/fees)
  const thRes = await loadPofThresholds();
  if (thRes?.data?.thresholds?.length) {
    const merged: PofGuides = {
      ...guidesRes.data,
      thresholds: thRes.data.thresholds,
      updated: thRes.data.updated || guidesRes.data.updated,
    };
    return {
      source: thRes.source, // 'remote' | 'cache' | 'local'
      cachedAt: thRes.cachedAt,
      meta: thRes.meta,
      data: merged,
    };
  }

  // Fallback: try Live IRCC if rules thresholds missing
  const live = await loadPofLive({ bypassCache: bypassLiveCache });
  if (live?.thresholds?.length) {
    const merged: PofGuides = {
      ...guidesRes.data,
      thresholds: live.thresholds.map(t => ({ family_size: t.family_size, amount_cad: t.amount_cad })),
      updated: live.updatedISO || guidesRes.data.updated,
    };
    return {
      source: live.source,
      cachedAt: live.fetchedAtISO,
      meta: { status: 200, tag: 'live-ircc' },
      data: merged,
    };
  }

  // Last resort: whatever guides had bundled
  return guidesRes;
}

// -------------------------
// Dev helpers
// -------------------------
export async function forcePofRevalidate(): Promise<void> {
  await AsyncStorage.multiRemove([
    K_POF_GUIDES_META, K_POF_GUIDES_CACHE,
    K_POF_THRESHOLDS_META, K_POF_THRESHOLDS_CACHE,
  ]);
  await clearPofLiveCache();
}

export async function resetPofState(): Promise<void> {
  await AsyncStorage.removeItem('ms.pof.state.v1');
}

// -------------------------
// State API
// -------------------------
export async function loadPofState(): Promise<PofState> {
  const raw = await AsyncStorage.getItem(K_POF_STATE);
  if (raw) return JSON.parse(raw) as PofState;

  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth()+1;
  const months: MonthEntry[] = [];
  for (let i=5;i>=0;i--){
    const {y:yy, m:mm} = addMonths(y,m,-i);
    months.push({ yyyyMm: fmtYyyyMm(yy,mm), entries: [] });
  }
  const state: PofState = { familySize: 1, months, updatedAt: nowISO() };
  await AsyncStorage.setItem(K_POF_STATE, JSON.stringify(state));
  return state;
}

export async function savePofState(updater: (prev: PofState)=>PofState | PofState): Promise<PofState> {
  const prev = await loadPofState();
  const next = typeof updater === 'function' ? (updater as any)(prev) : updater;
  next.updatedAt = nowISO();
  await AsyncStorage.setItem(K_POF_STATE, JSON.stringify(next));
  return next;
}

// -------------------------
// Domain helpers
// -------------------------
export function getRequiredAmount(familySize: number, guides: PofGuides): number {
  return requiredForFamily(Math.max(1, Math.trunc(familySize||1)), guides?.thresholds || []);
}
export function isTypeEligible(typeId: FundTypeId, guides: PofGuides): boolean {
  const t = (guides?.fund_types || []).find(x => x.id === typeId);
  return !!t?.eligible;
}
export type PofWarning = { code: 'missing_months' | 'ineligible_funds'; message: string };

export function summarize(state: PofState, guides: PofGuides): {
  required: number;
  monthlyEligibleTotals: Array<{ yyyyMm: string; total_cad: number }>;
  sixMonthMinEligible: number;
  sixMonthAvgEligible: number;
  latestMonthEligible: number;
  warnings: PofWarning[];
} {
  const required = getRequiredAmount(state.familySize, guides);

  const totals = state.months.map(m => {
    const sum = (m.entries || []).reduce((acc, e) => acc + (isTypeEligible(e.typeId, guides) ? Math.max(0, Number(e.amount_cad)||0) : 0), 0);
    return { yyyyMm: m.yyyyMm, total_cad: Math.round(sum) };
  });

  const warnings: PofWarning[] = [];
  const filled = totals.filter(t => t.total_cad > 0).length;
  if (filled < 6) {
    warnings.push({ code: 'missing_months', message: `You have ${filled}/6 months with any eligible balance. IRCC expects consistent proof across 6 months.` });
  }
  const anyIneligible = state.months.some(m => (m.entries||[]).some(e => !isTypeEligible(e.typeId, guides) && (Number(e.amount_cad)||0) > 0));
  if (anyIneligible) {
    warnings.push({ code: 'ineligible_funds', message: `Some entries use ineligible fund types (e.g., borrowed funds, property, crypto). These do not count toward PoF.` });
  }

  const eligibleVals = totals.map(t => t.total_cad);
  const sixMonthMinEligible = eligibleVals.length ? Math.min(...eligibleVals) : 0;
  const sixMonthAvgEligible = eligibleVals.length ? Math.round(eligibleVals.reduce((a,b)=>a+b,0) / eligibleVals.length) : 0;
  const latestMonthEligible = totals.length ? totals[totals.length-1].total_cad : 0;

  return { required, monthlyEligibleTotals: totals, sixMonthMinEligible, sixMonthAvgEligible, latestMonthEligible, warnings };
}

// -------------------------
// UI helpers
// -------------------------
export function fundTypeOptions(guides: PofGuides): Array<{ id: FundTypeId; label: string; eligible: boolean }> {
  return (guides?.fund_types || []).map(t => ({ id: t.id, label: t.label || String(t.id), eligible: !!t.eligible }));
}
