// src/services/draws.ts
// S3-02 — Draw Proximity wrapper built on your updates A4 loader.

import { loadRounds, type LoaderResult } from "./updates";

export type ProximityItem = {
  label: string;       // e.g., "Latest General", "Last 3-general avg", "Latest category: French"
  cutoff: number;      // CRS cutoff for that bucket
  delta: number;       // userTotal - cutoff (negative means below)
  date?: string;
  sourceUrl?: string;
};

export type ProximityResult = {
  rounds: LoaderResult<any[]>;   // pass-through loader result (for freshness/source UI)
  items: ProximityItem[];
};

function latest<T>(arr: T[], pick: (x: T) => number | undefined): T | undefined {
  return [...arr].sort((a: any, b: any) => {
    const aa = pick(a) ?? 0, bb = pick(b) ?? 0;
    return bb - aa; // desc
  })[0];
}

export async function computeProximity(userTotal: number): Promise<ProximityResult> {
  const roundsLR = await loadRounds(); // A4: Remote→Cache→Local with validators
  const rounds = roundsLR.data || [];

  const general = rounds.filter((r: any) => !r.category || /general/i.test(r.category));
  const cats    = rounds.filter((r: any) => r.category && !/general/i.test(r.category));

  const out: ProximityItem[] = [];

  // Latest General
  const lg = latest(general, (r: any) => new Date(r.date || 0).getTime());
  if (lg?.cutoff) {
    out.push({
      label: "Latest General",
      cutoff: Number(lg.cutoff),
      delta: userTotal - Number(lg.cutoff),
      date: lg.date,
sourceUrl: typeof lg.source_url === "string" ? lg.source_url : undefined
    });
  }

  // General Avg (last 3)
  if (general.length) {
    const last3 = [...general].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 3);
    const valid = last3.filter((r: any) => typeof r.cutoff === "number");
    if (valid.length) {
      const avg = Math.round(valid.reduce((s: number, r: any) => s + r.cutoff, 0) / valid.length);
      out.push({
        label: "3-draw general average",
        cutoff: avg,
        delta: userTotal - avg,
        date: valid[0].date,
sourceUrl: typeof valid[0].source_url === "string" ? valid[0].source_url : undefined
      });
    }
  }

  // Latest category (if any)
  const lc = latest(cats, (r: any) => new Date(r.date || 0).getTime());
  if (lc?.cutoff) {
    out.push({
      label: `Latest category: ${lc.category}`,
      cutoff: Number(lc.cutoff),
      delta: userTotal - Number(lc.cutoff),
      date: lc.date,
sourceUrl: typeof lc.source_url === "string" ? lc.source_url : undefined
    });
  }

  // Sort by required cutoff asc (closest target first)
  out.sort((a, b) => a.cutoff - b.cutoff);

  return { rounds: roundsLR, items: out };
}
