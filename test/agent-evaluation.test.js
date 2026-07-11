import test from "node:test";
import assert from "node:assert/strict";
import {
  askOpenClaw,
  setOpenClawFetchForTests
} from "../src/providers/openclaw.js";

test("agent responses expose normalized citations and grounded confidence", async () => {
  const previousBaseUrl = process.env.OPENCLAW_BASE_URL;
  const previousApiKey = process.env.OPENCLAW_API_KEY;
  const previousTransport = process.env.OPENCLAW_TRANSPORT;
  process.env.OPENCLAW_TRANSPORT = "http";
  process.env.OPENCLAW_BASE_URL = "https://agent.example";
  process.env.OPENCLAW_API_KEY = "test";
  setOpenClawFetchForTests(async () => ({
    ok: true,
    json: async () => ({
      answer: "The supplied release credits support this answer.",
      citations: ["MusicBrainz"]
    })
  }));
  try {
    const result = await askOpenClaw("Explain the credits", {});
    assert.deepEqual(result.citations, [{ title: "MusicBrainz" }]);
    assert.equal(result.confidence, "grounded");
  } finally {
    if (previousBaseUrl === undefined) delete process.env.OPENCLAW_BASE_URL;
    else process.env.OPENCLAW_BASE_URL = previousBaseUrl;
    if (previousApiKey === undefined) delete process.env.OPENCLAW_API_KEY;
    else process.env.OPENCLAW_API_KEY = previousApiKey;
    if (previousTransport === undefined) delete process.env.OPENCLAW_TRANSPORT;
    else process.env.OPENCLAW_TRANSPORT = previousTransport;
    setOpenClawFetchForTests(globalThis.fetch);
  }
});

test("agent responses without sources are explicitly partial", async () => {
  const previousTransport = process.env.OPENCLAW_TRANSPORT;
  process.env.OPENCLAW_TRANSPORT = "http";
  process.env.OPENCLAW_BASE_URL = "https://agent.example";
  process.env.OPENCLAW_API_KEY = "test";
  setOpenClawFetchForTests(async () => ({ ok: true, json: async () => ({ answer: "A tentative answer" }) }));
  try {
    assert.equal((await askOpenClaw("Question", {})).confidence, "partial");
  } finally {
    if (previousTransport === undefined) delete process.env.OPENCLAW_TRANSPORT;
    else process.env.OPENCLAW_TRANSPORT = previousTransport;
    delete process.env.OPENCLAW_BASE_URL;
    delete process.env.OPENCLAW_API_KEY;
    setOpenClawFetchForTests(globalThis.fetch);
  }
});
