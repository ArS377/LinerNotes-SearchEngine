import React from "react";
import type { AgentResponse } from "../src/contracts/api.js";
import { ResearchSources } from "./ResearchSources.js";

// Render a small Markdown subset as React nodes. Model HTML is always escaped.
export function ResearchAnswer({ response }: { response: AgentResponse }) {
  function inline(value: string) {
    return value.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, index) => {
      if (part.startsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
      const match = /^\[(\d+)\]$/.exec(part);
      const citation = match && response.citations.find((source) => source.id === Number(match[1]));
      if (citation?.url && /^https?:\/\//i.test(citation.url)) return <a key={index} href={citation.url} target="_blank" rel="noopener noreferrer" aria-label={`Source ${match![1]}: ${citation.title}`}>{part}</a>;
      return part;
    });
  }
  if (response.comparison) {
    const { introductions, rows, uncertainty } = response.comparison;
    return <div className="research-answer">
      {introductions.map((item, index) => <p className="research-answer-summary" key={index}><strong>{item.title}</strong> by {item.artist}: {inline(item.text)}</p>)}
      <details className="research-learn-more"><summary>Learn more</summary><div>
        <div className="research-table-wrap" role="region" aria-label="Research details" tabIndex={0}><table>
          <thead><tr><th scope="col">Aspect</th>{introductions.map((item, index) => <th scope="col" key={index}>{item.title}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index}><th scope="row">{inline(row.aspect)}</th>{row.cells.map((cell, i) => <td key={i}>{inline(cell)}</td>)}</tr>)}</tbody>
        </table></div>
        {uncertainty && <p>{inline(uncertainty)}</p>}
      </div></details>
      <ResearchSources response={response} />
    </div>;
  }
  const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  const lines = response.answer.trim().split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  const summaries: string[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) { index++; continue; }
    if (line.includes("|") && lines[index + 1]?.includes("|") && cells(lines[index + 1]).every((cell) => /^:?-{3,}:?$/.test(cell))) {
      const headers = cells(line), rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(cells(lines[index++]));
      blocks.push(<div className="research-table-wrap" key={index} role="region" aria-label="Research details" tabIndex={0}><table><thead><tr>{headers.map((header, i) => <th scope="col" key={i}>{inline(header)}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{headers.map((_, j) => <td key={j}>{inline(row[j] || "—")}</td>)}</tr>)}</tbody></table></div>);
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(<h3 key={index}>{inline(line.replace(/^#{1,6}\s+/, ""))}</h3>); index++;
    } else if (/^(?:[-*]|\d+\.)\s/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^(?:[-*]|\d+\.)\s/.test(lines[index].trim())) items.push(lines[index++].trim().replace(/^(?:[-*]|\d+\.)\s+/, ""));
      blocks.push(<ul key={index}>{items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>);
    } else {
      const paragraph = [line]; index++;
      while (index < lines.length && lines[index].trim() && !/^(?:#{1,6}\s|[-*]\s|\d+\.\s)/.test(lines[index].trim()) && !lines[index].includes("|")) paragraph.push(lines[index++].trim());
      const value = paragraph.join(" ");
      if (!blocks.length && !summaries.length) summaries.push(value);
      else blocks.push(<p key={index}>{inline(value)}</p>);
    }
  }
  return <div className="research-answer">
    {summaries.map((summary, index) => <p className="research-answer-summary" key={index}>{inline(summary)}</p>)}
    {blocks.length > 0 && <details className="research-learn-more"><summary>Learn more</summary><div>{blocks}</div></details>}
    <ResearchSources response={response} />
  </div>;
}
