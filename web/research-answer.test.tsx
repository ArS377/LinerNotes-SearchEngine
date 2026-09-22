import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { ResearchAnswer } from "./ResearchAnswer.js";

describe("research answer presentation", () => {
  it.each([2, 3])("keeps all %i recording introductions above the comparison disclosure", (count) => {
    const introductions = Array.from({ length: count }, (_, index) => ({ title: `Song ${index + 1}`, artist: "Artist", text: `Explores theme ${index + 1}.` }));
    const html = renderToStaticMarkup(<ResearchAnswer response={{ answer: "Duplicate legacy summary must not render.", comparison: { introductions, rows: [{ aspect: "Style", cells: introductions.map(() => "Rock") }], uncertainty: "Uncertainty note." }, citations: [], suggestions: [], confidence: "partial", model: "test", toolActivity: [] }} />);
    const [visible, details] = html.split("<details");
    for (let index = 1; index <= count; index++) expect(visible).toContain(`<strong>Song ${index}</strong>`);
    expect(details).toContain("<table>");
    expect(details).toContain("Uncertainty note.");
    expect(visible).not.toContain("Uncertainty note.");
    expect(html).not.toContain("Duplicate legacy summary");
    expect(visible.match(/research-answer-summary/g)).toHaveLength(count);
  });
  it("keeps additional single-song paragraphs inside Learn more", () => {
    const html = renderToStaticMarkup(<ResearchAnswer response={{ answer: "Short answer.\n\nExtra background.", citations: [], suggestions: [], confidence: "partial", model: "test", toolActivity: [] }} />);
    const [visible, details] = html.split("<details");
    expect(visible).toContain("Short answer.");
    expect(visible).not.toContain("Extra background.");
    expect(details).toContain("Extra background.");
  });
  it("keeps a summary visible and renders a cited table inside a closed disclosure", () => {
    const html = renderToStaticMarkup(<ResearchAnswer response={{ answer: "Short summary [1].\n\n| Aspect | Meaning |\n| --- | --- |\n| Theme | **Interpretation** [1] |", citations: [{ id: 1, title: "Interview", url: "https://example.com" }], suggestions: [], confidence: "partial", model: "test", toolActivity: [] }} />);
    expect(html).toContain("research-answer-summary");
    expect(html).toContain("<summary>Learn more</summary>");
    expect(html).not.toContain(" open=");
    expect(html).toContain('<th scope="col">Aspect</th>');
    expect(html).toContain("<strong>Interpretation</strong>");
    expect(html).toContain('aria-label="Source 1: Interview"');
  });
  it("escapes model markup and does not turn arbitrary model URLs into links", () => {
    const html = renderToStaticMarkup(<ResearchAnswer response={{ answer: '<script>alert(1)</script>\n\n- [Bad](javascript:alert(1))', citations: [], suggestions: [], confidence: "partial", model: "test", toolActivity: [] }} />);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("href=");
    expect(html).toContain("<ul>");
  });
});
