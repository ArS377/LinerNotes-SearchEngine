import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { ResearchSources } from "./ResearchSources.js";
import type { AgentResponse } from "../src/contracts/api.js";

const base: AgentResponse = { answer: "Answer [2]", confidence: "partial", model: "test", citations: [], suggestions: [], toolActivity: [], researchStatus: "ok" };
describe("research sources shared by questions and comparisons", () => {
  it("shows the original citation number and safe link without rendering source HTML", () => {
    const html = renderToStaticMarkup(<ResearchSources response={{ ...base, citations: [{ id: 2, title: "<script>bad</script>", url: "https://example.com/interview" }] }} />);
    expect(html).toContain("[2]"); expect(html).toContain('href="https://example.com/interview"');
    expect(html).not.toContain("<script>"); expect(html).toContain("noopener noreferrer");
  });
  it("reports missing configuration and failed searches", () => {
    expect(renderToStaticMarkup(<ResearchSources response={{ ...base, researchStatus: "not-configured" }} />)).toContain("isn’t enabled yet");
    expect(renderToStaticMarkup(<ResearchSources response={{ ...base, researchStatus: "unavailable" }} />)).toContain("couldn’t finish");
  });
});
