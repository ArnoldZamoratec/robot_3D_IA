# Human AI 3D

A browser-based conversational digital human: a 3D avatar that listens through your
microphone, answers with an AI voice, and moves its mouth with the audio it plays.

**Status:** M1 and M2 complete; M3 has a heuristic lip-sync implementation (not phoneme-level).
Speech recognition, the language model, and speech synthesis run on NVIDIA-hosted services.
See [docs/roadmap.md](docs/roadmap.md).

## Requirements
- Node.js ≥ 20.19 (developed on Node 24, npm 11)
- A WebGL-capable browser with a microphone (Chrome recommended)
- An NVIDIA API key from build.nvidia.com
- Google Chrome installed locally for the e2e tests

## Setup
```bash
npm install
cp .env.example .env        # set NVIDIA_API_KEY
npm run setup:avatar        # optional: demo realistic head (see licence note below)
#   then set VITE_AVATAR_URL=/models/facecap.glb in .env
npm run dev                 # http://localhost:5173 (web) + http://localhost:8787 (API)
```
Click **Start conversation**, allow the microphone, and speak. Pause briefly to end your turn.
Speaking while the avatar talks interrupts it (works best with headphones; see limitations).

## Scripts
| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server + API server with reload |
| `npm run typecheck` | TypeScript checks for app, server, and e2e |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright + local Chrome) |
| `E2E_LIVE=1 npm run test:e2e` | Also runs the live voice test against NVIDIA (uses API quota) |
| `npm run setup:avatar` | Copies the KTX2 transcoder and downloads the demo head into `public/` (git-ignored) |
| `npm run build` | Production bundle in `dist/` |
| `npm start` | Run the API server |

## Avatars
- **Placeholder** (default): procedural stylised bust. Force it with `?avatar=placeholder`.
- **Demo realistic head**: `npm run setup:avatar` downloads the three.js `facecap.glb` sample
  (52 ARKit blendshapes, no skeleton). Its licence is not stated in the three.js repository —
  use it only for local development.
- **Your own avatar**: any GLB with ARKit-named blendshapes (`jawOpen`, `eyeBlinkLeft` or
  `eyeBlink_L`, `mouthSmileLeft`, …). Meshopt and KTX2 compression are supported. Full-body
  models should have a head bone ending in `Head`; head-only models are auto-framed. Put it in
  `public/models/` and set `VITE_AVATAR_URL`, or open `/?avatar=/models/<file>.glb`.

**Face controls** (bottom right) shows how many face channels were bound and lets you test them.

A static photogrammetry scan (for example Sketchfab head scans) cannot talk on its own: it needs
facial blendshapes or a facial rig added in a DCC tool before the mouth can move.

## Project layout
```
src/avatar/        3D stage, avatars, face rig, procedural animation, lip sync
src/audio/         microphone capture + VAD, PCM utilities, speech playback
src/conversation/  conversation state machine, turn client, lifecycle hook
src/ui/            UI components
server/            Hono API: /api/health, /api/turn (ASR → LLM → TTS pipeline)
server/riva/       NVIDIA Riva gRPC client + vendored protos (MIT, nvidia-riva/common)
e2e/               Playwright browser tests (+ fake-microphone fixture)
docs/              architecture, decisions, roadmap, security
```
