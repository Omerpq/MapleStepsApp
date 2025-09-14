// src/services/rules.ts
import rules from "../data/rules.sample.json";
import AsyncStorage from "@react-native-async-storage/async-storage";

export function getRulesVersion(): string {
  return rules.rules_version || "dev";
}

// Clear all persisted rule-related caches (updates + scoring)
export async function clearAllRulesCaches(): Promise<void> {
  await AsyncStorage.multiRemove([
    "ms_rounds_cache_v2",       // Updates → rounds cache
    "ms_fees_cache_v1",         // Updates → fees cache
    "ms_crs_params_cache_v1",   // CRS params cache
    "ms_fsw_params_cache_v1",   // FSW params cache
    "ms_fees_test_seeded_v1",   // <-- add this (test-only seeding flag)
  ]);
}
