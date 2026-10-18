export type ChatSseEvent =
  | { kind: "token"; token: string }
  | { kind: "done" }
  | { kind: "error"; error: string }
  | { kind: "malformed"; raw: string }
  | { kind: "ignore" };

export function parseChatSseLine(line: string): ChatSseEvent {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return { kind: "ignore" };

  const payload = trimmed.slice(5).trimStart();
  if (!payload) return { kind: "ignore" };

  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    return { kind: "malformed", raw: payload };
  }

  if (!data || typeof data !== "object") return { kind: "ignore" };
  const event = data as Record<string, unknown>;

  if (typeof event.error === "string" && event.error.trim()) {
    return { kind: "error", error: event.error.trim() };
  }
  if (event.done === true) return { kind: "done" };
  if (typeof event.token === "string" && event.token.length > 0) {
    return { kind: "token", token: event.token };
  }

  return { kind: "ignore" };
}
