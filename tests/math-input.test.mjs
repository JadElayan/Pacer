import { test } from "node:test";
import assert from "node:assert/strict";
import { mathInputToTex } from "../lib/mathInput.ts";

test("powers and fractions format as you type", () => {
  assert.equal(mathInputToTex("x^2"), "{x}^{2}");
  assert.equal(mathInputToTex("a/b"), "\\frac{a}{b}");
  assert.equal(mathInputToTex("2x/4"), "\\frac{2x}{4}");
  assert.equal(mathInputToTex("(x+1)/(x-1)"), "\\frac{x+1}{x-1}");
  assert.equal(mathInputToTex("x^(n+1)"), "{x}^{n+1}");
  assert.equal(mathInputToTex("2x^2/4"), "\\frac{2{x}^{2}}{4}");
});

test("half-typed input still shows where the next part goes", () => {
  assert.equal(mathInputToTex("x^"), "{x}^{\\square}");
  assert.equal(mathInputToTex("3/"), "\\frac{3}{\\square}");
  assert.equal(mathInputToTex("(x+1"), "\\left(x+1\\right)");
});

test("other shortcuts, and TeX is left alone", () => {
  assert.equal(mathInputToTex("sqrt(x)"), "\\sqrt{x}");
  assert.equal(mathInputToTex("2*pi"), "2\\cdot \\pi");
  assert.equal(mathInputToTex("y = 2x + 3"), "y = 2x + 3");
  assert.equal(mathInputToTex("\\frac{1}{2}"), "\\frac{1}{2}");
});

test("equations get a spoken version for screen readers", async () => {
  const { texToSpeech } = await import("../lib/mathInput.ts");
  assert.equal(texToSpeech("\\frac{x+1}{2{x}^{2}}"), "(x+1) over (2x to the power 2)");
  assert.equal(texToSpeech("\\sqrt{x}"), "square root of x");
});
