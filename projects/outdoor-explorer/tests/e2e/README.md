# Deterministic browser tests

Run from `projects/outdoor-explorer/` with the pinned .NET SDK and Node on PATH:

```powershell
npm --prefix src/web ci
npm --prefix tests/e2e ci
npm --prefix tests/e2e run install:browsers
npm --prefix tests/e2e run test:all
```

The last command restores locked NuGet dependencies, builds the solution, runs xUnit excluding `Category=Live`, and runs Chromium. After a build, `npm --prefix tests/e2e test` runs just browsers. The full quality gate is `pwsh -File scripts/check.ps1` (PowerShell 7). On Windows PowerShell with script execution disabled, use `npm.cmd` in place of `npm`.

## Backend boundary and isolation

Playwright owns both webServer processes, including cleanup after failures. The test-only `OutdoorExplorer.E2eHost` uses `WebApplicationFactory<Program>` with Kestrel on `127.0.0.1:5088` and the real production entry point. Vite runs on `127.0.0.1:5178`. Occupied ports fail the run; existing development servers are never reused. For concurrent suite invocations on one machine use separate containers/agents; workers within a run are parallel.

Only the upstream HTTP transport is replaced with an immutable, fail-closed handler reading `tests/fixtures/nps/parks-page-*.json`. The real NPS adapter, pagination, mapper, cache, filters, endpoint serialization and error middleware run. The key is synthetic; no test fixture branch exists in the production API. The host uses the Testing environment, clears photo approvals, and replaces the shared quota policy with an unlimited test policy. xUnit independently verifies the production 120/minute limiter and its 429 Problem Details response. This prevents browser workers from consuming one another's quota.

Every test has its own browser context and URL state. Fixtures and the shared catalog are read-only; tests never mutate the provider or clear the shared cache. The automatic fixture blocks external browser HTTP and fails if any is attempted, including images. Map tests explicitly select `mapTiles: "fixture"` (a synthetic local PNG) or `"unavailable"` (aborted requests). Only exact OpenStreetMap tile paths are intercepted in those modes; no HTTP reaches the tile service. Main journeys use real app HTTP. Loading and transport-failure tests intercept requests: loading gates release real responses, and retry returns to real API requests. No sleeps, live data, real credentials, or normalized browser response mocks are used.

## Locators and coverage

Prefer `getByRole` with accessible names and `getByLabel`. Scope repeated content to the Destinations region or article. Use text for user-visible status messages. Add a `data-testid` only when no stable semantic locator exists, name it for a domain concept, and explain the exception beside the test. Map markers have explicit accessible names; no test IDs are needed.

Coverage includes regional render/deduplication, state/keyword/activity filtering, catalog activity options, URL reload and browser history, detail navigation/focus/source links, optional-field fallback, empty and missing results, invalid shared filters, required state selection, loading, failed request/retry, and a 390px viewport with keyboard navigation and horizontal overflow checks. These checks supplement manual accessibility review. Alert journeys follow with #45.

Map journeys cover opt-in loading, multi-state deduplication, filter/list/marker consistency, missing coordinates and empty maps, keyboard popup/detail navigation, authorized and denied location, radius changes, location clearing and reload privacy, and mobile fallback with unavailable tiles. Browser geolocation is supplied through Playwright context permissions and coordinates; no live location service is used.

## Failure diagnostics

Trace recording runs from the first attempt and is retained on failure; screenshots and video also survive failures. Retries are disabled so a failing first attempt remains visible. Artifacts are ignored under `test-results/` and `playwright-report/`; normal subsequent runs replace their contents, so copy a report before rerunning if needed.

```powershell
npm --prefix tests/e2e run report
# Substitute the actual failed-test folder:
npx --prefix tests/e2e playwright show-trace tests/e2e/test-results/<failed-test>/trace.zip
```

This follows Playwright's [webServer lifecycle](https://playwright.dev/docs/test-webserver) and [failure artifact configuration](https://playwright.dev/docs/test-use-options). CI artifact upload and bounded retention belong to #48.

## Optional browsers and live smoke

Chromium is the default PR path. To exercise optional Firefox/WebKit projects after installing their browser binaries:

```powershell
npx --prefix tests/e2e playwright install firefox webkit
$env:E2E_ALL_BROWSERS = '1'
npm --prefix tests/e2e test
Remove-Item Env:E2E_ALL_BROWSERS
```

Live NPS checks are separate, opt-in API tests. With a key already securely configured outside the repository, run `NPS_LIVE_SMOKE=1` and `dotnet test OutdoorExplorer.slnx --filter 'Category=Live'` as documented in the project README. A future scheduled job may run this path with protected secrets; it must not gate fixture-based PR checks. `test:all` forces live smoke off even if the caller's environment opted in.
