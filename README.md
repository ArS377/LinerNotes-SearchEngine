# Liner Notes

An independent music search engine for finding recordings by title, artist, or
remembered lyrics, then exploring playback links, credits, versions, and sources.

## Features

- Federated song search across local editorial data, MusicBrainz, and Apple Music.
- Search suggestions, typo-tolerant matching, result pagination, and lyric fragments.
- Song pages with lyrics availability, credits, source links, artwork, and previews.
- Artist profiles and discographies for both local and globally discovered artists.
- Saved songs and recent searches stored privately in the browser.
- Optional exact Spotify links and ACRCloud audio or humming identification.
- A React and TypeScript client with resilient request caching and accessible routing.
- Optional Supabase authentication and private cross-device libraries.
- Optional Redis response caching, request coalescing, and assistant rate limits.
- A grounded OpenClaw discovery agent with structured citations and confidence labels.
- OpenTelemetry instrumentation, structured logs, and optional Sentry reporting.

## Architecture

The React/Vite client consumes versioned, Zod-documented API contracts. The Node
service federates provider requests, normalizes results, and applies relevance
ranking. Redis is an optional distributed cache; without it the same interface
uses a bounded process-local cache. Supabase PostgreSQL stores private libraries,
history, and agent conversations with row-level security. Every managed service is
optional, so local search continues to work with no credentials.

## Run locally

Requires Node.js 22 or newer.

```bash
npm ci
npm run build:web
npm start
```

Open <http://localhost:3000>.

The app works without a `.env` file. Optional integrations can be configured by
copying `.env.example` to `.env`.

## Search coverage

Search combines three layers:

1. The locally enriched catalog for detailed pages and remembered-lyric matching.
2. MusicBrainz for broad open recording metadata.
3. Apple Music's official Search API for commercial-catalog coverage, artwork,
   legal previews, and exact Apple Music track links.

No single provider contains every recording ever made. When one remote provider is
unavailable, the others continue to return results.

## Optional integrations

Copy `.env.example` to `.env` and add credentials as needed.

- Spotify client credentials resolve exact track URLs and add Spotify's 0–100
  popularity score as a secondary search-ranking signal. Spotify does not expose
  lifetime stream totals through its public Web API, so the app never labels this
  score as a stream count. Without credentials, the interface provides a correctly
  encoded Spotify search link.
- ACRCloud credentials enable audio-file and humming identification.
- OpenClaw credentials enable a read-only assistant panel that can answer
  questions using the current search or song context.
- `MUSICBRAINZ_CONTACT` identifies this application in MusicBrainz API requests.

Credentials are used only on the server and are never exposed to browser code.

## Tests

```bash
npm test
npm run test:e2e
```

The suite covers local relevance, provider normalization, federated deduplication,
provider outages, caching, authentication boundaries, grounded-agent evaluation,
HTTP contracts, and static asset behavior. Playwright runs the critical search and
song journey on desktop and mobile Chromium and checks accessibility with Axe.

## Managed services

Apply `supabase/migrations/001_library.sql` to a Supabase project, then configure
the three `SUPABASE_*` values. Set `REDIS_URL` to an Upstash Redis connection URL.
Secrets are read only by the server; never use the Supabase service-role key in a
Vite environment variable or browser bundle.

`render.yaml` defines the production web service. Configure secrets in Render,
deploy the Docker image, and use `/api/health` for readiness and `/api/status` for
provider, cache, and runtime diagnostics.

## Deploy

The repository includes a non-root production container and GitHub Actions checks.

```bash
docker build -t liner-notes-search .
docker run --rm -p 3000:3000 --env-file .env liner-notes-search
```

Use `/api/health` for readiness probes and `/api/status` for runtime and provider
configuration diagnostics. Secrets remain server-side environment variables.
