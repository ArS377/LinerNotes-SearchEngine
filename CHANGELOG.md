# Changelog

## 1.0.0 - 2026-07-11

- Added progressive local-first and federated search with typed intent, confidence,
  provider states, filters, explanations, pagination, and request timings.
- Added Explore, genre, artist, comparison, private Insights, bookmarks, and About
  routes in a responsive editorial interface.
- Added a deterministic, explainable recommendation engine driven by browser-local
  bookmarks and recent searches; no account or paid API is required.
- Added versioned browser-profile migration, richer song provenance, authorized
  lyrics links, provider-safe fallbacks, and metadata-only bookmarking.
- Expanded API, unit, integration, accessibility, and Playwright journey coverage.

## 0.2.0 - 2026-07-10

- Migrated primary search, song, saved-library, and agent flows to React and TypeScript.
- Added shared Zod contracts, Supabase persistence schema, Redis caching, and rate limits.
- Added grounded OpenClaw conversations with citations, confidence, and safety boundaries.
- Added OpenTelemetry, structured logs, Sentry integration, Playwright, and Axe checks.
- Added managed deployment configuration, multi-stage Docker builds, OpenAPI, and CI gates.
