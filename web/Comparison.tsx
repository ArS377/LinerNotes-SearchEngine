import React from "react";
import { useMutation } from "@tanstack/react-query";
import { askAgent } from "./api.js";
import { ResearchSources } from "./ResearchSources.js";
import type { RecordingSummary } from "../src/contracts/api.js";

export function comparisonContext(items: RecordingSummary[]) {
  return { type: "comparison", recordings: items.slice(0, 3).map((item) => ({
    title: item.title.slice(0, 300), artist: item.artist.slice(0, 300),
    album: typeof item.album === "string" ? item.album.slice(0, 300) : null,
    version: typeof item.version === "string" ? item.version.slice(0, 300) : null,
    releaseDate: typeof item.releaseDate === "string" ? item.releaseDate.slice(0, 40) : null,
    genres: Array.isArray(item.genres) ? item.genres.filter((value): value is string => typeof value === "string").slice(0, 12).map((value) => value.slice(0, 100)) : [],
    source: item.source || "Liner Notes"
  })) };
}

const prompt = "Compare all supplied recordings using music details and web research. Write three short paragraphs beginning 'In common:', 'Differences:', and 'What we can’t tell:'. Name the tracks when explaining differences. Discuss sourced musical style, themes, songwriting and production where supported. Cite web claims using the provided numeric source IDs in brackets. Do not assume these are versions of the same song. Do not claim to have listened to the audio or infer quality or a winner. State important missing information. Use plain text.";

export function Comparison({ items, enabled }: { items: RecordingSummary[]; enabled: boolean }) {
  // Remount when the selection changes so an old response cannot describe a new pair.
  const context = comparisonContext(items);
  return <ComparisonRequest key={JSON.stringify(context)} context={context} enabled={enabled} />;
}

function ComparisonRequest({ context, enabled }: { context: ReturnType<typeof comparisonContext>; enabled: boolean }) {
  const comparison = useMutation({ mutationFn: () => askAgent(prompt, context), retry: false });
  const enough = context.recordings.length >= 2;
  return <section className="comparison-analysis" aria-labelledby="comparison-heading">
    <div className="comparison-analysis-heading"><div><h2 id="comparison-heading">How do they compare?</h2><p>Explore their music, themes, and background with sources from the web.</p></div>
      <button className="primary-button" disabled={!enabled || !enough || comparison.isPending} onClick={() => comparison.mutate()}>{comparison.isPending ? "Comparing recordings…" : comparison.isError ? "Retry comparison" : comparison.isSuccess ? "Compare again" : "Compare these recordings"}</button>
    </div>
    {!enabled && <p role="status">AI comparison needs a DeepInfra API key on the server. Add it to .env and restart the backend.</p>}
    {!enough && <p>Select at least two recordings to generate a comparison.</p>}
    <div aria-live="polite" aria-busy={comparison.isPending}>
      {comparison.isPending && <p>Comparing the selected recordings…</p>}
      {comparison.error && <p role="alert">Comparison couldn’t load. {comparison.error.message}</p>}
      {!comparison.isPending && !comparison.error && comparison.data && <div className="comparison-answer"><p>{comparison.data.answer}</p><ResearchSources response={comparison.data} /></div>}
    </div>
  </section>;
}
