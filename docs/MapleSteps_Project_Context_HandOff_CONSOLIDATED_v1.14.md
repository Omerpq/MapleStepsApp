MapleSteps — Project Context Hand-Off (PR-only) — CONSOLIDATED
Doc version: v1.14  Updated: 26 Sep 2025
Use this as the source of truth. Prefer exact code snippets over guesses. If data freshness is needed, rely on the rules repo endpoints listed below.

Executive primer
• Scope: Canadian PR only (Express Entry/PNP). No study/work permits.
• Freemium: QuickCheck + Score (FSW-67 & CRS), NOC search (read-only), live draws/fees with freshness badges, basic Action Plan.
• Premium: Guided journey (NOC verification → ECA → Language → Work evidence → PoF → EE profile → CRS optimizer/PNP → ITA/e-APR → tracking → landing), notifications, secure Vault, optional sync, post-landing. Subscription handled via RevenueCat (sandbox in dev); local dev override available for testing.
• Data model: Remote-first → Cache → Local fallback (JSON over HTTPS from rules repo; app never updates code via data).
• All remote loaders in the app follow the same contract (Remote→Cache→Local with conditional validators; UI indicates source + freshness).
  o NOC duties: Live-first from official sources (ESDC, fallback Job Bank) with a 24h TTL cache; explicit “Refresh from ESDC” bypasses cache.
  o PoF thresholds: Rules-repo first (ETag/Last-Modified). “Refresh from IRCC” fetches IRCC (Live) with a 24h TTL and shows “(cached)” when served from TTL.
  o Source labels standard: “Source: ESDC — fetched M/D/YYYY, h:mm:ss A” and “(cached)” when served from TTL cache.
  o PoF Live (IRCC): “IRCC (Live) — fetched M/D/YYYY, h:mm:ss A” and “(cached)” when served from the 24h TTL.

Endpoints (Rules repo → GitHub Raw)
• crs.params.json — https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/crs.params.json
• fsw67.params.json — https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/fsw67.params.json
• noc.2021.json — https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/noc.2021.json
• noc.categories.json — https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/noc.categories.json
• rounds.remote.json — https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/rounds.remote.json
• fees.remote.json — https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/fees.remote.json
• guides/eca.json — https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/guides/eca.json
  (We load with conditional GET: ETag/If-None-Match and Last-Modified/If-Modified-Since.)
• content/guides/language.json — https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/content/guides/language.json
• templates/reference_letter.md — https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/templates/reference_letter.md
  (We load with conditional GET: ETag/If-None-Match and Last-Modified/If-Modified-Since.)
• content/guides/pof.json — https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/content/guides/pof.json
• pof.thresholds.remote.json — https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/pof.thresholds.remote.json
• POF_GUIDES_URL = https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/content/guides/pof.json
• POF_THRESHOLDS_URL = https://raw.githubusercontent.com/Omerpq/maplesteps-rules/main/data/pof.thresholds.remote.json

