// src/services/eapr.ts
import AsyncStorage from "@react-native-async-storage/async-storage";



// --- Config ---
export const EAPR_GUIDES_URL =
  "https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/content/guides/eapr.json";

// --- AsyncStorage Keys ---
export const EAPR_GUIDES_CACHE_KEY = "ms.eapr.guides.cache.v1";
export const EAPR_GUIDES_META_KEY = "ms.eapr.guides.meta.v1";
export const EAPR_STATE_KEY = "ms.eapr.state.v1";

// --- Types ---
export type EAPRDoc = {
  id: string;
  title: string;
  required?: boolean;
  officialLink?: string;
  /** Optional helper text coming from guides/eapr.json */
  description?: string;
};

export type EAPRGuide = {
  id: string; // e.g., "eapr"
  title: string;
  sections: Array<{
    id: string;
    title: string;
    docs: EAPRDoc[];
  }>;
  /** Optional list of text tips shown at the bottom of the screen */
  tips?: string[];
};


export type EAPRPackState = {
  items: {
    [sectionId: string]: {
      [docId: string]: {
        provided?: boolean;
        filename?: string;
        sizeBytes?: number;
        notes?: string;
      };
    };
  };
};

export type A4Meta = {
  source: "remote" | "cache";
  status: 200 | 304;
  etag?: string | null;
  last_modified?: string | null;
  fetchedAtISO: string; // when we fetched/validated now
  __cachedAt?: string | null; // kept for compatibility with older code
};

// --- Internal helpers ---
async function readJSON<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJSON(key: string, val: any): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(val));
}

// Merge current state with any new docs that appear in guides (don’t drop user data)
function hydrateStateFromGuide(guide: EAPRGuide, state: EAPRPackState | null): EAPRPackState {
  const next: EAPRPackState = state ?? { items: {} };
  for (const section of guide.sections) {
    next.items[section.id] = next.items[section.id] ?? {};
    for (const d of section.docs) {
      next.items[section.id][d.id] = next.items[section.id][d.id] ?? {};
    }
  }
  return next;
}

// --- Public API ---

/**
 * A4-style loader for eAPR guides with conditional GET using ETag/Last-Modified.
 * Caches body + meta to AsyncStorage.
 */
export async function loadEaprGuides(): Promise<{ guide: EAPRGuide; meta: A4Meta }> {
  const metaPrev = await readJSON<{
    etag?: string | null;
    last_modified?: string | null;
  } & Partial<A4Meta>>(EAPR_GUIDES_META_KEY);

  const headers: Record<string, string> = {};
  if (metaPrev?.etag) headers["If-None-Match"] = String(metaPrev.etag);
  if (metaPrev?.last_modified) headers["If-Modified-Since"] = String(metaPrev.last_modified);

  const res = await fetch(EAPR_GUIDES_URL, { method: "GET", headers });
  const nowISO = new Date().toISOString();

  if (res.status === 200) {
const textRaw = await res.text();
const text = textRaw.replace(/^\uFEFF/, ""); // strip UTF-8 BOM if present
let body: any;
try {
  body = JSON.parse(text);
} catch {
  throw new Error(`Guides JSON parse failed. Head: ${text.slice(0, 80)}`);
}
    // eapr.json is expected to already be a guide object; normalize minimal fields
    const guide: EAPRGuide = {
  id: body.id ?? "eapr",
  title: body.title ?? "e-APR Document Pack",
  sections: body.sections ?? body, // support {sections:[...]} or bare array
  tips: Array.isArray(body.tips) ? body.tips as string[] : undefined,
};


    const meta: A4Meta = {
      source: "remote",
      status: 200,
      etag: res.headers.get("ETag"),
      last_modified: res.headers.get("Last-Modified"),
      fetchedAtISO: nowISO,
      __cachedAt: nowISO,
    };
    await writeJSON(EAPR_GUIDES_CACHE_KEY, guide);
    await writeJSON(EAPR_GUIDES_META_KEY, {
      etag: meta.etag,
      last_modified: meta.last_modified,
      status: meta.status,
      fetchedAtISO: meta.fetchedAtISO,
      __cachedAt: meta.__cachedAt,
    });
    // Ensure pack state is hydrated with any new docs
    const currState = await readJSON<EAPRPackState>(EAPR_STATE_KEY);
    const hydrated = hydrateStateFromGuide(guide, currState);
    if (currState == null) {
      await writeJSON(EAPR_STATE_KEY, hydrated);
    }
    return { guide, meta };
  }

  if (res.status === 304) {
    const guide = (await readJSON<EAPRGuide>(EAPR_GUIDES_CACHE_KEY))!;
    const meta: A4Meta = {
      source: "cache",
      status: 304,
      etag: metaPrev?.etag ?? null,
      last_modified: metaPrev?.last_modified ?? null,
      fetchedAtISO: nowISO,
      __cachedAt: metaPrev?.__cachedAt ?? metaPrev?.fetchedAtISO ?? nowISO,
    };
    // update last checked
    await writeJSON(EAPR_GUIDES_META_KEY, {
      etag: meta.etag,
      last_modified: meta.last_modified,
      status: meta.status,
      fetchedAtISO: meta.fetchedAtISO,
      __cachedAt: meta.__cachedAt,
    });
    // also ensure state has all docs
    const currState = await readJSON<EAPRPackState>(EAPR_STATE_KEY);
    const hydrated = hydrateStateFromGuide(guide, currState);
    if (!currState) await writeJSON(EAPR_STATE_KEY, hydrated);
    return { guide, meta };
  }

  // Unexpected code: fall back to cache if present
  const fallback = await readJSON<EAPRGuide>(EAPR_GUIDES_CACHE_KEY);
  if (fallback) {
    const meta: A4Meta = {
      source: "cache",
      status: 304,
      etag: metaPrev?.etag ?? null,
      last_modified: metaPrev?.last_modified ?? null,
      fetchedAtISO: nowISO,
      __cachedAt: metaPrev?.__cachedAt ?? metaPrev?.fetchedAtISO ?? nowISO,
    };
    return { guide: fallback, meta };
  }
  throw new Error(`Failed to load eAPR guides: HTTP ${res.status}`);
}

