// src/services/feedback.ts
// S5-03 — Help & Feedback: assemble diagnostics and submit via webhook (optional) or email fallback.

import { Platform, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAnalyticsState } from "./analytics";
import { RULES_CONFIG } from "./config";

/** Wire-in (optional): if you later add RULES_CONFIG.feedbackUrl, we'll POST JSON there. */
type MaybeUrl = string | undefined;

export type FeedbackCategory =
  | "bug"
  | "data-accuracy"
  | "feature-request"
  | "payment-subscription"
  | "other";

export type FeedbackForm = {
  category: FeedbackCategory;
  message: string;
  email?: string;
  includeDiagnostics?: boolean;
};

export type FeedbackDiagnostics = {
  platform: string;
  version?: string | null;
  background?: {
    optedIn?: boolean;
    lastRunISO?: string | null;
    lastResult?: any;
  };
  analytics?: {
    optedIn: boolean;
    bufferSize: number;
    lastUpdatedISO?: string | null;
  };
  rulesCache?: {
    rounds?: { cachedAt?: number | null; meta?: any } | null;
    fees?: { cachedAt?: number | null; meta?: any } | null;
  };
  nowISO: string;
};

// Internal keys we already use in S5-02/earlier sprints
const BG_OPT_KEY = "ms.background.opt_in.v1";
const BG_LAST_RUN = "ms.background.last_run_iso.v1";
const BG_LAST_RESULT = "ms.background.last_result.v1";

const ROUNDS_CACHE_KEY = "ms_rounds_cache_v2";
const FEES_CACHE_KEY = "ms_fees_cache_v1";

const ANALYTICS_META_KEY = "ms.analytics.meta.v1";

/** Read a JSON value from AsyncStorage safely. */
async function getJSON<T = any>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function collectDiagnostics(): Promise<FeedbackDiagnostics> {
  const analyticsState = await getAnalyticsState(); // { optedIn, bufferSize, lastUpdatedISO }
  const bgOpt = (await AsyncStorage.getItem(BG_OPT_KEY)) === "1";
  const bgLastRunISO = await AsyncStorage.getItem(BG_LAST_RUN);
  const bgLastResult = await getJSON(BG_LAST_RESULT);

  const rounds = await getJSON<{ cachedAt?: number; meta?: any }>(ROUNDS_CACHE_KEY);
  const fees = await getJSON<{ cachedAt?: number; meta?: any }>(FEES_CACHE_KEY);
  const analyticsMeta = await getJSON<{ lastUpdatedISO?: string }>(ANALYTICS_META_KEY);

  // App version (optional): read from expo-application if available; fall back to undefined
  let version: string | null = null;
  try {
    // Lazy import to avoid adding a hard dep if not present
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Application = require("expo-application");
    version =
      Application?.nativeApplicationVersion ??
      Application?.applicationVersion ??
      null;
  } catch {
    version = null;
  }

  return {
    platform: `${Platform.OS} ${Platform.Version ?? ""}`.trim(),
    version,
    background: {
      optedIn: bgOpt,
      lastRunISO: bgLastRunISO,
      lastResult: bgLastResult,
    },
    analytics: {
      optedIn: analyticsState.optedIn,
      bufferSize: analyticsState.bufferSize,
      lastUpdatedISO: analyticsMeta?.lastUpdatedISO ?? null,
    },
    rulesCache: {
      rounds: rounds ?? null,
      fees: fees ?? null,
    },
    nowISO: new Date().toISOString(),
  };
}

function encodeRFC3986(str: string) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16));
}

function asEmailBody(form: FeedbackForm, diags?: FeedbackDiagnostics): string {
  const lines: string[] = [
    `Category: ${form.category}`,
    form.email ? `Reporter email: ${form.email}` : `Reporter email: (not provided)`,
    "",
    "Message:",
    form.message,
  ];
  if (form.includeDiagnostics && diags) {
    lines.push(
      "",
      "— — — Diagnostics (auto-attached) — — —",
      `Platform: ${diags.platform}`,
      diags.version ? `App version: ${diags.version}` : `App version: (n/a)`,
      `Analytics: optedIn=${diags.analytics?.optedIn} bufferSize=${diags.analytics?.bufferSize} lastUpdated=${diags.analytics?.lastUpdatedISO ?? "(n/a)"}`,
      `Background: optedIn=${diags.background?.optedIn} lastRun=${diags.background?.lastRunISO ?? "(n/a)"}`,
      `Rounds cache: cachedAt=${diags.rulesCache?.rounds?.cachedAt ?? "(n/a)"} meta=${JSON.stringify(diags.rulesCache?.rounds?.meta ?? {})}`,
      `Fees cache: cachedAt=${diags.rulesCache?.fees?.cachedAt ?? "(n/a)"} meta=${JSON.stringify(diags.rulesCache?.fees?.meta ?? {})}`,
      `Now: ${diags.nowISO}`
    );
  }
  return lines.join("\n");
}

async function tryWebhook(webhookUrl: MaybeUrl, form: FeedbackForm, diags?: FeedbackDiagnostics) {
  if (!webhookUrl) return { ok: false as const, status: 0 };
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ form, diagnostics: diags }),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false as const, status: 0 };
  }
}

/** Submit feedback; prefers webhook if RULES_CONFIG.feedbackUrl exists; else falls back to mailto. */
export async function submitFeedback(form: FeedbackForm): Promise<{ ok: boolean; via: "webhook" | "email"; detail?: any }> {
  const diags = form.includeDiagnostics ? await collectDiagnostics() : undefined;

  // 1) Optional webhook
  const webhookUrl = (RULES_CONFIG as any)?.feedbackUrl as MaybeUrl;
  const webhook = await tryWebhook(webhookUrl, form, diags);
  if (webhook.ok) {
    return { ok: true, via: "webhook", detail: { status: webhook.status } };
  }

  // 2) Email fallback
  const to = (RULES_CONFIG as any)?.feedbackEmail || "support@maplesteps.app";
  const subject = `MapleSteps feedback — ${form.category}`;
  const body = asEmailBody(form, diags ?? undefined);
  const url = `mailto:${encodeRFC3986(to)}?subject=${encodeRFC3986(subject)}&body=${encodeRFC3986(body)}`;
  const can = await Linking.canOpenURL(url);
  if (can) {
    await Linking.openURL(url);
    return { ok: true, via: "email" };
  }
  return { ok: false, via: "email" };
}