AsyncStorage keys
ms_noc_cache_v1, ms_noc_categories_cache_v2, ms_rounds_cache_v2, ms_fees_cache_v1,
ms_crs_params_cache_v1, ms_fsw_params_cache_v1,
ms.tasks.v1, ms.tasks.viewmode.v1, ms.tasks.focus_floor.v1,
ms_updates_migrated_v1,
ms.notifications.map.v1, ms.notifications.permission_v1, ms.notifications.migrated_v1,
ms.eca.state.v1, ms.eca.guides.cache.v1, ms.eca.guides.meta.v1, ms.eca.notifications.map.v1,
ms.language.state.v1, ms.language.guides.cache.v1, ms.language.guides.meta.v1, ms.language.clb_for_score.v1,
ms.pof.state.v1, ms.pof.guides.cache.v1, ms.pof.guides.meta.v1, ms.pof.thresholds.cache.v1, ms.pof.thresholds.meta.v1, ms.pof.live.cache.v1,
ms.payments.state.v1, ms.payments.dev.subscribed.v1
• ms.tasks.viewmode.v1 — persists the Action Plan view mode ('due' | 'suggested').
• ms.tasks.focus_floor.v1 — minimum step number the sticky banner will consider (ECA nudges to 2).
• ms.notifications.map.v1 — taskId → localNotificationId.
• ms.notifications.permission_v1 — "granted" | "denied" | "prompted".
• ms.notifications.migrated_v1 — one-time flag to wipe legacy scheduled notifications.
• ms_noc_cache_v1 — 24h TTL cache for Live NOC duties (ESDC/Job Bank); drives “(cached)” label.
• ms.eca.state.v1 — ECA wizard: { selectedBodyId?, items[], updatedAt }.
• ms.eca.guides.cache.v1 / ms.eca.guides.meta.v1 — cached LoaderResult + { etag, last_modified } validators.
• ms.eca.notifications.map.v1 — wizard-item reminder map (ecaKey → localNotificationId).
• ms.pof.state.v1 — PoF tracker: { familySize, months[6]{ yyyyMm, entries[] }, updatedAt }.
• ms.pof.guides.cache.v1, ms.pof.guides.meta.v1 — PoF guides A4 loader cache + validators.
• ms.pof.thresholds.cache.v1, ms.pof.thresholds.meta.v1 — PoF thresholds A4 loader cache + validators.
• ms.pof.live.cache.v1 — IRCC Live thresholds 24h TTL cache.
• ms.language.state.v1 — Language planner state (targets, test date, weekly plan).
• ms.language.guides.cache.v1 / ms.language.guides.meta.v1 — A4 loader cache + validators (ETag/Last-Modified).
• ms.language.clb_for_score.v1 — Primary language CLB selected/confirmed for the Score screen.
• ms.payments.state.v1 — persisted subscription status { isActive: boolean, updatedAt: ISO }.
• ms.payments.dev.subscribed.v1 — DEV-only override used by the Action Plan “Premium ON/OFF” chip (persists across navigation).

App structure (high-level)
Screens: QuickCheck, Score, Updates, ActionPlan, Timeline (stub), Vault (stub), ECAWizard, LanguagePlanner, NOCVerify.tsx (NOC verification mini-wizard: duty compare, evidence capture, source label, “Refresh from ESDC”, export), ProofOfFunds.tsx
Components: NocPicker, NocBadge, RulesBadge, DataFreshness
Services: crs.ts, fsw67.ts, noc.ts, rules.ts, updates.ts, config.ts, eca.ts, language.ts, payments.ts (RevenueCat wrapper), notifications.ts,
          nocLive.ts — Live NOC duties fetcher (ESDC primary, Job Bank fallback), label kind (“live-esdc”/“live-jobbank”),
          nocCache.ts — 24h TTL cache for live duties (read/write behind nocLive.ts),
          nocVerify.ts — wizard state + template linkage, nocRules.ts — Rules snapshot fallback reader,
          pof.ts — PoF loaders (guides + thresholds), pofLive.ts — IRCC thresholds with 24h TTL cache
Bundled fallbacks: crs.params.json, fsw67.params.json, noc.2021.json, noc.categories.json, rounds.json, fees.json (+ optional action_plan.seed.json), guides/eca.json, guides/language.json, src/data/pof.thresholds.json, src/data/guides/pof.json