/** Reads current pack state (initializes when missing). */
export async function getPackState(): Promise<EAPRPackState> {
  const guide = (await readJSON<EAPRGuide>(EAPR_GUIDES_CACHE_KEY)) as EAPRGuide | null;
  const existing = await readJSON<EAPRPackState>(EAPR_STATE_KEY);
  if (guide) {
    const hydrated = hydrateStateFromGuide(guide, existing);
    if (!existing) await writeJSON(EAPR_STATE_KEY, hydrated);
    return hydrated;
  }
  // no guide yet: return existing or empty
  return existing ?? { items: {} };
}

/** Toggles provided on a document and persists state. */
export async function markProvided(sectionId: string, docId: string, provided: boolean): Promise<EAPRPackState> {
  const state = (await readJSON<EAPRPackState>(EAPR_STATE_KEY)) ?? { items: {} };
  state.items[sectionId] = state.items[sectionId] ?? {};
  state.items[sectionId][docId] = state.items[sectionId][docId] ?? {};
  state.items[sectionId][docId].provided = provided;
  await writeJSON(EAPR_STATE_KEY, state);
  return state;
}

/** Updates filename/sizeBytes/notes for a document and persists state. */
export async function updateDocInfo(
  sectionId: string,
  docId: string,
  patch: Partial<{ filename: string; sizeBytes: number; notes: string }>
): Promise<EAPRPackState> {
  const state = (await readJSON<EAPRPackState>(EAPR_STATE_KEY)) ?? { items: {} };
  state.items[sectionId] = state.items[sectionId] ?? {};
  state.items[sectionId][docId] = state.items[sectionId][docId] ?? {};
  const curr = state.items[sectionId][docId];
  if (patch.filename !== undefined) curr.filename = patch.filename || undefined;
  if (patch.sizeBytes !== undefined) curr.sizeBytes = Number.isFinite(patch.sizeBytes as number) ? (patch.sizeBytes as number) : undefined;
  if (patch.notes !== undefined) curr.notes = patch.notes ?? undefined;
  await writeJSON(EAPR_STATE_KEY, state);
  return state;
}

/** Validates required docs and returns list of missing issues. */
export function validatePack(guide: EAPRGuide, state: EAPRPackState): Array<{ sectionId: string; title: string; message: string }> {
  const issues: Array<{ sectionId: string; title: string; message: string }> = [];
  for (const section of guide.sections) {
    for (const d of section.docs) {
      if (d.required) {
        const st = state.items?.[section.id]?.[d.id];
        if (!st || st.provided !== true) {
          issues.push({ sectionId: section.id, title: d.title, message: "Required but not marked as provided" });
        }
      }
    }
  }
  return issues;
}

// --- DEV/QA helpers (optional chips on screen) ---
/** Wipes guides cache, meta, user pack state, and IRCC Live TTL meta. */
export async function clearEaprCaches(): Promise<void> {
  await AsyncStorage.multiRemove([
    EAPR_GUIDES_CACHE_KEY,
    EAPR_GUIDES_META_KEY,
    EAPR_STATE_KEY,
    "ms.eapr.ircc.live.meta.v1", // IRCC Live TTL cache
  ]);
}


/** Forces next load to go remote by clearing meta validators. */
export async function forceEaprRevalidate(): Promise<void> {
  await AsyncStorage.removeItem(EAPR_GUIDES_META_KEY);
}
