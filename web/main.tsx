import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { api, askAgent, searchMusic } from "./api.js";
import type { RecordingSummary } from "../src/contracts/api.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false }
  }
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
    try {
      return JSON.parse(localStorage.getItem(savedKey) || "[]");
    } catch {
      return [];
    }
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

function SearchBox({ initial = "" }: { initial?: string }) {
  const [query, setQuery] = useState(initial);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }
  return (
    <form className="hero-search" role="search" data-search-form onSubmit={submit}>
      <label className="sr-only" htmlFor="hero-query">Search music</label>
      <input id="hero-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try any song, artist, or lyric" />
      <button type="submit"><span>Search</span><span aria-hidden="true">↗</span></button>
    </form>
  );
}

function ResultCard({ recording, saved, onSave }: { recording: RecordingSummary; saved: boolean; onSave: () => void }) {
  return (
    <article className="result-card">
      <button className="result-card-link" onClick={() => navigate(`/songs/${encodeURIComponent(recording.slug)}`)}>
        <span className={`result-art${recording.thumbnailUrl || recording.artworkUrl ? " has-artwork" : ""}`} style={recording.thumbnailUrl || recording.artworkUrl ? { backgroundImage: `url(${recording.thumbnailUrl || recording.artworkUrl})` } : undefined} aria-hidden="true" />
        <span>
          <span className="source-badge">{recording.source || recording.providers?.join(" · ") || "Liner Notes"}</span>
          <strong className="result-title">{recording.title}</strong>
          <span className="result-meta">{recording.artist}</span>
        </span>
      </button>
      <button type="button" className="save-button" aria-label={`${saved ? "Remove" : "Save"} ${recording.title}`} onClick={onSave}>{saved ? "Saved" : "Save"}</button>
    </article>
  );
}

function AgentPanel({ context }: { context: Record<string, unknown> }) {
  const [prompt, setPrompt] = useState("");
  const mutation = useMutation({ mutationFn: () => askAgent(prompt, context) });
  return (
    <section className="assistant-panel">
      <div><p className="eyebrow">Grounded discovery</p><h2>Ask about the music</h2></div>
      <form className="assistant-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
        <label className="sr-only" htmlFor="agent-prompt">Ask the music agent</label>
        <textarea id="agent-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={2000} required placeholder="Compare versions, explain context, or suggest where to listen next" />
        <button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Researching…" : "Ask"}</button>
      </form>
      <div className="assistant-response" aria-live="polite">
        {mutation.error && <p>{mutation.error.message}</p>}
        {mutation.data && <><p>{mutation.data.answer}</p>{mutation.data.citations.length > 0 && <ul>{mutation.data.citations.map((citation, index) => <li key={`${citation.title}-${index}`}>{citation.url ? <a href={citation.url} rel="noreferrer" target="_blank">{citation.title}</a> : citation.title}</li>)}</ul>}<small>Confidence: {mutation.data.confidence}</small></>}
      </div>
    </section>
  );
}

function SearchResults({ query, saved, toggle }: { query: string; saved: RecordingSummary[]; toggle: (recording: RecordingSummary) => void }) {
  const search = useQuery({ queryKey: ["search", query], queryFn: () => searchMusic(query), enabled: Boolean(query) });
  return <section className="results-view">
    <div className="compact-search-wrap"><SearchBox initial={query} /></div>
    <div className="results-heading"><p className="eyebrow">Search results</p><h1>“{query}”</h1><p aria-live="polite">{search.isPending ? "Searching across providers…" : search.error ? search.error.message : `${search.data?.results.length || 0} ranked matches`}</p></div>
    {search.data && <AgentPanel context={{ type: "search", query, results: search.data.results.slice(0, 8) }} />}
    <div className="results-list" data-results-list aria-live="polite">{search.data?.results.map((recording) => <ResultCard key={recording.slug} recording={recording} saved={saved.some((item) => item.slug === recording.slug)} onSave={() => toggle(recording)} />)}</div>
  </section>;
}

