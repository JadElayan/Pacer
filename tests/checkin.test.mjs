import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInReceipt } from "../lib/checkInReceipt.ts";

test("a retry preserves the recorded result, including an incorrect answer", () => {
  const events = [
    { kind: "answer", questionId: "previous", sid: "student", correct: true },
    { kind: "answer", questionId: "current", sid: "other", correct: true },
    { kind: "answer", questionId: "current", sid: "student", correct: false },
  ];
  assert.equal(checkInReceipt(events, "current", "student"), false);
  assert.equal(checkInReceipt(events, "current", "new student"), undefined);
});
