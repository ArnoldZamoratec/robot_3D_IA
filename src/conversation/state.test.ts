import { describe, expect, it } from "vitest";
import {
  conversationReducer as reduce,
  initialConversationState,
  type ConversationEvent,
  type ConversationState,
} from "./state.ts";

const run = (events: ConversationEvent[], from: ConversationState = initialConversationState) =>
  events.reduce(reduce, from);

const err = { code: "network", message: "lost", recoverable: true };

describe("conversationReducer", () => {
  it("follows a full happy-path turn", () => {
    const s = run([
      { type: "CONNECT" },
      { type: "CONNECTED" },
      { type: "USER_SPEECH_STARTED" },
      { type: "USER_SPEECH_ENDED" },
      { type: "RESPONSE_STARTED" },
      { type: "RESPONSE_DONE" },
    ]);
    expect(s).toEqual({ status: "listening", error: null });
  });

  it("moves to interrupted when the user barges in while speaking", () => {
    const speaking = run([{ type: "CONNECT" }, { type: "CONNECTED" }, { type: "RESPONSE_STARTED" }]);
    expect(reduce(speaking, { type: "USER_SPEECH_STARTED" }).status).toBe("interrupted");
    expect(reduce(speaking, { type: "INTERRUPT" }).status).toBe("interrupted");
    expect(run([{ type: "INTERRUPT" }, { type: "USER_SPEECH_ENDED" }], speaking).status).toBe("processing");
  });

  it("records errors from active states and recovers via RETRY", () => {
    const failed = run([{ type: "CONNECT" }, { type: "FAILED", error: err }]);
    expect(failed).toEqual({ status: "error", error: err });
    expect(reduce(failed, { type: "RETRY" })).toEqual({ status: "connecting", error: null });
  });

  it("ignores events that are invalid for the current state", () => {
    expect(reduce(initialConversationState, { type: "RESPONSE_DONE" })).toBe(initialConversationState);
    expect(reduce(initialConversationState, { type: "FAILED", error: err })).toBe(initialConversationState);
    const disconnected = run([{ type: "CONNECT" }, { type: "DISCONNECT" }]);
    expect(disconnected.status).toBe("disconnected");
    expect(reduce(disconnected, { type: "RESPONSE_STARTED" })).toBe(disconnected);
  });

  it("can reconnect after disconnecting", () => {
    const s = run([{ type: "CONNECT" }, { type: "DISCONNECT" }, { type: "CONNECT" }, { type: "CONNECTED" }]);
    expect(s.status).toBe("listening");
  });
});
