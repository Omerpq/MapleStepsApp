// src/screens/EEProfileChecklist.tsx
import React, { useEffect, useState, useCallback, useMemo } from "react";

import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { colors } from "../theme/colors";
import { getEEChecklist, EECheck, applyFix, getEEDebugSnapshot } from "../services/eeProfile";
import * as Clipboard from "expo-clipboard";

import AsyncStorage from '@react-native-async-storage/async-storage';

import { View, Text, Pressable, ActivityIndicator, ScrollView, Alert, Platform } from "react-native";


import { gateToEAPR } from "../services/ita";


function Pill({ label, tone = "default" }: { label: string; tone?: "danger" | "warn" | "ok" | "default" }) {
  const palette =
    tone === "danger" ? { bg: "#FFECEC", bd: "#F5A3A3", tx: "#7A0F0F" } :
    tone === "warn"   ? { bg: "#FFF7E8", bd: "#F2D39A", tx: "#6E4B00" } :
    tone === "ok"     ? { bg: "#EAF9EF", bd: "#BCE6C8", tx: "#0F5A2A" } :
                        { bg: "#EEF2F7", bd: "#D4DDE8", tx: "#273446" };
  return (
    <View style={{
      backgroundColor: palette.bg,
      borderColor: palette.bd,
      borderWidth: 1,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 999,
      alignSelf: "flex-start",
    }}>
      <Text style={{ color: palette.tx, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function Row({ item, onFix }: { item: EECheck; onFix: (c: EECheck) => void }) {
  const tone = item.severity === "error" ? "danger" : item.severity === "warn" ? "warn" : item.severity === "ok" ? "ok" : "default";
  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#E5EAF1",
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowOffset: { width: 0, height: 1 },
        shadowRadius: 2,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16, flex: 1, paddingRight: 12 }}>
          {item.title}
        </Text>
        <Pill
          label={item.severity === "error" ? "Error" : item.severity === "warn" ? "Warning" : item.severity === "ok" ? "OK" : "Info"}
          tone={tone as any}
        />
      </View>
      {item.details ? (
        <Text style={{ color: "#4B5A6B", fontSize: 14, lineHeight: 20, marginBottom: 10 }}>
          {item.details}
        </Text>
      ) : null}
      {item.fix?.type !== "none" && (
        <Pressable
          onPress={() => onFix(item)}
          style={{
            alignSelf: "flex-start",
            backgroundColor: colors.mapleRed,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 8,
          }}
          accessibilityRole="button"
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>
            {item.fix.type === "navigate" ? "Open" : item.fix.type === "openUrl" ? "Open official page" : "Fix"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
async function showNocCacheDev() {
  try {
    const raw = await AsyncStorage.getItem('ms_noc_cache_v1');
    const pretty = raw ? JSON.stringify(JSON.parse(raw), null, 2) : '(null)';
    // Copy to clipboard on web & native if available
    if (typeof navigator !== 'undefined' && (navigator as any).clipboard?.writeText) {
      await (navigator as any).clipboard.writeText(pretty);
    }
    Alert.alert('ms_noc_cache_v1', pretty.slice(0, 1400)); // alert limit safety
    console.log('[ms_noc_cache_v1]', pretty);
  } catch (e: any) {
    Alert.alert('ms_noc_cache_v1', `Error: ${String(e?.message || e)}`);
  }
}

export default function EEProfileChecklist() {
  // S4-01 — Add a gated "Start e-APR" header button
React.useLayoutEffect(() => {
  // `navigation` is available via screen props; if your signature is (props), destructure or use props.navigation
  // Most of your screens already have `navigation` in scope.
  // @ts-ignore - tolerate any typing difference here
  const nav: any = (typeof navigation !== "undefined" ? navigation : undefined);
  if (!nav || !nav.setOptions) return;

  nav.setOptions({
    headerRight: () => (
      <Pressable
        onPress={() => gateToEAPR(nav, "EAPRBuilder")}
        style={{ paddingHorizontal: 12, paddingVertical: 6 }}
        accessibilityRole="button"
        accessibilityLabel="Start e-APR"
      >
        <Text style={{ fontWeight: "600" }}>Start e-APR</Text>
      </Pressable>
    ),
  });
}, [/* keep navigation stable */]);

  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<EECheck[]>([]);
  const [error, setError] = useState<string | null>(null);

  // DEV debug panel state (must be INSIDE the component)
  const [showDebug, setShowDebug] = useState(false);
  const [debugText, setDebugText] = useState<string>("");
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const out = await getEEChecklist();
    setChecks(out);
  } catch (e: any) {
    setError("Could not run checks. Please try again.");
  } finally {
    setLastRunAt(new Date());   // <-- add this line
    setLoading(false);
  }
}, []);


  // Refresh whenever the screen becomes focused
  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load])
  );

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    let errors = 0, warns = 0, oks = 0, infos = 0;
    for (const c of checks) {
      if (c.severity === "error") errors++;
      else if (c.severity === "warn") warns++;
      else if (c.severity === "ok") oks++;
      else infos++;
    }
    return { errors, warns, oks, infos };
  }, [checks]);

  const onFix = useCallback(async (item: EECheck) => {
    if (!item.fix) return;
    await applyFix(item.fix, (route, params) => navigation.navigate(route, params));
  }, [navigation]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 8 }}>
        <Pressable onLongPress={() => setShowDebug(v => !v)}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800", marginBottom: 8 }}>
            EE Profile — Pre-flight Checklist
          </Text>
        </Pressable>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pill label={`${counts.errors} errors`} tone="danger" />
          <Pill label={`${counts.warns} warnings`} tone="warn" />
          <Pill label={`${counts.oks} OK`} tone="ok" />
          <Pill label={`${counts.infos} info`} />
        </View>

        {/* Success state — show only when no errors/warnings */}
        {counts.errors === 0 && counts.warns === 0 && (
          <View style={{ marginTop: 10 }}>
            <Pill label="You're good to go 🎉" tone="ok" />
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable
  onPress={load}
  disabled={loading}
  style={{
    backgroundColor: loading ? "#64748b" : colors.slate,
    opacity: loading ? 0.7 : 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  }}
>
  <Text style={{ color: "#fff", fontWeight: "700" }}>
    {loading ? "Re-running…" : "Re-run checks"}
  </Text>
</Pressable>
{lastRunAt && (
  <Text style={{ marginTop: 6, color: "#6b7280", fontSize: 12 }}>
    Last run: {lastRunAt.toLocaleTimeString()}
  </Text>
)}

          <Pressable
            onPress={() => navigation.navigate("ActionPlan")}
            style={{
              backgroundColor: colors.gold,
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: "700" }}>Open Action Plan</Text>
          </Pressable>
        </View>

        {/* DEV-only debug panel (not inside the button) */}
        {__DEV__ && (
  <Pressable
    onPress={showNocCacheDev}
    style={{ marginTop: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#334155', borderRadius: 8 }}
  >
    <Text style={{ color: '#fff', fontWeight: '700' }}>DEV: Show NOC cache</Text>
  </Pressable>
)}

        {__DEV__ && showDebug && (
          <View style={{ marginTop: 12, borderWidth: 1, borderColor: "#E5EAF1", borderRadius: 8, padding: 10, backgroundColor: "#FCFEFF" }}>
            <Pressable
              onPress={async () => {
                try {
                  const snap = await getEEDebugSnapshot();
                  const txt = JSON.stringify(snap, null, 2);
                  setDebugText(txt);
                  console.log("[EE_DEBUG]", txt);
                  await Clipboard.setStringAsync(txt);
                  alert("EE debug snapshot copied to clipboard (and logged to console).");
                } catch (e) {
                  alert("Could not read debug snapshot.");
                }
              }}
              style={{ alignSelf: "flex-start", backgroundColor: "#334155", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, marginBottom: 8 }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Copy debug snapshot</Text>
            </Pressable>
            {debugText ? (
              <ScrollView style={{ maxHeight: 180 }}>
                <Text style={{ fontFamily: "monospace", fontSize: 12, color: "#334155" }}>{debugText}</Text>
              </ScrollView>
            ) : (
              <Text style={{ fontSize: 12, color: "#64748b" }}>Long-press the title to toggle this panel. Tap “Copy debug snapshot”.</Text>
            )}
          </View>
        )}
      </View>

      {/* Body */}
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: "#506070" }}>Running checks…</Text>
        </View>
      ) : error ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: "#7A0F0F" }}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {checks.map((c) => (
            <Row key={c.id} item={c} onFix={onFix} />
          ))}

          <View style={{ height: 24 }} />
          <Text style={{ color: "#6A7A8B", fontSize: 12, textAlign: "center" }}>
            Notes: This checklist reads your existing MapleSteps data. For PoF thresholds, use “Refresh from IRCC” in Proof of Funds to update the live amount.
          </Text>
          <View style={{ height: 16 }} />
        </ScrollView>
      )}
    </View>
  );
}


