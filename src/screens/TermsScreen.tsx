import React from "react";
import { ScrollView, Text, View } from "react-native";

export default function TermsScreen() {
  return (
    <ScrollView style={{ backgroundColor: "#fff" }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <View style={{ marginBottom: 8 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: "#111827" }}>Terms of Service</Text>
        <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Last updated: 12 Oct 2025</Text>
      </View>

      <Text style={{ color: "#111827", marginTop: 12 }}>
        These Terms govern your use of MapleSteps (“the App”). By using the App, you agree to these Terms.
      </Text>

      <Text style={{ fontWeight: "700", marginTop: 16, color: "#111827" }}>1. Service</Text>
      <Text style={{ color: "#111827", marginTop: 4 }}>
        The App provides planning and tracking tools for Canadian PR. It does not provide legal advice or replace a licensed representative.
      </Text>

      <Text style={{ fontWeight: "700", marginTop: 16, color: "#111827" }}>2. Eligibility & limitations</Text>
      <Text style={{ color: "#111827", marginTop: 4 }}>
        You are responsible for your submissions to IRCC. Scores and suggestions are estimates and may change if government rules change.
      </Text>

      <Text style={{ fontWeight: "700", marginTop: 16, color: "#111827" }}>3. Your responsibilities</Text>
      <Text style={{ color: "#111827", marginTop: 4 }}>
        Keep your inputs accurate; keep your device and login secure; respect applicable laws.
      </Text>

      <Text style={{ fontWeight: "700", marginTop: 16, color: "#111827" }}>4. Liability</Text>
      <Text style={{ color: "#111827", marginTop: 4 }}>
        We provide the App “as is” without warranties. To the maximum extent permitted by law, we are not liable for indirect or incidental damages.
      </Text>

      <Text style={{ fontWeight: "700", marginTop: 16, color: "#111827" }}>5. Changes</Text>
      <Text style={{ color: "#111827", marginTop: 4 }}>
        We may update these Terms. Continued use after updates means you accept the new Terms.
      </Text>

      <Text style={{ fontWeight: "700", marginTop: 16, color: "#111827" }}>6. Contact</Text>
      <Text style={{ color: "#111827", marginTop: 4 }}>
        Email: support@maplesteps.app
      </Text>
    </ScrollView>
  );
}
