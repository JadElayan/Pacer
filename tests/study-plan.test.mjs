import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlaceholderTitle, planFocus, planMaterial, planSteps, resolveReview, stepsDone, today } from "../lib/studyPlan.ts";

const now = new Date(2026, 10, 18, 12).getTime();
const day = 86_400_000;
const lessons = [
  { code: "111111", title: "Untitled lecture", ts: now - day, topics: [{ title: "Factoring", summary: "Pull out the GCF.", notes: ["6x + 9 = 3(2x + 3)"] }] },
  { code: "222222", title: "Untitled lecture", ts: now - 5 * day, topics: [{ title: "Limits", summary: "", notes: ["lim x→0"] }] },
];
const name = (l) => l.topics[0]?.title ?? l.title;
const check = (id, topic, correct, key = "4") => ({ id, ts: now - day, lesson: "111111", lecture: "Untitled lecture", subject: "Algebra", topic, question: `Q ${id}`, key, correct });

test("placeholder titles are recognised", () => {
  for (const t of ["Untitled lecture", "New topic", "Topic 3", ""]) assert.equal(isPlaceholderTitle(t), true, t);
  assert.equal(isPlaceholderTitle("Factoring"), false);
});

test("old review marks get the closest lesson's code and a readable label", () => {
  const [a, b] = resolveReview([
    { id: "r1", lecture: "Untitled lecture", topic: "Untitled lecture", ts: now - 5 * day + 3600_000 },
    { id: "r2", lecture: "Stats", topic: "New topic", ts: now },
  ], lessons, name);
  assert.equal(a.code, "222222");
  assert.equal(a.label, "Limits");
  assert.equal(b.code, undefined);
  assert.equal(b.label, "Stats");
});

test("focus picks the most-missed topic, with retry only for questions that have a key", () => {
  const log = { checkins: [check("q1", "Factoring", false), check("q2", "Factoring", false, ""), check("q3", "Limits", false)], signals: [] };
  const f = planFocus(log, []);
  assert.equal(f.topic, "Factoring");
  assert.equal(f.reason, "You missed 2 check-ins on this.");
  assert.deepEqual(f.retryIds, ["q1"]);
  assert.deepEqual(planSteps(f), ["reread", "retry", "practice"]);
  assert.equal(planFocus(log, [], undefined, ["Factoring"]).topic, "Limits");
  assert.equal(planFocus(log, [], "Limits").topic, "Limits");
});

test("with nothing missed, focus falls back to the newest review mark", () => {
  const review = [{ id: "r1", lecture: "x", topic: "Vectors", label: "Vectors", ts: 1, question: "why?" }];
  const f = planFocus({ checkins: [], signals: [] }, review);
  assert.equal(f.topic, "Vectors");
  assert.equal(f.reason, "You asked about this in class.");
  assert.deepEqual(planSteps(f), ["explain", "practice"]);
  assert.equal(planFocus({ checkins: [], signals: [] }, [{ ...review[0], resolved: true }]), null);
});

test("material comes from the topic's notes and check-ins", () => {
  const log = { checkins: [check("q1", "Factoring", false)], signals: [] };
  const m = planMaterial(planFocus(log, []), lessons, log);
  assert.deepEqual(m.selected, ["6x + 9 = 3(2x + 3)", "Check-in: Q q1 (answer: 4)"]);
  assert.deepEqual(m.context, ["Factoring: Pull out the GCF."]);
});

test("plan progress resets on a new day or topic", () => {
  const saved = { topic: "Factoring", day: today(now), done: ["reread"] };
  assert.deepEqual(stepsDone(saved, "Factoring", now), ["reread"]);
  assert.deepEqual(stepsDone(saved, "Limits", now), []);
  assert.deepEqual(stepsDone(saved, "Factoring", now + day), []);
});
