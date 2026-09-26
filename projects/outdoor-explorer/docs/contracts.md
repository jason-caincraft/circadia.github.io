# Proposed API and normalized data

These are design contracts, not implemented endpoints. #41 and #45 must confirm current NPS schemas with sanitized fixtures. C# records are the backend source of truth; publish OpenAPI and generate or contract-check frontend TypeScript types to prevent drift. Dates use ISO 8601 UTC strings; absent optional values are `null`, lists are arrays, and provider text is rendered as text rather than trusted HTML.

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
type Alert = {
  id: string;                    // namespaced original alert ID
  provider: "nps";
  parkCode: string;
  category: "danger" | "closure" | "caution" | "information" | "unknown";
  providerCategory: string | null;
  title: string;
  description: string | null;
  sourceUrl: string;             // validated provider URL; official park fallback
  sourceUpdatedAt: string | null;// only when supplied with understood semantics
  retrievedAt: string;
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
| `GET /api/parks/{parkCode}/alerts` | `DataResult<Alert[]>`; independent from park details |

Trim and uppercase state inputs; reject unsupported/empty state sets with 400. OR within states, AND across state, text, and activity filters. Text matches name and description case-insensitively; activity matches an exact NPS ID. Empty text/activity means no filter. Bound text to 200 characters and validate park codes and activity IDs against the ingested catalog/contract. Unknown well-formed activity IDs yield empty results; malformed input yields 400. Park codes outside the supported catalog yield 404. Apply filters after all upstream pages are collected; stable name/parkCode ordering avoids pagination artifacts. Activity options come from the normalized catalog, not invented labels. Initial bounded regional results require no public paging; upstream pagination remains mandatory.

Persist filters as frontend URL query parameters. Invalid URLs show a recoverable validation message. A valid empty result is 200 with an empty array. Backend failures use Problem Details (`type`, `title`, `status`, safe `detail`, trace ID), never raw provider bodies. Missing key in NPS mode and upstream unavailability without usable cache return 503; health remains independent. Failed alert requests show “Alerts temporarily unavailable” without hiding park details; successful empty responses show “No alerts returned by NPS,” with an official link. Never translate failure into an empty success.

Road events in #45 require their own verified normalized contract and source label; do not silently coerce them into alerts or infer road access. Keep alerts usable if the road-events request fails.

## Provider abstraction and resilience

`INpsProvider` exposes asynchronous `GetParksAsync(states, cancellationToken)` and `GetAlertsAsync(parkCode, cancellationToken)` operations returning normalized data plus completeness and retrieval metadata. Implement it with a typed `HttpClient`; keep raw DTOs, pagination, and mapping in the adapter. A fixture implementation obeys the same contract. Application services handle input rules and caching. Future providers get separate adapters and provenance, not an assumption that NPS covers their lands.

Walk NPS `limit`/`start` pages until the reported total is exhausted; deduplicate by identity and guard against repeated/empty pages and inconsistent totals. A failed page must not poison a complete cache entry. If only partial results exist, mark them partial and show an incomplete-results message; never assert completeness. Tests cover page boundaries, duplicates, invalid records, and failures mid-fetch.

Proposed application policy (not an NPS freshness guarantee): cache complete park metadata for 60 minutes and alerts for 5 minutes. Use sorted state sets/park codes as keys and coalesce concurrent misses. On upstream failure, park metadata may be served stale for up to 24 hours with a visible timestamp/warning. Do not silently serve expired alerts as current; show unavailable with an official source link. Retrieval time is distinct from provider publication/update time.

Use a 10-second per-attempt timeout and 30-second overall request budget, propagate cancellation, and allow at most two retries for transient network/5xx failures with jitter. On 429, honor `Retry-After` when present, otherwise back off conservatively; if the wait exceeds the request budget, return the appropriate unavailable/stale response. Do not retry authentication errors. Cap provider concurrency and add public API request limiting so browser traffic cannot exhaust the shared key.

NPS currently documents a default **1,000 requests/hour per key**, shared across endpoints, and exposes `X-RateLimit-Limit` and `X-RateLimit-Remaining`. Monitor these server-side and reduce traffic before exhaustion; the documented limit is not a per-browser allowance. Send credentials in `X-Api-Key`, never a URL. These details come from the [NPS API guides](https://home.nps.gov/subjects/developer/guides.htm); verify them again in #41. Cache durations above are our proposed choices, not provider requirements. Log safe status/duration/cache metrics, excluding keys, authorization headers, and raw request/response dumps.
