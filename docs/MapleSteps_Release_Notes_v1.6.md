# MapleSteps — Release Notes v1.6 (08 Sep 2025)

## S1-03 — Paywall scaffold & gating — DONE
Deliverables
- App: src/screens/Paywall.tsx (soft upsell)
- App: gating in ActionPlanScreen & goToTask() (Premium → Paywall when unsubscribed)

Acceptance criteria
- Premium tasks visually locked when unsubscribed; Free tasks route normally.
- Tapping any Premium task (list or sticky banner) routes to Paywall when unsubscribed; when subscribed, routes to the real destination.
- Test: src/screens/__tests__/ActionPlan.paywall.test.tsx (unsubscribed → Paywall; subscribed → destination)

## S1-04 — Updates: ETag / If-Modified-Since — DONE
Deliverables
- App: src/services/updates.ts — conditional requests with ETag/If-Modified-Since; validators persisted in meta.
- App: src/screens/UpdatesScreen.tsx — tiny "updated/validated" tag appended to Source line.
- App: App.tsx — run migrateUpdatesCachesOnce() on mount (one-time cache cleanup).
- Tests: src/services/__tests__/updates.httpcache.test.ts (rounds/fees 200→304 flow).

Acceptance criteria
- No redundant downloads: 304 keeps cache & cachedAt; UI shows "validated".
- On change: 200 updates data & cachedAt; UI shows "updated".
- Fallbacks unchanged: Remote → Cache → Local; contract unchanged: { source, cachedAt, meta, data } with optional meta.etag, meta.last_modified, meta.status.

## Other notes
- AsyncStorage: added ms_updates_migrated_v1 (one-time flag to clear legacy ms_rounds_cache_v1).
- Current app features: Updates now shows a status cue — "updated" (HTTP 200) vs "validated" (HTTP 304) — next to Source.
