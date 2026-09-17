import test from "node:test";
import assert from "node:assert/strict";
import { parseComparison } from "../src/providers/comparison-format.js";

const recordings = [{ title: "First", artist: "A" }, { title: "Second", artist: "B" }];
const valid = { introductions: [{ recordingIndex: 1, text: "Second meaning." }, { recordingIndex: 0, text: "First meaning." }], rows: [{ aspect: "Style", cells: ["Rock", "Pop"] }], uncertainty: "" };
test("flat model fields map to exactly one introduction and table column per recording", () => {
  const flat = { song0: "First meaning.", song1: "Second meaning.", style0: "Rock", style1: "Pop", production0: "Guitar", production1: "Piano", uncertainty: "" };
  const result = parseComparison(JSON.stringify(flat), recordings);
  assert.deepEqual(result.introductions.map((item) => item.text), ["First meaning.", "Second meaning."]);
  assert.deepEqual(result.rows[0].cells, ["Rock", "Pop"]);
  delete flat.song1;
  assert.throws(() => parseComparison(JSON.stringify(flat), recordings), /incomplete/);
});
test("introductions follow selection order and use catalog labels", () => {
  const result = parseComparison(JSON.stringify(valid), recordings);
  assert.deepEqual(result.introductions.map((item) => item.title), ["First", "Second"]);
  assert.equal(result.introductions[0].text, "First meaning.");
});
test("reject duplicate, missing, out-of-range introductions and malformed tables", () => {
  for (const value of [
    { ...valid, introductions: [valid.introductions[0], valid.introductions[0]] },
    { ...valid, introductions: valid.introductions.slice(0, 1) },
    { ...valid, introductions: [...valid.introductions, { recordingIndex: 2, text: "Extra" }] },
    { ...valid, rows: [{ aspect: "Style", cells: ["One"] }] }
  ]) assert.throws(() => parseComparison(JSON.stringify(value), recordings), /incomplete/);
  assert.throws(() => parseComparison("freeform text", recordings), /incomplete/);
});
test("supports three recordings without repeating introductions", () => {
  const result = parseComparison(JSON.stringify({ ...valid, introductions: [...valid.introductions, { recordingIndex: 2, text: "Third meaning." }], rows: [{ aspect: "Style", cells: ["Rock", "Pop", "Jazz"] }] }), [...recordings, { title: "Third", artist: "C" }]);
  assert.equal(result.introductions.length, 3);
});
