// src/components/DataFreshness.tsx
import React from "react";
import { View, Text, ActivityIndicator, Pressable } from "react-native";
import { useNoc } from "../hooks/useNoc";
import { RULES_CONFIG } from "../services/config";
import { hostOf, sourceTitle, tsFrom, fmtDateTimeLocal } from "../utils/freshness";

export default function DataFreshness() {
  const { status, meta, sources, refresh } = useNoc();

  const nocCachedAt = (meta?.noc as any)?.__cachedAt ?? null;
  const catCachedAt = (meta?.cats as any)?.__cachedAt ?? null;

  const nocWhen = fmtDateTimeLocal(tsFrom(nocCachedAt, meta?.noc));
  const catWhen = fmtDateTimeLocal(tsFrom(catCachedAt, meta?.cats));

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

      <Text style={{ color: "#666" }}>
        NOC 2021 — {sourceTitle(sources.noc)} • Last synced {nocWhen || "—"}
      </Text>
      <Text style={{ color: "#666" }}>
        IRCC categories — {sourceTitle(sources.cats)} • Last synced {catWhen || "—"}
      </Text>

      <Text style={{ color: "#999", fontSize: 12, marginTop: 6 }}>
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
