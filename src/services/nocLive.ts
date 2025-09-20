// src/services/nocLive.ts
// Drop-in replacement: tolerant live fetch + parsing of Main duties / Tasks
import { getCachedNoc, setCachedNoc, NocLivePayload } from './nocCache';
export type LiveNoc = {
  code: string;
  title?: string;
  teer?: string;
  mainDuties: string[];  // <-- shape expected by NOCVerify
  source?: string;
  fetchedAtISO?: string;
  fromCache?: boolean;
};


// Capture only the FIRST contiguous bullet list after a heading line.
// Prevents leaking into later sections (titles, inclusions, etc.).
function firstBulletBlockAfter(lines: string[], startIdx: number): string[] {
  const out: string[] = [];
  let started = false;
  for (let i = startIdx + 1; i < Math.min(lines.length, startIdx + 300); i++) {
    const l = cleanLine(lines[i]);
    const isBullet = /^[•\-\*\u2022\u2013\u2217]\s+/.test(l); // includes U+2217 "∗"
    if (!started) {
      if (isBullet) { started = true; out.push(l); }
      continue;
    }
    if (!isBullet) break;              // stop at first non-bullet after we’ve started
    out.push(l);
  }
  return out;
}


function normCode(x: any): string {
  const s = String(x ?? "").replace(/\D/g, "");
  return s ? s.padStart(5, "0") : "";
}
function teerFromCode(code5: string): string | undefined {
  return /^\d{5}$/.test(code5) ? code5[1] : undefined;
}

// ---------- proxy fetch (CORS-safe via r.jina.ai) ----------
async function fetchViaProxy(url: string): Promise<string | null> {
  const clean = url.replace(/^https?:\/\//, "");
  const candidates = [
    `https://r.jina.ai/https://${clean}`,
    `https://r.jina.ai/http://${clean}`,
  ];
  for (const proxied of candidates) {
    try {
      const res = await fetch(proxied, { method: "GET" });
      const txt = await res.text();
      if (res.ok && txt && txt.length > 50) return txt;
    } catch {
      // try next
    }
  }
  return null;
}

// ---------- parsing helpers ----------
function cleanLine(s: string): string {
  return s.replace(/\u00A0/g, " ").trim();
}

function pickSection(
  lines: string[],
  startHeads: RegExp[],
  stopHeads: RegExp[]
): string[] {
  const start = lines.findIndex((l) => startHeads.some((re) => re.test(l)));
  if (start === -1) return [];
  const after = lines.slice(start + 1);
  let stop = after.findIndex((l) => stopHeads.some((re) => re.test(l)));
  if (stop === -1) stop = Math.min(after.length, 200);
  return after.slice(0, stop);
}

function isGarbageBullet(s: string): boolean {
  const t = s.toLowerCase();
  if (/^#{2,}/.test(s)) return true;   // markdown headers like "##### Dentists"
  if (/\]\(https?:\/\//i.test(s)) {
    if (t.includes('canada.ca')) return true;
    if (t.includes('jobbank.gc.ca')) return true;
  }
  if (t.startsWith('skip to ')) return true;
  if (t.includes('#wb-')) return true;
  if (t.includes('about government')) return true;
  if (t.includes('switch to basic html')) return true;
  if (t.includes('language selection')) return true;
  if (t.includes('government of canada')) return true;
  if (t.includes('student employment')) return true;
  if (t.includes('breadcrumb')) return true;
  return false;
}

function bulletsFromSection(sectionLines: string[]): string[] {
  const out: string[] = [];
  for (const raw of sectionLines) {
    const l = cleanLine(raw);
    const m = l.match(/^[•\-\*\u2022\u2013\u2217]\s*(.+)$/); // allow U+2217 "∗"
    if (m) {
      const text = m[1].trim();
      if (!isGarbageBullet(text)) out.push(text);
    }
  }
  return Array.from(new Set(out))
    .filter(s => s.length > 6 && /[a-z]/i.test(s))
    .slice(0, 40);
}

// Enforce a hard budget for live fetch (so UI can fallback quickly)
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('LIVE_TIMEOUT')), ms);
    p.then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); }
    );
  });
}


