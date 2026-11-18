import { test } from "node:test";
import assert from "node:assert/strict";
import { hasNoteText, htmlToText, noteHtml, textToHtml } from "../lib/noteHtml.ts";

test("older plain-text notes become formatted notes, keeping their lists", () => {
  assert.equal(textToHtml("Solving for x\n• undo + first\n- then divide\n1. check\n2. done\n<b>"),
    "<div>Solving for x</div><ul><li>undo + first</li><li>then divide</li></ul><ol><li>check</li><li>done</li></ol><div>&lt;b&gt;</div>");
  assert.equal(noteHtml("<div>already html</div>"), "<div>already html</div>");
  assert.equal(noteHtml(undefined), "");
});

test("formatted notes export as readable text with bullets and numbers", () => {
  const html = "<h3>Two-step equations</h3><div><strong>Undo</strong> + first</div><ul><li>then <em>divide</em></li></ul><ol><li>check</li><li>done</li></ol><div>a &amp; b</div>";
  assert.equal(htmlToText(html), "Two-step equations\n\nUndo + first\n\n• then divide\n\n1. check\n2. done\n\na & b");
  assert.equal(htmlToText(textToHtml("plain\n• one")), "plain\n\n• one");
});

test("empty editors don't count as notes", () => {
  assert.equal(hasNoteText("<div><br></div>"), false);
  assert.equal(hasNoteText("<ul><li><br></li></ul>"), false);
  assert.equal(hasNoteText("<div>x</div>"), true);
  assert.equal(hasNoteText("plain"), true);
});

test("checklists, titles, indents and links export as readable text", () => {
  const html = '<h2>Unit 3</h2><h4>Slopes</h4><ul data-checklist="true"><li data-checked="true">read 3.1</li><li>try problems</li></ul><blockquote><div>indented idea</div></blockquote><div>See <a href="https://khanacademy.org">Khan</a></div>';
  assert.equal(htmlToText(html), "Unit 3\n\nSlopes\n\n☑ read 3.1\n☐ try problems\n\nindented idea\n\nSee Khan");
  assert.equal(noteHtml('<ul data-checklist="true"><li>x</li></ul>'), '<ul data-checklist="true"><li>x</li></ul>');
  assert.equal(hasNoteText('<ul data-checklist="true"><li><br></li></ul>'), false);
});

test("notes that start with plain text before the first formatted line are still HTML", () => {
  assert.equal(noteHtml("asd<div>a</div>"), "asd<div>a</div>");
  assert.equal(htmlToText("asd<div>a</div>"), "asd\na");
  assert.equal(noteHtml("2 < 3 and 5 > 4"), textToHtml("2 < 3 and 5 > 4"));
});
