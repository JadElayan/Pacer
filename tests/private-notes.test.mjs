import { test } from "node:test";
import assert from "node:assert/strict";
import { privateNoteKey } from "../lib/privateNoteKey.ts";

test("student notes are scoped to a room and account, with a separate guest notebook", () => {
  const keys = [
    privateNoteKey("ABC", "student-one"),
    privateNoteKey("ABC", "student-two"),
    privateNoteKey("DEF", "student-one"),
    privateNoteKey("ABC"),
  ];
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(privateNoteKey("ABC", "student-one"), keys[0]);
});
