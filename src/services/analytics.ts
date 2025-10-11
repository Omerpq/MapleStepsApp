// src/services/analytics.ts
// S5-02 — Opt-in analytics (screen + event). No 3P SDK; local buffer + console.
// Minimal surface: enable/disable, trackScreenView, trackEvent, getState, and a tiny hook.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const OPTIN_KEY = "ms.analytics.optin.v1";
const BUFFER_KEY = "ms.analytics.buffer.v1";
const META_KEY = "ms.analytics.meta.v1";

export type AnalyticsEvent =
  | { type: "screen"; name: string; params?: Record<string, any>; atISO: string }
  | { type: "event"; name: string; params?: Record<string, any>; atISO: string };

export type AnalyticsState = {
  optedIn: boolean;
  lastEvent?: AnalyticsEvent | null;
  bufferSize: number;
};

const MAX_BUFFER = 100;

async function readOptIn(): Promise<boolean> {
  return (await AsyncStorage.getItem(OPTIN_KEY)) === "1";
}

async function setOptIn(flag: boolean): Promise<void> {
  if (flag) await AsyncStorage.setItem(OPTIN_KEY, "1");
  else await AsyncStorage.removeItem(OPTIN_KEY);
}

async function pushToBuffer(ev: AnalyticsEvent): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(BUFFER_KEY);
    const arr: AnalyticsEvent[] = raw ? JSON.parse(raw) : [];
    arr.push(ev);
    if (arr.length > MAX_BUFFER) arr.splice(0, arr.length - MAX_BUFFER);
    await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(arr));
    await AsyncStorage.setItem(META_KEY, JSON.stringify({ lastEvent: ev }));
    return arr.length;
  } catch {
    return -1;
  }
}

async function getBufferSize(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(BUFFER_KEY);
    const arr: AnalyticsEvent[] = raw ? JSON.parse(raw) : [];
    return arr.length;
  } catch {
    return 0;
  }
}

async function readLastEvent(): Promise<AnalyticsEvent | null> {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw).lastEvent as AnalyticsEvent) : null;
  } catch {
    return null;
  }
}

/** Public API */

export async function enableAnalytics(): Promise<AnalyticsState> {
  await setOptIn(true);
  if (__DEV__) console.log("[Analytics] enabled");
  return getAnalyticsState();
}

export async function disableAnalytics(): Promise<AnalyticsState> {
  await setOptIn(false);
  if (__DEV__) console.log("[Analytics] disabled");
  return getAnalyticsState();
}

export async function getAnalyticsState(): Promise<AnalyticsState> {
  const optedIn = await readOptIn();
  const lastEvent = await readLastEvent();
  const bufferSize = await getBufferSize();
  return { optedIn, lastEvent, bufferSize };
}

export async function trackScreenView(name: string, params?: Record<string, any>) {
  const opted = await readOptIn();
  if (!opted) return;
  const ev: AnalyticsEvent = { type: "screen", name, params, atISO: new Date().toISOString() };
  if (__DEV__) console.log("[Analytics][screen]", ev.name, ev.params ?? {});
  await pushToBuffer(ev);
}

export async function trackEvent(name: string, params?: Record<string, any>) {
  const opted = await readOptIn();
  if (!opted) return;
  const ev: AnalyticsEvent = { type: "event", name, params, atISO: new Date().toISOString() };
  if (__DEV__) console.log("[Analytics][event]", ev.name, ev.params ?? {});
  await pushToBuffer(ev);
}

/** Tiny hook to read opt-in state reactively (for settings/dev UIs) */
export function useAnalyticsState(): AnalyticsState {
  const [st, setSt] = useState<AnalyticsState>({ optedIn: false, lastEvent: null, bufferSize: 0 });
  useEffect(() => {
    let alive = true;
    getAnalyticsState().then((s) => alive && setSt(s));
    return () => { alive = false; };
  }, []);
  return st;
}
