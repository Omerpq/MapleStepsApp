import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Linking, TouchableOpacity, ScrollView } from "react-native";
import { colors } from "../theme/colors";
import { loadRounds, loadFees } from "../services/updates";
import { RULES_CONFIG } from "../services/config";
import AsyncStorage from "@react-native-async-storage/async-storage";

if (__DEV__) {
  console.log("UPDATES_URLS", RULES_CONFIG.roundsUrl, RULES_CONFIG.feesUrl);
}

type Round = {
  date: string;
  category?: string;
  cutoff?: number;
  invitations?: number;
  source_url?: string;
};

// Helper to only open URLs if they are defined
const openUrl = (u?: string) => { if (u) Linking.openURL(u); };

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const fmtAgo = (ts?: number | null) => {
  if (!ts) return "";
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h === 0) return `${m}m ago`;
  if (m === 0) return `${h}h ago`;
  return `${h}h ${m}m ago`;
};

const fmtDateTime = (dOrIso: Date | string | undefined) => {
  if (!dOrIso) return "—";
  const d = dOrIso instanceof Date ? dOrIso : new Date(dOrIso);
  if (isNaN(d.getTime())) return String(dOrIso);
  return d.toLocaleString();
};

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

  // Fees
  const [feesList, setFeesList] = useState<any[]>([]);
  const [feesMeta, setFeesMeta] = useState<any | null>(null);
  const [feesSrc, setFeesSrc] = useState<"remote"|"cache"|"local">("local");
  const [feesCachedAt, setFeesCachedAt] = useState<number | null>(null);
  const [feesNotice, setFeesNotice] = useState<string | null>(null);

  // Refreshing
  const [refreshing, setRefreshing] = useState(false);

  // --- helpers (closure over state setters) --- //
  type LoadResult<T> = {
    data: T;
    source: "remote" | "cache" | "local";
    cachedAt: number | null;
    meta?: { last_checked?: string; source_url?: string };
    notice?: string | null;
  };

  function buildNotice(kind: "rounds" | "fees", r: LoadResult<any>): string {
    const when = r.cachedAt != null
      ? new Date(r.cachedAt).toLocaleString()
      : r.meta?.last_checked ?? "—";
    const src = r.source === "remote" ? "Remote" : r.source === "cache" ? "Cache" : "Local";
    return kind === "rounds"
      ? `Express Entry: ${src} • Last synced ${when}`
      : `Fees: ${src} • Last synced ${when}`;
  }

  function applyRounds(r: LoadResult<Round[]>) {
    setRounds(r.data);
    setRoundsSrc(r.source);
    setRoundsCachedAt(r.cachedAt ?? null);
    setRoundsNotice(r.notice ?? buildNotice("rounds", r));
  }

  function applyFees(f: LoadResult<any[]>) {
    setFeesList(f.data);
    setFeesMeta(f.meta || null);
    setFeesSrc(f.source);
    setFeesCachedAt(f.cachedAt ?? null);
    setFeesNotice(f.notice ?? buildNotice("fees", f));
  }
  // --- end helpers --- //

  const refresh = async () => {
  if (refreshing) return;   // prevent double-tap
  setRefreshing(true);
  try {
    const [rRes, fRes] = await Promise.allSettled([loadRounds(), loadFees()]);

    if (rRes.status === "fulfilled") applyRounds(rRes.value as any);
    else { try { applyRounds(await loadRounds() as any); } catch {} }

    if (fRes.status === "fulfilled") applyFees(fRes.value as any);
    else { try { applyFees(await loadFees() as any); } catch {} }
  } catch (e) {
    if (__DEV__) console.warn("REFRESH_ERROR", e);
  } finally {
    setRefreshing(false);
  }
};


  useEffect(() => {
    (async () => {
      try {
        const [r, f] = await Promise.all([loadRounds(), loadFees()]);
        applyRounds(r as any);
        applyFees(f as any);
      } catch {
        try { applyRounds(await loadRounds() as any); } catch {}
        try { applyFees(await loadFees() as any); } catch {}
      }
    })();
  }, []);

  const latest = rounds && rounds.length ? rounds[0] : null;

  const clearCache = async () => {
    await AsyncStorage.removeItem("ms_rounds_cache_v1");
    await AsyncStorage.removeItem("ms_fees_cache_v1");
    await refresh(); // re-load to show local/remote right away
  };

  const clearIRCCCache = async () => {
    await AsyncStorage.removeItem("ms_rounds_cache_v1");
    await AsyncStorage.removeItem("ms_fees_cache_v1");
    console.log("IRCC cache cleared");
  };


const logCache = async () => {
  if (!__DEV__) return;   // dev-only

  const [r, f] = await Promise.all([
    AsyncStorage.getItem("ms_rounds_cache_v1"),
    AsyncStorage.getItem("ms_fees_cache_v1"),
  ]);
  console.log(
    "CACHE_DEBUG rounds:", r ? "present" : "missing",
    "fees:",             f ? "present" : "missing"
  );
  try {
    if (r) console.log("CACHE_DEBUG rounds.cachedAt:", JSON.parse(r)?.cachedAt);
    if (f) console.log("CACHE_DEBUG  fees.cachedAt:", JSON.parse(f)?.cachedAt);
  } catch (e) {
    console.warn("CACHE_DEBUG parse error:", e);
  }
};


    const refreshFeesOnly = async () => {
    const f = await loadFees();
    applyFees(f as any);
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ paddingBottom: 24 }}>
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


      {(roundsSrc !== "remote" || feesSrc !== "remote") && (
        <View style={styles.notice}>
          {/* Draws notice */}
          {roundsSrc !== "remote" && (
            <Text style={styles.noticeText}>
              Draws: {roundsSrc === "local"
                ? "Live data not available. The data being shown might not be correct."
                : "Showing last available data saved on this device."}
              {(() => {
                const ts = typeof roundsCachedAt === "number" ? roundsCachedAt : null;
                return ts
                  ? ` • System was last available at ${fmtDateTime(new Date(ts))} (${fmtAgo(ts)})`
                  : "";
              })()}
            </Text>
          )}

          {/* Fees notice */}
          {feesSrc !== "remote" && (
            <Text style={styles.noticeText}>
              Fees: {feesSrc === "local"
                ? "Live data not available. The data being shown might not be correct."
                : "Showing last available data saved on this device."}
              {(() => {
                let ts: number | null = typeof feesCachedAt === "number" ? feesCachedAt : null;
                // If fully local and no cachedAt, fall back to file metadata
                if (!ts && feesSrc === "local" && feesMeta?.last_checked) {
                  const parsed = Date.parse(feesMeta.last_checked);
                  ts = isNaN(parsed) ? null : parsed;
                }
                return ts
                  ? ` • System was last available at ${fmtDateTime(new Date(ts))} (${fmtAgo(ts)})`
                  : "";
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
              Source: {roundsSrc} {roundsSrc === "cache" ? "(last good remote)" : roundsSrc === "local" ? "(bundled fallback)" : ""}
            </Text>

            <Text style={styles.meta}>Date: {fmtDate(latest.date)}</Text>
            <Text style={styles.meta}>Category: {latest.category || "General"}</Text>
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
          Source: {feesSrc} {feesSrc === "cache" ? "(last good remote)" : feesSrc === "local" ? "(bundled fallback)" : ""}
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


      {__DEV__ && (
  <TouchableOpacity onPress={logCache} style={{ marginBottom: 12 }}>
    <Text style={{ color: "cyan" }}>🧪 Log cache status</Text>
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
});
