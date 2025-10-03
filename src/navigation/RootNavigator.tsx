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
import LanguagePlanner from "../screens/LanguagePlanner";
import NOCVerify from "../screens/NOCVerify";

import ProofOfFunds from "../screens/ProofOfFunds";


// 👇 dev-only diagnostics screen (hidden from normal users)
import NocDevScreen from "../dev/NocDevScreen";

// 👇 ADD THESE TWO IMPORTS
import Paywall from "../screens/Paywall";
import ECAWizard from "../screens/ECAWizard";

import EEProfileChecklist from "../screens/EEProfileChecklist";
import EAPRBuilder from "../screens/EAPRBuilder";


import PNPMapper from "../screens/PNPMapper";

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
    // 1) turn headers ON by default
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      {/* 2) hide header only for the tab container */}
      <Stack.Screen
        name="MainTabs"
        component={Tabs}
        options={{ headerShown: false }}
      />

      {/* 3) let Paywall use the default stack header (back arrow) */}
      <Stack.Screen
        name="Paywall"
        component={Paywall}
        options={{ title: "Go Premium" }}  // no presentation:"modal"
      />

      <Stack.Screen
        name="ECAWizard"
        component={ECAWizard}
        options={{ title: "ECA Wizard" }}
      />
      <Stack.Screen
        name="LanguagePlanner"
        component={LanguagePlanner}
        options={{ title: "Language Planner" }}
      />
      <Stack.Screen
        name="NOCVerify"
        component={NOCVerify}
        options={{ title: "NOC Verification" }}
      />
      <Stack.Screen
        name="ProofOfFunds"
        component={ProofOfFunds}
        options={{ title: "Proof of Funds" }}
      />
     <Stack.Screen 
        name="PNPMapper"
        component={PNPMapper}
        options={{ title: "PNP Mapper", headerShown: true }} 
      />


      <Stack.Screen
        name="EEProfileChecklist"
        component={EEProfileChecklist}
        options={{ title: "EE Profile Checklist" }}
      />

      <Stack.Screen
        name="EAPRBuilder"
        component={EAPRBuilder}
        options={{ title: "e-APR Builder", headerShown: true }}
      />


      {__DEV__ && (
        <Stack.Screen
          name="NocDev"
          component={NocDevScreen}
          options={{ title: "NOC Dev Check" }}
        />
      )}
    </Stack.Navigator>
  );
}
