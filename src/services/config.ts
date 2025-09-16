// src/services/config.ts
// If you set these to real URLs (e.g., a GitHub RAW JSON or your CDN),
// the app will fetch live params. If left empty, we’ll fall back to local JSON.

export const RULES_CONFIG = {
  crsParamsUrl: "https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/crs.params.json",
  fswParamsUrl: "https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/fsw67.params.json",
  roundsUrl:    "https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/rounds.remote.json",
  feesUrl:      "https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/fees.remote.json",

  // NEW (C8)
  nocUrl: "https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/noc.2021.json",
  nocCategoriesUrl: "https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/noc.categories.json",
} as const;

// ECA guides (Rules repo)
export const ECA_GUIDES_URL =
  "https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/content/guides/eca.json";


// Language guides (Rules repo)
export const LANGUAGE_GUIDES_URL =
  "https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/content/guides/language.json";
