// src/screens/UpdatesScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Linking,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { colors } from "../theme/colors";
import {
  loadRounds,
  loadFees,
  pickDisplayTime,
  migrateUpdatesCachesOnce,
  type LoaderResult,
  type Round as RoundType,
  type Fee,
  isCategoryDraw,
} from "../services/updates";
import { loadNoc, loadNocCategories } from "../services/noc";
import { loadNocManifest, type NocManifest } from "../services/nocRules";
// S5-02 — Background refresh controls
import {
  enableBackgroundRefresh,
  disableBackgroundRefresh,
  runBackgroundRefreshNow,
  getBackgroundState,
  type BackgroundOptState,
} from "../services/background";

// S5-02 — Analytics controls
import {
  enableAnalytics,
  disableAnalytics,
  getAnalyticsState,
  trackEvent,
  type AnalyticsState,
} from "../services/analytics";


import {
  primeCrsParams,
  getCrsSource,
  getCrsCachedAt,
} from "../services/crs";
import {
  primeFswParams,
  getFswSource,
  getFswCachedAt,
} from "../services/fsw67";

import { RULES_CONFIG } from "../services/config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sourceTitle, makeNotice, syncQualifier, tsFrom, fmtDateTimeLocal } from "../utils/freshness";

if (__DEV__) {
  console.log("UPDATES_URLS", RULES_CONFIG.roundsUrl, RULES_CONFIG.feesUrl);
}

type Round = RoundType;

const openUrl = async (u?: string) => {
  if (!u) return;
  try {
    const ok = await Linking.canOpenURL(u);
    if (ok) await Linking.openURL(u);
    else if (__DEV__) console.warn("Cannot open URL:", u);
  } catch (e) {
    if (__DEV__) console.warn("Open URL failed:", u, e);
  }
};

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const syncLabel = (meta?: any) =>
  meta?.status === 200 ? "updated" :
  meta?.status === 304 ? "validated" : undefined;

const formatCad = (v: number | string | undefined) => {
  const n = typeof v === "number" ? v : Number(v);
  if (isNaN(n)) return String(v ?? "—");
  return `CA$ ${n.toLocaleString()}`;
};

