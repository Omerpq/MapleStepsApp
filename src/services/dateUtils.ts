// src/services/dateUtils.ts

/**
 * Pick a display date for the NOC badge.
 * Prefers cachedAt (epoch ms) then meta.last_checked (ISO string).
 * Returns local YYYY-MM-DD (avoids UTC off-by-one issues).
 */
export function pickDisplayTime(
  cachedAt: number | null,
  metaLast?: string
): string {
  const ts =
    typeof cachedAt === "number" && cachedAt > 0
      ? cachedAt
      : metaLast
      ? Date.parse(metaLast)
      : null;

  if (!ts || Number.isNaN(ts)) return "—";
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
