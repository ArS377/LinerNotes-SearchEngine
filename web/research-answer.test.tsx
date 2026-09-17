import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { ResearchAnswer } from "./ResearchAnswer.js";

describe("research answer presentation", () => {
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