export default function UpdatesScreen() {
  // Rounds
  const [rounds, setRounds] = useState<Round[]>([]);
  const [roundsSrc, setRoundsSrc] = useState<"remote"|"cache"|"local">("local");
  const [roundsNotice, setRoundsNotice] = useState<string | null>(null);
  const [roundsCachedAt, setRoundsCachedAt] = useState<number | null>(null);
  const [roundsMeta, setRoundsMeta] = useState<any | null>(null);

  // Fees
  const [feesList, setFeesList] = useState<any[]>([]);
  const [feesMeta, setFeesMeta] = useState<any | null>(null);
  const [feesSrc, setFeesSrc] = useState<"remote"|"cache"|"local">("local");
  const [feesCachedAt, setFeesCachedAt] = useState<number | null>(null);
  const [feesNotice, setFeesNotice] = useState<string | null>(null);
  // S5-02 — Background refresh local state
const [bg, setBg] = useState<BackgroundOptState | null>(null);
const [bgBusy, setBgBusy] = useState(false);

// S5-02 — Analytics local state
const [an, setAn] = useState<AnalyticsState | null>(null);
const [anBusy, setAnBusy] = useState(false);



    // NOC (rules repo) manifest
const [nocManifest, setNocManifest] = useState<NocManifest | null>(null);
const [nocMeta, setNocMeta] = useState<any | null>(null);
const [nocSrc, setNocSrc] = useState<"remote" | "cache" | "local">("local");
const [nocCachedAt, setNocCachedAt] = useState<number | null>(null);

  // Refreshing
  const [refreshing, setRefreshing] = useState(false);

  function applyRounds(r: LoaderResult<Round[]>) {
    setRounds(r.data);
    setRoundsSrc(r.source);
    setRoundsMeta(r.meta || null);
    setRoundsCachedAt(tsFrom(r.cachedAt, r.meta));
    setRoundsNotice(makeNotice("Express Entry", r));
  }

  function applyFees(f: LoaderResult<Fee[]>) {
    setFeesList(f.data);
    setFeesMeta(f.meta || null);
    setFeesSrc(f.source);
    setFeesCachedAt(tsFrom(f.cachedAt, f.meta));
    setFeesNotice(makeNotice("Fees", f));
  }
  function applyNoc(n: LoaderResult<NocManifest>) {
  setNocManifest(n.data);
  setNocSrc(n.source);
  setNocMeta(n.meta || null);
  setNocCachedAt(tsFrom(n.cachedAt, n.meta));
}

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
  const [rRes, fRes, nRes] = await Promise.allSettled([
    loadRounds(),
    loadFees(),
    loadNocManifest(),
  ]);

  if (rRes.status === "fulfilled") applyRounds(rRes.value as any);
  else { try { applyRounds(await loadRounds() as any); } catch {} }

  if (fRes.status === "fulfilled") applyFees(fRes.value as any);
  else { try { applyFees(await loadFees() as any); } catch {} }

  if (nRes.status === "fulfilled") applyNoc(nRes.value as any);
  else { try { applyNoc(await loadNocManifest() as any); } catch {} }
} catch (e) {
  if (__DEV__) console.warn("REFRESH_ERROR", e);} finally {
    setRefreshing(false); // ← add this back
  }
};

  // DEV-ONLY: refresh all rule data and report success/failure
  const refreshAllDev = async () => {
    if (!__DEV__) return;
    if (refreshing) return;
    setRefreshing(true);

    const lines: string[] = [];
    let ok = 0, total = 0;
    const add = (line: string) => lines.push(`• ${line}`);
    const run = async <T,>(name: string, fn: () => Promise<T>, fmt?: (x: T) => string) => {
      total++;
      try {
        const res = await fn();
        const extra = fmt ? ` — ${fmt(res)}` : "";
        add(`${name}: ok${extra}`);
        ok++;
      } catch (e: any) {
        add(`${name}: failed (${e?.message || "error"})`);
      }
    };

    await run("Rounds", async () => {
      const r = await loadRounds();
      applyRounds(r);
      return r;
    }, (r: any) => `${sourceTitle(r.source)}${syncQualifier(r.meta) ? ` • ${syncQualifier(r.meta)}` : ""}`);

    await run("Fees", async () => {
      const f = await loadFees();
      applyFees(f);
      return f;
    }, (r: any) => `${sourceTitle(r.source)}${syncQualifier(r.meta) ? ` • ${syncQualifier(r.meta)}` : ""}`);

    await run("NOC", () => loadNoc(), (r: any) => sourceTitle(r.source));
    await run("Categories", () => loadNocCategories(), (r: any) => sourceTitle(r.source));

    await run("CRS params", async () => { await primeCrsParams(); return { s: getCrsSource(), t: getCrsCachedAt() }; },
      (r: any) => sourceTitle(r.s));

    await run("FSW-67 params", async () => { await primeFswParams(); return { s: getFswSource(), t: getFswCachedAt() }; },
      (r: any) => sourceTitle(r.s));

    setRefreshing(false);
    Alert.alert("Refresh all", `${ok}/${total} succeeded\n\n${lines.join("\n")}`);
  };
// --- S5-02: Background refresh handlers (DEV) ---
const onBgOptIn = async () => {
  if (bgBusy) return;
  setBgBusy(true);
  try {
    const s = await enableBackgroundRefresh({ minimumInterval: 3600, startOnBoot: true });
    setBg(s);
    if (__DEV__) console.log("[BG] enabled", s);
  } finally {
    setBgBusy(false);
  }
};

const onBgOptOut = async () => {
  if (bgBusy) return;
  setBgBusy(true);
  try {
    const s = await disableBackgroundRefresh();
    setBg(s);
    if (__DEV__) console.log("[BG] disabled", s);
  } finally {
    setBgBusy(false);
  }
};

const onBgRunNow = async () => {
  if (bgBusy) return;
  setBgBusy(true);
  try {
    const r = await runBackgroundRefreshNow();
    const s = await getBackgroundState();
    setBg(s);
    Alert.alert(
      "Background refresh (manual)",
      r === 2 ? "New data" : r === 1 ? "No new data" : "Failed"
    );
  } finally {
    setBgBusy(false);
  }
};

const onBgShowState = async () => {
  try {
    const s = await getBackgroundState();
    setBg(s);
    const lines = [
      `optedIn: ${s.optedIn}`,
      `registered: ${s.isRegistered}`,
      `status: ${s.status}`,
      `lastRun: ${s.lastRunISO ?? "—"}`,
      s.lastResult ? `lastResult: ${JSON.stringify(s.lastResult)}` : `lastResult: —`,
    ];
    Alert.alert("Background state", lines.join("\n"));
  } catch {}
};
// --- end S5-02 ---
// --- S5-02: Analytics handlers (DEV) ---
const onAnEnable = async () => {
  if (anBusy) return;
  setAnBusy(true);
  try {
    const s = await enableAnalytics();
    setAn(s);
    if (__DEV__) console.log("[AN] enabled", s);
  } finally {
    setAnBusy(false);
  }
};

