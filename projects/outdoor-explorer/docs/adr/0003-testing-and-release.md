# ADR 0003: Deterministic tests and staged release

Status: accepted for planning; implementation spans #40–#49.

## Context

Live provider calls introduce credentials, quotas, and nondeterminism into tests. The existing public site must remain operational while the new application develops.

## Decision

Use xUnit unit/integration tests, frontend component tests with fixtures, and Playwright TypeScript Chromium E2E. Inject sanitized NPS fixtures at the backend provider boundary; exercise HTTP mapping separately with stubbed upstream responses. Cover pagination, normalization, missing key, invalid input/coordinates, timeout, 429/retry behavior, cache freshness, and partial failure. Browser coverage includes state/activity/text filters, URL reload, details/source links, alerts, loading/empty/error states, keyboard use, and mobile layout.

Start tests with each feature, consolidate the suite in #43, and implement CI in #48 before staging. Keep ordinary tests free of keys and external network dependencies, including photos. Retain Playwright traces/screenshots/video on failure with bounded retention; isolate per-test state and avoid fixed sleeps. Optional live smoke checks are opt-in, use protected secrets, and do not gate ordinary PRs. Fixture mode must fail closed outside Development/Test.

Scope new CI to this project and its related workflow changes without editing the existing Jekyll workflow. Require clean restore/build/lint/test and usable failure artifacts. Perform manual keyboard, screen-reader, responsive, and attribution reviews before release. Add Firefox/WebKit as later extensions if useful.

Release the core search/detail/alerts journey to staging through #49 after CI; document smoke tests, host secrets, health checks, and rollback. Maps and other enrichment do not block the core MVP. Public CainCraft integration and DNS changes require their own explicit approval as specified in #49.

## Consequences and alternatives

Fixtures need maintenance and do not prove the upstream contract is unchanged; optional live checks and integration-time schema review address that gap. Browser-only API mocks cannot verify the full application boundary, so they are insufficient as the primary E2E strategy. A staging release makes hosting and usability review possible before public site integration.