function Song({ slug, saved, toggle }: { slug: string; saved: RecordingSummary[]; toggle: (recording: RecordingSummary) => void }) {
  const endpoint = slug.startsWith("mbid-") ? `/api/external-songs/${encodeURIComponent(slug.slice(5))}` : slug.startsWith("apple-") ? `/api/apple-songs/${encodeURIComponent(slug.slice(6))}` : `/api/songs/${encodeURIComponent(slug)}`;
  const song = useQuery({ queryKey: ["song", slug], queryFn: () => api<Record<string, unknown>>(endpoint) });
  if (song.isPending) return <div className="loading-state">Opening the liner notes…</div>;
  if (song.error || !song.data) return <div className="empty-state"><h1>Recording unavailable</h1><p>{song.error?.message}</p></div>;
  const data = song.data as Record<string, unknown> & {
    title: string;
    artist: string | { name: string };
    artworkUrl?: string;
    story?: string;
  };
  const artist = typeof data.artist === "string" ? data.artist : data.artist.name;
  const summary: RecordingSummary = { slug, title: data.title, artist, artworkUrl: data.artworkUrl };
  return <article className="song-view"><button className="text-link" onClick={() => history.back()}>← Back</button><div className="song-hero"><div><p className="eyebrow">Liner notes</p><h1>{data.title}</h1><p>{artist}</p><button onClick={() => toggle(summary)}>{saved.some((item) => item.slug === slug) ? "Remove from saved" : "Save recording"}</button></div>{data.artworkUrl && <img src={data.artworkUrl} alt="" />}</div>{data.story && <section className="story-section"><h2>The story</h2><p>{data.story}</p></section>}<AgentPanel context={{ type: "song", song: data }} /></article>;
}

function Home() {
  const discovery = useQuery({ queryKey: ["discover"], queryFn: () => api<{ featured: RecordingSummary[]; genres: Array<{ name: string; slug: string }> }>("/api/discover") });
  return <section className="hero"><div className="hero-copy"><p className="eyebrow">A search engine for music</p><h1>Find the song.<br /><em>Know the story.</em></h1><p className="hero-intro">Search a global music catalog by title, artist, or remembered lyrics.</p></div><SearchBox /><div className="catalog-strip"><p>Explore across genres</p><div className="genre-list">{discovery.data?.genres.slice(0, 6).map((genre) => <span key={genre.slug}>{genre.name}</span>)}</div></div></section>;
}

function App() {
  const path = usePath();
  const { saved, toggle } = useSaved();
  const url = useMemo(() => new URL(path, location.origin), [path]);
  let content: React.ReactNode = <Home />;
  if (url.pathname === "/search") content = <SearchResults query={url.searchParams.get("q") || ""} saved={saved} toggle={toggle} />;
  else if (url.pathname.startsWith("/songs/")) content = <Song slug={decodeURIComponent(url.pathname.slice(7))} saved={saved} toggle={toggle} />;
  else if (url.pathname === "/saved") content = <section className="collection-view"><p className="eyebrow">Your library</p><h1>Saved recordings</h1><div className="results-list">{saved.map((recording) => <ResultCard key={recording.slug} recording={recording} saved onSave={() => toggle(recording)} />)}</div></section>;
  return <><header className="site-header"><button className="wordmark" onClick={() => navigate("/")}><span>LINER NOTES</span></button><nav aria-label="Primary navigation"><button onClick={() => navigate("/")}>Search</button><button onClick={() => navigate("/saved")}>Saved <span className="saved-count">{saved.length}</span></button></nav></header><main id="app" tabIndex={-1}>{content}</main><div className="toast" role="status" aria-live="polite" /><footer><p>Built for curious listeners.</p><p>Music data is attributed on every song page.</p></footer></>;
}

createRoot(document.getElementById("root")!).render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
