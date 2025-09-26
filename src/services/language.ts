// src/services/language.ts
// Language Planner: state, guides loader (Remote→Cache→Local), weekly plan generator,
// and a one-shot CLB handoff for CRS/Score screen.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { LANGUAGE_GUIDES_URL } from './config';

// -------------------------
// AsyncStorage keys
// -------------------------
const K_LANG_STATE = 'ms.language.state.v1';
const K_LANG_GUIDES_CACHE = 'ms.language.guides.cache.v1';
const K_LANG_GUIDES_META = 'ms.language.guides.meta.v1';
const K_LANG_CLB_FOR_SCORE = 'ms.language.clb_for_score.v1'; // one-shot pipe to Score

// -------------------------
// Types
// -------------------------
export type LoaderSource = 'remote' | 'cache' | 'local';
export type LoaderMeta = { etag?: string; last_modified?: string; status?: 200 | 304 };
export type LoaderResult<T> = { source: LoaderSource; cachedAt: string; meta?: LoaderMeta; data: T };

export type Ability = 'reading' | 'listening' | 'writing' | 'speaking';
export type TestId = 'ielts' | 'celpip' | 'tef' | 'tcf' | string;

export type LanguageGuides = {
  version: string;
  updated: string; // ISO
  tests: Array<{ id: TestId; name: string }>;
  prep_tips: {
    reading: string[];
    listening: string[];
    writing: string[];
    speaking: string[];
    mixed?: string[];
  };
};

export type LangResultsCLB = {
  readingClb?: number;
  listeningClb?: number;
  writingClb?: number;
  speakingClb?: number;
};

export type WeeklyPlanItem = {
  weekIndex: number;        // 0-based
  startISO: string;         // inclusive
  endISO: string;           // inclusive
  focus: Ability | 'mixed';
  tasks: string[];          // 3–5 items, pulled from guides
};

export type LanguageState = {
  // Planner basics
  testId?: TestId;
  targetClb?: number;       // 0–10 (simplified)
  testDateISO?: string;     // selected exam date
  hoursPerWeek?: number;    // guidance only (default 6)

  // Generated plan (derived from basics)
  plan?: WeeklyPlanItem[];

  // Results (user-entered CLB per ability)
  results?: LangResultsCLB;

  // Bookkeeping
  updatedAt: string;        // ISO
};

// -------------------------
// Helpers
// -------------------------
const nowISO = () => new Date().toISOString();

