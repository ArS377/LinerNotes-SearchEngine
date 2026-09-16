import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "@tanstack/react-query";
import { Discovery } from "./Discovery.js";
import { submitDiscoveryChoices } from "./discovery-controls.js";

vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }));

describe("explicit discovery submission", () => {
  beforeEach(() => vi.clearAllMocks());
  it("loads seed details but disables recommendations and hides cached results/errors before submission", () => {
    vi.mocked(useQuery).mockReturnValueOnce({ data: { title: "Bad Romance", artist: { name: "Lady Gaga" } } } as ReturnType<typeof useQuery>);
    vi.mocked(useQuery).mockReturnValueOnce({ data: { items: [], providerStatus: "unavailable" }, error: new Error("old lookup error") } as ReturnType<typeof useQuery>);
    const markup = renderToStaticMarkup(<Discovery url={new URL("http://localhost/discover?seed=example&focus=genre")} bookmarks={[]} navigate={() => {}} renderRecording={() => null} />);
    const [details, recommendations] = vi.mocked(useQuery).mock.calls;
    expect(details[0].enabled).toBe(true);
    expect(recommendations[0].enabled).toBe(false);
    expect(recommendations[0].refetchOnWindowFocus).toBe(false);
    expect(recommendations[0].refetchOnReconnect).toBe(false);
    expect(markup).toContain("More like Bad Romance");
    expect(markup).toContain("Exclude songs by Lady Gaga");
    expect(markup).toContain("Choose your filters, then click Find recommendations.");
    expect(markup).not.toContain("recordings to try");
    expect(markup).not.toContain("old lookup error");
    expect(markup).not.toContain("Searching the catalogs");
  });
  it("first submission applies the chosen filters instead of refetching unsubmitted defaults", () => {
    const apply = vi.fn(), retry = vi.fn();
    const choices = { focus: "genre" as const, differentArtists: false, unfamiliarArtists: true };
    submitDiscoveryChoices(null, choices, apply, retry);
    expect(apply).toHaveBeenCalledExactlyOnceWith(choices);
    expect(retry).not.toHaveBeenCalled();
  });
  it("invalid trails disable both lookups", () => {
    vi.mocked(useQuery).mockReturnValue({} as ReturnType<typeof useQuery>);
    const markup = renderToStaticMarkup(<Discovery url={new URL("http://localhost/discover?seed=example&trail=broken")} bookmarks={[]} navigate={() => {}} renderRecording={() => null} />);
    expect(vi.mocked(useQuery).mock.calls.every(([options]) => options.enabled === false)).toBe(true);
    expect(markup).toContain("This trail link is invalid");
  });
});
