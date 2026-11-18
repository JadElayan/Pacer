import { test } from "node:test";
import assert from "node:assert/strict";

// Counters stay in memory for these tests (no Supabase).
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
process.env.AI_UNITS_PER_DEVICE_DAY = "1000";
const budget = await import("../lib/aiBudget.ts");

test("titles and small JSON run without thinking; answers use low effort; class jobs use medium", () => {
  const title = budget.requestSettings("summarize", "claude-sonnet-5-5", false);
  assert.deepEqual(title.thinking, { type: "between_tools" });
  assert.deepEqual(title.output_config, { effort: "low" });
  assert.ok(title.max_tokens <= 400);

  const answer = budget.requestSettings("explain", "claude-sonnet-5-5", false);
  assert.equal(answer.thinking, undefined, "short answers keep a little adaptive thinking");
  assert.deepEqual(answer.output_config, { effort: "low" });
  assert.ok(budget.requestSettings("explain", "claude-sonnet-5-5", true).max_tokens > answer.max_tokens, "a fuller answer gets more room");

  assert.deepEqual(budget.requestSettings("recap", "claude-sonnet-5-5", false).output_config, { effort: "medium" });
});

test("settings only use fields the model accepts", () => {
  assert.equal(budget.requestSettings("summarize", "claude-haiku-4-5", false).output_config, undefined);
  assert.equal(budget.requestSettings("summarize", "claude-opus-5-5", false).thinking, undefined, "Opus 5.5 can't turn thinking off; low effort instead");
  assert.deepEqual(budget.requestSettings("summarize", "claude-haiku-5-5", false).thinking, { type: "disabled" });
});

test("cost units weight output tokens and discount cache reads", () => {
  assert.equal(budget.units({ input_tokens: 1000, output_tokens: 100 }), 1500);
  assert.equal(budget.units({ cache_read_input_tokens: 1000 }), 100);
});

test("the same request is cached; 'explain it another way' never is", () => {
  const key = budget.cacheKey("explain", ["m", "standard", "", "prompt"]);
  assert.equal(key, budget.cacheKey("explain", ["m", "standard", "", "prompt"]));
  budget.remember(key, { text: "answer", source: "ai" });
  assert.deepEqual(budget.cached(key), { text: "answer", source: "ai" });
  assert.equal(budget.cacheKey("another", ["m", "standard", "", "prompt"]), null);
  budget.remember(budget.cacheKey("why", ["x"]), { text: "", source: "ai", error: "nope" });
  assert.equal(budget.cached(budget.cacheKey("why", ["x"])), undefined, "errors are not cached");
});

test("identical requests in flight share one call", async () => {
  let calls = 0;
  const work = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return { text: "a", source: "ai" }; };
  await Promise.all([budget.once("k1", work), budget.once("k1", work), budget.once("k1", work)]);
  assert.equal(calls, 1);
});

test("a device over its daily allowance is refused; repeat offenders are paused", async () => {
  assert.equal(await budget.overBudget("device-a", "explain"), null);
  await budget.spend("device-a", 1200);
  assert.match(await budget.overBudget("device-a", "explain"), /today's AI allowance/);
  assert.equal(await budget.overBudget("device-b", "explain"), null, "other devices are unaffected");

  for (let i = 0; i < 3; i++) await budget.strike("device-c", "test");
  assert.match(await budget.overBudget("device-c", "explain"), /paused here for 30 minutes/);
});

test("teacher-only jobs have a daily cap per device", async () => {
  let message = null;
  for (let i = 0; i < 16 && !message; i++) message = await budget.overBudget("device-d", "recap");
  assert.match(message, /used a lot today/);
});
