// src/services/eeProfile.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking } from "react-native";

// Always show explicit "CAD" instead of a $ symbol.
const fmtCAD = (n: number) =>
  `CAD ${Number(n).toLocaleString("en-CA", { maximumFractionDigits: 0 })}`;


// Always format as Canadian standard YYYY-MM-DD to match the Planner
const fmtDate = (isoOrStr: string) => {
  try {
    const d = new Date(isoOrStr);
    if (isNaN(d.getTime())) return isoOrStr;
    return d.toLocaleDateString("en-CA"); // -> YYYY-MM-DD
  } catch {
    return isoOrStr;
  }
};


/** Types */
export type EESeverity = "error" | "warn" | "info" | "ok";
export type EEFix =
  | { type: "navigate"; route: string; params?: any }
  | { type: "openUrl"; url: string }
  | { type: "none" };
export type EECheck = {
  id: string;
  title: string;
  details?: string;
  severity: EESeverity;
  status: "issue" | "ok" | "unknown";
  fix: EEFix;
  evidence?: string[];
};

/** Keys (from hand-off) */
const K_ECA = "ms.eca.state.v1";
const K_LANG = "ms.language.state.v1";
const K_POF_STATE = "ms.pof.state.v1";
const K_POF_THRESH_RULES = "ms.pof.thresholds.cache.v1";
const K_POF_THRESH_LIVE = "ms.pof.live.cache.v1";
const K_NOC_CACHE = "ms_noc_cache_v1";
const K_PAY = "ms.payments.state.v1";

async function getJSON<T = any>(key: string): Promise<T | null> {
  try { const raw = await AsyncStorage.getItem(key); return raw ? JSON.parse(raw) as T : null; }
  catch { return null; }
}
function hasValue(v: any): boolean { return !(v == null || (typeof v === "string" && v.trim?.() === "")); }

/* ---------- ECA ---------- */
function pickEcaBody(eca: any): string | undefined {
  return (
    eca?.selectedBodyId ?? // your actual shape
    eca?.selectedBody ??
    eca?.body ??
    eca?.selected?.body ??
    eca?.selected?.id ??
    eca?.chosenBody ??
    eca?.provider
  );
}

/* ---------- Language ---------- */
function asISOorString(v: any): string | undefined {
  if (!hasValue(v)) return undefined;
  const s = String(v);
  return s;
}
function pickLanguageTestDate(lang: any): string | undefined {
  if (!lang) return undefined;
  const cands = [
    lang.testDateISO,           // your actual shape
    lang.testDate,
    lang.plan?.testDate,
    lang.selected?.testDate,
    lang.test?.date,
    lang.date,
    lang.planner?.date,
    lang.bookedDate,
    lang.targetDate,
    lang.plan?.dateISO,
    lang.plan?.targetDate,
    lang?.result?.testDate,
  ];
  for (const c of cands) {
    const got = asISOorString(c);
    if (got) return got;
  }
  // If a weekly plan exists, consider it planned (soft OK)
  if (Array.isArray(lang?.plan) && lang.plan.length > 0) return "planned";
  if (Array.isArray(lang?.plan?.weeks) && lang.plan.weeks.length > 0) return "planned";
  return undefined;
}

/* ---------- NOC ---------- */
type NocFreshness = "none" | "stale" | "recent" | "fresh";

/** Normalize ms_noc_cache_v1 and compute freshness.
 * Supports:
 *  - Duties cache: { [code]: { fetchedAtISO?, cachedAt?, fetchedAt?, fetched_at?, items?[], duties?[], data?.items?[] } }
 *  - Single-entry variants
 *  - Array of entries
 *  - Taxonomy cache: { savedAt: number, meta?: { last_checked?: string }, data: [{code,title}...] }
 */