Current app features (user-facing)
• QuickCheck (FSW-67) with Likely/Borderline/Unlikely and total score.
• Score: full FSW-67 breakdown; CRS with additional points (PNP +600, sibling +15, French +25/+50, Canadian study +15/+30).
• Contextual warnings: ECA required for foreign education; Proof of Funds unless valid job offer.
• NOC 2021: search/pick + TEER; Data Freshness shows last-checked & source; manual refresh.
• NOC Verification mini-wizard: compare user duties vs live NOC duties (ESDC/Job Bank), highlight gaps, and suggest evidence; per-duty notes/checkboxes; “Refresh from ESDC”; offline uses last 24h cache if present.
• Template export: fills reference_letter.md from selected duties + notes; copy/share; selections persist across navigation/reloads.
• Updates: latest Express Entry round details + IRCC fees with freshness/source; clear cache (dev).
• Updates: adds a tiny status cue — “updated” (HTTP 200) vs “validated” (HTTP 304) — beside the Source indicator.
• Action Plan: local checklist seeded from JSON; per-task due-date offset editing; “Due date / Suggested” view toggle; dev-only Reset/Re-seed.
• “What’s Next” smart picker: sticky banner shows the next unblocked task (respects Premium status and depends_on); tie-breakers = sooner due date → earlier step → lower seed index; tap navigates via task.route; list shows 🔒 Premium and ⛔ Blocked (with unmet dependency names).
• Timeline & Vault: MVP placeholders for notifications and secure docs.
• Global Rules/Data freshness badges across screens.
• Paywall (soft upsell) and Premium gating: when unsubscribed, tapping any Premium task (list or sticky banner) opens Paywall; Free tasks route normally. When subscribed, tasks open their real destination. Paywall uses the standard stack header (back arrow).
• Sticky “What’s Next” banner uses the same goToTask(...) gating as list rows.
• Local notifications: each future, not-done task gets a single 9:00 AM local reminder on its due date; Done cancels; due-date edits reschedule.
• Updates: dev-only “Refresh all” to revalidate all rules data in one tap.
• ECA Wizard (guided): pick ECA body (WES/ICES/IQAS/ICAS/CES/…), body-specific checklist, per-item status, quick target dates; header shows Remote / Cache / Local + last synced; dev Force Remote revalidates.
• Action Plan — ECA row UX: ECA x/y progress chip; row is wizard-controlled (checkbox disabled); pill “Wizard-controlled — open ECA Wizard” opens the wizard; selecting a body sets the row Done; “Change ECA body” clears selection and unchecks the row.
• Sticky “What’s Next” banner — focus floor: banner prefers first unblocked candidate at/after Step = ms.tasks.focus_floor.v1 (ECA nudges to Step 2). Still respects Premium gating & dependencies.
• Notifications (wizard items): items with target dates get a single 09:00 local reminder; Done cancels.
• Language Planner: pick target CLB, choose test (IELTS/CELPIP/TEF/TCF), set a test date, generate a 13-week plan; same freshness header as other loaders.
• Score → Planner hand-off: a “Planner” pill next to Primary language CLB opens Language Planner; Save Results writes ms.language.clb_for_score.v1 and the Score screen auto-uses it in CRS.
• Proof of Funds (PoF):
  o Required amount by family size from rules repo thresholds (Remote/Cache/Local + “updated/validated” badge).
  o Manual “Refresh from IRCC” (Live) with 24h TTL and explicit “(cached)” label when TTL-served.
  o 6-month seasoning tracker; multiple entries per month by fund type (✅ eligible / ⛔ ineligible) from guides.
  o Modal dropdown (no clipping) and responsive input on phones.
  o Summary: 6-month minimum, average, latest eligible totals; warnings for missing months / ineligible funds.

Detailed app file map
Screens
• src/screens/QuickCheckScreen.tsx
• src/screens/ScoreScreen.tsx
• src/screens/UpdatesScreen.tsx
• src/screens/ActionPlanScreen.tsx
• src/screens/TimelineScreen.tsx
• src/screens/VaultScreen.tsx
• src/screens/Paywall.tsx
• src/screens/LanguagePlanner.tsx
• src/screens/ECAWizard.tsx
• src/screens/NOCVerify.tsx

Tests
• src/screens/__tests__/ActionPlan.paywall.test.tsx (gating: unsubscribed → Paywall; subscribed → real destination)
• src/services/__tests__/updates.httpcache.test.ts (verifies 200→cache then 304 keeps cachedAt; no redundant body download)
• src/services/__tests__/updates.contract.test.ts (A4 loader contract: Remote/Cache/Local + pickDisplayTime)
• src/utils/__tests__/freshness.test.ts (time formatting + age classification)

Components
• src/components/NocPicker.tsx
• src/components/NocBadge.tsx
• src/components/RulesBadge.tsx
• src/components/DataFreshness.tsx
(NOCVerify composes these + simple per-duty row controls; no new shared component required.)

