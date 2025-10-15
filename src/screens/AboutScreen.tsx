import React from "react";
import { ScrollView, View, Text, Image, Linking, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";

import HowItWorksSheet from '../components/onboarding/HowItWorksSheet';


function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{ paddingVertical: 12 }} accessibilityRole="button">
      <Text style={{ fontSize: 16, color: "#111827" }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function AboutScreen() {
  
  const navigation = useNavigation<any>(); // <-- add
  // If you inject app version via Constants.manifest?.version, feel free to replace this.
  const [showHowItWorks, setShowHowItWorks] = React.useState(false);

  const version = "1.0.1";

return (
  <>
  {/* [how-it-works] sheet */}
{showHowItWorks && (
  <HowItWorksSheet
    onStart={() => {
    setShowHowItWorks(false);
    navigation.navigate('MainTabs', { screen: 'ActionPlan' });
  }}
    onSkip={() => setShowHowItWorks(false)}
  />
)}

    <ScrollView style={{ backgroundColor: "#fff" }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <View style={{ marginBottom: 6 }}>
        <Text style={{ fontSize: 18, fontWeight: "600", color: "#111827", marginBottom: 6 }}>About MapleSteps</Text>
        <Text style={{ color: "#6B7280" }}>Version {version}</Text>
      </View>
{/* [how-it-works] quick access */}
<View style={{ marginTop: 8, marginBottom: 12 }}>
  <TouchableOpacity
    onPress={() => setShowHowItWorks(true)}
    activeOpacity={0.7}
    style={{ paddingVertical: 12, borderRadius: 10, backgroundColor: '#6b1010' }}
    accessibilityRole="button"
  >
    <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>
      How MapleSteps works
    </Text>
  </TouchableOpacity>
</View>

      <View style={{ borderTopWidth: 1, borderTopColor: "#E5E7EB", marginTop: 16, paddingTop: 12 }}>
        <LinkRow label="Privacy Policy" onPress={() => navigation.navigate("Policy")} />
        <LinkRow label="Terms of Service"  onPress={() => navigation.navigate("Terms")} />
        <LinkRow label="Contact Support" onPress={() => Linking.openURL("mailto:support@maplesteps.app")} />
        <LinkRow label="Rate the app" onPress={() => Linking.openURL("market://details?id=com.omerpq.maplesteps")} />
      </View>

      <View style={{ marginTop: 16 }}>
        <Text style={{ fontSize: 13, color: "#6B7280" }}>
          Data sources include IRCC and ESDC. This app is not affiliated with the Government of Canada.
        </Text>
      </View>

      {/* bottom wordmark */}
      <View style={{ alignItems: "center", marginTop: 24 }}>
        <Image
          source={require("../../assets/brand/wordmark-light.png")}
          style={{ width: 200, height: undefined, aspectRatio: 4.5 }}
          resizeMode="contain"
          accessibilityLabel="MapleSteps"
        />
      </View>

      {/* footer */}
      <View style={{ alignItems: "center", marginTop: 8, marginBottom: 8 }}>
        <Text style={{ fontSize: 12, color: "#6B7280" }}>© 2025 MapleSteps • All rights reserved.</Text>
        <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>
          Developed in <Text style={{ color: "#6B1010", fontWeight: "600" }}>Canada</Text> with care
        </Text>
      </View>
    </ScrollView>
      </>
);
}