function getNocFreshness(nocCache: any): { tier: NocFreshness; newestISO?: string } {
  if (!nocCache) return { tier: "none" };

  // Special-case: taxonomy cache shape (your pasted JSON)
  if (
    typeof nocCache === "object" &&
    Array.isArray((nocCache as any).data) &&
    (typeof (nocCache as any).savedAt === "number" || typeof (nocCache as any)?.meta?.last_checked === "string")
  ) {
    const savedAtMs = typeof (nocCache as any).savedAt === "number" ? Number((nocCache as any).savedAt) : NaN;
    const lastCheckedStr = (nocCache as any)?.meta?.last_checked as string | undefined; // e.g., "2025-09-19"
    const lastCheckedMs = lastCheckedStr ? new Date(lastCheckedStr).getTime() : NaN;

    const t = Number.isFinite(savedAtMs) ? savedAtMs : (Number.isFinite(lastCheckedMs) ? lastCheckedMs : NaN);
    if (!Number.isFinite(t)) return { tier: "none" };

    const now = Date.now();
    const age = now - t;
    const DAY = 24 * 60 * 60 * 1000;
    if (age <= 1 * DAY) return { tier: "fresh", newestISO: new Date(t).toISOString() };
    if (age <= 30 * DAY) return { tier: "recent", newestISO: new Date(t).toISOString() };
    return { tier: "stale", newestISO: new Date(t).toISOString() };
  }

  // Generic normalization
  let entries: any[] = [];
  if (Array.isArray(nocCache)) {
    entries = nocCache;
  } else if (typeof nocCache === "object") {
    const vals = Object.values(nocCache);
    entries = vals.length ? (vals as any[]) : [nocCache];
  } else {
    return { tier: "none" };
  }

  let newestMs: number | undefined;
  let newestISO: string | undefined;
  let anyFetch = false;

  for (const e of entries) {
    if (!e || typeof e !== "object") continue;

    // items may sit under various keys; treat presence of a fetch timestamp as a fetch even if items omitted
    const iso: string | undefined =
      (e as any).fetchedAtISO ||
      (e as any).cachedAt ||
      (e as any).fetchedAt ||
      (e as any).fetched_at ||
      (e as any)?.meta?.fetchedAtISO ||
      (e as any)?.fetched?.iso;

    const numTs: number | undefined = typeof (e as any).savedAt === "number" ? Number((e as any).savedAt) : undefined;

    let t = NaN;
    if (iso) t = new Date(iso).getTime();
    if (!Number.isFinite(t) && Number.isFinite(numTs!)) t = numTs as number;

    if (!Number.isFinite(t)) continue;

    anyFetch = true;
    if (newestMs == null || t > newestMs) {
      newestMs = t;
      newestISO = new Date(t).toISOString();
    }
  }

  if (!anyFetch || !Number.isFinite(newestMs!)) return { tier: "none" };

  const now = Date.now();
  const age = now - (newestMs as number);
  const DAY = 24 * 60 * 60 * 1000;

  if (age <= 1 * DAY) return { tier: "fresh", newestISO };
  if (age <= 30 * DAY) return { tier: "recent", newestISO };
  return { tier: "stale", newestISO };
}



/* ---------- PoF ---------- */
function pickFamilySize(obj: any): number | undefined {
  const cands = [
    obj?.familySize,
    obj?.householdSize,
    obj?.household?.size,
    obj?.meta?.familySize,
    obj?.profile?.familySize,
  ].filter((n) => Number.isFinite(Number(n)));
  const n = cands.length ? Number(cands[0]) : undefined;
  return n && n >= 1 && n <= 10 ? n : undefined;
}

/** Convert { data.thresholds: [{family_size, amount_cad}...] } to a map. */
function thresholdsArrayToMap(th: any): Record<string, number> | undefined {
  const arr = th?.data?.thresholds ?? th?.thresholds ?? th?.data?.byFamilySize;
  if (Array.isArray(arr)) {
    const map: Record<string, number> = {};
    for (const row of arr) {
      const k = String(row.family_size ?? row.familySize ?? row.size ?? row.family);
      const v = Number(row.amount_cad ?? row.amount ?? row.value);
      if (k && Number.isFinite(v)) map[k] = v;
    }
    return Object.keys(map).length ? map : undefined;
  }
  return undefined;
}

function pickThresholdTable(th: any): Record<string, number> | undefined {
  if (!th) return undefined;
  // Prefer your array shape first
  const fromArray = thresholdsArrayToMap(th);
  if (fromArray) return fromArray;

  // Then the generic shapes
  const d = th.data ?? th;
  const map =
    d.byFamilySize ??
    d.amounts ??
    d.table ??
    th.byFamilySize ??
    th.amounts ??
    th.table ??
    d.thresholds?.byFamilySize ??
    th.thresholds?.byFamilySize;
  if (map && typeof map === "object") return map as Record<string, number>;

  // Flat fallbacks
  const flat =
    (typeof d.amount === "number" ? d.amount : undefined) ??
    (typeof d.required === "number" ? d.required : undefined) ??
    (typeof d.value === "number" ? d.value : undefined) ??
    (typeof th.thresholds?.required === "number" ? th.thresholds.required : undefined);
  if (typeof flat === "number") return { "1": flat };

  return undefined;
}

