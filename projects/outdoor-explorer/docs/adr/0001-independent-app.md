# ADR 0001: Independent API and frontend

Status: accepted for planning; implementation in #40, hosting in #49.

## Context

The repository already publishes Circadia through Jekyll. Outdoor Explorer needs server-side provider credentials and an interactive browser UI without coupling its lifecycle to that site or other projects.

## Decision

Keep all app source, dependencies, tests, and documentation under `projects/outdoor-explorer/`. Use ASP.NET Core for the API and React + TypeScript/Vite for the frontend. Pin supported runtime versions during scaffolding. Use separate project-local dependency manifests and build artifacts, with no Jekyll or root Node dependency. No database or authentication is required for the MVP.

Use normalized JSON across the API boundary and exact allowed origins for local/staging CORS. Keep frontend configuration public and provider credentials server-side. Later static frontend hosting on caincraft.com remains possible, with a separately hosted API; #49 owns hosting evaluation and any separately approved site/domain integration.

## Consequences and alternatives

Two development services are required, but each can build and deploy independently. A browser-only client was rejected because it exposes the NPS key. Extending Jekyll or the existing OAuth worker was rejected because it couples unrelated projects. A full-stack React framework adds no needed MVP capability.

The current Jekyll configuration may copy tracked project files. Before runnable scaffolding reaches publication, resolve that artifact boundary through separately scoped publishing configuration and inspect build output. A nested `.gitignore` is insufficient. This documentation issue does not alter existing site files.

Next: [ADR 0002: Provider and data policy](0002-provider-and-data-policy.md).
