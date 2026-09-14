# Track discovery recommender

The implemented system is a metadata-based baseline for listener-controlled
discovery. It does not analyze sound or claim to match production, vocals or energy.

## User flow

Choose **Find similar** on a song or result, select genre/era priorities and artist
filters, then preview, bookmark, dismiss or follow a recommendation. Following a
recording adds an edge and its explanation to a trail. Trails can be saved in the
browser or copied as links. Links contain public track metadata and focus controls,
not the listener's bookmarks, excluded tracks or unfamiliar-artist filter. A localhost
link is usable only on the same computer until the application is deployed.

## Implementation

- `src/discovery.js`: canonical seed resolution, candidate retrieval, ranking,
  diversity reranking, evidence and conservative preview matching.
- `src/contracts/discovery.js`: Zod request and trail validation, shared with the UI.
- `POST /api/v1/discover`: bounded JSON, validated options, per-client rate limit,
  explicit provider failures and missing-recording errors.
- `web/Discovery.tsx`: React + TanStack Query preference controls and result states.
- `web/discovery-trails.ts`: validated trail URLs and localStorage persistence.

No new packages, paid model API, vector database or account are required. Existing
MusicBrainz and Apple adapters provide catalog data; the existing cache provides
request coalescing and memory/optional Redis caching. Seed lookup accepts identifiers,
not arbitrary remote URLs.

## Candidate retrieval

Resolve a local, MusicBrainz or Apple recording on the server. Use a verified exact
title/artist match in Apple to fill missing seed genre metadata where possible.
Retrieve up to 100 MusicBrainz recordings matching up to three seed tags, optionally
including the same artist. Merge with the seven-record local catalog. Use bounded,
quoted Lucene fields and the existing MusicBrainz request queue. Era-only fallback is
available when a seed has a date but no tags and same-artist retrieval is disabled.

MusicBrainz tags are preserved when a search response has no separate genres field.
Prefer the recording's first-release-date over an associated release's date. Even
that date may reflect incomplete catalog history, so explanations say catalog year.

## Ranking

Normalize genre punctuation and a small explicit alias list. For seed genres A and
candidate genres B, compute Jaccard similarity:

`genre = |A intersection B| / |A union B|`

For known release years, compute exponential proximity:

`era = exp(-abs(seedYear - candidateYear) / 12)`

Missing dates score zero and are not described as a year match. These starting
weights are hand-tuned and are not learned from user data:

| Focus | Genre weight | Era weight |
| --- | ---: | ---: |
| Balanced | 0.75 | 0.25 |
| Genre | 1.00 | 0.00 |
| Era | 0.25 | 0.75 |

Balanced and genre modes require at least one shared tag. Era mode also permits a
candidate within five years without shared tags, and requires a known date. Do not
pad results with unrelated recordings to reach the requested count.

Exclude the seed, exact normalized title/artist duplicates, dismissed identifiers,
equivalent dismissed entries present in the candidate pool, and bookmarked tracks.
The two artist controls independently exclude the seed artist and artists represented
in the current bookmarks. Matching artist names is conservative, not a complete
cross-platform identity graph; aliases and collaborative credits can evade it.

## Diversity and explanations

Greedily choose the next track using an MMR-style objective:

`0.75 * relevance - 0.25 * maximum_redundancy_with_selected_tracks`

Redundancy is the larger of the same-artist penalty (0.85) and same-known-album penalty
(0.80), plus 0.15 times genre overlap. This favors varied artists and releases while
preserving relevance. It is a soft penalty, not a guarantee of unique artists.

Reasons are assembled from actual shared tags, known dates and the bookmark filter.
The response includes source links and score components. Scores are ranking signals,
not calibrated probabilities or predictions of listener satisfaction. No LLM writes
these explanations.

Search Apple for previews only for the selected results. Attach media only when the
normalized title AND artist match; otherwise leave the preview unavailable. This
conservative rule can miss legitimate collaborations, but avoids first-result audio
substitution. It does not establish an ISRC-level recording match.

## Tests and evaluation

Automated tests cover ranking changes, artist filters, deduplication, dismissals,
artist/album diversity, missing evidence, outages, bounded requests, API behavior and
trail serialization. These establish correctness, not recommendation quality.

Next, create a fixed set of seed tracks spanning scenes and have listeners judge five
recommendations per seed. Compare this baseline against genre-only and random-within-
genre retrieval using save/open rate, relevant picks at five, artist diversity and
preview coverage. Do not change weights based only on whether unit tests pass.

Current limitations include a 100-candidate retrieval ceiling, sparse community tags,
incomplete dates, limited preview coverage, and no popularity or listening-history
model. "Outside my bookmarks" does not mean obscure or never heard before. Shared
trails preserve the selected path; the recommendations at each node can change.

## Audio-aware next stage (not implemented)

For production and vocal similarity, evaluate a music-capable CLAP checkpoint on
audio the project is authorized to process. A Python/PyTorch batch worker would
compute embeddings; PostgreSQL with pgvector could retrieve candidates by cosine
similarity using HNSW, followed by the existing preference filters and MMR stage.
General embeddings do not automatically disentangle vocals from instrumentation:
separate controls need suitable representations and listener evaluation before launch.
Credits-based producer/composer edges also require verified relationship data.

References:

- [MusicBrainz search fields](https://musicbrainz.org/doc/MusicBrainz_API/Search)
- [MMR paper](https://doi.org/10.1145/290941.291025)
- [CLAP](https://github.com/LAION-AI/CLAP)
- [pgvector](https://github.com/pgvector/pgvector)
