// src/utils/freshness.ts
import type { LoaderResult, Source } from "../services/updates";

// --- Labels ---
export const sourceTitle = (s?: Source | string) =>
  s === "remote" ? "Remote" : s === "cache" ? "Cache" : "Local";

export const syncQualifier = (meta?: any): "updated" | "validated" | undefined =>
  meta?.status === 200 ? "updated" : meta?.status === 304 ? "validated" : undefined;

// --- Timestamps ---
export const tsFrom = (cachedAt: number | null | undefined, meta?: any): number | null => {
  if (typeof cachedAt === "number") return cachedAt;
  const iso = meta?.last_checked;
  return iso ? Date.parse(iso) : null;
};

export const fmtHM = (ms?: number | null) =>
  typeof ms === "number"
    ? new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";

export const fmtDateLocal = (ms?: number | null) =>
  typeof ms === "number" ? new Date(ms).toLocaleDateString() : "";

export const fmtDateTimeLocal = (ms?: number | null) =>
  typeof ms === "number" ? new Date(ms).toLocaleString() : "";

// --- Lines for badges/notices ---
export function makeNotice(kindLabel: string, r: LoaderResult<any>) {
  const ts = tsFrom(r.cachedAt, r.meta);
  const when = fmtDateTimeLocal(ts) || "—";
  return `${kindLabel}: ${sourceTitle(r.source)} • Last synced ${when}`;
}

/** Full line including source label (good for Updates notices). */
export function makeMetaLine(
  label: "CRS" | "FSW" | undefined,
  source: Source,
  cachedAt: number | null,
  meta?: any
) {
  const parts: string[] = [];
  if (label) parts.push(label);
  parts.push(sourceTitle(source));
  const when = fmtHM(tsFrom(cachedAt, meta));
  if (when) parts.push(`fetched ${when}`);
  const qual = syncQualifier(meta);
  if (qual) parts.push(qual);
  return parts.join(" • ");
}

/** Compact line without repeating the source (good for RulesBadge under a colored chip). */
export function makeMetaLineCompact(
  label: "CRS" | "FSW",
  cachedAt: number | null,
  meta?: any
) {
  const parts: string[] = [];
  if (label) parts.push(label);
  const when = fmtHM(tsFrom(cachedAt, meta));
  parts.push(when ? `fetched ${when}` : "bundled");
  const qual = syncQualifier(meta);
  if (qual) parts.push(qual);
  return parts.join(" • ");
}

// --- URL host helper (shared) ---
export function hostOf(u?: string) {
  try {
    if (!u) return "—";
    return new URL(u).host;
  } catch {
    const s = String(u || "");
    return s.replace(/^https?:\/\/(www\.)?/i, "").split("/")[0] || "—";
  }
}
