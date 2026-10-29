import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { MicCapture } from "../audio/micCapture.ts";
import { bytesToBase64 } from "../audio/pcm.ts";
import { SpeechPlayer } from "../audio/speechPlayer.ts";
import { conversationReducer, initialConversationState, type ConversationError } from "./state.ts";
import { streamTurn, TurnError, type ChatMessage } from "./turnClient.ts";

const MAX_HISTORY = 12;
// While the avatar speaks, require louder input to count as barge-in (speaker echo protection).
const SPEAKING_SENSITIVITY = 2.5;

export interface Captions {
  user: string;
  assistant: string;
}

export interface SpeechOutput {
  context: AudioContext;
  node: AudioNode;
}

function micError(e: unknown): ConversationError {
  const name = (e as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      code: "mic_denied",
      message: "Microphone access was denied. Allow it in the browser's site settings, then retry.",
      recoverable: true,
    };
  }
  if (name === "NotFoundError") {
    return { code: "mic_missing", message: "No microphone was found. Connect one and retry.", recoverable: true };
  }
  return { code: "mic_error", message: `Could not open the microphone (${name ?? "unknown error"}).`, recoverable: true };
}

async function checkServer(signal: AbortSignal): Promise<ConversationError | null> {
  try {
    const res = await fetch("/api/health", { signal });
    const body = (await res.json()) as { voiceConfigured?: boolean };
    if (!body.voiceConfigured) {
      return { code: "voice_not_configured", message: "The server has no AI provider key configured.", recoverable: true };
    }
    return null;
  } catch {
    return { code: "network", message: "Cannot reach the server.", recoverable: true };
  }
}

/**
 * Voice conversation lifecycle. The microphone opens only from `start()` (a user click);
 * utterances detected by the VAD are sent to /api/turn; streamed reply audio is played and
 * exposed for lip sync. User speech during playback interrupts it (barge-in).
 */
export function useConversation() {
  const [state, dispatch] = useReducer(conversationReducer, initialConversationState);
  const [micActive, setMicActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [captions, setCaptions] = useState<Captions>({ user: "", assistant: "" });
  const [speechOutput, setSpeechOutput] = useState<SpeechOutput | null>(null);

  const ctx = useRef<AudioContext | null>(null);
  const mic = useRef<MicCapture | null>(null);
  const player = useRef<SpeechPlayer | null>(null);
  const session = useRef<AbortController | null>(null);
  const turn = useRef<AbortController | null>(null);
  const turnComplete = useRef(false);
  const history = useRef<ChatMessage[]>([]);
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  const cancelTurn = useCallback(() => {
    turn.current?.abort();
    turn.current = null;
    player.current?.stop();
    if (mic.current) mic.current.sensitivity = 1;
  }, []);

  const teardown = useCallback(() => {
    cancelTurn();
    session.current?.abort();
    session.current = null;
    mic.current?.stop();
    mic.current = null;
    player.current?.dispose();
    player.current = null;
    setMicActive(false);
    setMicLevel(0);
    setSpeechOutput(null);
  }, [cancelTurn]);

  const fail = useCallback(
    (error: ConversationError) => {
      teardown();
      dispatch({ type: "FAILED", error });
    },
    [teardown],
  );

  const remember = (user: string, assistant: string) => {
    if (!user) return;
    history.current = [...history.current, { role: "user" as const, content: user }];
    if (assistant) history.current.push({ role: "assistant", content: assistant });
    history.current = history.current.slice(-MAX_HISTORY);
  };

  const runTurn = useCallback(
    async (pcm: Int16Array) => {
      cancelTurn();
      const controller = new AbortController();
      turn.current = controller;
      turnComplete.current = false;
      let transcript = "";
      let reply = "";
      setCaptions({ user: "…", assistant: "" });
      try {
        const audio = bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
        for await (const event of streamTurn(audio, history.current, controller.signal)) {
          if (controller.signal.aborted) return;
          switch (event.type) {
            case "transcript":
              transcript = event.text;
              setCaptions({ user: transcript, assistant: "" });
              break;
            case "sentence":
              reply = reply ? `${reply} ${event.text}` : event.text;
              setCaptions((c) => ({ ...c, assistant: reply }));
              break;
            case "audio":
              player.current?.enqueue(event.pcm, event.sampleRate);
              break;
            case "done":
              turnComplete.current = true;
              remember(transcript, event.reply);
              if (!player.current?.playing) dispatch({ type: "RESPONSE_DONE" });
              break;
            case "error":
              throw new TurnError({ code: event.code, message: event.message, recoverable: true });
          }
        }
      } catch (e) {
        if (controller.signal.aborted) {
          // Interrupted: keep what was said so far so the model knows it was cut off.
          remember(transcript, reply && `${reply} [interrupted]`);
          return;
        }
        fail(
          e instanceof TurnError
            ? e.detail
            : { code: "network", message: `Request failed: ${(e as Error).message}`, recoverable: true },
        );
      }
    },
    [cancelTurn, fail],
  );

  const start = useCallback(async () => {
    teardown();
    const controller = new AbortController();
    session.current = controller;
    const { signal } = controller;
    dispatch({ type: statusRef.current === "error" ? "RETRY" : "CONNECT" });

    // Created inside the click handler so autoplay policies allow audio output.
    if (!ctx.current || ctx.current.state === "closed") ctx.current = new AudioContext();
    const context = ctx.current;
    void context.resume();

    const serverProblem = await checkServer(signal);
    if (signal.aborted) return;
    if (serverProblem) return fail(serverProblem);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      if (!signal.aborted) fail(micError(e));
      return;
    }
    if (signal.aborted) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const speech = new SpeechPlayer(context);
    speech.onStart = () => {
      if (mic.current) mic.current.sensitivity = SPEAKING_SENSITIVITY;
      dispatch({ type: "RESPONSE_STARTED" });
    };
    speech.onIdle = () => {
      if (mic.current) mic.current.sensitivity = 1;
      if (turnComplete.current) dispatch({ type: "RESPONSE_DONE" });
    };
    player.current = speech;

    try {
      mic.current = await MicCapture.start(context, stream, {
        onSpeechStart: () => {
          const status = statusRef.current;
          if (status === "speaking" || status === "processing") cancelTurn(); // barge-in
          dispatch({ type: "USER_SPEECH_STARTED" });
        },
        onUtterance: (pcm) => {
          dispatch({ type: "USER_SPEECH_ENDED" });
          void runTurn(pcm);
        },
        onLevel: setMicLevel,
      });
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      if (!signal.aborted) fail({ code: "audio_init", message: `Audio setup failed: ${(e as Error).message}`, recoverable: true });
      return;
    }
    if (signal.aborted) return teardown();

    setMicActive(true);
    setSpeechOutput({ context, node: speech.output });
    dispatch({ type: "CONNECTED" });
  }, [teardown, fail, cancelTurn, runTurn]);

  const stop = useCallback(() => {
    teardown();
    dispatch({ type: "DISCONNECT" });
  }, [teardown]);

  const interrupt = useCallback(() => {
    cancelTurn();
    dispatch({ type: "INTERRUPT" });
    dispatch({ type: "RESPONSE_DONE" });
  }, [cancelTurn]);

  const clearHistory = useCallback(() => {
    history.current = [];
    setCaptions({ user: "", assistant: "" });
  }, []);

  useEffect(
    () => () => {
      teardown();
      void ctx.current?.close();
      ctx.current = null; // StrictMode remounts: recreate instead of reusing a closed context
    },
    [teardown],
  );

  return { state, start, stop, interrupt, clearHistory, micActive, micLevel, captions, speechOutput };
}