const onAnDisable = async () => {
  if (anBusy) return;
  setAnBusy(true);
  try {
    const s = await disableAnalytics();
    setAn(s);
    if (__DEV__) console.log("[AN] disabled", s);
  } finally {
    setAnBusy(false);
  }
};

const onAnShowState = async () => {
  try {
    const s = await getAnalyticsState();
    setAn(s);
    const lines = [
      `optedIn: ${s.optedIn}`,
      s.lastEvent ? `lastEvent: ${s.lastEvent.type}:${s.lastEvent.name}` : "lastEvent: —",
      `bufferSize: ${s.bufferSize}`,
    ];
    Alert.alert("Analytics state", lines.join("\n"));
  } catch {}
};

// Optional: fire a test event (uses opt-in)
const onAnFireTest = async () => {
  await trackEvent("updates_dev_test", { when: new Date().toISOString() });
  const s = await getAnalyticsState();
  setAn(s);
  Alert.alert("Analytics", "Test event tracked (if opted-in).");
};
// --- end S5-02 ---

  useEffect(() => {
    (async () => {
      await migrateUpdatesCachesOnce();
      try {
  const [r, f, n] = await Promise.all([
    loadRounds(),
    loadFees(),
    loadNocManifest(),
  ]);
  applyRounds(r as any);
  applyFees(f as any);
  applyNoc(n as any);
} catch {
  try { applyRounds(await loadRounds() as any); } catch {}
  try { applyFees(await loadFees() as any); } catch {}
  try { applyNoc(await loadNocManifest() as any); } catch {}
}

    })();
  }, []);
// S5-02 — Load current background state on mount
useEffect(() => {
  getBackgroundState().then(setBg).catch(() => {});
}, []);
// S5-02 — Load current analytics state on mount
useEffect(() => {
  getAnalyticsState().then(setAn).catch(() => {});
}, []);

  const latest = rounds && rounds.length ? rounds[0] : null;
  const showCategoryHint = isCategoryDraw(latest?.category);

  const clearCache = async () => {
    await AsyncStorage.removeItem("ms_rounds_cache_v2");
    await AsyncStorage.removeItem("ms_fees_cache_v1");
    await refresh();
  };

  const clearIRCCCache = async () => {
    await AsyncStorage.removeItem("ms_rounds_cache_v2");
    await AsyncStorage.removeItem("ms_fees_cache_v1");
    console.log("IRCC cache cleared");
  };

  const clearNocCache = async () => {
  await AsyncStorage.removeItem("ms_noc_manifest_v1");
  console.log("NOC manifest cache cleared");
};

  const logCache = async () => {
  

    if (!__DEV__) return;
    const [r, f] = await Promise.all([
      AsyncStorage.getItem("ms_rounds_cache_v2"),
      AsyncStorage.getItem("ms_fees_cache_v1"),
    ]);
    console.log(
      "CACHE_DEBUG rounds:", r ? "present" : "missing",
      "fees:",             f ? "present" : "missing"
    );
    try {
      const rr = r ? JSON.parse(r) : null; // { savedAt, meta, data }
      const ff = f ? JSON.parse(f) : null;
      if (rr) console.log("CACHE_DEBUG rounds.savedAt:", rr.savedAt, "last_checked:", rr.meta?.last_checked);
      if (ff) console.log("CACHE_DEBUG  fees.savedAt:", ff.savedAt, "last_checked:", ff.meta?.last_checked);
    } catch (e) {
      console.warn("CACHE_DEBUG parse error:", e);
    }
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
        <TouchableOpacity
          onPress={refresh}
          disabled={refreshing}
          accessibilityState={{ disabled: refreshing }}
          style={[styles.refreshBtn, refreshing && { opacity: 0.5 }]}
        >
          <Text style={styles.refreshText}>
            {refreshing ? "Refreshing…" : "Check for updates ↻"}
          </Text>
        </TouchableOpacity>

        {__DEV__ && (
  <View style={{ flexDirection: "row", marginLeft: 8, gap: 8 }}>
    {/* BG panel */}
    <View>
      <TouchableOpacity
        onPress={onBgOptIn}
        disabled={bgBusy}
        style={[styles.refreshBtn, bgBusy && { opacity: 0.6 }]}
      >
        <Text style={styles.refreshText}>BG: Opt-in</Text>
      </TouchableOpacity>
<TouchableOpacity
  onPress={onBgShowState}
  style={[styles.refreshBtn, { marginTop: 6 }]}
>
  <Text style={styles.refreshText}>BG: Show state</Text>
</TouchableOpacity>

      <TouchableOpacity
        onPress={onBgOptOut}
        disabled={bgBusy}
        style={[styles.refreshBtn, bgBusy && { opacity: 0.6, marginTop: 6 }]}
      >
        <Text style={styles.refreshText}>BG: Opt-out</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onBgRunNow}
        disabled={bgBusy}
        style={[styles.refreshBtn, bgBusy && { opacity: 0.6 }, { marginTop: 6 }]}
      >
        <Text style={styles.refreshText}>BG: Run now</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onBgShowState}
        style={[styles.refreshBtn, { marginTop: 6 }]}
      >
        <Text style={styles.refreshText}>
          BG: {bg?.optedIn ? "ON" : "OFF"} · {bg?.isRegistered ? "Reg" : "NoReg"}
        </Text>
      </TouchableOpacity>
    </View>

    {/* AN panel */}
    <View>
      <TouchableOpacity
        onPress={onAnEnable}
        disabled={anBusy}
        style={[styles.refreshBtn, anBusy && { opacity: 0.6 }]}
      >
        <Text style={styles.refreshText}>AN: Enable</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onAnDisable}
        disabled={anBusy}
        style={[styles.refreshBtn, anBusy && { opacity: 0.6, marginTop: 6 }]}
      >
        <Text style={styles.refreshText}>AN: Disable</Text>
      </TouchableOpacity>
        <TouchableOpacity
  onPress={onAnShowState}
  style={[styles.refreshBtn, { marginTop: 6 }]}