// ---------- public API ----------
export async function fetchNocFromLive(code: string): Promise<LiveNoc> {
  const code5 = normCode(code);
  if (!code5) return { code: "", mainDuties: [] };

  // === Cache fast-path (24h TTL) ===
  const cached = await getCachedNoc(code5);
  if (cached && !cached.expired) {
    const p = cached.payload;
    try {
      console.log(
        "[NOC_DEBUG]",
        JSON.stringify(
          {
            code: code5,
            usedSource: (p.source ?? (p.sourceUrl?.includes('jobbank.gc.ca') ? 'jobbank' : 'esdc')) || 'esdc',
            url: p.sourceUrl || '',
            count: p.mainDuties.length,
            items: p.mainDuties,
            fromCache: true,
            fetchedAtISO: p.fetchedAtISO
          },
          null,
          2
        )
      );
    } catch {}
    return {
  code: p.code,
  title: p.title,
  teer: typeof p.teer === 'string' ? p.teer : String(p.teer ?? ''),
  mainDuties: p.mainDuties,
  source: p.sourceUrl || p.source,
  fetchedAtISO: p.fetchedAtISO,
  fromCache: true,
};

  }

  // === Live attempt wrapped so we can apply a hard timeout ===
  const liveAttempt = (async (): Promise<LiveNoc> => {
    let largeEsdc: LiveNoc | null = null;  // fallback if Job Bank fails

    const sources = [
      {
        kind: "esdc",
        url: `https://noc.esdc.gc.ca/Structure/NOCProfile?GocTemplateCulture=en-CA&code=${code5}&version=2021.0`,
      },
      {
        kind: "jobbank",
        url: `https://www.jobbank.gc.ca/noc-detail-occupation-${Number(code5)}?lang=en&wbdisable=true`,
      },
    ] as const;

    for (const s of sources) {
      const text = await fetchViaProxy(s.url);
      if (!text) continue;

      const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);

      // Title guess (ESDC typically shows "31110 – <Title>")
      const guessTitle =
        lines.find((l) => /^[0-9]{5}\s*[-–]\s*/.test(l)) ||
        lines.find((l) => /^[A-Z].{4,}$/.test(l));
      const title =
        guessTitle?.replace(/^[0-9]{4,5}\s*[-–]\s*/, "").trim() || undefined;

      let sec: string[] = [];
      if (s.kind === "jobbank") {
        // Job Bank: “Tasks” or sometimes “Main duties”
        sec = pickSection(
          lines,
          [/(^|\s)(Tasks|Main duties)\s*:?\s*$/i],
          [
            /^(Employment requirements|Work conditions|Additional information|All titles|Example titles|Wages|Outlook)/i,
            /^[A-Z][A-Za-z ]{3,}:$/,
          ]
        );
      } else {
        // ESDC/NOC: “Main duties”
        const startIdx = lines.findIndex(l => /(Main duties)\s*:?\s*$/i.test(l));
        sec = startIdx >= 0 ? firstBulletBlockAfter(lines, startIdx) : [];
      }

      let duties = bulletsFromSection(sec).map(s =>
        s
          .replace(/^[#*\-\u2022\u2013\u2217]+\s*/, "")
          .replace(/\s+/g, " ")
          .trim()
      );

      if (duties.length === 0) {
        if (s.kind === "jobbank") {
          const firstKey = lines.findIndex((l) => /(Main duties|Tasks)/i.test(l));
          const tail = firstKey === -1 ? [] : lines.slice(firstKey);
          duties = bulletsFromSection(tail);
        } else {
          // ESDC gave no duties -> try next source
          continue;
        }
      }

      if (duties.length > 0) {
        if (s.kind === "esdc" && duties.length > 18) {
          // capture but try Job Bank for a tighter list
          largeEsdc = {
            code: code5,
            title,
            teer: teerFromCode(code5),
            mainDuties: duties,
            source: s.url,
          };
          try {
            console.log(
              "[NOC_DEBUG_CAPTURE]",
              JSON.stringify(
                {
                  code: code5,
                  usedSource: s.kind,
                  url: s.url,
                  count: duties.length,
                  items: duties,
                },
                null,
                2
              )
            );
          } catch {}
          continue;
        }

        // Success: log + cache + return
        try {
          console.log(
            "[NOC_DEBUG]",
            JSON.stringify(
              {
                code: code5,
                usedSource: s.kind,
                url: s.url,
                count: duties.length,
                items: duties,
                fromCache: false
              },
              null,
              2
            )
          );
        } catch {}

        const payload: NocLivePayload = {
          code: code5,
          title,
          teer: teerFromCode(code5) ?? '',
          mainDuties: duties,
          source: s.kind === 'jobbank' ? 'jobbank' : 'esdc',
          sourceUrl: s.url,
          fetchedAtISO: new Date().toISOString(),
        };
        setCachedNoc(code5, payload).catch(() => {});

        return {
  code: code5,
  title,
  teer: teerFromCode(code5),
  mainDuties: duties,
  source: s.url,
  fetchedAtISO: payload.fetchedAtISO,
};

      }
    }

    if (largeEsdc) {
      try {
        console.log(
          "[NOC_DEBUG]",
          JSON.stringify(
            {
              code: largeEsdc.code,
              usedSource: "esdc",
              url: largeEsdc.source || "",
              count: largeEsdc.mainDuties.length,
              items: largeEsdc.mainDuties,
              fromCache: false
            },
            null,
            2
          )
        );
      } catch {}

      const payload: NocLivePayload = {
        code: largeEsdc.code,
        title: largeEsdc.title,
        teer: largeEsdc.teer ?? '',
        mainDuties: largeEsdc.mainDuties,
        source: 'esdc',
        sourceUrl: largeEsdc.source || '',
        fetchedAtISO: new Date().toISOString(),
      };
      setCachedNoc(code5, payload).catch(() => {});

      return { ...largeEsdc, fetchedAtISO: payload.fetchedAtISO };
    }

    throw new Error("All live sources blocked or returned no duties.");
  })();

  // 2s budget: if live is slow, caller will fall back to snapshot/bundled
  return withTimeout(liveAttempt, 2000);
}
