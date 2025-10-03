// src/services/eapr.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { EAPR_GUIDES_URL } from "./config";

export type EAPRDoc = {
  id: string;
  title: string;
  description?: string;
  required: boolean;
  officialLink?: string;
};

export type EAPRSection = {
  id: string;
  title: string;
  docs: EAPRDoc[];
};

export type EAPRGuide = {
  version: string;
  sections: EAPRSection[];
  tips?: string[];
};

export type LoaderMeta = {
  source: "remote" | "cache";
  status: 200 | 304;
  etag?: string | null;
  last_modified?: string | null;
  fetchedAtISO: string; // when we fetched/validated remote
  __cachedAt?: string | null; // when cache was last written
};

export type EAPRLoaderResult = {
  guide: EAPRGuide;
  meta: LoaderMeta;
};

const CACHE_KEY = "ms.eapr.guides.cache.v1";
const META_KEY  = "ms.eapr.guides.meta.v1";
const STATE_KEY = "ms.eapr.state.v1";

export type EAPRDocState = {
  provided: boolean;
  filename?: string;
  sizeBytes?: number;
  notes?: string;
};

export type EAPRPackState = {
  /** map: sectionId -> docId -> state */
  items: Record<string, Record<string, EAPRDocState>>;
  updatedAtISO: string;
};

// ---- helpers ----
async function getCached(): Promise<{guide: EAPRGuide | null; meta: LoaderMeta | null}> {
  const [g, m] = await Promise.all([
    AsyncStorage.getItem(CACHE_KEY),
    AsyncStorage.getItem(META_KEY),
  ]);
  return {
    guide: g ? JSON.parse(g) as EAPRGuide : null,
    meta: m ? JSON.parse(m) as LoaderMeta : null,
  };
}

async function setCache(guide: EAPRGuide, meta: LoaderMeta): Promise<void> {
  const now = new Date().toISOString();
  const metaWithCache: LoaderMeta = { ...meta, __cachedAt: now };
  await Promise.all([
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(guide)),
    AsyncStorage.setItem(META_KEY, JSON.stringify(metaWithCache)),
  ]);
}

// A4: Remote → Cache → (no Local bundle yet)
export async function loadEaprGuides(): Promise<EAPRLoaderResult> {
  const cached = await getCached();

  // Use validators if present
  const headers: Record<string, string> = {};
  if (cached.meta?.etag) headers["If-None-Match"] = cached.meta.etag;
  if (cached.meta?.last_modified) headers["If-Modified-Since"] = cached.meta.last_modified as string;

  try {
    const resp = await fetch(EAPR_GUIDES_URL, { headers });
    if (resp.status === 304 && cached.guide && cached.meta) {
      const meta: LoaderMeta = {
        source: "cache",
        status: 304,
        etag: cached.meta.etag ?? null,
        last_modified: cached.meta.last_modified ?? null,
        fetchedAtISO: cached.meta.fetchedAtISO ?? new Date().toISOString(),
        __cachedAt: cached.meta.__cachedAt ?? null,
      };
      return { guide: cached.guide, meta };
    }

    if (resp.ok) {
      const guide = (await resp.json()) as EAPRGuide;
      const etag = resp.headers.get("ETag");
      const lastMod = resp.headers.get("Last-Modified");
      const meta: LoaderMeta = {
        source: "remote",
        status: 200,
        etag,
        last_modified: lastMod,
        fetchedAtISO: new Date().toISOString(),
        __cachedAt: null,
      };
      await setCache(guide, meta);
      return { guide, meta: { ...meta, __cachedAt: new Date().toISOString() } };
    }

    // Non-200/304: fallback to cache if available
    if (cached.guide && cached.meta) {
      return {
        guide: cached.guide,
        meta: {
          ...cached.meta,
          source: "cache",
          status: 304,
          fetchedAtISO: cached.meta.fetchedAtISO ?? new Date().toISOString(),
        },
      };
    }
    throw new Error(`Failed to load ${EAPR_GUIDES_URL}: ${resp.status}`);
  } catch (e) {
    if (cached.guide && cached.meta) {
      return {
        guide: cached.guide,
        meta: {
          ...cached.meta,
          source: "cache",
          status: 304,
          fetchedAtISO: cached.meta.fetchedAtISO ?? new Date().toISOString(),
        },
      };
    }
    // ultimate fallback: empty guide
    return {
      guide: { version: "dev", sections: [], tips: [] },
      meta: {
        source: "cache",
        status: 304,
        fetchedAtISO: new Date().toISOString(),
        etag: null,
        last_modified: null,
        __cachedAt: null,
      },
    };
  }
}

// State persistence
export async function getPackState(): Promise<EAPRPackState> {
  const s = await AsyncStorage.getItem(STATE_KEY);
  if (s) return JSON.parse(s) as EAPRPackState;
  return { items: {}, updatedAtISO: new Date().toISOString() };
}

export async function setPackState(updater: (prev: EAPRPackState) => EAPRPackState): Promise<EAPRPackState> {
  const prev = await getPackState();
  const next = updater(prev);
  next.updatedAtISO = new Date().toISOString();
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(next));
  return next;
}

export async function markProvided(sectionId: string, docId: string, provided: boolean): Promise<EAPRPackState> {
  return setPackState(prev => {
    const section = prev.items[sectionId] ?? {};
    const curr = section[docId] ?? {};
    section[docId] = { ...curr, provided };
    return { ...prev, items: { ...prev.items, [sectionId]: section } };
  });
}

export async function updateDocInfo(sectionId: string, docId: string, info: Partial<EAPRDocState>): Promise<EAPRPackState> {
  return setPackState(prev => {
    const section = prev.items[sectionId] ?? {};
    const curr = section[docId] ?? {};
    section[docId] = { ...curr, ...info };
    return { ...prev, items: { ...prev.items, [sectionId]: section } };
  });
}

export type EAPRValidationIssue = {
  sectionId: string;
  docId: string;
  title: string;
  message: string;
};

export function validatePack(guide: EAPRGuide, state: EAPRPackState): EAPRValidationIssue[] {
  const issues: EAPRValidationIssue[] = [];
  for (const section of guide.sections) {
    for (const d of section.docs) {
      if (d.required) {
        const ok = state.items?.[section.id]?.[d.id]?.provided === true;
        if (!ok) {
          issues.push({
            sectionId: section.id,
            docId: d.id,
            title: d.title,
            message: "Required document not marked as provided.",
          });
        }
      }
    }
  }
  return issues;
}
