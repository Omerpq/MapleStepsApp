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

import LandingChecklist from "../screens/LandingChecklist";

// ðŸ‘‡ dev-only diagnostics screen (hidden from normal users)
import NocDevScreen from "../dev/NocDevScreen";

// ðŸ‘‡ ADD THESE TWO IMPORTS
import Paywall from "../screens/Paywall";
import ECAWizard from "../screens/ECAWizard";

import EEProfileChecklist from "../screens/EEProfileChecklist";

// S5-03 â€” Help & Feedback
import Feedback from "../screens/Feedback";


import PNPMapper from "../screens/PNPMapper";


import PRTracker from "../screens/PRTracker";

import EAPRBuilder from "../screens/EAPRBuilder";

import AboutScreen from "../screens/AboutScreen";
import PolicyScreen from "../screens/PolicyScreen";
import TermsScreen from "../screens/TermsScreen";

// anchor: brand-imports
import { Image } from "react-native";

import { MaterialCommunityIcons } from "@expo/vector-icons";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Keep your existing tabs exactly as-is
function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
headerTitleAlign: "left",
tabBarActiveTintColor: colors.mapleRed,
tabBarLabelStyle: { fontSize: 10 },
headerLeft: () => (
  <Image
    source={require("../../assets/brand/logo-glyph.png")}
    style={{ width: 24, height: 24, marginLeft: 12 }}
    resizeMode="contain"
    accessibilityLabel="MapleSteps"
  />
),

      }}
    >
      <Tab.Screen
        name="QuickCheck"
        component={QuickCheckScreen}
        options={{
    title: "QuickCheck",
    tabBarLabel: "Eligibility",
    tabBarIcon: ({ color, size }) => (
      <MaterialCommunityIcons name="clipboard-check-outline" size={size} color={color} />
    ),
  }}
      />
      <Tab.Screen
  name="Score"
  component={ScoreScreen}
  options={{
    title: "Score",
    tabBarIcon: ({ color, size }) => (
      <MaterialCommunityIcons name="trophy-outline" size={size} color={color} />
    ),
  }}
/>

      
      
      
      <Tab.Screen
  name="ActionPlan"
  component={ActionPlanScreen}
  options={{
    title: "Action Plan",
    tabBarLabel: "Plan",
    tabBarIcon: ({ color, size }) => (
      <MaterialCommunityIcons name="playlist-check" size={size} color={color} />
    ),
  }}
/>

      <Tab.Screen
  name="Timeline"
  component={TimelineScreen}
  options={{
    title: "Timeline",
    tabBarIcon: ({ color, size }) => (
      <MaterialCommunityIcons name="timeline-clock-outline" size={size} color={color} />
    ),
  }}
/>
      <Tab.Screen
  name="Updates"
  component={UpdatesScreen}
  options={{
    title: "Updates",
    tabBarIcon: ({ color, size }) => (
      <MaterialCommunityIcons name="update" size={size} color={color} />
    ),
  }}
/>
      <Tab.Screen
  name="Vault"
  component={VaultScreen}
  options={{
    title: "Vault",
    tabBarIcon: ({ color, size }) => (
      <MaterialCommunityIcons name="shield-lock-outline" size={size} color={color} />
    ),
  }}
/>
      <Tab.Screen
  name="Settings"
  component={SettingsScreen}
  options={{
    title: "Settings",
    tabBarIcon: ({ color, size }) => (
      <MaterialCommunityIcons name="cog-outline" size={size} color={color} />
    ),
  }}
/>
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
        options={{ title: "" }}  // no presentation:"modal"
      />

      <Stack.Screen
        name="ECAWizard"
        component={ECAWizard}
        options={{ title: "ECA Wizard" }}
      />
      <Stack.Screen
        name="LanguagePlanner"
        component={LanguagePlanner}
        options={{ title: "" }}
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
      <Stack.Screen
        name="PRTracker"
        component={PRTracker}
        options={{ title: "", headerShown: true }}
      />
      <Stack.Screen
  name="LandingChecklist"
  component={LandingChecklist}
  options={{ headerTitle: "" }}
/>


      <Stack.Screen
  name="Vault"
  component={VaultScreen}
  options={{ headerShown: false }}
/>

      {/* S5-03 â€” Help & Feedback */}
      <Stack.Screen
  name="Feedback"
  component={Feedback}
  options={{ headerTitle: "" }}
/>


        <Stack.Screen
            name="AboutMapleSteps"
            component={AboutScreen}
            options={{ title: "" }}
            />

        <Stack.Screen
            name="Policy"
            component={PolicyScreen}
            options={{ title: "" }}
            />

            <Stack.Screen
            name="Terms"
            component={TermsScreen}
            options={{ title: "" }}
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