import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api.js";
import type { RecordingSummary } from "../src/contracts/api.js";
import { slugSchema } from "../src/contracts/discovery.js";
import { readSavedTrails, readTrail, trailPath, trailStorageKey, type Trail } from "./discovery-trails.js";

type Focus = "balanced" | "genre" | "era";
type Recommendation = RecordingSummary & { reasons: string[]; evidence: { source: string; url: string | null }; score: number; components: { genre: number; era: number } };
type DiscoveryResponse = { seed: RecordingSummary; items: Recommendation[]; providerStatus: string; method: string; candidateCount: number; limitations: string[] };
type Props = { url: URL; bookmarks: RecordingSummary[]; navigate: (path: string) => void; renderRecording: (recording: RecordingSummary) => React.ReactNode };

export function Discovery({ url, bookmarks, navigate, renderRecording }: Props) {
  const seedSlug = url.searchParams.get("seed") || "";
  const focusParam = url.searchParams.get("focus");
  const initialFocus: Focus = focusParam === "genre" || focusParam === "era" ? focusParam : "balanced";
  const [focus, setFocus] = useState<Focus>(initialFocus);
  const [different, setDifferent] = useState(url.searchParams.get("different") !== "0");
  const [unfamiliar, setUnfamiliar] = useState(false);
  const [applied, setApplied] = useState({ focus: initialFocus, differentArtists: url.searchParams.get("different") !== "0", unfamiliarArtists: false });
  const dismissKey = `liner-notes-dismissed:${readTrail(url.searchParams.get("trail") || "")?.steps[0].slug || seedSlug}`;
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try { const items = JSON.parse(sessionStorage.getItem(dismissKey) || "[]"); return Array.isArray(items) ? items.filter((item) => slugSchema.safeParse(item).success).slice(0, 30) : []; } catch { return []; }
  });
  useEffect(() => { try { sessionStorage.setItem(dismissKey, JSON.stringify(dismissed)); } catch { /* Dismissal still works in memory if browser storage is unavailable. */ } }, [dismissKey, dismissed]);
  const [message, setMessage] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const trailValue = url.searchParams.get("trail");
  const incoming = trailValue ? readTrail(trailValue) : null;
  const invalidTrail = Boolean(trailValue && (!incoming || incoming.steps.at(-1)?.slug !== seedSlug));
  const validSeed = slugSchema.safeParse(seedSlug).success;
  const query = useQuery({
    queryKey: ["track-discovery", seedSlug, applied, dismissed, bookmarks.map((item) => [item.slug, item.artist])],
    queryFn: () => api<DiscoveryResponse>("/api/v1/discover", { method: "POST", body: JSON.stringify({ seedSlug, ...applied, limit: 5, knownArtists: [...new Set(bookmarks.map((item) => item.artist))].slice(0, 200), excludeSlugs: [...new Set([...bookmarks.map((item) => item.slug), ...dismissed, ...(incoming?.steps.map((item) => item.slug) || [])])].slice(0, 250) }) }),
    enabled: validSeed && !invalidTrail, retry: false, staleTime: 300_000
  });
  const data = query.data;
  const seed = data?.seed;
  const steps = incoming?.steps || (seed ? [{ slug: seed.slug, title: seed.title, artist: seed.artist }] : []);
  const trail: Trail = { version: 1, steps, focus: applied.focus, differentArtists: applied.differentArtists };

  function save() {
    if (!seed) return;
    try {
      const saved = readSavedTrails(localStorage);
      const signature = JSON.stringify(trail);
      const entry = { id: crypto.randomUUID(), title: `${steps[0].title}${steps.length > 1 ? ` → ${steps.at(-1)!.title}` : " discovery"}`, savedAt: new Date().toISOString(), trail };
      localStorage.setItem(trailStorageKey, JSON.stringify([entry, ...saved.filter((item) => JSON.stringify(item.trail) !== signature)].slice(0, 30)));
      setMessage("Trail saved in this browser.");
    } catch { setMessage("Couldn’t save to this browser. Copy the trail link instead."); }
  }

  async function share() {
    const link = `${location.origin}${trailPath(trail)}`;
    setShareUrl(link);
    try { await navigator.clipboard.writeText(link); setMessage("Trail link copied. Bookmarks and private filters are not included."); }
    catch { setMessage("Select and copy the trail link below."); }
  }

  if (invalidTrail || !validSeed) return <section className="shell page-view"><h1>{invalidTrail ? "This trail link is invalid" : "Start with a song"}</h1><p>Open a recording and choose Find similar to start discovering.</p><button onClick={() => navigate("/")}>Search for a song</button></section>;

  return <section className="shell page-view discovery-view">
    <div className="discovery-topline"><button className="text-link" onClick={() => navigate(`/songs/${seedSlug}`)}>← Recording details</button><button className="text-link" onClick={() => navigate("/trails")}>Saved trails →</button></div>
    <h1>{seed ? `More like ${seed.title}` : "Finding your next record…"}</h1>
    <p className="page-intro">{seed ? `Start from ${seed.artist}. Choose the connection you want to follow.` : "Loading the recording and looking for connections."}</p>
    <form className="discovery-controls" onSubmit={(event) => { event.preventDefault(); setApplied({ focus, differentArtists: different, unfamiliarArtists: unfamiliar }); setMessage(""); setShareUrl(""); }}>
      <fieldset><legend>Find songs…</legend><div className="discovery-focus">{([{ value: "balanced", title: "Similar genre and year", description: "Match genres, favoring songs released closer together." }, { value: "genre", title: "Similar genre, any year", description: "Match genres without considering release year." }, { value: "era", title: "From around the same time", description: "Prioritize nearby release years, then genre." }] as const).map((option) => <label key={option.value}><input type="radio" name="focus" value={option.value} checked={focus === option.value} onChange={() => setFocus(option.value)} /><span><strong>{option.title}</strong><span>{option.description}</span></span></label>)}</div></fieldset>
      <div className="discovery-options"><label><input type="checkbox" checked={different} onChange={(event) => setDifferent(event.target.checked)} />{seed ? `Exclude songs by ${seed.artist}` : "Exclude songs by the starting artist"}</label><label><input type="checkbox" checked={unfamiliar} onChange={(event) => setUnfamiliar(event.target.checked)} />Exclude artists I’ve bookmarked</label><button className="primary-button" type="submit" disabled={query.isFetching}>{query.isFetching ? "Finding recordings…" : "Find recommendations"}</button></div>
      <p className="discovery-note">These suggestions use genres and release years—not how the music sounds.</p>
    </form>
    {query.isPending && <p role="status">Searching the catalogs and checking previews…</p>}
    {query.error && <div className="state-message" role="alert"><strong>Recommendations couldn’t load</strong><p>{query.error.message}</p><button onClick={() => query.refetch()}>Try again</button></div>}
    {data && <><div className="section-heading"><h2>{data.items.length} recordings to try</h2><span className="discovery-count">{data.candidateCount} candidates checked</span></div>{data.providerStatus !== "ok" && <p role="status">{data.providerStatus === "unavailable" ? "MusicBrainz is unavailable. These results use the local catalog." : "This recording has limited genre metadata. Try release era or another starting track."}</p>}{!data.items.length && <div className="state-message"><strong>No matches for these choices</strong><p>Try another focus, allow the same artist, or start with a different recording.</p></div>}
      <div className="discovery-results">{data.items.map((item) => <article className="discovery-result" key={item.slug}>{renderRecording(item)}<div className="recommendation-reasons"><ul>{item.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><span>{item.evidence.url ? <a href={item.evidence.url} target="_blank" rel="noreferrer">{item.evidence.source} ↗</a> : item.evidence.source}</span><details><summary>How this was ranked</summary><p>Genre overlap: {item.components.genre.toFixed(2)}. Era proximity: {item.components.era.toFixed(2)}. Weighted relevance: {item.score.toFixed(2)}. The final order also reduces repeated artists and albums. These scores are ranking signals, not probabilities that you’ll like a song.</p></details></div><div className="discovery-result-actions"><button disabled={steps.length >= 10} onClick={() => navigate(trailPath({ ...trail, steps: [...steps, { slug: item.slug, title: item.title, artist: item.artist, reason: item.reasons.join(" ") }] }))}>Follow this recording →</button><button disabled={dismissed.length >= 30 || query.isFetching} onClick={() => setDismissed((items) => [...items, item.slug])}>Not this track</button></div></article>)}</div>
      {steps.length >= 10 && <p>You’ve reached ten steps. Save this trail, then open a recording to start another.</p>}
      {dismissed.length > 0 && <button className="text-link" onClick={() => setDismissed([])}>Reset dismissed tracks ({dismissed.length})</button>}
      <section className="discovery-trail"><div className="section-heading"><h2>Your discovery trail</h2><div className="trail-actions"><button onClick={save}>Save trail</button><button onClick={share}>Copy trail link</button></div></div><ol>{steps.map((step, index) => <li key={`${step.slug}-${index}`}><button className="text-link" onClick={() => navigate(trailPath({ ...trail, steps: steps.slice(0, index + 1) }))}>{step.title} — {step.artist}</button>{step.reason && <p>{step.reason}</p>}</li>)}</ol><p className="discovery-note">The link contains this trail and its focus. Recommendations may change as catalogs update. Localhost links only work on this computer until the app is deployed.</p><p role="status">{message}</p>{shareUrl && <label className="trail-share">Trail link<input readOnly value={shareUrl} onFocus={(event) => event.target.select()} /></label>}</section>
    </>}
  </section>;
}

export function TrailLibrary({ navigate }: { navigate: (path: string) => void }) {
  const [saved] = useState(() => readSavedTrails(localStorage));
  return <section className="shell page-view"><h1>Your discovery trails</h1><p className="page-intro">The paths you saved while finding new music. Stored in this browser.</p>{saved.length ? <div className="trail-library">{saved.map((item) => <article key={item.id}><h2>{item.title}</h2><p>{item.trail.steps.length} recording{item.trail.steps.length === 1 ? "" : "s"} · {new Date(item.savedAt).toLocaleDateString()}</p><button onClick={() => navigate(trailPath(item.trail))}>Continue this trail →</button></article>)}</div> : <div className="state-message"><strong>Your first trail starts with a song</strong><p>Choose Find similar on any recording, then follow a recommendation.</p><button onClick={() => navigate("/")}>Find a starting track</button></div>}</section>;
}
