import type { ConversationStatus } from "../conversation/state.ts";

const LABELS: Record<ConversationStatus, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  listening: "Listening",
  processing: "Thinking…",
  speaking: "Speaking",
  interrupted: "Interrupted",
  error: "Error",
  disconnected: "Disconnected",
};

export function StatusPill({ status }: { status: ConversationStatus }) {
  return (
    <div className="status-pill" data-status={status} role="status" aria-live="polite" data-testid="status">
      <span className="status-dot" aria-hidden="true" />
      {LABELS[status]}
    </div>
  );
}
