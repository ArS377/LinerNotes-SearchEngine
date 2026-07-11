import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { api, askAgent, searchMusic } from "./api.js";
import type { RecordingSummary } from "../src/contracts/api.js";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } }
});
const savedKey = "liner-notes-saved-v2";

function navigate(path: string) {
  history.pushState({}, "", path);
  window.dispatchEvent(new CustomEvent("liner-route"));
}

function usePath() {
  const [path, setPath] = useState(`${location.pathname}${location.search}`);
  useEffect(() => {
    const update = () => setPath(`${location.pathname}${location.search}`);
    window.addEventListener("popstate", update);
    window.addEventListener("liner-route", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("liner-route", update);
    };
  }, []);
  return path;
}

function useSaved() {
  const [saved, setSaved] = useState<RecordingSummary[]>(() => {
    try { return JSON.parse(localStorage.getItem(savedKey) || "[]"); } catch { return []; }
  });
  const toggle = (recording: RecordingSummary) => {
    setSaved((current) => {
      const next = current.some((item) => item.slug === recording.slug)
        ? current.filter((item) => item.slug !== recording.slug)
        : [recording, ...current];
      localStorage.setItem(savedKey, JSON.stringify(next));
      return next;
    });
  };
  return { saved, toggle };
}

function SearchBox({ initial = "", compact = false }: { initial?: string; compact?: boolean }) {
  const [query, setQuery] = useState(initial);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }
  return (
    <form className={`search-form${compact ? " search-form--compact" : ""}`} role="search" onSubmit={submit}>
      <label htmlFor="music-query">Search music</label>
      <div className="search-form__field">
        <input id="music-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Song, artist, or remembered lyric" />
        <button type="submit"><span>Search</span><span aria-hidden="true">↗</span></button>
      </div>
    </form>
  );
}

function ResultCard({ recording, saved, onSave }: { recording: RecordingSummary; saved: boolean; onSave: () => void }) {
  const artwork = recording.thumbnailUrl || recording.artworkUrl;
  return <article className="result-card">
    <button className="result-card__main" onClick={() => navigate(`/songs/${encodeURIComponent(recording.slug)}`)}>
      <span className={`result-art${artwork ? " has-artwork" : ""}`} style={artwork ? { backgroundImage: `url(${artwork})` } : undefined} aria-hidden="true" />
      <span className="result-card__copy">
        <span className="source-badge">{recording.source || recording.providers?.join(" · ") || "Liner Notes"}</span>
        <strong>{recording.title}</strong>
        <span>{recording.artist}</span>
      </span>
    </button>
    <button type="button" className="save-button" aria-label={`${saved ? "Remove" : "Save"} ${recording.title}`} onClick={onSave}>{saved ? "Saved" : "Save"}</button>
  </article>;
}

function AgentPanel({ context }: { context: Record<string, unknown> }) {
  const [prompt, setPrompt] = useState("");
  const mutation = useMutation({ mutationFn: () => askAgent(prompt, context) });
  return <details className="assistant-panel">
    <summary><span><span className="eyebrow">Grounded discovery</span><strong>Ask about these results</strong></span><span aria-hidden="true">+</span></summary>
    <div className="assistant-panel__body">
      <form className="assistant-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
        <label htmlFor="agent-prompt">Ask the music agent</label>
        <textarea id="agent-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={2000} required placeholder="Compare versions, explain context, or suggest where to listen next" />
        <button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Researching…" : "Ask"}</button>
      </form>
      <div className="assistant-response" aria-live="polite">
        {mutation.error && <p>{mutation.error.message}</p>}
        {mutation.data && <><p>{mutation.data.answer}</p>{mutation.data.citations.length > 0 && <ul>{mutation.data.citations.map((citation, index) => <li key={`${citation.title}-${index}`}>{citation.url ? <a href={citation.url} rel="noreferrer" target="_blank">{citation.title}</a> : citation.title}</li>)}</ul>}<small>Confidence: {mutation.data.confidence}</small></>}
      </div>
    </div>
  </details>;
}

function SearchResults({ query, saved, toggle }: { query: string; saved: RecordingSummary[]; toggle: (recording: RecordingSummary) => void }) {
  const search = useQuery({ queryKey: ["search", query], queryFn: () => searchMusic(query), enabled: Boolean(query) });
  const count = search.data?.results.length || 0;
  return <section className="results-view">
    <div className="shell compact-search-wrap"><SearchBox initial={query} compact /></div>
    <div className="shell results-heading"><p className="eyebrow">Search results</p><h1>{query ? `“${query}”` : "Start a search"}</h1><p aria-live="polite">{search.isPending ? "Searching across providers…" : search.error ? "Search is unavailable right now." : `${count} ranked ${count === 1 ? "match" : "matches"}`}</p></div>
    <div className="shell results-list" aria-live="polite">
      {search.isPending && <div className="state-message"><strong>Looking through the catalog</strong><p>Matching titles, artists, and remembered lyrics.</p></div>}
      {search.error && <div className="state-message"><strong>Search needs a moment</strong><p>Try again, or use a shorter title or artist name.</p></div>}
      {search.data && count === 0 && <div className="state-message"><strong>No exact match yet</strong><p>Try a lyric fragment, an artist name, or fewer words.</p></div>}
      {search.data?.results.map((recording) => <ResultCard key={recording.slug} recording={recording} saved={saved.some((item) => item.slug === recording.slug)} onSave={() => toggle(recording)} />)}
    </div>
    {search.data && count > 0 && <div className="shell"><AgentPanel context={{ type: "search", query, results: search.data.results.slice(0, 8) }} /></div>}
  </section>;
}

