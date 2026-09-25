import assert from "node:assert/strict";
import { mathCaptionsSrt } from "../packages/pipeline/src/mathFallback.js";

const words = [
  { word: "One", start: 0, end: 0.3 },
  { word: "plus", start: 0.3, end: 0.6 },
  { word: "one", start: 0.6, end: 0.9 },
  { word: "hundred", start: 0.9, end: 1.25 },
  { word: "is", start: 1.25, end: 1.5 },
  { word: "101.", start: 1.5, end: 1.8 },
  { word: "Done.", start: 1.8, end: 2.1 },
];
const captions = mathCaptionsSrt(words);
assert.match(captions, /00:00:00,000 --> 00:00:01,800\nOne plus one hundred is 101\./);
assert.match(captions, /00:00:01,800 --> 00:00:02,100\nDone\./);
console.log("Math fallback: timed, readable captions passed");
