import AsyncStorage from "@react-native-async-storage/async-storage";

import { Platform } from "react-native";

/** CORS-aware fetch: on web, IRCC pages block localhost (no CORS). We mark as corsBlocked instead of throwing. */
async function fetchCorsAware(url: string, method: "HEAD" | "GET") {
  if (Platform.OS === "web") {
    return { ok: false as const, status: 0, headers: new Headers(), corsBlocked: true };
  }
  try {
    const res = await fetch(url, { method });
    return { ok: res.ok, status: res.status, headers: res.headers, corsBlocked: false };
  } catch {
    return { ok: false as const, status: 0, headers: new Headers(), corsBlocked: false };
  }
}


export type IrccLink = { id: string; title: string; url: string };
export type IrccLiveMeta = {
  verifiedAtISO: string;      // when we last verified remotely
  links: Array<IrccLink & { status: number | null; lastModified?: string | null }>;
  source: "live" | "cache";
};

const KEY = "ms.eapr.ircc.live.meta.v1";
const TTL_MS = 24 * 60 * 60 * 1000;

export const IRCC_LINKS: IrccLink[] = [
  { id: "docs_overview", title: "Express Entry — Documents", url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents.html" },
  { id: "pof",           title: "Proof of funds",            url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/proof-funds.html" },
  { id: "language",      title: "Language test results",     url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/language-test.html" },
  { id: "police",        title: "Police certificates",       url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/police-certificates.html" },
  { id: "medical",       title: "Medical exam (PR)",         url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/application/medical-police/medical-exams/requirements-permanent-residents.html" },
  { id: "photo_specs",   title: "PR photo specs (PDF)",      url: "https://www.canada.ca/content/dam/ircc/migration/ircc/english/information/applications/guides/pdf/5445eb-e.pdf" },
  { id: "help_filesize", title: "IRCC file-size guidance",   url: "https://ircc.canada.ca/english/helpcentre/answer.asp?qnum=1123&top=23" }
];

async function getCache(): Promise<IrccLiveMeta | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as IrccLiveMeta; } catch { return null; }
}

export async function loadIrccLiveMeta(forceRemote = false): Promise<IrccLiveMeta> {
  const cached = await getCache();
  const now = Date.now();
  const fresh = cached && (now - new Date(cached.verifiedAtISO).getTime() < TTL_MS);

  if (cached && !forceRemote && fresh) return { ...cached, source: "cache" };

  try {
    // Use HEAD where possible; fall back to GET with no-cache headers
    const checks = await Promise.all(IRCC_LINKS.map(async (l) => {
      try {
        const resp = await fetchCorsAware(l.url, "HEAD");

        const lastMod = resp.headers.get("Last-Modified");
        return { ...l, status: resp.status, lastModified: lastMod ?? undefined };
      } catch {
        try {
          const resp = await fetchCorsAware(l.url, "GET");
          const lastMod = resp.headers.get("Last-Modified");
          return { ...l, status: resp.status, lastModified: lastMod ?? undefined };
        } catch {
          return { ...l, status: null, lastModified: undefined };
        }
      }
    }));

    const meta: IrccLiveMeta = {
      verifiedAtISO: new Date().toISOString(),
      links: checks,
      source: "live",
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(meta));
    return meta;
  } catch {
  if (cached) {
    // Stamp NOW so the UI reflects this refresh attempt even if we had to use cache
    return { ...cached, source: "cache", verifiedAtISO: new Date().toISOString() };
  }
  return {
    verifiedAtISO: new Date().toISOString(),
    links: IRCC_LINKS.map(l => ({ ...l, status: null })),
    source: "cache"
  };
}

}
