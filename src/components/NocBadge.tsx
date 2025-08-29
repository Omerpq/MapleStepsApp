import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
// Assumes C8 added the remote-first NOC loader returning our standard contract:
// { data, source: "remote"|"cache"|"local", cachedAt: number|null, meta?: { last_checked?: string } }
import { loadNoc } from "../services/noc";
import { pickDisplayTime } from "../services/dateUtils";

type LoadResult = {
  source: "remote" | "cache" | "local";
  cachedAt: number | null;
  meta?: { last_checked?: string };
};


export default function NocBadge() {
  const [lastText, setLastText] = useState<string>("—");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = (await loadNoc()) as LoadResult;
        if (!mounted) return;
        setLastText(pickDisplayTime(res.cachedAt, res.meta?.last_checked));
      } catch {
        if (mounted) setLastText("—");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View
      style={styles.pill}
      testID="noc-badge"
      accessible
      accessibilityRole="text"
      accessibilityLabel={`NOC 2021, last: ${lastText === "—" ? "unknown" : lastText}`}
    >
      <Text style={styles.text} testID="noc-badge-text">
        NOC 2021 • last: {lastText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#F2F2F3",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E3E5",
    marginTop: 6,
    marginBottom: 8,
  },
  text: {
    fontSize: 11,
    color: "#4A4D50",
  },
});