function Song({ slug, saved, toggle }: { slug: string; saved: RecordingSummary[]; toggle: (recording: RecordingSummary) => void }) {
  const endpoint = slug.startsWith("mbid-") ? `/api/external-songs/${encodeURIComponent(slug.slice(5))}` : slug.startsWith("apple-") ? `/api/apple-songs/${encodeURIComponent(slug.slice(6))}` : `/api/songs/${encodeURIComponent(slug)}`;
  const song = useQuery({ queryKey: ["song", slug], queryFn: () => api<Record<string, unknown>>(endpoint) });
  if (song.isPending) return <div className="shell state-page">Opening the liner notes…</div>;
  if (song.error || !song.data) return <div className="shell state-page"><h1>Recording unavailable</h1><p>{song.error?.message}</p></div>;
  const data = song.data as Record<string, unknown> & { title: string; artist: string | { name: string }; artworkUrl?: string; story?: string };
  const artist = typeof data.artist === "string" ? data.artist : data.artist.name;
  const summary: RecordingSummary = { slug, title: data.title, artist, artworkUrl: data.artworkUrl };
  return <article className="song-view"><div className="shell"><button className="text-link" onClick={() => history.back()}>← Back to results</button><div className="song-hero"><div><p className="eyebrow">Liner notes</p><h1>{data.title}</h1><p className="song-artist">{artist}</p><button className="save-button" onClick={() => toggle(summary)}>{saved.some((item) => item.slug === slug) ? "Remove from saved" : "Save recording"}</button></div>{data.artworkUrl && <img src={data.artworkUrl} alt="" />}</div>{data.story && <section className="story-section"><p className="eyebrow">The story</p><p>{data.story}</p></section>}<AgentPanel context={{ type: "song", song: data }} /></div></article>;
}

function Home() {
  const discovery = useQuery({ queryKey: ["discover"], queryFn: () => api<{ genres: Array<{ name: string; slug: string }> }>("/api/discover") });
  return <section className="hero"><div className="shell hero__grid"><div className="hero-copy"><p className="eyebrow">A search engine for music</p><h1>Find the song.<br /><em>Know the story.</em></h1><p>Search a global music catalog by title, artist, or remembered lyrics.</p></div><SearchBox /><div className="search-help"><p className="eyebrow">Search by what you remember</p><ul><li>“we were born before the wind”</li><li>“that 80s song with a dancing video”</li><li>“jazz singer, late-night train lyric”</li></ul></div><div className="catalog-strip"><p>Explore across genres</p><div>{discovery.data?.genres.slice(0, 6).map((genre) => <span key={genre.slug}>{genre.name}</span>)}</div></div></div></section>;
}

function Saved({ saved, toggle }: { saved: RecordingSummary[]; toggle: (recording: RecordingSummary) => void }) {
  return <section className="shell collection-view"><p className="eyebrow">Your library</p><h1>Saved recordings</h1>{saved.length === 0 ? <div className="state-message"><strong>Nothing saved yet</strong><p>Save a recording from search to keep it close.</p><button className="text-link" onClick={() => navigate("/")}>Search the catalog →</button></div> : <div className="results-list">{saved.map((recording) => <ResultCard key={recording.slug} recording={recording} saved onSave={() => toggle(recording)} />)}</div>}</section>;
}

function App() {
  const path = usePath();
  const { saved, toggle } = useSaved();
  const url = useMemo(() => new URL(path, location.origin), [path]);
  let content: React.ReactNode = <Home />;
  if (url.pathname === "/search") content = <SearchResults query={url.searchParams.get("q") || ""} saved={saved} toggle={toggle} />;
  else if (url.pathname.startsWith("/songs/")) content = <Song slug={decodeURIComponent(url.pathname.slice(7))} saved={saved} toggle={toggle} />;
  else if (url.pathname === "/saved") content = <Saved saved={saved} toggle={toggle} />;
  return <><header className="site-header"><div className="shell site-header__inner"><button className="wordmark" onClick={() => navigate("/")}>LINER NOTES</button><nav aria-label="Primary navigation"><button aria-current={url.pathname === "/" ? "page" : undefined} onClick={() => navigate("/")}>Search</button><button aria-current={url.pathname === "/saved" ? "page" : undefined} onClick={() => navigate("/saved")}>Saved <span className="saved-count">{saved.length}</span></button></nav></div></header><main id="app" tabIndex={-1}>{content}</main><footer><div className="shell"><p>Built for curious listeners.</p><p>Music data is attributed on every song page.</p></div></footer></>;
}

type WindowWithRoot = Window & { linerNotesRoot?: ReturnType<typeof createRoot> };
const appWindow = window as WindowWithRoot;
const root = appWindow.linerNotesRoot || createRoot(document.getElementById("root")!);
appWindow.linerNotesRoot = root;
root.render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
