// src/screens/EAPRBuilder.tsx
import React from "react";
import { View, Text } from "react-native";

export default function EAPRBuilder() {
  return (
    <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
      <Text style={{ fontSize: 20, fontWeight: "600", marginBottom: 8 }}>
        e-APR Builder
      </Text>
      <Text>
        This is a placeholder screen. Access is gated by the ITA readiness
        check. If you reached here, the gate allowed navigation (all required
        checks are OK).
      </Text>
    </View>
  );
}
