import test from "node:test";
import assert from "node:assert/strict";
import { authenticate, libraryConfigured } from "../src/services/library.js";

test("library persistence is optional", () => {
  assert.equal(typeof libraryConfigured(), "boolean");
});

test("authentication rejects missing bearer tokens before database access", async () => {
  await assert.rejects(() => authenticate(""), { code: "UNAUTHORIZED" });
});
