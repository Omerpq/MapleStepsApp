// src/screens/LandingChecklist.tsx
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, Linking, Platform } from "react-native";

import { colors } from "../theme/colors";
import {
  loadLandingGuides,
  getLandingState,
  setLandingState,
  LandingGuide,
  LandingProvince,
} from "../services/landing";
import { verifyLandingLinksLive, type LandingLiveResult } from "../services/landingLive";

const palette = {
  textPrimary: (colors as any)?.textPrimary ?? "#111827",
  link: (colors as any)?.link ?? "#2563eb",
  mapleRed: (colors as any)?.mapleRed ?? "#b91c1c",
};
const statusLabel = (s: number | null) => {
  if (Platform.OS === "web" && (s === null || s === 0)) return "WEB-CORS";
  if (s === null || s === 0) return "ERR";
  return `${s}`;
};

type PillTone = "gray" | "green";
function Pill({ label, tone = "gray" as PillTone }: { label: string; tone?: PillTone }) {

  const bg = tone === "green" ? "#e7f8ec" : "#f3f4f6";
  const fg = tone === "green" ? "#0a8a3a" : "#4b5563";
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
      <Text style={{ color: fg, fontWeight: "600", fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export default function LandingChecklist() {
  const [loading, setLoading] = useState(true);
  const [guide, setGuide] = useState<LandingGuide | null>(null);
  const [metaLine, setMetaLine] = useState<string>("");
  const [state, setState] = useState<Record<string, Record<string, boolean>>>({});
  const [provinceCode, setProvinceCode] = useState<string>("ON"); // default selection
  const [liveLoading, setLiveLoading] = useState(false);
const [live, setLive] = useState<LandingLiveResult | null>(null);
const [liveError, setLiveError] = useState<string | null>(null);


  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await loadLandingGuides();
        setGuide(res.data);

        const fetchedAt =
          res.meta?.__cachedAt
            ? new Date(res.meta.__cachedAt)
            : res.meta?.last_checked
            ? new Date(res.meta.last_checked)
            : null;

        const when = fetchedAt ? fetchedAt.toLocaleString() : "—";
        const sourceTitle = res.meta.source === "remote" ? "Remote" : res.meta.source === "cache" ? "Cache" : "Local";
        const statusLabel = res.meta.status === 200 ? "updated" : res.meta.status === 304 ? "validated" : undefined;
        setMetaLine(
          ["Source:", sourceTitle, "• fetched", when, statusLabel ? `• ${statusLabel}` : ""]
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
        );

        const st = await getLandingState();
        setState(st);
      } catch (e: any) {
        Alert.alert("Landing guides", e?.message ?? "Failed to load guide.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const province: LandingProvince | undefined = useMemo(
    () => guide?.provinces.find((p) => p.code === provinceCode),
    [guide, provinceCode]
  );

  const completedCount = useMemo(() => {
    if (!province) return 0;
    const map = state[province.code] || {};
    return province.tasks.filter((t) => !!map[t.id]).length;
  }, [state, province]);

  const totalCount = province?.tasks.length ?? 0;

  const toggle = async (taskId: string) => {
    if (!province) return;
    const prev = state[province.code] || {};
    const nextForProv = { ...prev, [taskId]: !prev[taskId] };
    const next = { ...state, [province.code]: nextForProv };
    setState(next);
    await setLandingState(next);
  };

  const open = (url?: string) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {
      Alert.alert("Open link", "Could not open the official link.");
    });
  };
  const verifyLive = async (force: boolean) => {
  if (!guide) return;
  if (!provinceCode) return;
  try {
    setLiveError(null);
    setLiveLoading(true);
    const res = await verifyLandingLinksLive(guide, provinceCode, force);
    setLive(res);
  } catch (e: any) {
    setLive(null);
    setLiveError(e?.message ?? "Live verification failed.");
  } finally {
    setLiveLoading(false);
  }
};

  const ProvincePicker = () => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {guide?.provinces.map((p) => {
        const active = p.code === provinceCode;
        return (
          <Pressable
            key={p.code}
            onPress={() => setProvinceCode(p.code)}
            style={{
              backgroundColor: active ? palette.mapleRed : "#f3f4f6",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
            }}
          >
            <Text style={{ color: active ? "#fff" : "#374151", fontWeight: "600" }}>{p.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#fff" }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: palette.textPrimary, marginBottom: 4 }}>
        Landing & Post-Landing
      </Text>
      {!!guide && <Text style={{ color: "#6b7280", marginBottom: 12 }}>{guide.title}</Text>}

      {/* Standardized freshness/meta line */}
      <Text style={{ color: "#6b7280", fontSize: 12, marginBottom: 16 }}>{metaLine}</Text>

      {/* Province picker */}
      <ProvincePicker />
{/* Live verification (24h TTL) */}
{Platform.OS === "web" ? (
  <View style={{ marginTop: 12, padding: 12, backgroundColor: "#f9fafb", borderRadius: 8, borderWidth: 1, borderColor: "#eef2f7" }}>
    <Text style={{ fontWeight: "700", color: "#111827", marginBottom: 4 }}>Official links — Live</Text>
    <Text style={{ color: "#6b7280" }}>
      Live verification is unavailable on web due to CORS. Use a device to verify, or tap each “Open official guidance” link.
    </Text>
  </View>
) : (
  <View style={{ marginTop: 12, padding: 12, backgroundColor: "#f9fafb", borderRadius: 8, borderWidth: 1, borderColor: "#eef2f7" }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <Text style={{ fontWeight: "700", color: "#111827" }}>Official links — Live</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={() => verifyLive(false)}
          disabled={liveLoading || !guide}
          style={{ backgroundColor: "#f3f4f6", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, opacity: liveLoading ? 0.6 : 1 }}
        >
          <Text style={{ color: "#374151", fontWeight: "600" }}>{liveLoading ? "Verifying…" : "Verify"}</Text>
        </Pressable>
        <Pressable
          onPress={() => verifyLive(true)}
          disabled={liveLoading || !guide}
          style={{ backgroundColor: "#eef2ff", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, opacity: liveLoading ? 0.6 : 1 }}
        >
          <Text style={{ color: "#3730a3", fontWeight: "700" }}>Refresh (bypass TTL)</Text>
        </Pressable>
      </View>
    </View>

    {/* Meta line */}
    {live && (
      <Text style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>
        IRCC/Prov (Live) — verified {new Date(live.verifiedAtISO).toLocaleString()}
        {live.source === "cache" ? " (cached)" : ""}
      </Text>
    )}
    {liveError && <Text style={{ color: "#b91c1c", marginBottom: 8 }}>{liveError}</Text>}

    {/* Results */}
    {live?.links?.length ? (
      <View style={{ gap: 6 }}>
        {live.links.map((lnk) => {
          const ok = typeof lnk.status === "number" && lnk.status >= 200 && lnk.status < 400;
          return (
            <View key={lnk.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: "#111827", flex: 1 }} numberOfLines={1}>
                {lnk.title}
              </Text>
              <Pill label={ok ? `OK ${statusLabel(lnk.status)}` : statusLabel(lnk.status)} tone={ok ? "green" : "gray"} />
            </View>
          );
        })}
      </View>
    ) : (
      <Text style={{ color: "#6b7280" }}>Tap Verify to check current link availability.</Text>
    )}
  </View>
)}

      {/* Progress */}
      <View style={{ marginTop: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pill
          label={`Progress ${completedCount}/${totalCount}`}
          tone={completedCount === totalCount && totalCount > 0 ? "green" : "gray"}
        />
      </View>

      {/* Tasks */}
      <View style={{ borderTopWidth: 1, borderTopColor: "#eef2f7", marginTop: 8 }}>
        {loading && <Text style={{ color: "#6b7280", marginTop: 12 }}>Loading…</Text>}

        {!loading && !province && (
          <Text style={{ color: "#6b7280", marginTop: 12 }}>Select a province to view tasks.</Text>
        )}

        {!loading &&
          province &&
          province.tasks.map((t, idx) => {
            const checked = !!state[province.code]?.[t.id];
            return (
              <View
                key={t.id}
                style={{
                  paddingVertical: 12,
                  borderBottomWidth: idx === province.tasks.length - 1 ? 0 : 1,
                  borderBottomColor: "#eef2f7",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "600", color: "#111827" }}>
                    {t.title} {t.required ? <Text style={{ color: palette.mapleRed }}>*</Text> : null}
                  </Text>
                  {!!t.officialLink && (
                    <Pressable onPress={() => open(t.officialLink)}>
                      <Text style={{ color: palette.link, fontSize: 12, marginTop: 2 }}>
                        Open official guidance</Text>
                    </Pressable>
                  )}
                </View>

                <Pressable
                  onPress={() => toggle(t.id)}
                  style={{
                    backgroundColor: checked ? "#e7f8ec" : "#f3f4f6",
                    borderWidth: 1,
                    borderColor: checked ? "#9fe3b8" : "#e5e7eb",
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ color: checked ? "#0a8a3a" : "#374151", fontWeight: "700" }}>
                    {checked ? "Done" : "Mark done"}
                  </Text>
                </Pressable>
              </View>
            );
          })}
      </View>

      {/* Tips */}
      {!!guide?.global_tips?.length && (
        <View
          style={{
            marginTop: 16,
            padding: 12,
            backgroundColor: "#f9fafb",
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#eef2f7",
          }}
        >
          <Text style={{ fontWeight: "700", color: "#111827", marginBottom: 6 }}>Tips</Text>
          {guide!.global_tips!.map((tip, i) => (
            <Text key={i} style={{ color: "#374151", marginBottom: 4 }}>
              • {tip}
            </Text>
          ))}
        </View>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}
