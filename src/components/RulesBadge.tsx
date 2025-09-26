// src/components/RulesBadge.tsx
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { getRulesVersion } from "../services/rules";

import {
  getCrsVersion,
  primeCrsParams,
  getCrsSource,
  getCrsCachedAt,
} from "../services/crs";

import {
  getFswVersion,
  primeFswParams,
  getFswSource,
  getFswCachedAt,
} from "../services/fsw67";

import { makeMetaLineCompact } from "../utils/freshness";

// ---------- Display helpers ----------
type RuleSource = "remote" | "cache" | "local";

const STATE_TITLE: Record<RuleSource, string> = {
  remote: "Remote",
  cache: "Cache",
  local: "Local",
};

// ---------- Component ----------
export default function RulesBadge() {
  const rulesVer = getRulesVersion();

  const [crsVer, setCrsVer] = useState(getCrsVersion());
  const [fswVer, setFswVer] = useState(getFswVersion());

  const [crsSource, setCrsSource] = useState<RuleSource>("local");
  const [fswSource, setFswSource] = useState<RuleSource>("local");

  const [crsAt, setCrsAt] = useState<number | null>(null);
  const [fswAt, setFswAt] = useState<number | null>(null);

  useEffect(() => {
    // Prime & then reflect the real source for CRS
    primeCrsParams()
      .catch(() => {})
      .finally(() => {
        setCrsVer(getCrsVersion());
        setCrsSource(getCrsSource());
        setCrsAt(getCrsCachedAt());
      });

    // Prime & then reflect the real source for FSW
    primeFswParams()
      .catch(() => {})
      .finally(() => {
        setFswVer(getFswVersion());
        setFswSource(getFswSource());
        setFswAt(getFswCachedAt());
      });
  }, []);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Rules: {rulesVer}</Text>

      <View style={styles.row}>
        <View style={tagStyle(crsSource)}>
          <Text style={styles.tagText}>{STATE_TITLE[crsSource]}</Text>
          <Text style={styles.syncText}>{makeMetaLineCompact("CRS", crsAt)}</Text>
        </View>

        <View style={tagStyle(fswSource)}>
          <Text style={styles.tagText}>{STATE_TITLE[fswSource]}</Text>
          <Text style={styles.syncText}>{makeMetaLineCompact("FSW", fswAt)}</Text>
        </View>
      </View>
    </View>
  );
}

// ---------- Styles ----------
const tagStyle = (s: RuleSource) => [
  styles.tag,
  s === "local"
    ? { backgroundColor: "#EEE", borderColor: "#CCC" }            // grey for local
    : s === "cache"
    ? { backgroundColor: "#FFF8E6", borderColor: "#F5D48A" }      // amber for cache
    : { backgroundColor: "#E8FFF1", borderColor: "#B6EBC6" },     // green for remote
];

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  title: { color: colors.text, fontWeight: "600", marginBottom: 6 },
  row: { flexDirection: "row", gap: 8 },
  tag: {
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    minWidth: 140,
  },
  tagText: { fontWeight: "700", color: colors.text },
  syncText: { fontSize: 12, color: "#666" },
});
