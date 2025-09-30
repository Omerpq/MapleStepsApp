// src/components/DrawProximityCard.tsx
import React from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";


type FreshMeta = { source: "remote" | "cache" | "local"; cachedAt: number | null; meta?: any };
type Item = { label: string; cutoff: number; delta: number; date?: string; sourceUrl?: string };

type Props = {
  freshness: FreshMeta;
  items: Item[];
};

export default function DrawProximityCard({ freshness, items }: Props) {
  return (
    <View style={s.wrap} accessible accessibilityLabel="Draw proximity">
      <View style={s.header}>
        <Text style={s.h1}>Draw proximity</Text>
        <Text style={s.small}>
  {String(freshness.source).toUpperCase()}
  {freshness.cachedAt ? ` • saved ${new Date(freshness.cachedAt).toLocaleString()}` : ""}
</Text>

      </View>

      {items.length === 0 ? (
        <Text style={s.dim}>No recent draws available.</Text>
      ) : (
        items.map((it, idx) => (
          <View key={idx} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{it.label}</Text>
              <Text style={s.small}>
                Cutoff {it.cutoff}{it.date ? ` • ${it.date}` : ""}{it.sourceUrl ? " • " : ""}
                {it.sourceUrl ? (
                  <Pressable onPress={() => Linking.openURL(it.sourceUrl!)}>
                    <Text style={[s.small, s.link]}>IRCC page</Text>
                  </Pressable>
                ) : null}
              </Text>
            </View>
            <Text style={[s.badge, it.delta >= 0 ? s.ok : s.warn]}>
              {it.delta >= 0 ? `+${it.delta}` : `${it.delta}`}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 12, gap: 8, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  h1: { fontSize: 18, fontWeight: "700" },
  dim: { fontSize: 13, color: "#888" },
  row: { flexDirection: "row", alignItems: "center", paddingTop: 8, marginTop: 8, borderTopWidth: 1, borderTopColor: "#eee", gap: 10 },
  title: { fontSize: 15, fontWeight: "600" },
  small: { fontSize: 12, color: "#666" },
  link: { textDecorationLine: "underline" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, fontWeight: "800", overflow: "hidden" },
  ok: { backgroundColor: "#ECFDF5", color: "#065F46" },
  warn: { backgroundColor: "#FEF2F2", color: "#991B1B" },
});
