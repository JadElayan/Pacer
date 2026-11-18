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

test("questions written on a slide become suggestions, without repeating the AI's", async () => {
  const { slideQuestions, suggestionsForSlide } = await import("../lib/slideQuestions.ts");
  const text = "Example\nSuppose we have a continuous random variable with the following density curve:\n1. What is the area under the density curve?\n2. What is the probability that this random variable is less than 0.5?\n3. What is the probability that this random variable is equal to 0.5?";
  assert.deepEqual(slideQuestions(text), [
    "What is the area under the density curve?",
    "What is the probability that this random variable is less than 0.5?",
    "What is the probability that this random variable is equal to 0.5?",
  ]);
  const merged = suggestionsForSlide(5, text, [{ slide: 5, question: "What is the area under the density curve?", answer: "1", answerSlide: 5 }, { slide: 6, question: "Other?", answer: "", answerSlide: null }]);
  assert.deepEqual(merged.map((s) => [s.id, s.answer]), [["ai-5-0", "1"], ["slide-5-0", ""], ["slide-5-1", ""]]);
  assert.deepEqual(slideQuestions("Why? ok"), []);
});
