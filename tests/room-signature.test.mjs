import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoomKeys, importSigner, importVerifier, signRoomMessage, verifyRoomMessage } from "../lib/roomSignature.ts";

const state = { type: "state", code: "123456", body: JSON.stringify({ code: "123456", rev: 4, title: "Linear equations" }) };

test("students accept board updates signed by the room's teacher", async () => {
  const keys = await createRoomKeys();
  const sig = await signRoomMessage(await importSigner(keys.privateJwk), state);
  assert.equal(await verifyRoomMessage(await importVerifier(keys.publicJwk), state, sig), true);
  assert.equal("d" in keys.publicJwk, false, "the registered public key must not contain the private part");
});

test("forged, unsigned, tampered, and replayed messages are rejected", async () => {
  const teacher = await createRoomKeys();
  const attacker = await createRoomKeys();
  const verifier = await importVerifier(teacher.publicJwk);
  const sig = await signRoomMessage(await importSigner(teacher.privateJwk), state);
  const forged = await signRoomMessage(await importSigner(attacker.privateJwk), state);
  assert.equal(await verifyRoomMessage(verifier, state, forged), false);
  assert.equal(await verifyRoomMessage(verifier, state, undefined), false);
  assert.equal(await verifyRoomMessage(verifier, state, "not-base64!"), false);
  assert.equal(await verifyRoomMessage(verifier, { ...state, body: state.body.replace("Linear", "Fake") }, sig), false);
  assert.equal(await verifyRoomMessage(verifier, { ...state, code: "654321" }, sig), false);
  assert.equal(await verifyRoomMessage(verifier, { ...state, type: "grade" }, sig), false);
});

test("a grade signed for one student can't be redirected to another", async () => {
  const keys = await createRoomKeys();
  const grade = { type: "grade", code: "123456", to: "student-a", body: JSON.stringify({ questionId: "q1", correct: true }) };
  const sig = await signRoomMessage(await importSigner(keys.privateJwk), grade);
  assert.equal(await verifyRoomMessage(await importVerifier(keys.publicJwk), { ...grade, to: "student-b" }, sig), false);
});
