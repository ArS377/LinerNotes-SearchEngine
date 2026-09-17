import React from "react";
import type { AgentResponse } from "../src/contracts/api.js";

export function ResearchSources({ response }: { response: AgentResponse }) {
  const status = response.researchStatus;
  const message = status === "not-configured" ? "Web research isn’t enabled yet."
    : status === "unavailable" ? "Web search couldn’t finish. Try again shortly."
    : status === "partial" ? "Some searches couldn’t finish; this answer may be incomplete."
    : status === "empty" ? "No usable web sources were found for this question."
    : status === "ok" && !response.citations.length ? "Web search completed, but this answer has no linked supporting citations." : null;
  const sources = response.citations.filter((source) => source.url && /^https?:\/\//i.test(source.url));
  return <>{message && <p role="status">{message}</p>}{sources.length > 0 && <div aria-label="Answer sources"><p>Sources</p><ul>{sources.map((source, index) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">[{source.id || index + 1}] {source.title}</a></li>)}</ul></div>}</>;
}
