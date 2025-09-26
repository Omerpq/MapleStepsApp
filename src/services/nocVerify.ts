// src/services/nocVerify.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
const STORAGE_KEY = 'ms.noc.verify.state.v1';


// ---- Types ----
export type DutyCheck = {
  id: string;           // stable id derived from text
  text: string;         // duty text (from NOC 2021 "main duties")
  checked: boolean;     // user says they perform this duty
  note?: string;        // optional user note / evidence note
};

export type NocVerifyState = {
  selectedNocCode?: string;      // e.g., "21231"
  selectedNocTitle?: string;     // e.g., "Software engineers and designers"
  selectedNocTeer?: string;      // e.g., "TEER 1"
  duties: DutyCheck[];           // normalized duties with checkboxes
  updatedAtISO: string;
  sourceLabel?: string;          // "Source: Rules snapshot" | "Source: ESDC (NOCProfile)" | "Source: Bundled data"
};
export function formatSourceLabel(opts: {
  kind: 'live-esdc' | 'live-jobbank' | 'rules' | 'bundled';
  fetchedAtISO?: string;          // for live (fresh or cached-live)
  snapshotUpdatedAt?: string;  
  cached?: boolean;   // for rules snapshot (YYYY-MM-DD)
}): string {
  switch (opts.kind) {
    case 'live-esdc': {
  const stamp = opts.fetchedAtISO
    ? ` — fetched ${new Date(opts.fetchedAtISO).toLocaleString()}`
    : '';
  const cached = opts.cached ? ' (cached)' : '';
  return `Source: ESDC${stamp}${cached}`;
}
case 'live-jobbank': {
  const stamp = opts.fetchedAtISO
    ? ` — fetched ${new Date(opts.fetchedAtISO).toLocaleString()}`
    : '';
  const cached = opts.cached ? ' (cached)' : '';
  return `Source: Job Bank${stamp}${cached}`;
}


    case 'rules': {
      const stamp = opts.snapshotUpdatedAt ? ` — updated ${opts.snapshotUpdatedAt}` : '';
      return `Source: Rules snapshot${stamp}`;
    }
    case 'bundled':
    default:
      return `Source: Bundled data`;
  }
}

// ---- Helpers ----
const nowISO = () => new Date().toISOString();

const dutyIdFromText = (text: string, fallbackIdx: number) =>
  (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `duty-${fallbackIdx}`;

export function computeProgress(duties: DutyCheck[]) {
  const total = duties.length || 0;
  const matched = duties.filter(d => d.checked).length;
  return { matched, total };
}

// crude pattern → evidence hints
export function suggestEvidenceForDuty(text: string): string[] {
  const t = text.toLowerCase();
  const hints: string[] = [];
  if (/(supervis|lead|manage|train)/.test(t)) hints.push('Org chart or supervisor note; training logs');
  if (/(prepare|draft|write|report|proposal|document)/.test(t)) hints.push('Work samples (redacted), document metadata');
  if (/(budget|financial|cost|estimate)/.test(t)) hints.push('Budget sheets, approvals, screenshots from tools');
  if (/(analy|design|architect|plan)/.test(t)) hints.push('Design docs, JIRA tickets, diagrams (redacted)');
  if (/(test|qa|quality|validate)/.test(t)) hints.push('Test plans, reports, sign-off emails');
  if (/(client|stakeholder|present)/.test(t)) hints.push('Meeting minutes, agendas, presentation decks');
  if (!hints.length) hints.push('Payslips + job description + manager’s confirmation');
  return hints;
}

// ---- Persistence API ----
export async function loadState(): Promise<NocVerifyState | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as NocVerifyState;
  } catch {
    return null;
  }
}

async function saveState(next: NocVerifyState) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export async function resetState() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export type NocBasics = {
  code: string;
  title: string;
  teer?: string;
  mainDuties: string[]; // pass NOC "main duties" list here (we’ll wire from noc.ts in Step 2)
  sourceLabel?: string; // NEW: carry the label into state for UI
};

export async function setSelectedNoc(noc: NocBasics) {
  const duties: DutyCheck[] = (noc.mainDuties || []).map((text, i) => ({
    id: dutyIdFromText(text, i + 1),
    text,
    checked: false,
  }));
  const next: NocVerifyState = {
    selectedNocCode: noc.code,
    selectedNocTitle: noc.title,
    selectedNocTeer: noc.teer,
    duties,
    sourceLabel: noc.sourceLabel || undefined, // NEW
    updatedAtISO: nowISO(),
  };
  await saveState(next);
  return next;
}

export async function toggleDuty(dutyId: string, checked: boolean) {
  const cur = (await loadState()) || { duties: [], updatedAtISO: nowISO() } as NocVerifyState;
  const duties = (cur.duties || []).map(d => (d.id === dutyId ? { ...d, checked } : d));
  const next: NocVerifyState = { ...cur, duties, updatedAtISO: nowISO() };
  await saveState(next);
  return next;
}

export async function setDutyNote(dutyId: string, note?: string) {
  const cur = (await loadState()) || { duties: [], updatedAtISO: nowISO() } as NocVerifyState;
  const duties = (cur.duties || []).map(d => (d.id === dutyId ? { ...d, note } : d));
  const next: NocVerifyState = { ...cur, duties, updatedAtISO: nowISO() };
  await saveState(next);
  return next;
}

// ---- Reference Letter: inline generator (will link to Rules template later) ----
export type RefLetterInput = {
  applicantName: string;
  jobTitle: string;
  employerName: string;
  employerAddress?: string;
  startDateISO: string;    // YYYY-MM-DD ok
  endDateISO?: string;     // optional if current
  hoursPerWeek?: number;
  salaryPerYear?: string;  // e.g., "PKR 3,600,000"
  supervisorName?: string;
  supervisorTitle?: string;
  contactEmail?: string;
  contactPhone?: string;
  nocCode: string;
  nocTitle: string;
  duties: DutyCheck[];     // we’ll include only checked items
};

export function buildReferenceLetterMarkdown(input: RefLetterInput) {
  const {
    applicantName, jobTitle, employerName, employerAddress,
    startDateISO, endDateISO, hoursPerWeek, salaryPerYear,
    supervisorName, supervisorTitle, contactEmail, contactPhone,
    nocCode, nocTitle, duties,
  } = input;

  const period = endDateISO ? `${startDateISO} to ${endDateISO}` : `${startDateISO} to Present`;
  const checked = (duties || []).filter(d => d.checked);

  const dutyBullets = checked.length
    ? checked.map(d => `- ${d.text}`).join('\n')
    : '- (fill duties performed here)';

  return `# Employment Reference Letter

**Date:** ${new Date().toISOString().slice(0, 10)}

**To whom it may concern,**

This letter confirms that **${applicantName}** has been employed with **${employerName}** as **${jobTitle}** for the period **${period}**.

- **Work location:** ${employerAddress || '(address)'}
- **Hours per week:** ${hoursPerWeek ?? '(hours)'}
- **Compensation:** ${salaryPerYear || '(salary)'}
- **Position title:** ${jobTitle}
- **NOC (2021):** ${nocCode} — ${nocTitle}

**Main duties performed (aligned with NOC ${nocCode}):**
${dutyBullets}

I confirm that the above information is true and based on company records.

Sincerely,

${supervisorName || '(Name)'}
${supervisorTitle || '(Title)'}
${employerName}
${contactEmail || '(email)'} | ${contactPhone || '(phone)'}
`;
}
