// src/dev/NocDevScreen.tsx
import React, { useState } from "react";
import { View, Text, Button, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadNoc, loadNocCategories } from "../services/noc";

type AnyRes = {
  source?: "remote" | "cache" | "local";
  cachedAt?: string | null;
  meta?: { last_checked?: string };
  data?: any[];
};

export default function NocDevScreen() {
  const [nocRes, setNocRes] = useState<AnyRes | null>(null);
  const [catRes, setCatRes] = useState<AnyRes | null>(null);
  const [status, setStatus] = useState<string>("");

  async function onLoadNoc() {
    setStatus("Loading NOC…");
    try {
      const res = await loadNoc();
      setNocRes(res as AnyRes);
      setStatus("Loaded NOC ✔");
    } catch (e: any) {
      setStatus("NOC load failed ❌ " + (e?.message || String(e)));
    }
  }

  async function onLoadCats() {
    setStatus("Loading categories…");
    try {
      const res = await loadNocCategories();
      setCatRes(res as AnyRes);
      setStatus("Loaded categories ✔");
    } catch (e: any) {
      setStatus("Categories load failed ❌ " + (e?.message || String(e)));
    }
  }

  async function onClear() {
    setStatus("Clearing caches…");
    try {
      await AsyncStorage.multiRemove([
        "ms_noc_cache_v1",
        "ms_noc_categories_cache_v1",
      ]);
      setStatus("Cleared caches ✔");
      setNocRes(null);
      setCatRes(null);
    } catch (e: any) {
      setStatus("Clear failed ❌ " + (e?.message || String(e)));
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 12 }}>
        NOC Dev Check
      </Text>

      <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
        <Button title="Load NOC" onPress={onLoadNoc} />
        <Button title="Load Categories" onPress={onLoadCats} />
        <Button title="Clear NOC caches" onPress={onClear} />
      </View>

      <Text style={{ color: "#aaa", marginBottom: 16 }}>Status: {status}</Text>

      <View style={{ height: 1, backgroundColor: "#333", marginVertical: 8 }} />

      <Text style={{ fontSize: 18, fontWeight: "600", marginTop: 8 }}>
        NOC result
      </Text>
      <Text>source: {nocRes?.source ?? ""}</Text>
      <Text>items: {nocRes?.data?.length ?? ""}</Text>
      <Text>cachedAt: {nocRes?.cachedAt ?? ""}</Text>
      <Text>last_checked: {nocRes?.meta?.last_checked ?? ""}</Text>

      <View style={{ height: 1, backgroundColor: "#333", marginVertical: 12 }} />

      <Text style={{ fontSize: 18, fontWeight: "600" }}>Categories result</Text>
      <Text>source: {catRes?.source ?? ""}</Text>
      <Text>categories: {catRes?.data?.length ?? ""}</Text>
      <Text>cachedAt: {catRes?.cachedAt ?? ""}</Text>
      <Text>last_checked: {catRes?.meta?.last_checked ?? ""}</Text>
    </ScrollView>
  );
}
