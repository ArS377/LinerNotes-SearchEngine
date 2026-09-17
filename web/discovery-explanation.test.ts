import { describe, expect, it } from "vitest";
import { rankingExplanation } from "./Discovery.js";

describe("ranking explanations", () => {
  const seed = { title: "Starting track" };
  it("uses plain language for a balanced metadata match", () => {
    const explanation = rankingExplanation({ title: "Recommended track", evidence: { genres: ["rage", "cloud rap"], seedYear: 2023, candidateYear: 2025 } }, seed, "balanced");
    expect(explanation.genreSentence).toContain("rage and cloud rap");
    expect(explanation.yearSentence).toContain("2 years from your starting track");
    expect(explanation.choiceSentence).toBe("You chose to balance matching genre tags with release era.");
  });
  it("explains era-only matches without technical scores", () => {
    const explanation = rankingExplanation({ title: "Recommended track", evidence: { genres: [], seedYear: 2023, candidateYear: 2023 } }, seed, "era");
    expect(explanation.genreSentence).toContain("did not need a matching genre tag");
    expect(explanation.yearSentence).toContain("same year");
    expect(JSON.stringify(explanation)).not.toMatch(/overlap|proximity|weighted|0\.\d/);
  });
});
