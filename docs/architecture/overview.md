# Architecture overview

## Runtime topology
```
Browser (React + R3F)                               Node API (Hono, server/)
┌──────────────────────────────────┐  POST /api/turn ┌──────────────────────────────────────┐
│ MicCapture (AudioWorklet + VAD)  │ ─────────────▶  │ validate, rate-limit                 │
│   utterance → PCM16 16 kHz       │   JSON {audio,  │ runTurn():                           │
│ useConversation (state machine)  │   history}      │   Riva ASR (gRPC/NVCF)  ──┐          │
│ SpeechPlayer (Web Audio) ◀───────│ ◀───────────── │   LLM chat stream (HTTPS) ─┼─▶ NVIDIA │
│   └▶ AudioLipSync → AvatarAnimator│  NDJSON stream │   Riva TTS per sentence ──┘          │
│ Avatar (placeholder or GLB)      │                 │ NVIDIA_API_KEY stays here            │
└──────────────────────────────────┘                 └──────────────────────────────────────┘
```
In development, Vite (5173) proxies `/api` to the API (8787). The browser never sees the API key
and never talks to NVIDIA directly.

## Voice turn data flow
1. `MicCapture` reads the mic through an AudioWorklet in ~20 ms frames; an energy VAD with an
   adaptive noise floor detects speech start/end. 300 ms of pre-roll is kept so word onsets are
   not clipped. Utterances are downsampled to 16 kHz PCM16.
2. The hook posts `{ audio, history }` to `/api/turn`. History (last 12 messages) lives only in
   browser memory.
3. The server runs `runTurn` (`server/turn.ts`): ASR → streamed LLM tokens → `SentenceChunker`
   → TTS per sentence, chained so audio is emitted in order while the LLM keeps generating.
4. The response is NDJSON: `transcript`, `sentence`, `audio` (base64 PCM16), `done` / `error`.
5. `SpeechPlayer` schedules chunks gaplessly on a Web Audio `GainNode`; `AudioLipSync` taps that
   node, so the mouth follows exactly what is heard.
6. Barge-in: VAD speech start while speaking/processing aborts the fetch (the server stops the
   LLM and TTS via the request's abort signal) and stops playback. The VAD threshold is raised
   ×2.5 while the avatar speaks to reduce self-interruption from speaker echo.

Measured live (2026-10-28, local dev, Spanish): ASR ≈ 0.6–1.0 s, first LLM sentence ≈ +0.8 s,
first audio ≈ 3.2 s after the end of the user's utterance.

## Modules
| # | Module | Location |
|---|---|---|
| 1 | Avatar rendering & loading | `src/avatar/AvatarStage.tsx`, `GltfAvatar.tsx`, `PlaceholderAvatar.tsx` |
| 2 | Rig & animation control | `src/avatar/animator.ts`, `idleMotion.ts` |
| 3 | Face channels & lip sync | `src/avatar/faceRig.ts`, `lipSync.ts` |
| 4 | Mic capture & playback | `src/audio/micCapture.ts`, `vad.ts`, `pcm.ts`, `speechPlayer.ts`, `public/capture-worklet.js` |
| 5 | AI pipeline & transport | `server/turn.ts`, `llm.ts`, `text.ts`, `riva/client.ts`; `src/conversation/turnClient.ts` |
| 6 | Conversation state & interruption | `src/conversation/state.ts`, `useConversation.ts` |
| 7 | UI & accessibility | `src/App.tsx`, `src/ui/*` (status, captions, mic indicator) |
| 8 | Credentials & config | `server/config.ts`, `server/index.ts` |
| 9 | Memory/persistence | none (in-memory history only) |
| 10 | Errors, logging, tests | `ErrorBoundary` (app + avatar), Vitest, Playwright |

Provider coupling is confined to `server/index.ts` (wiring), `server/llm.ts`, and
`server/riva/`. `runTurn` depends only on the `TurnDeps` interface, so another ASR/LLM/TTS can
be swapped in without touching the browser.

## Animation data flow
```
BlinkController ─┐
AudioLipSync ────┼─▶ AvatarAnimator.update(dt) ─▶ AvatarPose { face, head, gaze }
manual sliders ──┘     composeFace(): additive,          │
idleHeadMotion ───────▶ clamped to [0,1]                  ▼
                                    PlaceholderAvatar  or  GltfAvatar (morph targets by ARKit
                                    (direct transforms)    name; head bone or whole-model pivot)
```

## Conversation state machine
`idle → connecting → listening → processing → speaking → listening …`, with `interrupted`
(barge-in or button), `error` (`RETRY` → `connecting`) and `disconnected`. Transitions are a
static table; invalid events are ignored. See `src/conversation/state.ts`.
