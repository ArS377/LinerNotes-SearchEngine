import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { Comparison, comparisonContext, comparisonLoadingLabel } from "./Comparison.js";

const items = [{ slug: "one", title: "First track", artist: "First artist", genres: ["rock"], album: "First album" }, { slug: "two", title: "Second track", artist: "Second artist" }];
function render(enabled: boolean, selection = items) {
  return renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><Comparison items={selection} enabled={enabled} /></QueryClientProvider>);
}
describe("comparison", () => {
  it("shows an explicit action, not an automatic generated result", () => {
    const html = render(true);
    expect(html).toContain("Compare these recordings");
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("AI-generated from");
  });
  it("includes a labelled loading treatment for comparison requests", () => {
    expect(comparisonLoadingLabel).toBe("Comparing the selected recordings…");
  });
  it("disables paid requests without configuration or two recordings", () => {
    expect(render(false)).toContain("disabled");
    expect(render(false)).toContain("DeepInfra API key");
    expect(render(true, items.slice(0, 1))).toContain("disabled");
  });
  it("sends only bounded music fields and leaves unknown facts unknown", () => {
    const context = comparisonContext([...items, { ...items[0], story: "x".repeat(20000), privateToken: "secret" }, items[1]]);
    expect(context.recordings).toHaveLength(3);
    expect(context.recordings[1].album).toBeNull();
    expect(context.recordings[1].genres).toEqual([]);
    expect(JSON.stringify(context)).not.toContain("secret");
    expect(JSON.stringify(context)).not.toContain("story");
    expect(comparisonContext(items)).not.toEqual(comparisonContext(items.slice(0, 1)));
  });
});
