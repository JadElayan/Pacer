import { test } from "node:test";
import assert from "node:assert/strict";
import { appendCard, blocksFor, cardToText, insertBlock, moveBlock, parseBlocks, placedClips, serializeBlocks } from "../lib/noteBlocks.ts";

const clip = (id) => `<div data-block="clip:${id}"></div>`;

test("parses text, clips and cards in order and serializes back", () => {
  const html = `<div>one</div>${clip("a1")}<div>two</div><blockquote data-card="Explanation (AI)"><div>why</div><blockquote>quote</blockquote></blockquote><div>three</div>`;
  const blocks = parseBlocks(html);
  assert.deepEqual(blocks.map((b) => b.kind), ["text", "clip", "text", "card", "text"]);
  assert.equal(blocks[3].label, "Explanation (AI)");
  assert.equal(blocks[3].html, "<div>why</div><blockquote>quote</blockquote>");
  assert.equal(serializeBlocks(blocks), html);
});

test("older clips are added at the end and deleted clips disappear", () => {
  const blocks = blocksFor(`<div>notes</div>${clip("gone")}`, ["c1"], ["c1"]);
  assert.deepEqual(blocks.map((b) => b.kind === "clip" ? b.id : b.kind), ["text", "c1", "text"]);
});

test("every clip or card is followed by a text block to type in", () => {
  const blocks = blocksFor(`${clip("a")}${clip("b")}`, ["a", "b"], []);
  assert.deepEqual(blocks.map((b) => b.kind), ["text", "clip", "text", "clip", "text"]);
});

test("moving a clip above text, and inserting into the middle of text", () => {
  const blocks = blocksFor(`<div>one</div>${clip("a")}`, ["a"], []);
  const moved = moveBlock(blocks, 1, 0);
  assert.deepEqual(moved.map((b) => b.kind), ["clip", "text"]);
  assert.equal(moved[1].html, "<div>one</div>");
  const split = insertBlock(parseBlocks("<div>one</div><div>two</div>"), { kind: "clip", id: "x" }, 0, ["<div>one</div>", "<div>two</div>"]);
  assert.equal(serializeBlocks(split), `<div>one</div>${clip("x")}<div>two</div>`);
});

test("cards append, keep quotes in labels safe, and turn into text", () => {
  const html = appendCard("<div>mine</div>", 'Catch-up "today"', "<div>recap</div>");
  const blocks = parseBlocks(html);
  assert.equal(blocks[1].label, 'Catch-up "today"');
  const text = cardToText(blocks, 1);
  assert.match(serializeBlocks(text), /<strong>Catch-up &quot;today&quot;<\/strong><\/div><div>recap<\/div>$/);
});

test("clip width survives a round trip", () => {
  const html = `<div data-block="clip:a" data-w="60"></div>`;
  assert.equal(parseBlocks(html)[0].w, 60);
  assert.equal(serializeBlocks(parseBlocks(html)), html);
});

test("placed clips are found across topics", () => {
  assert.deepEqual([...placedClips({ t1: clip("a"), t2: `<div>x</div>${clip("b")}`, t3: undefined })], ["a", "b"]);
});

test("an empty topic still has a text block to type in", () => {
  assert.deepEqual(blocksFor("", [], []), [{ kind: "text", html: "" }]);
  assert.deepEqual(blocksFor(undefined ?? "", ["c"], ["c"]).map((b) => b.kind), ["text", "clip", "text"]);
});
