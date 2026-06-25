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

## Run locally

Requires Node.js 22 or newer.

```bash
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
```

The suite covers local relevance, provider normalization, artist profiles, search
suggestions, federated deduplication, provider outages, exact/fallback playback
links, audio identification signing, HTTP routes, and static asset behavior.

## Deploy

The repository includes a non-root production container and GitHub Actions checks.

```bash
docker build -t liner-notes-search .
docker run --rm -p 3000:3000 --env-file .env liner-notes-search
```

Use `/api/health` for readiness probes and `/api/status` for runtime and provider
configuration diagnostics. Secrets remain server-side environment variables.
