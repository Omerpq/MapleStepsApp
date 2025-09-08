import React from "react";
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

export default function Paywall() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const from = route?.params?.from as string | undefined;

  const onUnlock = () => {
    Alert.alert(
      "Premium",
      "TODO: Integrate payments in S3-01 (plans + purchase)."
    );
  };

  const onRestore = () => {
    Alert.alert("Restore purchases", "TODO: Implement in S3-01.");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>Premium</Text>
        <Text style={styles.title}>Unlock your guided journey</Text>
        {from ? (
          <Text style={styles.from}>You tapped a Premium task: {from}</Text>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.point}>
            • Guided journey (NOC verification → ECA → Language → Work evidence
            → PoF → EE profile → CRS optimizer/PNP → ITA/e-APR → tracking →
            landing)
          </Text>
          <Text style={styles.point}>• Notifications & due-date reminders</Text>
          <Text style={styles.point}>• Secure Vault for documents</Text>
          <Text style={styles.point}>
            • Live draws & fees with freshness badges
          </Text>
        </View>

        <Pressable accessibilityRole="button" style={styles.cta} onPress={onUnlock}>
          <Text style={styles.ctaText}>Unlock Premium</Text>
        </Pressable>

        <Pressable onPress={onRestore} style={styles.restore}>
          <Text style={styles.restoreText}>Restore purchases</Text>
        </Pressable>

        <Pressable onPress={() => navigation.goBack()} style={styles.later}>
          <Text style={styles.laterText}>Not now</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  container: { padding: 24, gap: 16, alignItems: "center" },
  kicker: {
    fontSize: 16,
    letterSpacing: 1,
    color: "#93C5FD",
    textTransform: "uppercase",
    marginTop: 8,
  },
  title: { fontSize: 24, fontWeight: "700", color: "white", textAlign: "center" },
  from: { fontSize: 12, color: "#9CA3AF", textAlign: "center" },
  card: {
    width: "100%",
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  point: { fontSize: 14, color: "#E5E7EB", lineHeight: 20 },
  cta: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    marginTop: 8,
  },
  ctaText: { color: "white", fontWeight: "700", fontSize: 16 },
  restore: { paddingVertical: 8 },
  restoreText: { color: "#93C5FD", textDecorationLine: "underline" },
  later: { paddingVertical: 8 },
  laterText: { color: "#9CA3AF" },
});
