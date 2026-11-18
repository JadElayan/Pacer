import { test } from "node:test";
import assert from "node:assert/strict";
import { groupLessons, isEmptyLesson, lessonName, matchesSearch } from "../lib/lessonList.ts";

const base = { code: "123456", title: "Untitled lecture", ts: new Date(2026, 10, 18, 10).getTime(), topics: [] };

test("untitled lessons are named after their first real topic", () => {
  assert.equal(lessonName({ ...base, topics: [{ title: "New topic", summary: "", notes: [] }, { title: "Pacer Live Demo Overview", summary: "", notes: [] }] }), "Pacer Live Demo Overview");
  assert.equal(lessonName({ ...base, title: "Solving Equations" }), "Solving Equations");
});

test("untitled lessons with no topics use subject and date", () => {
  assert.match(lessonName({ ...base, subject: "Algebra" }), /^Algebra · /);
  assert.match(lessonName(base), /^Class · /);
});

test("empty lessons are detected", () => {
  assert.equal(isEmptyLesson(base), true);
  assert.equal(isEmptyLesson({ ...base, boards: [{ id: "b", ts: 1, blocks: [], strokes: [] }] }), true);
  assert.equal(isEmptyLesson({ ...base, topics: [{ title: "Limits", summary: "", notes: ["x"] }] }), false);
  assert.equal(isEmptyLesson({ ...base, myClips: [{ id: "c", topicId: "t", ts: 1 }] }), false);
});

test("search matches names, subjects and topics", () => {
  const lesson = { ...base, subject: "Stats", topics: [{ title: "Mean and median", summary: "", notes: [] }] };
  assert.equal(matchesSearch(lesson, "median"), true);
  assert.equal(matchesSearch(lesson, "stats"), true);
  assert.equal(matchesSearch(lesson, "calculus"), false);
});

test("lessons group into today, this week and earlier", () => {
  const now = new Date(2026, 10, 18, 15).getTime();
  const groups = groupLessons([{ ts: now - 3600_000 }, { ts: now - 2 * 86_400_000 }, { ts: now - 30 * 86_400_000 }], now);
  assert.deepEqual(groups.map((g) => [g.label, g.items.length]), [["Today", 1], ["This week", 1], ["Earlier", 1]]);
});
