# Liner Notes

An explainable music-intelligence platform for finding a recording by title,
artist, or remembered lyrics—and then following its artists, genres, versions,
credits, provenance, and musical context.

## Features

- Progressive local-first search across editorial data, MusicBrainz, and Apple Music.
- Typed query intent (artist, track, lyrics, or mixed), confidence, provider health,
  filters, typo tolerance, result explanations, pagination, and measured latency.
- Explore, genre, artist, song, and side-by-side version comparison experiences.
- Private listening insights with diversity metrics and explainable recommendations.
- Versioned bookmarks, comparisons, and recent searches stored only in the browser.
- Rich song provenance, legal playback destinations, and authorized lyrics links.
- Optional exact Spotify links and ACRCloud audio or humming identification.
- A React and TypeScript client with resilient request caching and accessible routing.
- Optional Supabase authentication and private cross-device libraries.
- Optional Redis response caching, request coalescing, and assistant rate limits.
- A low-cost DeepInfra music assistant using the supplied catalog context.
- OpenTelemetry instrumentation, structured logs, and optional Sentry reporting.

## Architecture

The React/Vite client consumes versioned Zod contracts. The Node service classifies
intent, returns local matches immediately, federates provider requests, normalizes
results, deduplicates versions, and applies relevance ranking. A deterministic
content-based engine turns browser-supplied profile metadata into taste metrics and
recommendations with a human-readable reason for every result.

Every managed service is optional. Redis falls back to a bounded process-local
cache; Supabase can add authenticated cross-device persistence; and the complete
search, discovery, compare, and insights journey works without credentials.

## Run locally

Requires Node.js 22 or newer.

```bash
npm ci
npm run build:web
npm start
```

Open <http://localhost:3000>.

For separate hot-reload servers during development, run these in two terminals:

```bash
npm run dev
npm run dev:web
```

The API runs on port 3000 and Vite runs on port 5173.

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

## Privacy and copyright

The default profile never leaves the browser except as transient metadata sent to
the recommendation endpoint; the server does not persist it. Bookmarks contain
metadata and source URLs—not audio files. Liner Notes does not scrape or reproduce
full lyrics. It links to authorized lyric destinations and labels unavailable
capabilities honestly.

## Optional integrations

Copy `.env.example` to `.env` and add credentials as needed.

- Spotify client credentials resolve exact track URLs and add Spotify's 0–100
  popularity score as a secondary search-ranking signal. Spotify does not expose
  lifetime stream totals through its public Web API, so the app never labels this
  score as a stream count. Without credentials, the interface provides a correctly
  encoded Spotify search link.
- ACRCloud credentials enable audio-file and humming identification.
- DeepInfra credentials enable a read-only assistant panel that can answer
  questions using the current search or song context.
- `MUSICBRAINZ_CONTACT` identifies this application in MusicBrainz API requests.

Credentials are used only on the server and are never exposed to browser code.

### Music assistant setup

Add your token to `DEEPINFRA_API_KEY` in `.env`, then restart `npm start`.
`DEEPINFRA_MODEL` defaults to `google/gemma-3-4b-it`; no OpenClaw installation
or credentials are used. Never put the token in a `VITE_` variable or commit `.env`.
The assistant panel is hidden until the key is configured.

As checked September 17, 2026, [DeepInfra pricing](https://deepinfra.com/models/text-generation/4)
lists this model at $0.05 per million input tokens and $0.10 per million output
tokens. 1,000 questions at 1,000 input + 300 output tokens each would cost about
$0.08 (estimate, not a billing guarantee). Each request caps output at 512 tokens,
question length at 2,000 characters, and context at 16,000 serialized characters.
Model requests time out after 20 seconds, with no automatic paid retries.

Add `TAVILY_API_KEY` to `.env` and restart the backend to enable web research
for both music questions and recording comparisons. Song questions use one
basic Tavily search; comparisons use one search per recording (up to three).
Searches have a 10-second timeout, return up to three bounded excerpts each,
and successful results are cached in server memory for one hour. Identical
concurrent searches share a request. Search queries include song titles, artist
names and the question; full catalog records and conversation history are not
sent to Tavily. Keys stay on the server.

DeepInfra receives those excerpts alongside music details and cites source IDs.
The server creates citation links only from returned Tavily URLs actually cited
by the model. These are search excerpts, not full-page research or independent
fact-checking; confidence stays `partial`. Missing keys, failed searches and
empty results are explicitly shown in the UI. When no search evidence is available,
the server skips generation rather than spending model tokens on an unsupported
answer. Search outages are not cached. Search charges are separate from model
charges; basic searches consume one Tavily credit each.

## Tests

```bash
npm test
npm run test:e2e
```

The suite covers intent classification, explainable recommendations, local-first
and federated contracts, relevance, provider normalization, deduplication, outages,
caching, authentication boundaries, grounded-agent evaluation, and static assets.
Playwright exercises search, song, comparison, and private-insights journeys on
desktop and mobile Chromium and checks accessibility with Axe.

Run `npm run benchmark` to reproduce the local ranking benchmark. On the release
workstation, version 0.2.0 completed 100 representative searches at 0.168 ms p50,
0.344 ms p95, and 1.348 ms maximum. These figures measure only the in-process
ranking algorithm and do not represent network-provider or production latency.

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
