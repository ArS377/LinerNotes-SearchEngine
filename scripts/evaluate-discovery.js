// Evaluation fixtures only: never imported by the recommendation service.
// Live catalog smoke test, not a claim of listener-judged relevance.
import { discover } from "../src/discovery.js";
import { searchAppleMusic } from "../src/providers/apple.js";
import { normalize } from "../src/search.js";
import { catalogSummaries } from "../src/music-intelligence.js";

const cases = [
  ["rap", "Green Room", "Ken Carson"],
  ["disco/electronic", "Get Lucky", "Daft Punk"],
  ["country", "Jolene", "Dolly Parton"],
  ["jazz", "So What", "Miles Davis"],
  ["shoegaze", "Only Shallow", "my bloody valentine"],
  ["metal", "Master of Puppets", "Metallica"],
  ["reggae", "Three Little Birds", "Bob Marley & The Wailers"],
  ["genre-switching pop/folk", "cardigan", "Taylor Swift"]
];
for (const [category, title, artist] of cases) {
  if (process.argv[2] && !category.includes(process.argv[2])) continue;
  const started = Date.now();
  try {
    const found = await searchAppleMusic(`${title} ${artist}`, 10);
    const seed = found.results.find((item) => normalize(item.title) === normalize(title) && normalize(item.artist) === normalize(artist)) || catalogSummaries().find((item) => normalize(item.title) === normalize(title) && normalize(item.artist) === normalize(artist));
    if (!seed) { console.log(JSON.stringify({ category, title, artist, status: "seed-not-found" })); continue; }
    const result = await discover({ seedSlug: seed.slug });
    console.log(JSON.stringify({ category, title, artist, status: result.providerStatus, researchStatus: result.seed.genreResearch?.status, selected: result.seed.genreResearch?.selected, research: result.seed.genreResearch?.entries, candidates: result.candidateCount, items: result.items.map((item) => ({ title: item.title, artist: item.artist, shared: item.evidence.genres, context: item.evidence.candidateGenreContext.level })), elapsedMs: Date.now() - started }));
  } catch (error) { console.log(JSON.stringify({ category, title, artist, status: "error", error: error.message, elapsedMs: Date.now() - started })); }
}
