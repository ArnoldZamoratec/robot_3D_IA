# Human AI 3D — project instructions

Browser-based conversational digital human: React + TypeScript + Vite + React Three Fiber
frontend, Hono (Node) backend. Voice pipeline: NVIDIA Riva ASR → Nemotron LLM → Riva TTS,
orchestrated server-side in `server/turn.ts` and streamed to the browser as NDJSON. See `docs/architecture/overview.md` and `docs/roadmap.md`.

## Communication
- Explain decisions and progress to the user in Spanish. Code, identifiers, comments, docs: English.

## Commands
- `npm run dev` — web (5173) + API (8787); Vite proxies `/api` to the API.
- `npm run typecheck` — `tsc -b` over app, server, and e2e projects.
- `npm test` — Vitest unit tests (`src/**/*.test.ts`, `server/**/*.test.ts`).
- `npm run test:e2e` — Playwright against the locally installed Chrome (`channel: "chrome"`); starts the dev server if needed.
  `E2E_LIVE=1` adds the live voice test (real NVIDIA calls, fake-mic WAV fixture).
- `npm run setup:avatar` — KTX2 transcoder + demo head into git-ignored `public/`.
- `npm run build` — typecheck + production bundle.
Run typecheck, unit tests, and e2e before reporting a milestone as done.

## Conventions
- Strict TypeScript; relative imports include the `.ts`/`.tsx` extension.
- Face animation uses ARKit blendshape names (`src/avatar/faceRig.ts`). New face sources are
  additional layers on `AvatarAnimator` — never write morph targets directly from other modules.
- Per-frame state lives in mutable objects read inside `useFrame`; do not put per-frame values in React state.
- Conversation status changes only through `conversationReducer` events (`src/conversation/state.ts`).
- Provider code lives in `server/llm.ts`, `server/riva/`, wired in `server/index.ts`; `runTurn` only sees `TurnDeps`.
- Verify NVIDIA model IDs / NVCF function IDs live before changing them (models get retired: 410/404).
- E2E tests open `/?avatar=placeholder` so they do not depend on the configured avatar.
- Install npm packages with `--before=<date ≥14 days ago>` and run `npm audit` afterwards.

## Security
- Provider API keys live only in server env (`.env`, never committed). `VITE_*` vars are public.
- The browser never calls the AI provider; everything goes through `/api/turn`.
- Microphone is requested only after an explicit user action, with a visible indicator.

## Honesty rules
- The placeholder is stylised; the facecap demo head is unlicensed for distribution. Neither is a production avatar.
- Amplitude-driven mouth movement must be labelled as a fallback, not as phoneme lip sync.
- Never report a feature as working without running it.
