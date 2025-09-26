// src/services/templates.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TEMPLATE_REF_LETTER_URL } from './config';
import type { DutyCheck } from './nocVerify';

type Source = 'remote' | 'cache' | 'local';

export type TemplateLoaderResult = {
  source: Source;
  data: string;
  meta?: {
    etag?: string | null;
    last_modified?: string | null;
    status?: 200 | 304 | number;
    cachedAt?: string;
    url: string;
  };
};

const CACHE_KEY = 'ms.templates.ref_letter.cache.v1';
const META_KEY  = 'ms.templates.ref_letter.meta.v1';

// ---------- Loader (Remote → Cache → Local) ----------
export async function loadRefLetterTemplate(): Promise<TemplateLoaderResult> {
  const cached = await AsyncStorage.getItem(CACHE_KEY);
  const metaRaw = await AsyncStorage.getItem(META_KEY);
  const meta = metaRaw ? safeJson(metaRaw) : {};

  try {
    const headers: Record<string, string> = {};
    if (meta?.etag) headers['If-None-Match'] = meta.etag;
    if (meta?.last_modified) headers['If-Modified-Since'] = meta.last_modified;

    const resp = await fetch(TEMPLATE_REF_LETTER_URL, { headers });

    if (resp.status === 304 && cached) {
      const out: TemplateLoaderResult = {
        source: 'cache',
        data: cached,
        meta: { ...meta, status: 304, url: TEMPLATE_REF_LETTER_URL },
      };
      return out;
    }

    if (resp.ok) {
      const text = await resp.text();
      const etag = resp.headers.get('etag');
      const last_modified = resp.headers.get('last-modified');
      const cachedAt = new Date().toISOString();

      await AsyncStorage.setItem(CACHE_KEY, text);
      await AsyncStorage.setItem(META_KEY, JSON.stringify({ etag, last_modified, cachedAt }));

      const out: TemplateLoaderResult = {
        source: 'remote',
        data: text,
        meta: { etag, last_modified, cachedAt, status: 200, url: TEMPLATE_REF_LETTER_URL },
      };
      return out;
    }

    // Non-OK fallback to cache or local
    if (cached) {
      return { source: 'cache', data: cached, meta: { ...meta, status: resp.status, url: TEMPLATE_REF_LETTER_URL } };
    }
    return { source: 'local', data: FALLBACK_TEMPLATE, meta: { status: resp.status, url: TEMPLATE_REF_LETTER_URL } };
  } catch {
    if (cached) {
      return { source: 'cache', data: cached, meta: { ...meta, status: 304, url: TEMPLATE_REF_LETTER_URL } };
    }
    return { source: 'local', data: FALLBACK_TEMPLATE, meta: { status: 0, url: TEMPLATE_REF_LETTER_URL } };
  }
}

function safeJson(s: string) {
  try { return JSON.parse(s); } catch { return {}; }
}

// ---------- Template application ----------
export type RefLetterInput = {
  applicantName: string;
  jobTitle: string;
  employerName: string;
  employerAddress?: string;
  startDateISO: string;
  endDateISO?: string;
  hoursPerWeek?: number;
  salaryPerYear?: string;
  supervisorName?: string;
  supervisorTitle?: string;
  contactEmail?: string;
  contactPhone?: string;
  nocCode: string;
  nocTitle: string;
  duties: DutyCheck[];
};

export function applyRefLetterTemplate(tpl: string, input: RefLetterInput): string {
  const today = new Date().toISOString().slice(0, 10);
  const endOrPresent = input.endDateISO && input.endDateISO.trim() ? input.endDateISO : 'Present';

  // Handle the EACH_CHECKED_DUTY block
  const loopStart = '{{#EACH_CHECKED_DUTY}}';
  const loopEnd = '{{/EACH_CHECKED_DUTY}}';
  let out = tpl;

  const startIdx = out.indexOf(loopStart);
  const endIdx = out.indexOf(loopEnd);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const block = out.substring(startIdx + loopStart.length, endIdx);
    const checked = (input.duties || []).filter(d => d.checked);
    const rendered = checked.length
      ? checked.map(d => block.replaceAll('{{DUTY_TEXT}}', d.text)).join('')
      : block.replace('{{DUTY_TEXT}}', '(add duties performed here)');
    out = out.substring(0, startIdx) + rendered + out.substring(endIdx + loopEnd.length);
  }

  const map: Record<string, string> = {
    '{{TODAY_YYYY_MM_DD}}': today,
    '{{APPLICANT_NAME}}': input.applicantName || '(Applicant Name)',
    '{{JOB_TITLE}}': input.jobTitle || '(Job Title)',
    '{{EMPLOYER_NAME}}': input.employerName || '(Employer)',
    '{{EMPLOYER_ADDRESS}}': input.employerAddress || '(Address)',
    '{{START_DATE}}': input.startDateISO || 'YYYY-MM-DD',
    '{{END_DATE_OR_PRESENT}}': endOrPresent,
    '{{HOURS_PER_WEEK}}': input.hoursPerWeek != null ? String(input.hoursPerWeek) : '(hours)',
    '{{SALARY_PER_YEAR}}': input.salaryPerYear || '(salary)',
    '{{NOC_CODE}}': input.nocCode || '(NOC)',
    '{{NOC_TITLE}}': input.nocTitle || '(Title)',
    '{{SUPERVISOR_NAME}}': input.supervisorName || '(Name)',
    '{{SUPERVISOR_TITLE}}': input.supervisorTitle || '(Title)',
    '{{CONTACT_EMAIL}}': input.contactEmail || '(email)',
    '{{CONTACT_PHONE}}': input.contactPhone || '(phone)',
  };

  for (const [k, v] of Object.entries(map)) {
    out = out.split(k).join(v);
  }
  return out;
}

// Local fallback identical to the rules repo structure
const FALLBACK_TEMPLATE = `# Employment Reference Letter

**Date:** {{TODAY_YYYY_MM_DD}}

**To whom it may concern,**

This letter confirms that **{{APPLICANT_NAME}}** has been employed with **{{EMPLOYER_NAME}}** as **{{JOB_TITLE}}** for the period **{{START_DATE}}** to **{{END_DATE_OR_PRESENT}}**.

- **Work location:** {{EMPLOYER_ADDRESS}}
- **Hours per week:** {{HOURS_PER_WEEK}}
- **Compensation:** {{SALARY_PER_YEAR}}
- **Position title:** {{JOB_TITLE}}
- **NOC (2021):** {{NOC_CODE}} — {{NOC_TITLE}}

**Main duties performed (aligned with NOC {{NOC_CODE}}):**
{{#EACH_CHECKED_DUTY}}
- {{DUTY_TEXT}}
{{/EACH_CHECKED_DUTY}}

I confirm that the above information is true and based on company records.

Sincerely,

{{SUPERVISOR_NAME}}
{{SUPERVISOR_TITLE}}
{{EMPLOYER_NAME}}
{{CONTACT_EMAIL}} | {{CONTACT_PHONE}}
`;
