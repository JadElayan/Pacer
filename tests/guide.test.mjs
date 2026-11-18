import { test } from "node:test";
import assert from "node:assert/strict";
import { guideSteps } from "../lib/guide.ts";

const deck = { id: "d", name: "Deck", current: 1, pages: {
  1: { id: "p1", width: 1, height: 1, text: "Stats 101 Welcome\nEveryone is welcome\nGrading: 3 quizzes" },
  2: { id: "p2", width: 1, height: 1, text: "" },
} };

test("one step per slide, then one per topic with something to show", () => {
  const steps = guideSteps({ slides: deck, topics: [
    { id: "t1", title: "Mean and median", summary: "Two kinds of average.", notes: ["<div>mean = sum / count</div><div>median = middle</div>"] },
    { id: "t2", title: "New topic", summary: "", notes: [] },
  ] }, [1, 2], "notes");
  assert.deepEqual(steps.map((s) => [s.kind, s.title, s.page]), [
    ["slide", "Stats 101 Welcome", "slide:1"],
    ["slide", "Slide 2", "slide:2"],
    ["topic", "Mean and median", "notes"],
  ]);
  assert.deepEqual(steps[0].points, ["Everyone is welcome", "Grading: 3 quizzes"]);
  assert.deepEqual(steps[2].points, ["mean = sum / count", "median = middle"]);
});

test("topic steps fall back to the first slide when there is no notes page", () => {
  const steps = guideSteps({ slides: deck, topics: [{ title: "Intro", summary: "Hi", notes: [] }] }, [1], undefined);
  assert.equal(steps.at(-1).page, "slide:1");
});
