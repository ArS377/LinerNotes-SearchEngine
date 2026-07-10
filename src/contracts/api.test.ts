import { describe, expect, it } from "vitest";
import {
  agentMessageSchema,
  environmentSchema,
  searchQuerySchema,
  searchResponseSchema
} from "./api.js";

describe("API contracts", () => {
  it("normalizes bounded search parameters", () => {
    expect(searchQuerySchema.parse({ q: "  daft punk  ", limit: "10" })).toEqual({
      q: "daft punk",
      limit: 10,
      offset: 0
    });
    expect(() => searchQuerySchema.parse({ q: "", limit: 100 })).toThrow();
  });

  it("rejects incomplete search responses", () => {
    expect(() => searchResponseSchema.parse({ results: [] })).toThrow();
  });

  it("bounds agent prompts", () => {
    expect(agentMessageSchema.parse({ prompt: "Compare these versions" }).context).toEqual({});
    expect(() => agentMessageSchema.parse({ prompt: "x".repeat(2_001) })).toThrow();
  });

  it("requires Supabase configuration as a complete group", () => {
    expect(() => environmentSchema.parse({ SUPABASE_URL: "https://example.supabase.co" })).toThrow();
    expect(environmentSchema.parse({})).toMatchObject({ PORT: 3000 });
  });
});