Services (loaders & calculators)
• src/services/eca.ts — Remote→Cache→Local loader for ECA guides (conditional GET), persistent wizard state, 09:00 local reminder scheduling/cancellation for item targets, and Action Plan glue:
  o ECA_TASK_ID = '03_eca_choose_and_start' (canonical base id for the AP row)
  o syncActionPlanEcaChoose(taskId) — sets the AP row done/undone based on body selection presence
  o markActionPlanTaskIfComplete(taskId) — marks the AP row Done when all wizard items are Done and nudges focus floor to 2
  o clearSelectedBody() — wizard-only clearer; cancels reminders; unchecks the AP row
• src/services/config.ts, crs.ts, fsw67.ts, noc.ts, rules.ts, updates.ts, notifications.ts
• updates.ts — conditional GETs (ETag / If-Modified-Since). LoaderResult.meta: { etag?, last_modified?, status: 200|304 }. 304 returns source=cache with cachedAt unchanged; 200 updates cache and cachedAt.
• src/services/language.ts — A4 loader (validator headers), planner state, and CRS tie-in.
• src/services/nocLive.ts — Live duties fetch (ESDC → parsed via proxy; Job Bank fallback). Returns { source, sourceUrl, fetchedAtISO, items[] }.
• src/services/nocCache.ts — get/set by NOC code with 24h TTL; labels add “(cached)” when served from here.
• src/services/nocVerify.ts — selection/notes persistence and template merge for reference_letter.md.
• src/services/payments.ts — RevenueCat (react-native-purchases) wrapper:
  • configure/init on app mount;
  • getSubscriptionProducts(): Product[];
  • purchaseSubscription(sku), restore();
  • getPersistedState(): { isActive, updatedAt };
  • __devSetSubscribed(flag) → writes ms.payments.dev.subscribed.v1 (DEV only).

Data (bundled fallbacks)
• src/data/crs.params.json, fsw67.params.json, noc.2021.json, noc.categories.json, rounds.json, fees.json, action_plan.seed.json (required)
• src/data/guides/eca.json, src/data/guides/language.json
• src/data/guides/pof.json, src/data/pof.thresholds.json

Rules repo file map
/data served to the app
• /data/crs.params.json, /data/fsw67.params.json, /data/noc.2021.json, /data/noc.categories.json, /data/rounds.remote.json, /data/fees.remote.json, /data/action_plan/pr.action_plan.seed.json (optional)
• /data/guides/eca.json
• /data/content/guides/language.json
• /data/templates/reference_letter.md (export template used by NOCVerify).
• /data/content/guides/pof.json
• /data/pof.thresholds.remote.json
/schema (optional, recommended)
• crs.params.schema.json, fsw67.params.schema.json, noc.2021.schema.json, noc.categories.schema.json, rounds.schema.json, fees.schema.json, action_plan.schema.json
• /data/guides/eca.json
• pof.thresholds.schema.json, pof.guides.schema.json (optional)
(Fallback snapshots)
• /noc/2021/{code}.json — optional NOC duties snapshot; used only when Live fails.

Utils & tests
• src/utils/nextTasks.ts
  o Comparator unchanged (due → step → seed index → id).
  o Candidates include locked (Premium); gating happens at navigation (banner may still point at Premium → Paywall).
  o Focus floor is applied in ActionPlanScreen using seed step (number or "Step 2" strings tolerated).
• goToTask signature (unchanged):
   goToTask(navigation, task, isSubscribed)
  • If task.isPremium && !isSubscribed → navigation.navigate('Paywall', { from: task.id })
  • Else if task.routeHint present → navigation.navigate(task.routeHint)
  • Else → navigation.navigate('ActionPlan', { focusTaskId: task.id })
• src/utils/freshness.ts
• src/utils/__tests__/freshness.test.ts

src/screens/ActionPlanScreen.tsx
• All navigation entry points call goToTask(navigation, candidate, isSubscribed).
• ECA row renders a pill (“Wizard-controlled — open ECA Wizard”); checkbox disabled; wizard controls Done/Not done.
• Blocked tasks remain disabled; Premium-locked show 🔒 and route to Paywall when tapped.
• Dev chip toggles subscription and now persists via ms.payments.dev.subscribed.v1.
• Reads ms.tasks.focus_floor.v1 and picks first candidate with step ≥ floor for the banner (default null → behaves as before).
• Dev chips: Debug banner (logs floor + top candidates), Force floor=2, Done: ECA overview (unblocks Step-2 chain in dev).
• ECA x/y progress chip (gray/amber/green) on the ECA “Pick your body” row.

