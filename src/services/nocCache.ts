// src/services/nocCache.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

export type NocLivePayload = {
  code: string;
  title?: string;
  teer?: string | number;
  mainDuties: string[];
  source?: 'esdc' | 'jobbank';
  sourceUrl?: string;
  fetchedAtISO: string; // when the live page was fetched
};

const KEY_PREFIX = 'noc:live:2021:'; // e.g., noc:live:2021:21231
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function keyFor(code: string) {
  return `${KEY_PREFIX}${code}`;
}

export async function setCachedNoc(
  code: string,
  payload: NocLivePayload,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<void> {
  const now = Date.now();
  const record = {
    payload,
    meta: {
      cachedAt: now,
      ttlMs
    }
  };
  try {
    await AsyncStorage.setItem(keyFor(code), JSON.stringify(record));
  } catch {
    // ignore storage errors silently
  }
}

export async function getCachedNoc(
  code: string
): Promise<{ payload: NocLivePayload; expired: boolean } | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      payload: NocLivePayload;
      meta: { cachedAt: number; ttlMs: number };
    };
    const { cachedAt, ttlMs } = parsed.meta || {};
    const expired = typeof cachedAt === 'number' && typeof ttlMs === 'number'
      ? Date.now() - cachedAt > ttlMs
      : true;
    return { payload: parsed.payload, expired };
  } catch {
    return null;
  }
}

export async function clearCachedNoc(code: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(code));
  } catch {
    // ignore
  }
}

export async function clearAllNocCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const nocKeys = keys.filter(k => k.startsWith(KEY_PREFIX));
    if (nocKeys.length) {
      await AsyncStorage.multiRemove(nocKeys);
    }
  } catch {
    // ignore
  }
}

/** Helper for "Refresh now" UX: force ignore cache by clearing it first. */
export async function forceRefresh(code: string): Promise<void> {
  await clearCachedNoc(code);
}
