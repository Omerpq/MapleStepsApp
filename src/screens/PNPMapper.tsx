// src/screens/PNPMapper.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Switch,
  Pressable,
  Linking,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { loadPnpGuides, matchStreams, PnpProfileInput, RankedStream } from "../services/pnp";

type Source = "remote" | "cache" | "local";

export default function PNPMapper() {
  // loader state
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<Source>("local");
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<200 | 304 | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [guides, setGuides] = useState<any | null>(null);

  // profile toggles
  const [profile, setProfile] = useState<PnpProfileInput>({
    hasExpressEntryProfile: false,
    hasJobOffer: false,
    isTech: false,
    isHealth: false,
    isTrades: false,
    isFrancophone: false,
    isIntlStudentOrGrad: false,
    hasProvincialTies: false,
    isOccupationInDemand: false,
  });

  // load once
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await loadPnpGuides();
        if (!mounted) return;
        if (res.ok && res.data) {
          setGuides(res.data);
          setSource(res.source);
          setFetchedAt(res.meta?.last_checked ?? null);
          setStatus(res.meta?.status);
        } else {
          setError(res.error ?? "Failed to load PNP guides.");
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load PNP guides.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const results: RankedStream[] = useMemo(() => {
    if (!guides) return [];
    return matchStreams(guides, profile, 20);
  }, [guides, profile]);

  const headerLabel = useMemo(() => {
    const src = source === "remote" ? "Remote" : source === "cache" ? "Cache" : "Local";
    const st =
      status === 200 ? "updated" : status === 304 ? "validated" : source === "local" ? "bundled" : "";
    const ts = fetchedAt ? new Date(fetchedAt).toLocaleString() : "";
    return `Source: ${src}${st ? ` • ${st}` : ""}${ts ? ` • last checked ${ts}` : ""}`;
  }, [source, status, fetchedAt]);

  function ToggleRow({
    label,
    value,
    onValueChange,
    testID,
  }: {
    label: string;
    value: boolean;
    onValueChange: (v: boolean) => void;
    testID?: string;
  }) {
    return (
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Switch testID={testID} value={value} onValueChange={onValueChange} />
      </View>
    );
  }

  function StreamCard({ item }: { item: RankedStream }) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardSub}>{item.province}</Text>

        {item.matched?.length ? (
          <View style={styles.tagsRow}>
            {item.matched.map((c) => (
              <View key={c} style={styles.tag}>
                <Text style={styles.tagText}>{c}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {item.hints?.length ? (
          <View style={{ marginTop: 6 }}>
            {item.hints.map((h, i) => (
              <Text key={i} style={styles.hint}>• {h}</Text>
            ))}
          </View>
        ) : null}

        <Pressable
          onPress={() => Linking.openURL(item.officialUrl)}
          style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.linkBtnText}>Open official page</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading PNP streams…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Couldn’t load PNP data</Text>
        <Text style={styles.errorSub}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>PNP Mapper</Text>
      <Text style={styles.meta}>{headerLabel}</Text>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Your profile</Text>

        <ToggleRow
          label="I already have an Express Entry profile"
          value={!!profile.hasExpressEntryProfile}
          onValueChange={(v) => setProfile((p) => ({ ...p, hasExpressEntryProfile: v }))}
          testID="pnp-ee"
        />
        <ToggleRow
          label="I have a (valid) Canadian job offer / employer"
          value={!!profile.hasJobOffer}
          onValueChange={(v) => setProfile((p) => ({ ...p, hasJobOffer: v }))}
          testID="pnp-job"
        />
        <ToggleRow
          label="My field is Tech / IT"
          value={!!profile.isTech}
          onValueChange={(v) => setProfile((p) => ({ ...p, isTech: v }))}
          testID="pnp-tech"
        />
        <ToggleRow
          label="My field is Health / Nursing"
          value={!!profile.isHealth}
          onValueChange={(v) => setProfile((p) => ({ ...p, isHealth: v }))}
          testID="pnp-health"
        />
        <ToggleRow
          label="I’m in Skilled Trades"
          value={!!profile.isTrades}
          onValueChange={(v) => setProfile((p) => ({ ...p, isTrades: v }))}
          testID="pnp-trades"
        />
        <ToggleRow
          label="I’m Francophone (French CLB ≈ 7+)"
          value={!!profile.isFrancophone}
          onValueChange={(v) => setProfile((p) => ({ ...p, isFrancophone: v }))}
          testID="pnp-fr"
        />
        <ToggleRow
          label="I’m an international student/graduate in Canada"
          value={!!profile.isIntlStudentOrGrad}
          onValueChange={(v) => setProfile((p) => ({ ...p, isIntlStudentOrGrad: v }))}
          testID="pnp-intl"
        />
        <ToggleRow
          label="I have ties to a province (family/study/work/invitation)"
          value={!!profile.hasProvincialTies}
          onValueChange={(v) => setProfile((p) => ({ ...p, hasProvincialTies: v }))}
          testID="pnp-ties"
        />
        <ToggleRow
          label="My occupation is currently ‘in-demand’"
          value={!!profile.isOccupationInDemand}
          onValueChange={(v) => setProfile((p) => ({ ...p, isOccupationInDemand: v }))}
          testID="pnp-demand"
        />
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Suggested streams</Text>
        {results.length === 0 ? (
          <Text style={{ color: "#666", marginTop: 6 }}>
            No matches yet. Turn on one or more profile options above, or leave all off to browse all streams.
          </Text>
        ) : null}

        <View style={{ marginTop: 8 }}>
          {results.map((r) => (
            <StreamCard key={r.id} item={r} />
          ))}
        </View>

        {guides?.streams?.length && results.length < guides.streams.length ? (
          <Text style={styles.footerNote}>
            Showing {results.length} of {guides.streams.length}. Adjust your profile toggles to see more.
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: { fontSize: 22, fontWeight: "700" },
  meta: { marginTop: 4, color: "#666" },
  block: { marginTop: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#ddd" },
  blockTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  toggleRow: {
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleLabel: { fontSize: 15 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  cardSub: { color: "#666", marginTop: 2 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  tag: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#f1f1f1", borderRadius: 999, marginRight: 6, marginBottom: 6 },
  tagText: { fontSize: 12, color: "#333" },
  hint: { color: "#444", marginTop: 2 },
  linkBtn: { marginTop: 10, paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "#333" },
  linkBtnText: { fontWeight: "600" },
  errorTitle: { fontSize: 16, fontWeight: "700" },
  errorSub: { marginTop: 6, color: "#666" },
  footerNote: { color: "#666", marginTop: 8 },
});
