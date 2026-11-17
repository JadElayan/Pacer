import { test } from "node:test";
import assert from "node:assert/strict";
import { lectureContent } from "../lib/recapContent.ts";

const room = (extra) => ({ code: "123456", title: "Algebra", blocks: [], topics: [], strokes: [], currentTopicId: null, ended: false, rev: 0, ...extra });
const page = (text) => ({ id: text, width: 4, height: 3, text });

test("the recap includes presented slides, in order, before board notes", () => {
  const lines = lectureContent(room({
    blocks: [{ id: "b", topicId: "t", kind: "text", content: "2x + 3 = 11", order: 0, ts: 0 }],
    slides: { id: "d", name: "Deck", total: 3, current: 2, access: "presented", presented: [2, 1], ink: {}, pages: { 1: page("Variables"), 2: page("Two-step equations") } },
  }));
  assert.deepEqual(lines, ["Slide 1: Variables", "Slide 2: Two-step equations", "2x + 3 = 11"]);
});

test("slides the teacher never presented are left out, and slide text falls back to the teacher's private copy", () => {
  const lines = lectureContent(room({
    slides: { id: "d", name: "Deck", total: 3, current: 1, access: "all", presented: [1], ink: {}, pages: { 1: page(""), 3: page("Not shown") } },
    privateSlidePages: { 1: page("Intro to slopes") },
  }));
  assert.deepEqual(lines, ["Slide 1: Intro to slopes"]);
});

test("content stays within the AI route's 40 items, sharing room between slides and board", () => {
  const pages = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [i + 1, page(`Slide text ${i + 1}`)]));
  const lines = lectureContent(room({
    blocks: Array.from({ length: 50 }, (_, i) => ({ id: `b${i}`, topicId: "t", kind: "text", content: `Note ${i}`, order: i, ts: 0 })),
    slides: { id: "d", name: "Deck", total: 50, current: 1, access: "all", presented: Object.keys(pages).map(Number), ink: {}, pages },
  }));
  assert.equal(lines.length, 40);
  assert.equal(lines.filter((line) => line.startsWith("Slide")).length, 26);
});
