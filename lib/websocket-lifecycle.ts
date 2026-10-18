export const WS_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

export type StreamingStartAction = "start" | "wait" | "connect";

export function hasActiveConnectionAttempt(
  readyState: number | null | undefined,
): boolean {
  return readyState === WS_STATE.CONNECTING || readyState === WS_STATE.OPEN;
}

export function getStreamingStartAction(
  readyState: number | null | undefined,
): StreamingStartAction {
  if (readyState === WS_STATE.OPEN) return "start";
  if (readyState === WS_STATE.CONNECTING) return "wait";
  return "connect";
}
