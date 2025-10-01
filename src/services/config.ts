// src/services/config.ts
// Remote-first → Cache → Local (rules repo endpoints)
// If any URL is unreachable, loaders fall back to cached copy, then to bundled JSON.

export const RULES_CONFIG = {
  crsParamsUrl: 'https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/crs.params.json',
  fswParamsUrl: 'https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/fsw67.params.json',
  roundsUrl:    'https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/rounds.remote.json',
  feesUrl:      'https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/fees.remote.json',

  // NOC (Rules repo)
  nocUrl:           'https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/noc.2021.json',
  nocCategoriesUrl: 'https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/noc.categories.json',
} as const;

// Guides & templates (Rules repo)
export const ECA_GUIDES_URL =
  'https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/content/guides/eca.json';

export const LANGUAGE_GUIDES_URL =
  'https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/content/guides/language.json';

export const POF_GUIDES_URL =
  'https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/content/guides/pof.json';

export const TEMPLATE_REF_LETTER_URL =
  'https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/templates/reference_letter.md';

export const POF_THRESHOLDS_URL =
  'https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/pof.thresholds.remote.json';

// ---- In-app purchase SKUs (must match your store IDs) ----
export const IAP_SKUS_ANDROID = [
  'premium_monthly',   // <-- change to your Play Console product IDs
  'premium_yearly'
];

export const IAP_SKUS_IOS = [
  'premium_monthly',   // <-- change to your App Store Connect product IDs
  'premium_yearly'
];

// PNP guides (Rules repo)
  export const PNP_GUIDES_URL =
  'https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/content/guides/pnp.json';

