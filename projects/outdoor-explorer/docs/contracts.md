# API and normalized data

Park models and endpoints are implemented in #41; independent visitor alerts and road-event feeds are implemented in #45. The NPS parks schema was checked on 2026-09-26 against its [official Swagger definition](https://www.nps.gov/subjects/developer/customcf/swagger.json?03142019). Saved synthetic fixtures represent this schema, not a live recording. C# records in `Parks/Contracts.cs` are the backend source of truth; matching frontend types are maintained in `src/web/src/parks.ts`, with synthetic normalized fixtures in `parks.fixtures.ts`. Keep these types synchronized when changing the C# records; automatic type generation is not configured. Retrieval dates use ISO 8601 UTC strings; provider dates retain their supplied text and semantic label (an alert index date has no documented timezone); absent optional values are `null`, lists are arrays, and provider text must be rendered as text rather than trusted HTML.

## Models

```typescript
type StateCode = "ID" | "OR" | "WA";
type Activity = { id: string; name: string };
type Photo = {
  url: string;
  credit: string;
  caption: string | null;
  altText: string | null;
  sourceUrl: string;
};
type OperatingInformation = {
  name: string | null;
  description: string | null;
  standardHours: Record<string, string>;
  exceptions: Array<{
    name: string | null;
    startDate: string | null;
    endDate: string | null;
    hours: Record<string, string>;
  }>;
};
type Park = {
  id: string;                    // namespaced: nps:<parkCode>
  provider: "nps";
  providerId: string;            // original NPS record ID
  parkCode: string;
  name: string;                  // fullName
  designation: string | null;
  states: string[];              // preserve states beyond the three filter options
  coordinates: { latitude: number; longitude: number } | null;
  description: string | null;
  officialUrl: string;
  activities: Activity[];
  photos: Photo[];               // only images cleared for reuse
  operatingInformation: OperatingInformation[];
  retrievedAt: string;           // our fetch time, not a provider update time
};
type VisitorNotice = {
  id: string;                    // original provider ID, unique within the feed
  parkCode: string;
  category: string;              // provider category/event_type, Unspecified if missing
  title: string;
  description: string | null;
  sourceUrl: string;             // HTTPS NPS URL or official park fallback
  providerDate: string | null;   // supplied text, never inferred from retrieval time
  dateLabel: string;             // Provider last indexed / Provider source updated
};
type DataResult<T> = {
  data: T;
  status: "fresh" | "stale" | "partial";
  retrievedAt: string;
  warnings: string[];            // safe, stable codes; no raw upstream errors
};
```

Validate coordinates as a pair of finite numbers with latitude in [-90, 90] and longitude in [-180, 180]; invalid/missing pairs become `null`, never `(0, 0)`. Deduplicate activities by provider ID. Preserve provider categories even when unrecognized. Missing required park identity or valid official URL makes a record unusable: omit it with a partial-data warning rather than fabricate it. Accept only absolute HTTP(S) content URLs; official park links must resolve to the NPS domain policy established in integration. Never let a client supply an upstream URL.

## Endpoints and filtering

| Endpoint | Contract |
| --- | --- |
| `GET /health` | Process health, 200 when running; no credentials or provider call |
| `GET /api/parks?states=ID,OR,WA&q=&activityId=` | `DataResult<Park[]>`; defaults to all three states |
| `GET /api/parks/{parkCode}` | `DataResult<Park>` within supported geography |
| `GET /api/parks/{parkCode}/alerts` | `DataResult<VisitorNotice[]>`; independent from park details |
| `GET /api/parks/{parkCode}/road-events` | `DataResult<VisitorNotice[]>`; independent road feed |

Trim and uppercase state inputs; reject unsupported/empty state sets with 400. OR within states, AND across state, text, and activity filters. Text matches name and description case-insensitively; activity matches an exact NPS ID. Empty text/activity means no filter. Bound text to 200 characters and validate park codes and activity IDs against the ingested catalog/contract. Unknown well-formed activity IDs yield empty results; malformed input yields 400. Park codes outside the supported catalog yield 404. Apply filters after all upstream pages are collected; stable name/parkCode ordering avoids pagination artifacts. Activity options come from the normalized catalog, not invented labels. Initial bounded regional results require no public paging; upstream pagination remains mandatory.

Persist filters as frontend URL query parameters. Invalid URLs show a recoverable validation message. A valid empty result is 200 with an empty array. Backend failures use Problem Details (`type`, `title`, `status`, safe `detail`, trace ID), never raw provider bodies. Missing key in NPS mode and upstream unavailability without usable cache return 503; health remains independent. Failed alert requests show “Alerts temporarily unavailable” without hiding park details; successful empty responses show “No alerts returned by NPS,” with an official link. Never translate failure into an empty success.

### Verified visitor-feed contracts (#45)

