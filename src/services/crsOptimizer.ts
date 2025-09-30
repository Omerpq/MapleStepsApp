// src/services/crsOptimizer.ts
// S3-02 — CRS Optimizer (import-free). You inject your own calculators from the screen.

export type CRSAdditionalInputs = {
  hasPNP: boolean;
  hasSibling: boolean;
  frenchCLB: number;  // 0–10
  study: "none" | "1-2" | "2+";
};

export type OptimizerInput = {
  age: number;
  clb: number; // 0–10
  education: "none" | "secondary" | "one-year" | "two-year" | "bachelor" | "two-or-more" | "masters" | "phd";
  extras: CRSAdditionalInputs;
};

export type Suggestion = {
  id: string;
  title: string;
  estGain: number;
  details: string;
  flags?: ("premium" | "documentation" | "timeline" | "external")[];
};

export type OptimizerResult = {
  base: number;
  additional: number;
  total: number;
  suggestions: Suggestion[];
};

export type OptimizerFns = {
  // Your core CRS function: (age, clb, education) => base CRS number
  crsCore: (args: { age: number; clb: number; education: OptimizerInput["education"] }) => number;
  // Your additional CRS calculator: (extras) => additional CRS number
  additional: (extras: CRSAdditionalInputs) => number;
};

const clampCLB = (x: number) => Math.max(0, Math.min(10, Math.floor(x)));

export function runOptimizer(input: OptimizerInput, fns: OptimizerFns): OptimizerResult {
  const baseNow = fns.crsCore({ age: input.age, clb: input.clb, education: input.education });
  const addNow  = fns.additional(input.extras);
  const totalNow = baseNow + addNow;

  const suggestions: Suggestion[] = [];

  // 1) Language steps
  for (const step of [1, 2, 3]) {
    const next = clampCLB(input.clb + step);
    if (next <= input.clb) continue;
    const baseNext = fns.crsCore({ age: input.age, clb: next, education: input.education });
    const gain = (baseNext + addNow) - totalNow;
    if (gain > 0) {
      suggestions.push({
        id: `lang_clb_plus_${step}`,
        title: `Improve primary language to CLB ${next}`,
        estGain: gain,
        details: `Raising CLB from ${input.clb} → ${next} increases core CRS across four abilities.`,
        flags: ["timeline"],
      });
    }
  }

  // 2) Education milestones
  const eduOrder: OptimizerInput["education"][] = [
    "none","secondary","one-year","two-year","bachelor","two-or-more","masters","phd"
  ];
  const curIdx = eduOrder.indexOf(input.education);
  for (let i = curIdx + 1; i < eduOrder.length; i++) {
    const up = eduOrder[i];
    const baseNext = fns.crsCore({ age: input.age, clb: input.clb, education: up });
    const gain = (baseNext + addNow) - totalNow;
    if (gain > 0) {
      suggestions.push({
        id: `edu_upgrade_${up}`,
        title: `Credential upgrade: ${labelEdu(up)}`,
        estGain: gain,
        details: `Assumes ECA recognition if foreign. Complete ECA first.`,
        flags: ["documentation"],
      });
      break; // show first meaningful jump
    }
  }

  // 3) French milestones (+25 at CLB 5–6; +50 at ≥7)
  for (const target of [5, 7, 9]) {
    if (input.extras.frenchCLB >= target) continue;
    const extrasNext = { ...input.extras, frenchCLB: target };
    const totalNext = baseNow + fns.additional(extrasNext);
    const gain = totalNext - totalNow;
    if (gain > 0) {
      const bonus = target >= 7 ? "+50" : "+25";
      suggestions.push({
        id: `french_clb_${target}`,
        title: `Add French (target CLB ${target}) ${bonus}`,
        estGain: gain,
        details: `Additional CRS awards ${bonus} for French proficiency.`,
        flags: ["timeline"],
      });
      break;
    }
  }

  // 4) Canadian study (+15 / +30)
  if (input.extras.study !== "2+") {
    const nextStudy = input.extras.study === "none" ? "1-2" : "2+";
    const extrasNext = { ...input.extras, study: nextStudy as "1-2" | "2+" };
    const totalNext = baseNow + fns.additional(extrasNext);
    const gain = totalNext - totalNow;
    if (gain > 0) {
      suggestions.push({
        id: `study_${nextStudy}`,
        title: `Canadian study (${nextStudy === "1-2" ? "1–2 years +15" : "2+ years +30"})`,
        estGain: gain,
        details: `Awarded only for eligible Canadian education; proof needed at e-APR.`,
        flags: ["timeline","documentation"],
      });
    }
  }

  // 5) Sibling in Canada (+15)
  if (!input.extras.hasSibling) {
    const totalNext = baseNow + fns.additional({ ...input.extras, hasSibling: true });
    const gain = totalNext - totalNow;
    if (gain > 0) {
      suggestions.push({
        id: "sibling",
        title: "Claim sibling in Canada (+15)",
        estGain: gain,
        details: "Citizen/PR sibling, age ≥18, eligible relationships; documentary proof required.",
        flags: ["documentation"],
      });
    }
  }

  // 6) PNP (+600)
  if (!input.extras.hasPNP) {
    const totalNext = baseNow + fns.additional({ ...input.extras, hasPNP: true });
    const gain = totalNext - totalNow;
    if (gain > 0) {
      suggestions.push({
        id: "pnp",
        title: "Provincial Nomination (+600)",
        estGain: gain,
        details: "Program-specific criteria; long lead time; extremely high impact.",
        flags: ["external","timeline","documentation"],
      });
    }
  }

  suggestions.sort((a, b) => b.estGain - a.estGain || a.id.localeCompare(b.id));
  return { base: baseNow, additional: addNow, total: totalNow, suggestions };
}

function labelEdu(k: OptimizerInput["education"]): string {
  switch (k) {
    case "none": return "No credential";
    case "secondary": return "Secondary";
    case "one-year": return "One-year post-secondary";
    case "two-year": return "Two-year post-secondary";
    case "bachelor": return "Bachelor’s";
    case "two-or-more": return "Two or more credentials";
    case "masters": return "Master’s";
    case "phd": return "Doctoral (PhD)";
    default: return String(k);
  }
}
