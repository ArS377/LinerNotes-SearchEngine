import { performance } from "node:perf_hooks";
import { searchRecordings } from "../src/search.js";

const queries = [
  "Jolene Dolly Parton",
  "Bohemian Rhapsody",
  "with the lights out",
  "Daft Punk",
  "Kendrick Lamar Alright"
];
const samples = [];

for (let iteration = 0; iteration < 100; iteration += 1) {
  const query = queries[iteration % queries.length];
  const started = performance.now();
  searchRecordings(query, 20);
  samples.push(performance.now() - started);
}

samples.sort((left, right) => left - right);
const percentile = (value) => samples[Math.min(samples.length - 1, Math.floor(samples.length * value))];

console.log(JSON.stringify({
  benchmark: "local-search",
  samples: samples.length,
  p50Milliseconds: Number(percentile(0.5).toFixed(3)),
  p95Milliseconds: Number(percentile(0.95).toFixed(3)),
  maximumMilliseconds: Number(samples.at(-1).toFixed(3)),
  measuredAt: new Date().toISOString()
}, null, 2));