function pickRequiredAmount(thresholds: any, familySize?: number): number | undefined {
  const table = pickThresholdTable(thresholds);
  if (!table) return undefined;
  if (familySize && table[String(familySize)] != null) {
    const v: any = table[String(familySize)];
    return typeof v === "number" ? v : Number(v);
  }
  const firstKey = Object.keys(table)[0];
  const firstVal = firstKey ? table[firstKey] : undefined;
  const n = typeof firstVal === "number" ? firstVal : Number(firstVal);
  return Number.isFinite(n) ? n : undefined;
}

/** Compute PoF stats from months[]: latest, min over last 6 months, and count present. */
function calcEligibleStatsFromMonths(pofState: any): { latest?: number; min6?: number; count: number } {
  const months = Array.isArray(pofState?.months) ? pofState.months : [];
  if (months.length === 0) return { latest: undefined, min6: undefined, count: 0 };

  // Sort yyyyMm ascending, then take last 6 for the IRCC lookback window
  const sortedKeys = months
    .map((m: any) => String(m?.yyyyMm || ""))
    .filter((s: string) => /^\d{4}-\d{2}$/.test(s))
    .sort(); // lexicographic works for YYYY-MM

  const windowKeys = sortedKeys.slice(-6); // last 6 keys (or fewer if not enough)
  const windowMonths = months.filter((m: any) => windowKeys.includes(String(m?.yyyyMm)));

  const sumMonth = (m: any) =>
    Array.isArray(m?.entries)
      ? m.entries.reduce((sum: number, e: any) => sum + Number(e?.amount_cad ?? 0), 0)
      : 0;

  // latest
  const latestKey = sortedKeys[sortedKeys.length - 1];
  const latestMonth = months.find((m: any) => String(m?.yyyyMm) === latestKey);
  const latest = latestMonth ? sumMonth(latestMonth) : undefined;

  // min across the 6-month window
  const totals = windowMonths.map(sumMonth).filter((n: number) => Number.isFinite(n));
  const min6 = totals.length ? Math.min(...totals) : undefined;

  return { latest, min6, count: windowMonths.length };
}

// NOC Verify persisted state (selection/notes)
const K_NOC_VERIFY = "ms.noc.verify.state.v1";

function findNocTitleByCode(nocTaxonomy: any, code?: string): string | undefined {
  if (!code) return undefined;
  const arr = Array.isArray(nocTaxonomy?.data) ? nocTaxonomy.data : [];
  const row = arr.find((r: any) => String(r?.code) === String(code));
  return row?.title;
}

function pickSelectedNocCode(nocVerifyState: any): string | undefined {
  // tolerate multiple shapes
  const cands = [
    nocVerifyState?.selectedNocCode,
    nocVerifyState?.selected?.nocCode,
    nocVerifyState?.selected?.code,
    nocVerifyState?.noc?.code,
    nocVerifyState?.selection?.code,
    nocVerifyState?.current?.code,
  ];
  for (const c of cands) {
    if (c != null && String(c).trim() !== "") return String(c);
  }
  return undefined;
}


