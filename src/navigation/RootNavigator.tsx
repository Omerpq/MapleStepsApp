// src/navigation/RootNavigator.tsx
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import QuickCheckScreen from "../screens/QuickCheckScreen";
import ScoreScreen from "../screens/ScoreScreen";
import ActionPlanScreen from "../screens/ActionPlanScreen";
import TimelineScreen from "../screens/TimelineScreen";
import UpdatesScreen from "../screens/UpdatesScreen";
import VaultScreen from "../screens/VaultScreen";
import SettingsScreen from "../screens/SettingsScreen";
import { colors } from "../theme/colors";

// 👇 dev-only diagnostics screen (hidden from normal users)
import NocDevScreen from "../dev/NocDevScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Keep your existing tabs exactly as-is
function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: true, tabBarActiveTintColor: colors.mapleRed }}
    >
      <Tab.Screen name="QuickCheck" component={QuickCheckScreen} options={{ title: "QuickCheck" }} />
      <Tab.Screen name="Score" component={ScoreScreen} options={{ title: "Score" }} />
      <Tab.Screen name="ActionPlan" component={ActionPlanScreen} options={{ title: "Action Plan" }} />
      <Tab.Screen name="Timeline" component={TimelineScreen} options={{ title: "Timeline" }} />
      <Tab.Screen name="Updates" component={UpdatesScreen} options={{ title: "Updates" }} />
      <Tab.Screen name="Vault" component={VaultScreen} options={{ title: "Vault" }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* Your normal app */}
      <Stack.Screen name="MainTabs" component={Tabs} />

      {/* Hidden dev route — only registered in development builds */}
      {__DEV__ && (
        <Stack.Screen
          name="NocDev"
          component={NocDevScreen}
          options={{ headerShown: true, title: "NOC Dev Check", presentation: "modal" }}
        />
      )}
    </Stack.Navigator>
  );
}
