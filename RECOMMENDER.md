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

Resolve a local, MusicBrainz or Apple recording on the server. Supplement broad
store categories with exact normalized title/artist matches in MusicBrainz. If no
specific recording genres are found, use an unambiguous matching artist's genre
profile. Preserve artist-level provenance in `genreContext`; this is a fallback,
not proof about the sound of every song by that artist.

Select the most specific genre tier: explicit microgenres (rage rap, drill, plugg,
pluggnb, boom bap, g-funk) before trap/cloud rap/regional hip hop, other specific
genres, then umbrella categories. Normalize rage/rage rap and trap/trap music.
Search up to 100 recordings using at most three selected genres. For specific rap
subgenres, also search up to ten tagged artists and fetch up to twenty recordings
from each of at most four matching artists. Exact artist credits are required;
conflicting recording subgenres are not overwritten. Added artist evidence includes
only genres shared with the seed, not unrelated free-form artist tags.

Merge with local candidates, respecting filters and deduplication. No artist names
or recommended songs are hardcoded. MusicBrainz searches remain rate-limited,
cached and bounded; transient HTTP 503 receives one queued retry. Recording search
retains twelve tags instead of three, so sparse subgenre evidence is less likely
to be truncated. Broad-only metadata produces an insufficient-metadata response
in balanced/genre modes, not a generic hip-hop/pop/rock recommendation list.

MusicBrainz tags are preserved when a search response has no separate genres field.
Prefer the recording's first-release-date over an associated release's date. Even
that date may reflect incomplete catalog history, so explanations say catalog year.

## Ranking

Normalize genre punctuation and aliases. Let S be the selected specific seed genres,
A all seed genres and B all candidate genres. Score:

`genre = 0.8 * |S intersection B| / |S| + 0.2 * Jaccard(A, B)`

Matching the specific subgenre dominates; extra descriptive tags should not demote
a well-described rage track below a sparsely tagged recording.

For known release years, compute exponential proximity:

`era = exp(-abs(seedYear - candidateYear) / 12)`

Missing dates score zero and are not described as a year match. These starting
weights are hand-tuned and are not learned from user data:

| Focus | Genre weight | Era weight |
| --- | ---: | ---: |
| Balanced | 0.75 | 0.25 |
| Genre | 1.00 | 0.00 |
| Era | 0.25 | 0.75 |

Balanced and genre modes require a shared selected non-umbrella genre. Era mode also permits a
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

Current limitations include bounded retrieval (up to 180 remote candidates), sparse community tags,
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
