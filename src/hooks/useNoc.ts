// src/hooks/useNoc.ts
import { useEffect, useMemo, useState } from "react";
import { loadNoc, loadNocCategories, type NocItem, type NocCategory } from "../services/noc";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Status = "idle" | "loading" | "ready" | "error";

export function useNoc() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<NocItem[]>([]);
  const [cats, setCats] = useState<NocCategory[]>([]);
  const [meta, setMeta] = useState<{ noc?: any; cats?: any }>({});
  const [sources, setSources] = useState<{ noc?: string; cats?: string }>({});
    // trigger re-fetch on demand
  const [tick, setTick] = useState(0);

  async function clearCaches() {
  await AsyncStorage.multiRemove([
    "ms_noc_cache_v1",
    "ms_noc_categories_cache_v2", // current
    "ms_noc_categories_cache_v1", // legacy
  ]);
}


  async function refresh(clearCache = true) {
    if (clearCache) await clearCaches();
    setTick((t) => t + 1);
  }

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setError(null);
    (async () => {
      try {
        const [nRes, cRes] = await Promise.all([loadNoc(), loadNocCategories()]);
        if (!alive) return;
        setItems(nRes.data);
        setCats(cRes.data);
        setMeta({ noc: nRes.meta, cats: cRes.meta });
        setSources({ noc: nRes.source, cats: cRes.source });
        setStatus("ready");
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Failed to load NOC data");
        setStatus("error");
      }
    })();
    return () => { alive = false; };
  }, [tick]);

  const index = useMemo(
    () => Object.fromEntries(items.map((i) => [i.code, i] as const)),
    [items]
  );

  const categoriesMap = useMemo(
    () => Object.fromEntries(cats.map((c) => [c.key, c.noc_codes] as const)),
    [cats]
  );

  const categoryCounts = useMemo(
    () => Object.fromEntries(cats.map((c) => [c.key, c.noc_codes.length] as const)),
    [cats]
  );

  const isInCategory = (code: string, key: string) =>
    (categoriesMap[key] || []).includes(code);

  return {
    status, error,
    items, index,
    categories: cats,
    categoriesMap,
    categoryCounts,
    meta, sources,
    isInCategory,
    refresh,
  };
}