/** Main API */
export async function getEEChecklist(): Promise<EECheck[]> {
    const [eca, lang, pofState, pofLive, pofRules, nocCache, payState, nocVerifyState] = await Promise.all([
  getJSON<any>(K_ECA),
  getJSON<any>(K_LANG),
  getJSON<any>(K_POF_STATE),
  getJSON<any>(K_POF_THRESH_LIVE),
  getJSON<any>(K_POF_THRESH_RULES),
  getJSON<any>(K_NOC_CACHE),
  getJSON<any>(K_PAY),
  getJSON<any>(K_NOC_VERIFY), // ← added
]);



  const isPremium = !!payState?.isActive;

  // ECA
  const ecaBody = pickEcaBody(eca);
  const ecaSelected = hasValue(ecaBody);
  const ecaCheck: EECheck = {
    id: "eca_selected",
    title: "ECA body selected",
    details: ecaSelected ? `Selected: ${String(ecaBody).toUpperCase?.() || String(ecaBody)}` : "Pick your ECA body (WES/ICES/IQAS/ICAS/CES/…)",
    severity: ecaSelected ? "ok" : "error",
    status: ecaSelected ? "ok" : "issue",
    fix: ecaSelected ? { type: "none" } : { type: "navigate", route: "ECAWizard" },
  };

  // Language
const testDate = pickLanguageTestDate(lang);
const hasDate = !!testDate && testDate !== "planned";

const langDetails =
  testDate === "planned"
    ? "Plan exists but no test date — pick a date in Language Planner"
    : hasDate
      ? `Test date: ${fmtDate(String(testDate))}`
      : "Plan and book IELTS/CELPIP/TEF/TCF";

const langCheck: EECheck = {
  id: "language_booked",
  title: "Language test planned/booked",
  details: langDetails,
  severity: hasDate ? "ok" : "warn",
  status: hasDate ? "ok" : "issue",
  fix: hasDate ? { type: "none" } : { type: "navigate", route: "LanguagePlanner" },
};

// Build "code · title" label if a NOC is selected in the mini-wizard
const selectedNocCode = pickSelectedNocCode(nocVerifyState);
const selectedNocTitle = findNocTitleByCode(nocCache, selectedNocCode); // nocCache is the taxonomy you showed
const nocLabel = selectedNocCode
  ? `${selectedNocCode} · ${selectedNocTitle ?? "Selected occupation"}`
  : undefined;

// NOC — tiered freshness for better UX over long prep periods
const nocFresh = getNocFreshness(nocCache);
let nocSeverity: EESeverity;
let nocStatus: EECheck["status"];
let nocDetails: string;

if (nocFresh.tier === "fresh") {
  nocSeverity = "ok";
  nocStatus = "ok";
  const when = nocFresh.newestISO ? new Date(nocFresh.newestISO).toLocaleString("en-CA") : "recently";
  nocDetails = `${nocLabel ? `Duty verified: ${nocLabel} — ` : ""}Fetched in last 24h (${when})`;
} else if (nocFresh.tier === "recent") {
  nocSeverity = "info";
  nocStatus = "issue";
  const when = nocFresh.newestISO ? new Date(nocFresh.newestISO).toLocaleDateString("en-CA") : "recently";
  nocDetails = `${nocLabel ? `Duty verified: ${nocLabel} — ` : ""}Fetched within ~30 days (${when}) — refresh before filing`;
} else if (nocFresh.tier === "stale") {
  nocSeverity = "warn";
  nocStatus = "issue";
  const when = nocFresh.newestISO ? new Date(nocFresh.newestISO).toLocaleDateString("en-CA") : "unknown date";
  nocDetails = `${nocLabel ? `Duty verified: ${nocLabel} — ` : ""}Stale (${when}) — open NOC Verification and tap “Refresh from ESDC”`;
} else {
  nocSeverity = "warn";
  nocStatus = "issue";
  nocDetails = `${nocLabel ? `Duty verified: ${nocLabel} — ` : ""}No recent fetch — open NOC Verification and tap “Refresh from ESDC”`;
}


const nocCheck: EECheck = {
  id: "noc_verified",
  title: "NOC duties verified against ESDC/Job Bank",
  details: nocDetails,
  severity: nocSeverity,
  status: nocStatus,
  fix: nocSeverity === "ok" ? { type: "none" } : { type: "navigate", route: "NOCVerify" },
};


  // PoF (prefer IRCC Live; fallback Rules)
const thresholds = pofLive ?? pofRules;
const familySize = pickFamilySize(pofState) ?? 1;
const required = pickRequiredAmount(thresholds, familySize);

// Compute 6-month stats from tracker months (align with IRCC)
const { latest, min6, count } = calcEligibleStatsFromMonths(pofState);

let pofSeverity: EESeverity = "info";
let pofStatus: EECheck["status"] = "unknown";
let pofDetails = "Open Proof of Funds to update your tracker and thresholds (IRCC live refresh available).";

if (typeof required !== "number") {
  pofDetails = "Required amount unavailable — in PoF, tap “Refresh from IRCC” to fetch live thresholds.";
  pofSeverity = "info";
  pofStatus = "issue";
} else if (!count || (typeof min6 !== "number" && typeof latest !== "number")) {
  pofDetails = "Add at least one month of eligible funds in PoF.";
  pofSeverity = "info";
  pofStatus = "issue";
} else if (count < 6 && typeof min6 === "number") {
  // Not enough months: warn, compare min-so-far to required
  const okSoFar = min6 >= required;
  pofDetails = `Only ${count}/6 months entered — minimum so far: ${fmtCAD(min6)} vs Required (family size ${familySize}): ${fmtCAD(required)}`;
  pofSeverity = okSoFar ? "warn" : "error";
  pofStatus = "issue";
} else if (typeof min6 === "number") {
  // Full window: compare 6-month minimum to required
  const ok = min6 >= required;
  pofDetails = `6-month minimum: ${fmtCAD(min6)} vs Required (family size ${familySize}): ${fmtCAD(required)}`;
  pofSeverity = ok ? "ok" : "error";
  pofStatus = ok ? "ok" : "issue";
} else {
  // Fallback: compare latest if min6 missing for some reason
  const ok = (latest ?? 0) >= required;
  pofDetails = `Latest month: ${fmtCAD(latest ?? 0)} vs Required (family size ${familySize}): ${fmtCAD(required)}`;
  pofSeverity = ok ? "ok" : "error";
  pofStatus = ok ? "ok" : "issue";
}

const pofCheck: EECheck = {
  id: "pof_adequate",
  title: "Proof of Funds meets IRCC threshold",
  details: pofDetails,
  severity: pofSeverity,
  status: pofStatus,
  fix: pofStatus === "ok" ? { type: "none" } : { type: "navigate", route: "ProofOfFunds" },
};


  // Premium
  const premiumCheck: EECheck = {
    id: "premium_ready",
    title: "Premium features available (CRS optimizer, planner, PNP mapper)",
    details: isPremium
      ? "Premium is active — you can use all guided tools for a smoother EE profile."
      : "Consider activating Premium to unlock guided steps and reduce mistakes.",
    severity: isPremium ? "ok" : "info",
    status: isPremium ? "ok" : "issue",
    fix: isPremium ? { type: "none" } : { type: "navigate", route: "Paywall", params: { from: "ee_profile_checklist" } },
  };

  // IRCC guide link
  const irccGuideCheck: EECheck = {
    id: "ircc_profile_prep",
    title: "Have these ready for your EE profile",
    details:
      "Passport details, personal history (10 years, no gaps), addresses, work history & reference letters, ECA number, language TRF, family details, travel history.",
    severity: "info",
    status: "ok",
    fix: { type: "openUrl", url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents.html" },
  };

  // Sort: error → warn → info → ok
  const checks = [ecaCheck, langCheck, nocCheck, pofCheck, premiumCheck, irccGuideCheck];
  const order = (s: EESeverity) => (s === "error" ? 0 : s === "warn" ? 1 : s === "ok" ? 2 : 3);

  checks.sort((a, b) => (order(a.severity) - order(b.severity)) || a.id.localeCompare(b.id));

  return checks;
}

/** DEV snapshot (unchanged API) */
// === REPLACE FROM HERE (start at: export async function getEEDebugSnapshot ...) ===
export async function getEEDebugSnapshot() {
  const [eca, lang, pofState, pofLive, pofRules] = await Promise.all([
    getJSON<any>(K_ECA),
    getJSON<any>(K_LANG),
    getJSON<any>(K_POF_STATE),
    getJSON<any>(K_POF_THRESH_LIVE),
    getJSON<any>(K_POF_THRESH_RULES),
  ]);

  const ecaBody = pickEcaBody(eca);
  const langDate = pickLanguageTestDate(lang);
  const familySize = pickFamilySize(pofState) ?? 1;
  const requiredLive = pickRequiredAmount(pofLive, familySize);
  const requiredRules = pickRequiredAmount(pofRules, familySize);

  // New stats (we removed pickEligibleLatest)
  const { latest, min6, count } = calcEligibleStatsFromMonths(pofState);

  return {
    raw: { eca, lang, pofState, pofLive, pofRules },
    derived: {
      ecaBody,
      langDate,
      familySize,
      requiredLive,
      requiredRules,
      eligibleLatest: latest,
      eligibleMin6: min6,
      monthsCount: count,
      // convenience field if you want one number:
      eligible: typeof min6 === "number" ? min6 : latest,
    },
  };
}

export async function applyFix(
  fix: EEFix,
  navigate?: (route: string, params?: any) => void
) {
  if (!fix) return;
  if (fix.type === "navigate" && navigate) {
    navigate(fix.route, fix.params);
    return;
  }
  if (fix.type === "openUrl") {
    await Linking.openURL(fix.url);
    return;
  }
  // type === "none" → nothing to do
}