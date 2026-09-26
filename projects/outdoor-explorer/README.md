# CainCraft Outdoor Explorer

An independent destination explorer for **National Park Service properties in Idaho, Oregon, and Washington**. Start with a state and activity, browse matching destinations, open a park, and consult its official NPS page and provider-reported alerts before planning a visit.

**Status:** runnable scaffold for [#40](https://github.com/jason-caincraft/circadia.github.io/issues/40). The API exposes process health; the frontend shows connection status and a search preview. NPS integration and working destination search follow in #41 and #42.

## Scope

The MVP supports one or more states (`ID`, `OR`, `WA`), text search, NPS activity filters, destination details, credited photos where permitted, operating information where supplied, and alerts with source and freshness information. “Park” includes NPS designations such as monuments and historic sites, not only national parks. Include a multi-state property when any of its states matches; retain its full state list and deduplicate by NPS park code.

NPS is the source for its own properties, not a complete outdoor inventory. The MVP excludes state parks, Forest Service/BLM inventory, reservations, live campsite availability, crowd/solitude predictions, routing, weather, accounts, and saved trips. An activity listing does not establish current access. Missing alerts do not mean safe travel or open roads. Coordinates describe a property, not a verified entrance or navigable destination.

Maps, campgrounds, drive times, additional providers, and saved trips are separately scoped follow-ons. Basic accessibility is part of the MVP, not deferred to later hardening.

## Architecture and boundaries

```mermaid
flowchart LR
    User[Browser] --> UI[React + TypeScript / Vite]
    UI -->|Normalized JSON /api| API[ASP.NET Core API]
    API --> Service[Validation and destination service]
    Service --> Cache[In-memory cache]
    Service --> Provider[INpsProvider adapter]
    Provider -->|Server-side X-Api-Key| NPS[NPS v1 API]
    Tests[xUnit and Playwright] --> Fixtures[Fixture provider]
    Fixtures -.-> Service
```

The frontend owns controls, URL filter state, rendering, navigation, and accessible loading/error messages. The backend owns validation, provider credentials, pagination, normalization, filtering, caching, and failures. Only the NPS adapter understands raw NPS DTOs. Production uses the real provider; deterministic tests inject fixtures at that same backend boundary. Browser tests exercise the actual app API.

Use **xUnit** for backend unit and API integration tests, **Vitest** for frontend component tests, and **Playwright TypeScript** for planned browser tests. The frontend uses lightweight React without a full-stack framework; no database is needed initially. Runtime and dependency versions are pinned locally. Do not use the repository-root Node packages, Jekyll, Liquid, Circadia assets, OAuth worker, or Trailbreaker Recon.

The frontend may later be statically hosted on caincraft.com or a subdomain; ASP.NET Core needs its own runtime host. Hosting, base paths, SPA fallback, exact CORS origins, and DNS integration are decisions for #49. No deployment or domain changes are part of this issue.

### Structure

API and frontend source and initial tests are implemented. The `tests/e2e/` and provider fixtures below remain targets for #43 and #41.

```text
projects/outdoor-explorer/
  README.md
  .gitignore                   # local secrets, build output, test artifacts
  .env.example                 # names/placeholders only
  global.json                  # pinned SDK
  OutdoorExplorer.slnx
  src/
    OutdoorExplorer.Api/       # endpoints, services, contracts, NPS adapter
    web/                      # React/TypeScript/Vite; own package.json + lockfile
  tests/
    OutdoorExplorer.Api.Tests/ # xUnit unit + WebApplicationFactory tests
    e2e/                      # Playwright TS; own package.json + lockfile
    fixtures/nps/             # sanitized representative provider payloads
  scripts/                    # project-local build/test orchestration
  docs/
    contracts.md
    adr/
      0001-independent-app.md
      0002-provider-and-data-policy.md
      0003-testing-and-release.md
```

See [normalized contracts and operational policy](docs/contracts.md) and the [architecture decisions](docs/adr/0001-independent-app.md).

## Local development and checks

Use **.NET SDK 10.0.401** (pinned in `global.json`, targeting .NET 10) and **Node 24.15.0** (pinned in `.nvmrc`; npm 8.19.1 or newer). Package versions and transitive dependencies are locked independently in NuGet `packages.lock.json` files and `src/web/package-lock.json`. The SDK is available from the [.NET 10 download page](https://dotnet.microsoft.com/en-us/download/dotnet/10.0); the Node version meets [Vite's runtime requirements](https://vite.dev/guide/).

Run from `projects/outdoor-explorer/`:

```powershell
dotnet restore OutdoorExplorer.slnx --locked-mode
npm --prefix src/web ci

# Terminal 1: API at http://localhost:5080 (Development launch profile)
dotnet run --project src/OutdoorExplorer.Api

# Terminal 2: frontend at http://localhost:5173
npm --prefix src/web run dev
```

Open **http://localhost:5173**. No key, environment file, or provider connection is needed. `/health` returns `200` with `{"status":"ok"}`. Stop the API and reload the page to see the unavailable state; restart it and select **Retry connection** to recover. Health checks time out after five seconds. Search controls preview the layout; search is explicitly disabled until #42.

Configuration is checked in for local use: the API launch profile binds port 5080, Development configuration allows exactly `http://localhost:5173`, and Vite binds localhost on port 5173 with strict-port behavior. Production has no allowed CORS origins by default. CORS is a browser policy, not authentication. Changing ports requires updating these settings and the public API URL together.

The frontend's optional `src/web/.env.local` may contain **only public configuration**, following `src/web/.env.example`. Vite disables automatic `VITE_*` exposure and explicitly injects only `VITE_API_BASE_URL`. Never place secrets in frontend files, public assets, or source code. Store future provider credentials outside the repository in a host secret manager or backend process environment. The root `.env.example` is a reference, not an automatically loaded configuration file. Provider configuration below is planned for #41 and is not consumed by this scaffold.

Run all checks with PowerShell 7:

```powershell
pwsh -File scripts/check.ps1
```

Or run the individual cross-platform commands:

```powershell
dotnet build OutdoorExplorer.slnx --no-restore
dotnet format OutdoorExplorer.slnx --no-restore --verify-no-changes
dotnet test OutdoorExplorer.slnx --no-build
npm --prefix src/web run lint
npm --prefix src/web test
npm --prefix src/web run build
```

### Contributor notes

Keep changes under this project except the explicit Jekyll publishing exclusion. Use `dotnet format OutdoorExplorer.slnx --no-restore` and `npm --prefix src/web run format` before review. Add API integration coverage for endpoints and component coverage for visible loading, failure, and recovery behavior. Tests use no external provider and require no credentials. Run the quality checks above before submitting changes; commit updated lockfiles with intentional dependency changes.

Errors use Problem Details (`application/problem+json`) with `type`, `title`, `status`, safe `detail`, and `traceId`. Exceptions use the same sanitized response in Development and Production; route misses also follow this convention. Health reports process availability only, not NPS availability.

The initial suite covers API health, exact-origin CORS, route errors, frontend success, failed requests, invalid responses, and retry. Playwright browser/server orchestration and broader fixture coverage are still scheduled for #43.

### Configuration contract

| Variable | Owner | Planned value/behavior |
| --- | --- | --- |
| `NPS_API_KEY` | Backend secret | Required only in `Nps` mode; never returned or logged |
| `OutdoorExplorer__Provider` | Backend | `Nps` by default; `Fixture` only in Development/Test |
| `Nps__BaseUrl` | Backend | `https://developer.nps.gov/api/v1/`; not client-controlled |
| `Nps__ParksCacheMinutes` | Backend | `60`, proposed policy |
| `Nps__AlertsCacheMinutes` | Backend | `5`, proposed policy |
| `AllowedOrigins__0` | Backend | `http://localhost:5173` in development; exact staging origin later |
| `VITE_API_BASE_URL` | Public frontend build config | `http://localhost:5080`; never a secret |

Keep production keys in the host's secret manager. Use .NET user secrets for local storage if the scaffold adds an explicit `Nps:ApiKey` fallback, with `NPS_API_KEY` taking precedence. Commit only placeholders. Ignore local `.env*` (except examples), local secret files, `.NET bin/obj`, `node_modules`, `dist`, Playwright artifacts, and logs within the project. Redact credentials from diagnostics and fixture recordings; rotate any accidentally exposed key. Never use a `VITE_` variable for a provider key because frontend configuration is public.

## Attribution, content, and accessibility

Display “Data: National Park Service” linked to the official park page and describe CainCraft as an independent app. Retain source links and timestamps. NPS content can include third-party material: preserve image credit, caption, and alt text; verify reuse rights before displaying an image, and omit uncertain images with a stable text fallback. Attribution alone does not establish permission. Do not use the NPS Arrowhead or imply endorsement. Review the [NPS disclaimer](https://www.nps.gov/aboutus/disclaimer.htm) before release, including applicable notices for commercial reuse.

Use semantic headings, explicit filter labels, keyboard-operable controls, visible focus, readable contrast, reduced-motion support, and responsive layouts. Announce result/loading/error changes without repeatedly moving focus; set an appropriate focus target on route navigation. Keep source links understandable out of context. Missing images and optional fields must preserve usable layout. Automated checks accompany manual keyboard, zoom, mobile, and screen-reader review; a later map must retain an equivalent list.

## Ordered milestones and release gates

This is implementation order, which intentionally brings CI and alerts forward ahead of optional map work. Each issue adds its own fixture tests; #43 expands and standardizes coverage.

| Order | Issue | Deliverable / gate |
| --- | --- | --- |
| 0 | [#39 Blueprint](https://github.com/jason-caincraft/circadia.github.io/issues/39) | Scope, contracts, ADRs; documentation only |
| 1 | [#40 Scaffold](https://github.com/jason-caincraft/circadia.github.io/issues/40) | Pinned tools, isolated app, `/health`, visible service-down state; runnable commands |
| 2 | [#41 NPS parks](https://github.com/jason-caincraft/circadia.github.io/issues/41) | Validated normalized parks, pagination, cache, fixture coverage |
| 3 | [#42 Destination UI](https://github.com/jason-caincraft/circadia.github.io/issues/42) | State/activity/text filters, shareable URLs, responsive details |
| 4 | [#43 Test suite](https://github.com/jason-caincraft/circadia.github.io/issues/43) | Deterministic API + Chromium E2E with failure diagnostics |
| 5 | [#48 CI](https://github.com/jason-caincraft/circadia.github.io/issues/48) | Clean-checkout build/lint/test without provider secrets |
| 6 | [#45 Alerts and road events](https://github.com/jason-caincraft/circadia.github.io/issues/45) | Complete core journey; verify endpoint contracts and distinguish empty/unavailable |
| 7 | [#49 Staging](https://github.com/jason-caincraft/circadia.github.io/issues/49) | MVP release: CI green, accessibility/source review, smoke tests, rollback documented |
| 8 | [#44 Map](https://github.com/jason-caincraft/circadia.github.io/issues/44) | Optional enhancement; attribution and accessible fallback |
| 9 | [#46 Campgrounds](https://github.com/jason-caincraft/circadia.github.io/issues/46) | Inventory/amenities, never implied booking availability |
| 10 | [#47 Drive distance](https://github.com/jason-caincraft/circadia.github.io/issues/47) | After map; separate routing provider evaluation |
| 11 | [#50 RIDB](https://github.com/jason-caincraft/circadia.github.io/issues/50) | After stable MVP; retain provider provenance |
| 12 | [#51 Conditions](https://github.com/jason-caincraft/circadia.github.io/issues/51) | After deployed MVP; independently sourced conditions |
| 13 | [#52 Saved trips and hardening](https://github.com/jason-caincraft/circadia.github.io/issues/52) | Local-only persistence first; deeper accessibility/performance review |

The root Jekyll configuration excludes only `projects/outdoor-explorer` from publication. This prevents app source, dependencies, local configuration, and build artifacts from being copied into Circadia. Existing site routes and root Node dependencies are unchanged. Verify this boundary with a Jekyll build to a temporary destination; it must contain the existing archive route and no `projects/outdoor-explorer` directory. Never store secrets in the site tree, even in ignored files.

## References

Provider guidance checked for this blueprint on 2026-09-26; recheck contracts and terms during integration and release:

- [NPS API documentation](https://www.nps.gov/subjects/developer/api-documentation.htm)
- [NPS authentication and rate limits](https://home.nps.gov/subjects/developer/guides.htm)
- [NPS content and image disclaimer](https://www.nps.gov/aboutus/disclaimer.htm)
