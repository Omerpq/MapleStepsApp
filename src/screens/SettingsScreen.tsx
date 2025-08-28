// src/screens/SettingsScreen.tsx
import React, { useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { colors } from "../theme/colors";

export default function SettingsScreen({ navigation }: any) {
  const tapCount = useRef(0);
  const lastTapAt = useRef<number>(0);

  function openDev() {
    // Works only in dev because NocDev route is registered under __DEV__
    navigation.navigate("NocDev");
    Alert.alert("Developer tools", "Opened NOC Dev Check");
  }

  function onSecretTap() {
    const now = Date.now();
    // Reset sequence if taps are spaced out
    if (now - lastTapAt.current > 1500) tapCount.current = 0;
    tapCount.current += 1;
    lastTapAt.current = now;
    if (tapCount.current >= 7) {
      tapCount.current = 0;
      openDev();
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.h1}>Settings & Legal</Text>
      <Text>Region: Pakistan (default)</Text>
      <Text style={styles.disclaimer}>
        Disclaimer: This app provides educational information, not legal advice; not affiliated with IRCC.
      </Text>

      {/* Hidden dev opener (long-press OR 7 quick taps) */}
      <TouchableOpacity onPress={onSecretTap} onLongPress={openDev} activeOpacity={0.6}>
        <Text style={styles.secretHint}>
          Version • long-press or tap 7× to open dev tools
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, backgroundColor: "#fff" },
  h1: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: 8 },
  disclaimer: { marginTop: 8, color: "#444" },
  secretHint: { textAlign: "center", color: "#999", marginTop: 24, fontSize: 12 },
});