Checked 2026-09-28 against the [official NPS Swagger definition](https://www.nps.gov/subjects/developer/customcf/swagger.json). `/alerts` accepts `parkCode`, `stateCode`, `limit`, `start`, and `q`; it returns string pagination metadata and a `data` array. Fetch every page for one park, validate membership, and deduplicate IDs. Category, title, description, URL, and `lastIndexedDate` are normalized. The latter is an index timestamp, not a publication date or confirmation of present conditions. Missing/unsafe URLs fall back to the official park URL.

`/roadevents` documents only `parkCode` (four-character codes) and optional `type` (`incident` or `workzone`), with no pagination. Both event types are requested by omitting `type`. It returns a GeoJSON `FeatureCollection` with `features`, nested `properties.core_details`, and `road_event_feed_info.data_sources`. Normalize feature ID, `name`, `event_type`, description, and the matching source's `update_date`. Do not interpret start/end dates as verified access or use geometry to infer membership. No feature park code or visitor URL is documented: use one park filter, verify `data_source_id` against a source whose `organization_name` matches the catalog park name, and link to that park's official page. Unverifiable source membership is unavailable, including provider naming discrepancies. A park with a code longer than four characters has an unavailable road feed rather than an unsupported request or fabricated empty success.

The feeds have separate requests, loading messages, retries, empty states, and unavailable states. A malformed record, mismatched park, or incomplete alerts pagination makes that feed unavailable rather than presenting incomplete information as complete. Empty success explicitly says no alerts/road events were returned by NPS. Every feed shows retrieval time; records separately label provider index/source update dates or their absence. Park details and the other feed remain usable after a failure. The page explains that NPS feeds may be delayed or incomplete and missing records do not establish safe travel or open roads.

## Provider abstraction and resilience

Live verification on 2026-09-26 confirmed that `stateCode=ID,OR,WA` requires literal comma separators. Encoding the whole list as `ID%2COR%2CWA` silently returned only Idaho matches. Encode each state value individually and preserve separators; the transport regression test and opt-in live smoke test cover all three states.

`INpsProvider` exposes asynchronous `GetParksAsync(states, cancellationToken)` returning normalized data plus completeness and retrieval metadata. It uses a typed `HttpClient`; raw JSON, pagination, and mapping stay in the adapter. Tests inject saved fixtures through its HTTP transport or replace the interface. Application services handle input rules and caching. `INpsConditionsProvider.GetConditionsAsync(park, roads, cancellationToken)` returns a normalized, independently sourced visitor feed. Future providers get separate adapters and provenance, not an assumption that NPS covers their lands.

Walk NPS `limit`/`start` pages until the reported total is exhausted; deduplicate by identity and guard against repeated/empty pages and inconsistent totals. A failed page must not poison a complete cache entry. If only partial results exist, mark them partial and show an incomplete-results message; never assert completeness. Tests cover page boundaries, duplicates, invalid records, and failures mid-fetch.

Implemented application policy (not an NPS freshness guarantee): cache complete park metadata for 60 minutes using one regional ID/OR/WA catalog shared across state/text/activity filters and detail routes. Coalesce concurrent misses and cap upstream fetch concurrency at one. On upstream failure or incomplete refresh, preserve complete data and serve it stale up to a total age of 24 hours with its original timestamp and `upstream_unavailable` warning. Partial data or errors are reused for a 30-second cooldown to prevent repeated failure traffic. Partial refreshes never replace complete data. Visitor feeds cache successful responses (including empty arrays) independently per catalog park and feed for five minutes, with a 30-second failure cooldown. Concurrent misses for the same feed coalesce; the two feeds refresh independently. At most four visitor-feed fetches run concurrently across parks per process; excess cache misses return unavailable with the same cooldown rather than queueing beyond the provider budget. Expired feed data is never served after failure, so a cached empty success cannot become an all-clear signal during an outage. Retrieval time is distinct from provider publication/update time.

Warnings: `invalid_record` (unusable identity/official URL/state list), `inconsistent_pagination` (changed total, offset/total inconsistency), `incomplete_pagination` (empty/repeated page or page cap), and `upstream_unavailable` mark incomplete fetches partial when usable records remain. Invalid response envelopes are unavailable, or partial if earlier pages succeeded. No usable partial records means 503, not an empty success. Optional omissions use `coordinates_unavailable` and `photos_omitted` without marking the catalog incomplete. Images require an exact URL in the server-configured reviewed allowlist; the default is empty. Operating-hour objects and legacy single-item arrays are accepted; unrecognized date formats become null.

Use a 10-second per-attempt timeout and 30-second overall request budget, propagate cancellation, and allow at most two retries for transient network/5xx failures with jitter. On 429, honor `Retry-After` when present, otherwise back off conservatively; if the wait exceeds the request budget, return the appropriate unavailable/stale response. Do not retry authentication errors. Cap provider concurrency and add public API request limiting so browser traffic cannot exhaust the shared key.

NPS documents a default **1,000 requests/hour per key**, shared across endpoints, and exposes `X-RateLimit-Limit` and `X-RateLimit-Remaining`. These details were verified against the [NPS API guides](https://home.nps.gov/subjects/developer/guides.htm) on 2026-09-26. The adapter logs numeric status and remaining quota only, disables default HTTP logging and redirects, and sends credentials in `X-Api-Key`, never a URL. API park routes have a global per-process 120-request/minute fixed-window limit with 429 Problem Details; health is excluded. Cache/cooldown and coalesced fetches further bound provider traffic. Shared limits across replicas remain a hosting concern for #49. Cache durations are application choices, not provider requirements.
