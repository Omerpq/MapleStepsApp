// src/dev/NocDevScreen.tsx
import React, { useState } from "react";
import { View, Text, Button, ScrollView, TextInput, FlatList } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadNoc, loadNocCategories, codesForCategory } from "../services/noc";

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

  // Search state
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<any[]>([]);

  // Category smoke-test state
  const [catKey, setCatKey] = useState("");
  const [catCodes, setCatCodes] = useState<string[]>([]);

  function runSearch(text: string) {
    setQ(text);
    const list = nocRes?.data ?? [];
    const s = text.trim().toLowerCase();
    if (!s) {
      setHits([]);
      return;
    }
    const out = list
      .filter((it: any) =>
        String(it.code).toLowerCase().includes(s) ||
        String(it.title ?? "").toLowerCase().includes(s)
      )
      .slice(0, 25);
    setHits(out);
  }

  async function onLoadNoc() {
    setStatus("Loading NOC…");
    try {
      const res = await loadNoc();
      setNocRes(res as AnyRes);
      setStatus("Loaded NOC ✔");
      // refresh search results if there is an active query
      if (q) {
        const list = (res as AnyRes).data ?? [];
        const s = q.trim().toLowerCase();
        setHits(
          list
            .filter((it: any) =>
              String(it.code).toLowerCase().includes(s) ||
              String(it.title ?? "").toLowerCase().includes(s)
            )
            .slice(0, 25)
        );
      }
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
      setQ("");
      setHits([]);
      setCatKey("");
      setCatCodes([]);
    } catch (e: any) {
      setStatus("Clear failed ❌ " + (e?.message || String(e)));
    }
  }

  function showCategory(key: string) {
    setCatKey(key);
    const cats = catRes?.data ?? [];
    const items = nocRes?.data ?? [];
    if (!cats.length || !items.length) {
      setStatus("Load NOC and Categories first");
      setCatCodes([]);
      return;
    }
    try {
      const codes = codesForCategory(key, cats);
      setCatCodes(codes);
      setStatus(`Category "${key}" → ${codes.length} codes`);
    } catch (e: any) {
      setStatus(`Category "${key}" failed: ${e?.message || String(e)}`);
      setCatCodes([]);
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

      {/* Search (enabled after NOC loads) */}
      <TextInput
        placeholder="Search NOC (code or title)…"
        value={q}
        editable={!!nocRes}
        onChangeText={runSearch}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          borderWidth: 1,
          borderColor: nocRes ? "#ccc" : "#eee",
          padding: 10,
          borderRadius: 8,
          marginBottom: 10,
          backgroundColor: nocRes ? "#fff" : "#f7f7f7",
        }}
      />

      <FlatList
        data={hits}
        keyExtractor={(item: any) => String(item.code)}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#eee" }}>
            <Text style={{ fontWeight: "700" }}>{item.code}</Text>
            <Text>{item.title}</Text>
          </View>
        )}
        ListEmptyComponent={
          q ? <Text style={{ color: "#888" }}>No matches.</Text> : null
        }
        style={{ marginBottom: 12 }}
      />

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

      <View style={{ height: 1, backgroundColor: "#333", marginVertical: 12 }} />

      {/* Category smoke-test */}
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Category smoke-test</Text>
      <View style={{ flexDirection: "row", gap: 12, marginVertical: 8 }}>
        <Button title="STEM codes" onPress={() => showCategory("stem")} />
        <Button title="Trades codes" onPress={() => showCategory("trades")} />
      </View>

      {catKey ? (
        <View>
          <Text>key: {catKey}</Text>
          <Text numberOfLines={3}>codes: {catCodes.join(", ") || "(none)"}</Text>
        </View>
      ) : (
        <Text style={{ color: "#888" }}>
          Tap a button to list codes for that category.
        </Text>
      )}
    </ScrollView>
  );
}
