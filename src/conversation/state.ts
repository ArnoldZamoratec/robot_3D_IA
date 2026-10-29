export type ConversationStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "speaking"
  | "interrupted"
  | "error"
  | "disconnected";

export interface ConversationError {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface ConversationState {
  status: ConversationStatus;
  error: ConversationError | null;
}

export type ConversationEvent =
  | { type: "CONNECT" }
  | { type: "CONNECTED" }
  | { type: "USER_SPEECH_STARTED" }
  | { type: "USER_SPEECH_ENDED" }
  | { type: "RESPONSE_STARTED" }
  | { type: "RESPONSE_DONE" }
  | { type: "INTERRUPT" }
  | { type: "FAILED"; error: ConversationError }
  | { type: "DISCONNECT" }
  | { type: "RETRY" };

export const initialConversationState: ConversationState = { status: "idle", error: null };

type Transitions = Partial<Record<ConversationEvent["type"], ConversationStatus>>;

// Explicit transition table: anything not listed is ignored, so stale provider events
// (e.g. a late RESPONSE_DONE after DISCONNECT) cannot corrupt the state.
const transitions: Record<ConversationStatus, Transitions> = {
  idle: { CONNECT: "connecting" },
  connecting: { CONNECTED: "listening", DISCONNECT: "disconnected" },
  listening: {
    USER_SPEECH_ENDED: "processing",
    RESPONSE_STARTED: "speaking",
    DISCONNECT: "disconnected",
  },
  processing: {
    RESPONSE_STARTED: "speaking",
    RESPONSE_DONE: "listening",
    USER_SPEECH_STARTED: "listening",
    DISCONNECT: "disconnected",
  },
  speaking: {
    RESPONSE_DONE: "listening",
    USER_SPEECH_STARTED: "interrupted",
    INTERRUPT: "interrupted",
    DISCONNECT: "disconnected",
  },
  interrupted: {
    USER_SPEECH_ENDED: "processing",
    RESPONSE_STARTED: "speaking",
    RESPONSE_DONE: "listening",
    DISCONNECT: "disconnected",
  },
  error: { RETRY: "connecting", DISCONNECT: "disconnected" },
  disconnected: { CONNECT: "connecting" },
};

const failableStatuses: ReadonlySet<ConversationStatus> = new Set([
  "connecting",
  "listening",
  "processing",
  "speaking",
  "interrupted",
]);

export function conversationReducer(
  state: ConversationState,
  event: ConversationEvent,
): ConversationState {
  if (event.type === "FAILED") {
    return failableStatuses.has(state.status) ? { status: "error", error: event.error } : state;
  }
  const next = transitions[state.status][event.type];
  if (!next) return state;
  return { status: next, error: null };
}

export function isSessionActive(status: ConversationStatus): boolean {
  return failableStatuses.has(status) && status !== "connecting";
}
