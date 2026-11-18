import { test } from "node:test";
import assert from "node:assert/strict";
import { guideSteps, readSlide } from "../lib/guide.ts";

const page = (id, text) => ({ id, width: 1, height: 1, text });
const deck = { id: "d", name: "Deck", current: 1, pages: {
  1: page("p1", "Normal Distribution ● Continuous Random Variables ● Intro to Normal Distribution ● Empirical Rule ● Z-Score ● Normal Distribution Probabilities"),
  2: page("p2", "Z-Score"),
  3: page("p3", "Example\nSuppose we have a continuous random variable with the following density curve:\n1. What is the area under the density curve?\n2. What is the probability that this random variable is less than 0.5?"),
  4: page("p4", "Recap"),
} };

test("bulleted slide text splits into a title and points", () => {
  const r = readSlide(deck.pages[1].text);
  assert.equal(r.title, "Normal Distribution");
  assert.deepEqual(r.points, ["Continuous Random Variables", "Intro to Normal Distribution", "Empirical Rule", "Z-Score", "Normal Distribution Probabilities"]);
});

test("steps skip title-only slides, mark overviews and keep slide questions", () => {
  const steps = guideSteps({ slides: deck, topics: [
    { id: "t1", title: "Mean and median", summary: "Two kinds of average.", notes: ["mean = sum / count"] },
    { id: "t2", title: "New topic", summary: "", notes: [] },
  ] }, [1, 2, 3, 4], "notes");
  assert.deepEqual(steps.map((s) => [s.kind, s.title, s.page]), [
    ["slide", "Normal Distribution", "slide:1"],
    ["slide", "Example", "slide:3"],
    ["topic", "Mean and median", "notes"],
  ]);
  assert.equal(steps[0].overview, true);
  assert.deepEqual(steps[1].questions, ["What is the area under the density curve?", "What is the probability that this random variable is less than 0.5?"]);
  assert.deepEqual(steps[1].points, ["Suppose we have a continuous random variable with the following density curve:"]);
});

test("topic steps fall back to the first slide when there is no notes page", () => {
  const steps = guideSteps({ slides: deck, topics: [{ title: "Intro", summary: "Hi", notes: [] }] }, [1], undefined);
  assert.equal(steps.at(-1).page, "slide:1");
});

test("titles run into the first sentence are split off, and inline numbered questions separate", () => {
  const a = readSlide("Density Plots Recall that we described discrete random variables with a PMF table. For continuous ones we use a curve.");
  assert.equal(a.title, "Density Plots");
  assert.match(a.points[0], /^Recall that we described/);
  const b = readSlide("Example Suppose we have a continuous random variable with the following density curve: 1. What is the area under the density curve? 2. What is P(X < 0.5)?");
  assert.equal(b.title, "Example");
  assert.deepEqual(b.questions, ["What is the area under the density curve?", "What is P(X < 0.5)?"]);
  assert.equal(readSlide("CDF The cumulative distribution function (CDF) has the same definition for discrete and continuous variables.").title, "CDF");
});

test("small words and lone maths letters don't stretch a title", () => {
  assert.equal(readSlide("Empirical Rule Because the normal distribution is symmetric, we have nice estimates for the spread.").title, "Empirical Rule");
  assert.equal(readSlide("Normal Distribution Curves X ~ N(0, 1) and X ~ N(2, 1) shown together on one plot here").title, "Normal Distribution Curves");
  assert.equal(readSlide("Rules of Thumb For most data, these estimates are close enough to be useful in practice.").title, "Rules of Thumb");
});

test("long slide text is split into sentences, never cut off", () => {
  const r = readSlide("Continuous Random Variables\nA continuous random variable can take any possible value within a range. If X is a continuous random variable, then P(X = k) = 0. The probability that X is exactly any one value is zero, so we only talk about intervals.");
  assert.deepEqual(r.points, [
    "A continuous random variable can take any possible value within a range.",
    "If X is a continuous random variable, then P(X = k) = 0.",
    "The probability that X is exactly any one value is zero, so we only talk about intervals.",
  ]);
  assert.ok(r.points.every((p) => !p.endsWith("…")));
});
