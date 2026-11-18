import { test } from "node:test";
import assert from "node:assert/strict";
import { confidence, emptyLog, mergeLogs, missedCheckins, nextUp, retryCheckin, topicProgress, upsertCheckin, weekSummary } from "../lib/progress.ts";
import { isCorrect } from "../lib/grade.ts";

const day = 86_400_000;
const now = new Date(2026, 10, 18, 12).getTime();
const check = (id, topic, correct, extra = {}) => ({ id, ts: now - day, lesson: "123456", lecture: "Algebra 1", subject: "Algebra", topic, question: `Q ${id}`, correct, ...extra });

test("upsert keeps one record per question and adds the key later", () => {
  let log = upsertCheckin(emptyLog(), check("q1", "Factoring", false, { given: "3" }));
  log = upsertCheckin(log, check("q1", "Factoring", false, { key: "4" }));
  assert.equal(log.checkins.length, 1);
  assert.equal(log.checkins[0].given, "3");
  assert.equal(log.checkins[0].key, "4");
});

test("retrying a missed check-in uses the forgiving grader and clears it when right", () => {
  const log = { checkins: [check("q1", "Factoring", false, { key: "x = 4" })], signals: [] };
  assert.equal(missedCheckins(log).length, 1);
  const wrong = retryCheckin(log, "q1", "5", isCorrect, now);
  assert.equal(wrong.correct, false);
  const right = retryCheckin(wrong.log, "q1", "4", isCorrect, now);
  assert.equal(right.correct, true);
  assert.equal(missedCheckins(right.log).length, 0);
  assert.equal(right.log.checkins[0].retries.length, 2);
});

test("merging logs from two devices keeps the longer retry list", () => {
  const a = { checkins: [check("q1", "F", false, { key: "4", retries: [{ ts: 1, given: "4", correct: true }] })], signals: [] };
  const b = { checkins: [check("q1", "F", false, { key: "4" })], signals: [{ id: "s1", ts: 1, lesson: "1", topic: "F", kind: "lost" }] };
  const m = mergeLogs(b, a);
  assert.equal(m.checkins[0].retries.length, 1);
  assert.equal(m.signals.length, 1);
});

test("topics are grouped by subject with a status", () => {
  const log = { checkins: [check("q1", "Like terms", true), check("q2", "Factoring", false), check("q3", "Factoring", false), check("q4", "Distributing", true), check("q5", "Distributing", false)], signals: [] };
  const [algebra] = topicProgress(log);
  const status = Object.fromEntries(algebra.topics.map((t) => [t.topic, t.status]));
  assert.deepEqual(status, { "Like terms": "strong", Factoring: "needs work", Distributing: "mixed" });
});

test("next up picks the topic with the most missed check-ins, then open review items", () => {
  const log = { checkins: [check("q1", "Factoring", false), check("q2", "Factoring", false), check("q3", "Limits", false)], signals: [] };
  assert.deepEqual(nextUp(log, []), { kind: "missed", topic: "Factoring", lesson: "123456", count: 2, subject: "Algebra" });
  const review = [{ id: "r1", ts: 1, topic: "Vectors", lecture: "Physics" }];
  assert.equal(nextUp(emptyLog(), review).kind, "review");
  assert.equal(nextUp(emptyLog(), [{ ...review[0], resolved: true }]).kind, "clear");
  assert.equal(nextUp(emptyLog(), []), null);
});

test("week summary counts classes, check-ins and a weekly streak", () => {
  const log = { checkins: [check("q1", "A", true), check("q2", "B", false), { ...check("q3", "C", true), ts: now - 20 * day }], signals: [] };
  const s = weekSummary(log, [now - day, now - 2 * day, now - 9 * day, now - 30 * day], now);
  assert.deepEqual(s, { classes: 2, right: 1, answered: 2, streak: 2 });
});

test("confidence finds topics that went from lost to got it", () => {
  const sig = (id, topic, kind, ts) => ({ id, ts, lesson: "1", topic, kind });
  const log = { checkins: [], signals: [sig("1", "Limits", "lost", 1), sig("2", "Limits", "gotit", 2), sig("3", "Vectors", "lost", 3)] };
  assert.deepEqual(confidence(log), { turnedAround: ["Limits"], stillLost: ["Vectors"] });
});