>
  <Text style={styles.refreshText}>AN: Show state</Text>
</TouchableOpacity>

      <TouchableOpacity
        onPress={onAnFireTest}
        style={[styles.refreshBtn, { marginTop: 6 }]}
      >
        <Text style={styles.refreshText}>AN: Fire test</Text>
      </TouchableOpacity>
    </View>
  </View>
)}

</View>

      {(roundsSrc !== "remote" || feesSrc !== "remote") && (
        <View style={styles.notice}>
          {roundsSrc !== "remote" && (
            <Text style={styles.noticeText}>
              Draws: {roundsSrc === "local"
                ? "Live data not available. The data being shown might not be correct."
                : "Showing last available data saved on this device."}
              {(() => {
                const ts = typeof roundsCachedAt === "number" ? roundsCachedAt : null;
                return ts
                  ? ` • System was last available at ${fmtDateTimeLocal(ts)}`
                  : "";
              })()}
            </Text>
          )}

          {feesSrc !== "remote" && (
            <Text style={styles.noticeText}>
              Fees: {feesSrc === "local"
                ? "Live data not available. The data being shown might not be correct."
                : "Showing last available data saved on this device."}
              {(() => {
                const ts = typeof feesCachedAt === "number" ? feesCachedAt : null;
                return ts ? ` • System was last available at ${fmtDateTimeLocal(ts)}` : "";
              })()}
            </Text>
          )}
        </View>
      )}

      {/* Latest Draw */}
      <View style={styles.card}>
        <Text style={styles.title}>Latest Express Entry Draw</Text>
        {latest ? (
          <>
            <Text style={[styles.meta, { opacity: 0.8 }]}>
              Source: {roundsSrc} {roundsSrc === "cache" ? "(last good remote)" : roundsSrc === "local" ? "(bundled fallback)" : ""}{syncLabel(roundsMeta) && ` • ${syncLabel(roundsMeta)}`}
            </Text>

            <Text style={styles.meta}>Date: {fmtDate(latest.date)}</Text>
            {latest.draw_number != null && (
              <Text style={styles.meta}>Draw: {latest.draw_number}</Text>
            )}
            <Text style={styles.meta}>Category: {latest.category || "General"}</Text>
            {showCategoryHint && (
              <Text style={styles.categoryHint}>This was a category based draw.</Text>
            )}

            <Text style={styles.meta}>Cutoff CRS: {latest.cutoff ?? "—"}</Text>
            <Text style={styles.meta}>Invitations: {latest.invitations ?? "—"}</Text>
            {latest.source_url ? (
              <TouchableOpacity onPress={() => openUrl(latest.source_url)}>
                <Text style={styles.link}>View official source ↗</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={styles.source}>source: {roundsSrc}</Text>
          </>
        ) : (
          <Text style={styles.meta}>No rounds data.</Text>
        )}
      </View>

      {/* Fees */}
      <View style={styles.card}>
        <Text style={styles.title}>Current Fees</Text>
        <Text style={[styles.meta, { opacity: 0.8 }]}>
          Source: {feesSrc} {feesSrc === "cache" ? "(last good remote)" : feesSrc === "local" ? "(bundled fallback)" : ""}{syncLabel(feesMeta) && ` • ${syncLabel(feesMeta)}`}
        </Text>

        {feesList.length > 0 ? (
          <>
            {feesMeta?.last_checked && (
              <Text style={styles.meta}>Last checked: {fmtDate(feesMeta.last_checked)}</Text>
            )}

            <Text style={[styles.meta, { marginTop: 6, fontWeight: "700" }]}>Key fees</Text>
            {feesList.map((row) => (
              <Text key={row.code} style={styles.meta}>
                {row.label}: {formatCad(row.amount_cad)}
              </Text>
            ))}

            {feesMeta?.source_url && (
              <TouchableOpacity onPress={() => openUrl(feesMeta.source_url)}>
                <Text style={styles.link}>View official fees ↗</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.source}>source: {feesSrc}</Text>
          </>
        ) : (
          <Text style={styles.meta}>No fees data.</Text>
        )}
      </View>
{/* NOC 2021 Coverage */}
<View style={styles.card}>
  <Text style={styles.title}>NOC 2021 Coverage</Text>

  <Text style={[styles.meta, { opacity: 0.8 }]}>
    Source: {nocSrc}
    {nocSrc === "cache" ? " (last good remote)" :
     nocSrc === "local" ? " (bundled fallback)" : ""}
    {nocMeta?.last_checked ? ` • Last checked: ${fmtDate(nocMeta.last_checked)}` : ""}
  </Text>

  {nocManifest ? (
    <>
      <Text style={styles.meta}>Codes available: {nocManifest.count}</Text>

      {nocMeta?.source_url ? (
        <TouchableOpacity onPress={() => openUrl(nocMeta.source_url)}>
          <Text style={styles.link}>View manifest ↗</Text>
        </TouchableOpacity>
      ) : null}

      {nocManifest.codes?.length ? (
        <Text style={[styles.meta, { opacity: 0.7 }]}>
          Sample: {nocManifest.codes.slice(0, 8).join(", ")}
        </Text>
      ) : null}

      <Text style={styles.source}>source: {nocSrc}</Text>
    </>
  ) : (
    <Text style={styles.meta}>No NOC manifest data.</Text>
  )}
</View>

      {__DEV__ && (
        <TouchableOpacity onPress={logCache} style={{ marginBottom: 12 }}>
          <Text style={{ color: "cyan" }}>🧪 Log cache status</Text>
        </TouchableOpacity>
      )}
      
      {__DEV__ && (
  <TouchableOpacity onPress={clearNocCache} style={{ marginBottom: 12 }}>
    <Text style={{ color: "violet" }}>🗑 Clear NOC cache</Text>
  </TouchableOpacity>
)}


      {__DEV__ && (
        <TouchableOpacity onPress={clearIRCCCache} style={{ marginBottom: 12 }}>
          <Text style={{ color: "orange" }}>🗑 Clear IRCC cache</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, backgroundColor: colors.background },
  h1: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: 8 },
  card: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: "#111"
  },
  title: { fontWeight: "700", color: "#fff", marginBottom: 6 },
  meta: { color: "#fff", fontSize: 14, marginBottom: 4 },
  source: { color: "#bbb", fontSize: 12, marginTop: 8 },
  link: { color: "#4ea1ff", marginTop: 6 },
  refreshBtn: { alignSelf: "flex-end", marginBottom: 8 },
  refreshText: { color: "#4ea1ff" },

  notice: {
    backgroundColor: "#222",
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#555",
  },
  noticeText: {
    color: "#ffcc00",
    fontSize: 13,
    lineHeight: 18,
  },
  categoryHint: {
    marginTop: 2,
    fontSize: 12,
    fontStyle: "italic",
    color: "#9CA3AF",
  },
});
