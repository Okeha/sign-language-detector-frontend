import test from "node:test";
import assert from "node:assert/strict";

import {
  getStreamingStartAction,
  hasActiveConnectionAttempt,
  WS_STATE,
} from "../lib/websocket-lifecycle";

test("treats CONNECTING and OPEN as an existing connection attempt", () => {
  assert.equal(hasActiveConnectionAttempt(WS_STATE.CONNECTING), true);
  assert.equal(hasActiveConnectionAttempt(WS_STATE.OPEN), true);
  assert.equal(hasActiveConnectionAttempt(WS_STATE.CLOSING), false);
  assert.equal(hasActiveConnectionAttempt(WS_STATE.CLOSED), false);
  assert.equal(hasActiveConnectionAttempt(null), false);
});

test("one disconnected start request progresses through connect, wait, then start", () => {
  assert.equal(getStreamingStartAction(null), "connect");
  assert.equal(getStreamingStartAction(WS_STATE.CONNECTING), "wait");
  assert.equal(getStreamingStartAction(WS_STATE.OPEN), "start");
});

test("starts immediately only for an open socket", () => {
  assert.equal(getStreamingStartAction(WS_STATE.OPEN), "start");
});

test("queues streaming while the socket is connecting", () => {
  assert.equal(getStreamingStartAction(WS_STATE.CONNECTING), "wait");
});

test("connects when no usable socket exists", () => {
  assert.equal(getStreamingStartAction(null), "connect");
  assert.equal(getStreamingStartAction(WS_STATE.CLOSING), "connect");
  assert.equal(getStreamingStartAction(WS_STATE.CLOSED), "connect");
});
