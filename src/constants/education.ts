export const FSW_EDUCATION_OPTIONS = [
  { value: "secondary",              label: "Secondary (High school)" },
  { value: "one_year_postsecondary", label: "One-year postsecondary diploma" },
  { value: "bachelor",               label: "Bachelor’s degree" },
  { value: "two_or_more",            label: "Two or more credentials (incl. one 3+ years)" },
  { value: "masters",                label: "Master’s / professional degree" },
  { value: "phd",                    label: "PhD / Doctorate" },
] as const;

export type FswEducationValue = typeof FSW_EDUCATION_OPTIONS[number]["value"];
