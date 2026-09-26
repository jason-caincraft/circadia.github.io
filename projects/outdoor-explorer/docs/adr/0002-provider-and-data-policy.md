# ADR 0002: NPS-only MVP with explicit provenance

Status: accepted for planning; schema verification in #41 and #45.

## Context

Provider records can be incomplete or delayed. Outdoor discovery must not turn incomplete inventory into claims about availability, solitude, road access, or safety.

## Decision

Limit initial geography to ID/OR/WA and inventory to NPS properties. Normalize through `INpsProvider` into the typed [Park and Alert contracts](../contracts.md). Retain original identifiers, official URLs, image credits, and separate retrieval/provider-update timestamps. Use backend-only credentials, bounded retries, complete-page ingestion, and in-memory caching. Explicitly distinguish empty, partial, stale, and unavailable states.

Display source attribution and official links. Verify image rights and omit uncertain material. Filter only on recorded activities, not inferred capabilities or current access. Alerts remain independent of park detail loading. Road events require a verified separate contract in #45.

## Consequences and alternatives

Coverage is intentionally narrower than a general outdoor search engine. In-memory cache is simple but resets on restart and is not shared between instances; revisit caching and quota coordination before scaling. Live availability, routing, other federal inventory, and weather need separate source evaluation. Direct frontend NPS calls and an initial generic multi-provider aggregation layer were rejected because they expose secrets or add premature complexity.

Next: [ADR 0003: Testing and release](0003-testing-and-release.md).
