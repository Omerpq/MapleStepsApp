import React from "react";
import { ScrollView, Text, View } from "react-native";

export default function PolicyScreen() {
  return (
    <ScrollView style={{ backgroundColor: "#fff" }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <View style={{ marginBottom: 8 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: "#111827" }}>Privacy Policy</Text>
        <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Last updated: 12 Oct 2025</Text>
      </View>

      <Text style={{ color: "#111827", marginTop: 12 }}>
        MapleSteps (“we”, “our”, “us”) provides tools to help users plan their Canadian PR journey. This policy explains what we collect, how we use it, and your choices.
      </Text>

      <Text style={{ fontWeight: "700", marginTop: 16, color: "#111827" }}>1. Information we collect</Text>
      <Text style={{ color: "#111827", marginTop: 4 }}>
        • Profile inputs you provide (e.g., age, education, language scores).{"\n"}
        • App analytics and diagnostics (crash logs, performance).{"\n"}
        • Optional contact emails if you reach out to support.
      </Text>

      <Text style={{ fontWeight: "700", marginTop: 16, color: "#111827" }}>2. How we use information</Text>
      <Text style={{ color: "#111827", marginTop: 4 }}>
        • To compute eligibility and build your plan.{"\n"}
        • To improve app reliability and features.{"\n"}
        • To respond to support requests.
      </Text>

      <Text style={{ fontWeight: "700", marginTop: 16, color: "#111827" }}>3. Data storage & retention</Text>
      <Text style={{ color: "#111827", marginTop: 4 }}>
        We store your data securely and keep it only as long as needed to provide the service. You may request deletion at any time.
      </Text>

      <Text style={{ fontWeight: "700", marginTop: 16, color: "#111827" }}>4. Sharing</Text>
      <Text style={{ color: "#111827", marginTop: 4 }}>
        We do not sell your data. We may share with service providers (e.g., analytics) under strict agreements to operate the app.
      </Text>

      <Text style={{ fontWeight: "700", marginTop: 16, color: "#111827" }}>5. Your choices</Text>
      <Text style={{ color: "#111827", marginTop: 4 }}>
        You can update or delete your information, and you can opt out of optional analytics where available in settings.
      </Text>

      <Text style={{ fontWeight: "700", marginTop: 16, color: "#111827" }}>6. Contact</Text>
      <Text style={{ color: "#111827", marginTop: 4 }}>
        Email: support@maplesteps.app
      </Text>
    </ScrollView>
  );
}
