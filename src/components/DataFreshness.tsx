// src/components/DataFreshness.tsx
import React from "react";
import { View, Text, ActivityIndicator, Pressable } from "react-native";
import { useNoc } from "../hooks/useNoc";
import { RULES_CONFIG } from "../services/config";


function hostOf(u: string) {
  try { return new URL(u).host; } catch {
    // fallback parse if URL constructor fails
    return (u || "").replace(/^https?:\/\/(www\.)?/i, "").split("/")[0] || "—";
  }
}

export default function DataFreshness() {
  const { status, meta, sources, refresh } = useNoc();

  const nocDate = meta?.noc?.last_checked ?? "—";
  const catDate = meta?.cats?.last_checked ?? "—";

  // Prefer URL embedded in JSON meta; fallback to config URLs
  const nocUrl =
    (meta?.noc as any)?.source?.url ||
    (meta?.noc as any)?.source_url ||
    RULES_CONFIG.nocUrl;

  const catsUrl =
    (meta?.cats as any)?.source?.url ||
    (meta?.cats as any)?.source_url ||
    RULES_CONFIG.nocCategoriesUrl;

  return (
    <View
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        gap: 4,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 6 }}>
        Data freshness
      </Text>

      <Text style={{ color: "#666" }}>NOC 2021 last checked: {nocDate}</Text>
      <Text style={{ color: "#666" }}>
        IRCC categories last checked: {catDate}
      </Text>

      {/* Status from hook (remote/cache/local) */}
      <Text style={{ color: "#666", marginTop: 6 }}>
        Status: {sources.noc ?? "—"} / {sources.cats ?? "—"} ({status})
      </Text>

            {/* Sources: show domains in prod; full URLs in dev */}
      <Text style={{ color: "#999", fontSize: 12, marginTop: 4 }}>
        NOC source: {hostOf(nocUrl)}
      </Text>
      <Text style={{ color: "#999", fontSize: 12 }}>
        IRCC source: {hostOf(catsUrl)}
      </Text>
      {__DEV__ && (
        <>
          <Text style={{ color: "#bbb", fontSize: 11, marginTop: 2 }} selectable>
            NOC URL: {nocUrl}
          </Text>
          <Text style={{ color: "#bbb", fontSize: 11 }} selectable>
            IRCC URL: {catsUrl}
          </Text>
        </>
      )}


      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginTop: 10,
        }}
      >
        <Pressable
          onPress={() => refresh(true)}
          style={{
            backgroundColor: "#111",
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>
            {status === "loading" ? "Refreshing…" : "Refresh data"}
          </Text>
        </Pressable>
        {status === "loading" && <ActivityIndicator />}
      </View>
    </View>
  );
}