Remote / Cache / Local conventions
• Remote: fetched from rules repo URLs; UI shows “Remote • last synced …”.
• Cache: last good Remote copy in AsyncStorage; UI shows “Cache • saved …”.
• Local: bundled JSON in the app build; UI shows “Local • bundled”.
• Behavior: loaders try Remote → Cache → Local automatically.
• ECA guides follow A4 loader contract; Wizard header surfaces Remote / Cache / Local and timestamp; Dev “Force Remote” clears validators and refetches.
• PoF: thresholds default to Rules-repo (Remote/Cache/Local). “Refresh from IRCC” fetches Live (24h TTL) → label “IRCC (Live)” and “(cached)” when TTL-served. Guides always use A4 loader.
• NOCVerify: Live (ESDC/Job Bank) uses 24h TTL cache (ms_noc_cache_v1). “Refresh from ESDC” forces Live and overwrites cache; label shows fetched time and “(cached)” when served from TTL. Offline → last cached; else fallback /noc/2021/{code}.json.

Action Plan JSON — purpose & glue
• Seed JSON is machine-readable content (Free/Premium, tags, due offsets).
• On first run (or version bump), app expands the seed to concrete tasks in AsyncStorage.
• Screen groups by step; router opens the right screen; Premium tasks route to Paywall if locked.
• Host the same seed in rules repo to update steps without shipping a new binary.
• Seed fields (current): id, title, access (free|premium), due_offset_days, step, route?, depends_on?[] (prefer ids).
Example (route + id as the canonical dependency key)
  { "id": "02_fsw67_quickcheck", "title": "Run QuickCheck (FSW-67) and note eligibility status", "access": "free", "due_offset_days": 0, "step": 1, "route": "QuickCheck" }
  { "id": "02_fsw67_breakdown", "title": "Open Score and review full FSW-67 breakdown", "access": "free", "due_offset_days": 1, "step": 1, "depends_on": ["02_fsw67_quickcheck"] }
  { "id": "04_language_plan_and_book_test", "title": "Language: plan, pick test (IELTS/CELPIP/TEF/TCF), book date, and start 13-week plan", "access": "premium", "due_offset_days": 5, "step": 3, "route": "LanguagePlanner", "depends_on": ["03_eca_choose_and_start"] }
• Back-compat: title-based depends_on tolerated, but ids are canonical.
• Persisted Task shape (app-side): id, title, baseISO, offsetDays, dueISO, done (dueISO = baseISO + offsetDays @ 09:00 local).
• step drives focus floor behavior (banner prefers first candidate with step ≥ ms.tasks.focus_floor.v1).
• Dependencies accept ids (canonical) and tolerate legacy title matches.

Bundled fallbacks:
• src/data/action_plan.seed.json is required and versioned (contains id/step/route/depends_on).
• (Optional future) Host the same seed in the rules repo to update steps without shipping a new binary.

RootNavigator
• Headers on by default; hide only for the tab container.
• MainTabs: headerShown=false (tabs manage their own headers).
• Stack route “Paywall”: component=Paywall, title="Go Premium" (uses stack back arrow; no modal presentation).
• Stack route “LanguagePlanner”: component=LanguagePlanner, headerShown=true.
• Stack route “ProofOfFunds”: component=ProofOfFunds, headerShown=true.

App bootstrap
• App.tsx: run migrateUpdatesCachesOnce() on mount to clear legacy ms_rounds_cache_v1 once.
• App.tsx: run notifications.init() on mount (permissions cache, Android channel, one-time migration, orphan cleanup).
• App.tsx: initialize payments in useEffect (configure RevenueCat; add/remove listeners).
• Expo Go caveat: it prints remote-push warnings for expo-notifications. We only use local reminders here; for real push, use a development build.

Expo config
• app.json: "plugins": ["expo-notifications"]
