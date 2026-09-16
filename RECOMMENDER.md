# Track discovery recommender

## What is implemented

`catalog-research-mmr-v3` uses provider metadata, not audio analysis. There are no
artist recommendation maps, genre-name tiers, broad-genre blocklists, or manually
assigned subgenre relationships in the recommendation algorithm. Numeric limits
and ranking weights remain explicit engineering parameters, not learned values.
Named artists and genres in test/evaluation fixtures are not production rules.

## Genre catalog and on-demand research

`src/genre-research.js` loads the complete MusicBrainz genre vocabulary using
`/ws/2/genre/all?fmt=txt`. The documented text format is unpaginated. The catalog
is cached for a day with a one-week stale fallback. Unicode-aware normalization
handles punctuation and case without removing non-Latin names. Store labels that
do not match the official vocabulary are not guessed into a genre or alias.

Seed resolution looks for an exact normalized title/artist match in MusicBrainz.
It also searches release groups by the seed's album title and artist, accepts only
one exact match, and loads that album's genres. Album evidence takes priority over
career-wide artist genres; ambiguous releases are not guessed. Evidence explicitly
distinguishes recording, album and artist context.
Artist metadata is fetched via that recording's artist ID, or a unique exact-name
artist result. Ambiguous artists are not merged. Up to twelve validated genres
from the recording and album (or artist if album evidence is unavailable) are researched using bounded recording searches:
`tag:"<provider genre>" AND status:official`, limit 1. The returned total is the
catalog prevalence estimate; counts are cached daily with stale fallback.

Ignore genre votes below one third of the strongest provider vote count when
votes are available. For positive-support genres, compute
`supportFraction * max(0.1, log((largestCount + 1)/(genreCount + 1)))`.
Keep genres with at least half the strongest score, preferring recording-level
evidence within that set over artist-level evidence. Select at most three genres.
This combines tagging support with rarity, rather than letting an obscure weak
artist tag override its principal style. It gives rarer descriptors influence without encoding
that one named genre is more specific than another. For example, a new genre
added by MusicBrainz is usable without a code change.

IMPORTANT: lower catalog frequency is only a specificity heuristic. It does not
establish a semantic parent/child hierarchy, a musical scene, or audible similarity.
Community tagging coverage is uneven and search totals are estimates. Research is
structured catalog querying, not unsupervised web scraping or an LLM inventing
genre facts. Missing counts remain unknown; partial research abstains rather than
silently selecting a broader remaining genre. Zero-count tags do not win by rarity.

The seed's `genreResearch` includes catalog size, research timestamp, status,
selected genres, counts, evidence level and reproducible search URLs. Each result's
evidence includes the matching research entries. Artist-level fallback is identified
in the explanation; it is not presented as a verified tag on the song itself.

## Retrieval and ranking

Search up to 100 recordings for the selected genres. For every genre family, also
search up to ten matching artists and fetch twenty recordings from each of at most
four eligible artists. No rap-specific branch exists. Artist-inferred candidate
genres cannot overwrite conflicting track tags. Broader tags are identified only
when the same research shows their count is more than four times the selected
genres' counts; unknown tags are not assumed broad. Related candidates keep only
artist genres shared with the seed. Existing local catalog entries join the pool.

Balanced and genre modes require a researched genre match. Era mode remains an
explicit alternative: it can accept a track within five years without a genre
match. Do not interpret era mode as a sound-similarity mode.

For selected seed genres S, all seed genres A and candidate genres B:

`genre = 0.8 * |S intersection B| / |S| + 0.2 * Jaccard(A, B)`

`era = exp(-abs(seedYear - candidateYear) / 12)`

Missing dates contribute zero. Balanced weights are 0.75 genre/0.25 era; genre mode
is 1/0; era mode is 0.25/0.75. These weights are hand-tuned, not trained.
Artist and album diversity use the existing MMR reranker:
`0.75 * relevance - 0.25 * maximum redundancy`.
The final list allows at most two recordings per artist and one per known
artist/album pair. Unknown album names are not grouped together. These caps apply
to every genre and can produce a shorter list; unrelated music is never added to
fill the remaining slots.

Seed, duplicates, dismissed/bookmarked recordings and excluded artists are filtered.
Preview/artwork enrichment requires an exact normalized title AND artist match.
MusicBrainz calls use the shared rate limiter; HTTP 503 is retried once, not forever.
The first uncached discovery can be slow due to bounded sequential provider queries.
Provider outages can produce fewer or no results. No generic genre list is silently
substituted when research fails. API input validation and rate limiting are unchanged.

## Tests and live evaluation

Run `npm test`, `npm run typecheck`, and `npm run lint`.
Genre research fixtures cover rap, rock/shoegaze, electronic, jazz, country, metal,
pop, folk, classical, reggae, soul, previously unknown provider genres, non-Latin
labels, conflicting artist styles, non-genre tags and provider outages.

Run `node scripts/evaluate-discovery.js` for live cross-genre catalog checks. Its
eight named seed tracks are evaluation fixtures only. It prints JSON lines with
selected genres, evidence/counts, recommendations, latency and failures. It does
not listen to audio or establish subjective relevance. A human-rated dataset is
still needed before claiming quality across every artist and every genre.

Discovery controls, previews, bookmarks and saved/shareable trails are unchanged.
No new paid API, model, dependency or vector database is required. Future audio
similarity requires appropriately licensed audio, embeddings and listener testing.

## Sources

### Live evaluation notes — 2026-09-15

Eight seed cases were exercised, with repeated runs during intermittent MusicBrainz
503 errors. This is not eight successful quality evaluations. The initial rarity-only
version exposed weak-tag drift (C86 for My Bloody Valentine) and artist-history drift
(country pop for cardigan). Those observations led to vote support and album-context
enrichment, with deterministic regression tests for both failure modes.

The support-weighted run selected rage for Green Room, thrash metal for Metallica,
and roots reggae for Bob Marley. Metallica returned five tagged recommendations
including Anthrax; several other cases could not retrieve candidates or complete
genre research because of provider failures. Jolene's bluegrass fallback was
artist-level context, not verification of the song's subgenre or a listener-quality
pass. The album-aware cardigan rerun found folklore's indie folk/chamber pop/folk pop
evidence but incomplete prevalence requests correctly produced no recommendations.
Album lookup exceptions now also abstain instead of substituting career-wide tags.

Outstanding: reliable provider coverage, faster cold lookups, artist-credit identity
edge cases, and listener judgments across a much larger set. No claim is made that
all artists or all genres have been evaluated, or that all eight live cases passed.

### API references

- https://musicbrainz.org/doc/MusicBrainz_API (genre vocabulary and text endpoint)
- https://musicbrainz.org/doc/MusicBrainz_API/Search (tag fields and search totals)
