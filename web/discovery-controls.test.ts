// Regression: ISSUE-002, Chrome QA 2026-09-16. See outputs/qa-report-2026-09-16.md.
import { describe, expect, it, vi } from "vitest";
import { submitDiscoveryChoices } from "./discovery-controls.js";

describe("discovery retry", () => {
  const choices = { focus: "balanced" as const, differentArtists: true, unfamiliarArtists: false };
  it("refetches when the same choices are submitted", () => {
    const apply = vi.fn(), retry = vi.fn();
    submitDiscoveryChoices(choices, { ...choices }, apply, retry);
    expect(retry).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
  });
  it("applies changed choices without refetching the previous query", () => {
    const apply = vi.fn(), retry = vi.fn();
    const next = { ...choices, focus: "genre" as const };
    submitDiscoveryChoices(choices, next, apply, retry);
    expect(apply).toHaveBeenCalledWith(next);
    expect(retry).not.toHaveBeenCalled();
  });
});
