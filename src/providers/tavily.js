import { createHash } from "node:crypto";

let fetchImplementation = globalThis.fetch;
const cache = new Map(), pending = new Map();
export const tavilyConfigured = () => Boolean(process.env.TAVILY_API_KEY?.trim());
const text = (value, size) => typeof value === "string" ? value.slice(0, size) : "";

export function researchQueries(prompt, context = {}) {
  const recordings = context.type === "comparison" ? context.recordings : context.song ? [context.song] : [];
  if (Array.isArray(recordings) && recordings.length) {
    return [...new Set(recordings.slice(0, 3).map((item) => {
      const artist = typeof item?.artist === "string" ? item.artist : item?.artist?.name;
      const question = context.type === "comparison" ? "song musical style themes production songwriting background" : text(prompt, 220);
      return `${text(item?.title, 160)} ${text(artist, 120)} ${question}`.trim();
    }))];
  }
  return [`${text(context.query, 200)} ${text(prompt, 260)} music`.trim()];
}

async function search(query) {
  // Cache only bounded public search excerpts; never keys or entire user contexts.
  const key = createHash("sha256").update(process.env.TAVILY_API_KEY.trim()).update(query).digest("hex");
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.sources;
  if (pending.has(key)) return pending.get(key);
  const operation = (async () => {
    const response = await fetchImplementation("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.TAVILY_API_KEY.trim()}` },
      body: JSON.stringify({ query, search_depth: "basic", auto_parameters: false, max_results: 3, include_answer: false, include_raw_content: false }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error("Web search unavailable");
    const body = await response.json();
    if (!Array.isArray(body.results)) throw new Error("Invalid search response");
    const sources = body.results.slice(0, 3).flatMap((item) => {
      try {
        const url = new URL(item.url);
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || !text(item.content, 1200).trim()) return [];
        return [{ title: text(item.title, 240) || url.hostname, url: url.href, content: text(item.content, 1200) }];
      } catch { return []; }
    });
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(key, { sources, expires: Date.now() + 3600000 });
    return sources;
  })().finally(() => pending.delete(key));
  pending.set(key, operation);
  return operation;
}

export async function researchMusic(prompt, context) {
  if (!tavilyConfigured()) return { status: "not-configured", sources: [] };
  const results = await Promise.allSettled(researchQueries(prompt, context).map(search));
  const sources = [...new Map(results.flatMap((result) => result.status === "fulfilled" ? result.value : []).map((source) => [source.url, source])).values()]
    .map((source, index) => ({ ...source, id: index + 1 }));
  const failed = results.some((result) => result.status === "rejected");
  return { status: failed ? sources.length ? "partial" : "unavailable" : sources.length ? "ok" : "empty", sources };
}

export function setTavilyFetchForTests(fetchFn) {
  fetchImplementation = fetchFn;
  cache.clear(); pending.clear();
}
