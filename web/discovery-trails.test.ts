import { describe, expect, it } from "vitest";
import { readSavedTrails, readTrail, trailPath, type Trail } from "./discovery-trails.js";

const trail: Trail = { version: 1, focus: "genre", differentArtists: true, steps: [{ slug: "get-lucky-daft-punk", title: "Get Lucky", artist: "Daft Punk" }, { slug: "next-track", title: "Another & Something", artist: "Someone", reason: "Shares disco catalog tags." }] };

describe("discovery trail persistence", () => {
  it("round-trips the complete public trail without private bookmark filters", () => {
    const url = new URL(trailPath(trail), "https://example.com");
    expect(url.searchParams.get("seed")).toBe("next-track");
    expect(readTrail(url.searchParams.get("trail")!)).toEqual(trail);
    expect(url.searchParams.has("knownArtists")).toBe(false);
    expect(url.searchParams.has("unfamiliarArtists")).toBe(false);
  });
  it("rejects malformed, oversized, and unsupported trail links", () => {
    expect(readTrail("not json")).toBeNull();
    expect(readTrail("x".repeat(16001))).toBeNull();
    expect(readTrail(JSON.stringify({ ...trail, version: 2 }))).toBeNull();
    expect(readTrail(JSON.stringify({ ...trail, steps: Array(11).fill(trail.steps[0]) }))).toBeNull();
    expect(readTrail(JSON.stringify({ ...trail, privateData: "not allowed" }))).toBeNull();
  });
  it("handles unavailable storage and discards malformed entries", () => {
    expect(readSavedTrails({ getItem: () => { throw new Error("unavailable"); } })).toEqual([]);
    const valid = { id: "one", title: "A trail", savedAt: "2026-09-14", trail };
    expect(readSavedTrails({ getItem: () => JSON.stringify([null, {}, valid]) })).toEqual([valid]);
  });
});