const dayAtNineLocal = (isoLike: string) => {
  const d = new Date(isoLike);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function weeksBetweenInclusive(start: Date, end: Date) {
  // Count calendar weeks (Mon–Sun neutral). We’ll split by 7-day buckets from start.
  const s = startOfDay(start);
  const e = startOfDay(end);
  const diffDays = Math.max(0, Math.ceil((e.getTime() - s.getTime()) / 86400000));
  // Include the end week: if diffDays=0 → 1 week; else ceil((diff+1)/7)
  return Math.max(1, Math.ceil((diffDays + 1) / 7));
}

function clampInt(n: any, min: number, max: number): number {
  const v = Number(n);
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function pickTips(candidates: string[] = [], count: number): string[] {
  if (!candidates.length) return [];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(candidates[i % candidates.length]);
  }
  return out;
}

function rotateFocus(i: number): Ability | 'mixed' {
  const order: Array<Ability | 'mixed'> = ['reading', 'listening', 'writing', 'speaking', 'mixed'];
  return order[i % order.length];
}

function computePrimaryClbFromResults(res?: LangResultsCLB): number | null {
  if (!res) return null;
  const vals = [res.readingClb, res.listeningClb, res.writingClb, res.speakingClb]
    .map(v => (typeof v === 'number' && v >= 0 ? v : undefined))
    .filter(v => v !== undefined) as number[];
  if (vals.length < 4) return null; // require all four
  // Conservative tie-in for simplified CRS model: use MIN across abilities
  return Math.min(...vals);
}

// -------------------------
// Guides loader (Remote → Cache → Local) with validators
// -------------------------
export async function loadLanguageGuides(): Promise<LoaderResult<LanguageGuides>> {
  // 1) Remote (with validators)
  try {
    const metaRaw = await AsyncStorage.getItem(K_LANG_GUIDES_META);
    const meta = metaRaw ? (JSON.parse(metaRaw) as LoaderMeta) : {};
    const headers: Record<string, string> = {};
    if (meta.etag) headers['If-None-Match'] = meta.etag;
    if (meta.last_modified) headers['If-Modified-Since'] = meta.last_modified;

    const res = await fetch(LANGUAGE_GUIDES_URL, { headers });
    if (res.status === 304) {
      const cachedRaw = await AsyncStorage.getItem(K_LANG_GUIDES_CACHE);
      if (cachedRaw) {
        const { data, cachedAt } = JSON.parse(cachedRaw) as LoaderResult<LanguageGuides>;
        return { source: 'cache', cachedAt, meta: { ...meta, status: 304 }, data };
      }
      // Fall through to Local
    }
    if (res.ok) {
      const data = (await res.json()) as LanguageGuides;
      const etag = res.headers.get('ETag') ?? undefined;
      const last_modified = res.headers.get('Last-Modified') ?? undefined;
      const out: LoaderResult<LanguageGuides> = {
        source: 'remote',
        cachedAt: nowISO(),
        meta: { etag, last_modified, status: 200 },
        data,
      };
      await AsyncStorage.multiSet([
        [K_LANG_GUIDES_CACHE, JSON.stringify(out)],
        [K_LANG_GUIDES_META, JSON.stringify(out.meta)],
      ]);
      return out;
    }
  } catch {
    // ignore → try Cache
  }

  // 2) Cache
  const cachedRaw = await AsyncStorage.getItem(K_LANG_GUIDES_CACHE);
  if (cachedRaw) {
    const { data, cachedAt, meta } = JSON.parse(cachedRaw) as LoaderResult<LanguageGuides>;
    return { source: 'cache', cachedAt, meta, data };
  }

  // 3) Local fallback
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const data = require('../data/guides/language.json') as LanguageGuides;
  return { source: 'local', cachedAt: nowISO(), data };
}

// -------------------------
// State API
// -------------------------
export async function loadLanguageState(): Promise<LanguageState> {
  const raw = await AsyncStorage.getItem(K_LANG_STATE);
  if (raw) return JSON.parse(raw) as LanguageState;
  return { updatedAt: nowISO(), hoursPerWeek: 6 };
}

/** Save planner basics and regenerate a weekly plan. */
export async function saveBasicsAndBuildPlan(input: {
  testId: TestId;
  targetClb?: number;
  testDateISO: string;       // any ISO-like string accepted
  hoursPerWeek?: number;
}): Promise<LanguageState> {
  const guides = await loadLanguageGuides();
  const prev = await loadLanguageState();

  const testId = input.testId;
  const targetClb = typeof input.targetClb === 'number' ? clampInt(input.targetClb, 0, 10) : undefined;
  const testDateISO = dayAtNineLocal(input.testDateISO);
  const hoursPerWeek = clampInt(input.hoursPerWeek ?? prev.hoursPerWeek ?? 6, 1, 40);

  const plan = generateWeeklyPlan({ testDateISO, hoursPerWeek }, guides.data);

  const next: LanguageState = {
    ...prev,
    testId,
    targetClb,
    testDateISO,
    hoursPerWeek,
    plan,
    updatedAt: nowISO(),
  };
  await AsyncStorage.setItem(K_LANG_STATE, JSON.stringify(next));
  return next;
}

/** Set/replace user-entered language CLB results per ability. */
export async function setResultsCLB(res: LangResultsCLB): Promise<LanguageState> {
  const prev = await loadLanguageState();
  const cleaned: LangResultsCLB = {
    readingClb: res.readingClb != null ? clampInt(res.readingClb, 0, 10) : undefined,
    listeningClb: res.listeningClb != null ? clampInt(res.listeningClb, 0, 10) : undefined,
    writingClb: res.writingClb != null ? clampInt(res.writingClb, 0, 10) : undefined,
    speakingClb: res.speakingClb != null ? clampInt(res.speakingClb, 0, 10) : undefined,
  };

  const next: LanguageState = {
    ...prev,
    results: cleaned,
    updatedAt: nowISO(),
  };
  await AsyncStorage.setItem(K_LANG_STATE, JSON.stringify(next));

  // If all four abilities are present, expose a one-shot CLB to the Score screen.
  const primary = computePrimaryClbFromResults(cleaned);
  if (primary != null) {
    await AsyncStorage.setItem(K_LANG_CLB_FOR_SCORE, String(primary));
  }
  return next;
}

/** Returns the *current* computed primary CLB (min across abilities) or null. */
export async function getComputedPrimaryClb(): Promise<number | null> {
  const s = await loadLanguageState();
  return computePrimaryClbFromResults(s.results);
}

/** One-shot read for Score screen: read and clear the CLB handoff. */
export async function readAndClearLanguageClbForScore(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(K_LANG_CLB_FOR_SCORE);
  if (!raw) return null;
  await AsyncStorage.removeItem(K_LANG_CLB_FOR_SCORE);
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// -------------------------
// Plan generator
// -------------------------
export function generateWeeklyPlan(
  input: { testDateISO: string; hoursPerWeek: number },
  guides: LanguageGuides
): WeeklyPlanItem[] {
  const today = startOfDay(new Date());
  const test = startOfDay(new Date(input.testDateISO));
  const weeks = weeksBetweenInclusive(today, test);

  const out: WeeklyPlanItem[] = [];
  for (let i = 0; i < weeks; i++) {
    const start = addDays(today, i * 7);
    const end = addDays(start, 6);
    const focus = rotateFocus(i);

    const tipsByFocus =
      focus === 'mixed'
        ? guides.prep_tips.mixed && guides.prep_tips.mixed.length
          ? guides.prep_tips.mixed
          : [
              ...(guides.prep_tips.reading ?? []),
              ...(guides.prep_tips.listening ?? []),
              ...(guides.prep_tips.writing ?? []),
              ...(guides.prep_tips.speaking ?? []),
            ]
        : guides.prep_tips[focus] ?? [];

    // Heuristic: 3 tasks for ≤6 hrs/week, else 4–5 tasks
    const count = input.hoursPerWeek <= 6 ? 3 : input.hoursPerWeek <= 10 ? 4 : 5;

    out.push({
      weekIndex: i,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      focus,
      tasks: pickTips(tipsByFocus, count),
    });
  }
  return out;
}

// -------------------------
// Convenience UX labels
// -------------------------
export const abilityLabel: Record<Ability | 'mixed', string> = {
  reading: 'Reading',
  listening: 'Listening',
  writing: 'Writing',
  speaking: 'Speaking',
  mixed: 'Mixed',
};

// -------------------------
// Optional: platform-specific helper (for later reminders)
// -------------------------
export function localNotifHint(): string {
  return (
    Platform.select({
      ios: '09:00 local reminder supported in development builds.',
      android: '09:00 local reminder supported in development builds.',
      default: 'Local reminder supported in development builds.',
    }) || 'Local reminder supported in development builds.'
  );
}
