// src/services/payments.ts
// Pure-JS stub so the app can run without native IAP modules installed.
// Keeps the same API surface used by the app.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_STATE = 'ms.premium.state.v1';
type PremiumState = { isActive: boolean; updatedAt: string; purchases?: any[] };

function nowISO() { return new Date().toISOString(); }

// --- persisted state helpers ---
async function persist(state: PremiumState) {
  await AsyncStorage.setItem(KEY_STATE, JSON.stringify(state));
  return state;
}

export async function getPersistedState(): Promise<PremiumState> {
  const raw = await AsyncStorage.getItem(KEY_STATE);
  if (raw) return JSON.parse(raw);
  return { isActive: false, updatedAt: nowISO(), purchases: [] };
}

// --- IAP-like API (no-ops) ---
export async function initIAP() {
  // no native init — stub
  const s = await getPersistedState();
  if (!s.updatedAt) await persist({ ...s, updatedAt: nowISO() });
}

export function endIAP() {
  // no listeners to remove
}

export type Product = {
  productId: string;
  title: string;
  description?: string;
  localizedPrice?: string;
  price?: string;
};

// Return empty list so Paywall renders “No products configured”
export function getSubscriptionProducts(): Product[] {
  return [];
}

// Simulate a failed purchase (since we have no store)
export async function purchaseSubscription(_productId: string) {
  throw new Error('Purchases are disabled in this build.');
}

// “Restore” just returns current local flag
export async function restore(): Promise<PremiumState> {
  const s = await getPersistedState();
  return { ...s, updatedAt: nowISO() };
}

export async function isSubscribed(): Promise<boolean> {
  const s = await getPersistedState();
  return s.isActive;
}

// DEV helper to flip the local flag so you can test premium gates
export async function __devSetSubscribed(value: boolean) {
  return persist({ isActive: value, updatedAt: nowISO(), purchases: [] });
}
