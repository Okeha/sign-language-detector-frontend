import test from "node:test";
import assert from "node:assert/strict";

import { parseChatSseLine } from "../lib/chat-sse";

test("parses token events", () => {
  assert.deepEqual(parseChatSseLine('data: {"token":"hello"}'), {
    kind: "token",
    token: "hello",
  });
});

test("preserves valid backend errors as semantic errors", () => {
  assert.deepEqual(parseChatSseLine('data: {"error":"provider down"}'), {
    kind: "error",
    error: "provider down",
  });
});

test("distinguishes malformed JSON from a semantic error", () => {
  const event = parseChatSseLine("data: {not-json}");
  assert.equal(event.kind, "malformed");
});

test("parses completion events with or without a space after data", () => {
  assert.deepEqual(parseChatSseLine('data:{"done":true}'), { kind: "done" });
});

test("ignores unrelated and empty events", () => {
  assert.deepEqual(parseChatSseLine("event: ping"), { kind: "ignore" });
  assert.deepEqual(parseChatSseLine("data: {}"), { kind: "ignore" });
});

test("server errors take precedence over completion flags", () => {
  assert.deepEqual(
    parseChatSseLine('data: {"done":true,"error":"provider down"}'),
    { kind: "error", error: "provider down" },
  );
});
