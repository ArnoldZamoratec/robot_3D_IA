# Architecture decisions

Each entry: context → decision → trade-offs. Status is `accepted` or `proposed`.

## ADR-001 Frontend stack: React + TypeScript + Vite + React Three Fiber — accepted
- **Context:** need a 3D scene with UI overlays, loading states, and per-frame animation.
- **Decision:** React 19, Vite 8, `@react-three/fiber` 9 + `@react-three/drei` 10 on three 0.186.
- **Trade-offs:** R3F adds a thin layer over Three.js but gives declarative scene composition,
  Suspense-based loading, and `useFrame`. Bundle is ~1.2 MB minified (343 kB gzip) — code
  splitting is deferred to M5.

## ADR-002 Backend: single Hono server on Node — accepted
- **Context:** the only server responsibilities are credential custody and minting short-lived
  session credentials; no database is needed for the MVP.
- **Decision:** Hono + `@hono/node-server`, run with `tsx`. Vite proxies `/api` in dev.
- **Trade-offs:** small, typed, testable via `app.request()` without opening a port. Hono also
  runs on edge runtimes if deployment requires it later.

## ADR-003 Face rig vocabulary: ARKit blendshape names — accepted
- **Context:** avatars come from different pipelines; lip sync and expression sources vary.
- **Decision:** all face animation is expressed as ARKit-named channels, combined as additive
  layers clamped to [0, 1] in `AvatarAnimator`, then bound by name to GLB morph targets.
- **Trade-offs:** models without ARKit names need renaming (e.g. in Blender). Viseme-only rigs
  (e.g. Oculus `viseme_*`) would need a mapping layer; not built until needed.

## ADR-004 Placeholder avatar until a licensed asset exists — accepted
- **Context:** no licensed, rigged, realistic human model is available in the repository.
- **Decision:** ship a procedural stylised bust, clearly labelled in the UI, that implements the
  same face channels. GLB loading is supported via `VITE_AVATAR_URL` with fallback to the
  placeholder on failure.
- **Trade-offs:** the placeholder is not realistic. It lets M2–M4 be built and tested end-to-end
  now. The GLB path is unit-tested for morph binding but has **not** been exercised with a real
  avatar file yet.

## ADR-005 Explicit conversation state machine — accepted
- **Decision:** a pure reducer with a static transition table (`src/conversation/state.ts`).
- **Trade-offs:** slightly more ceremony than ad-hoc booleans; in exchange, interruptions, late
  events, and retries are deterministic and unit-tested.

## ADR-006 Voice AI strategy — proposed (pending provider choice and doc verification)
Two strategies were compared:

| | A. Minimal: managed realtime speech-to-speech | B. Advanced: modular STT → LLM → TTS |
|---|---|---|
| Pieces | One provider realtime API (e.g. over WebRTC) | Streaming STT + LLM + streaming TTS with timing data |
| Latency | Lowest (single hop, provider-side VAD) | Higher; three streaming hops to tune |
| Interruption | Built into provider turn detection | Must be orchestrated ourselves |
| Lip sync input | Output audio stream only → audio-analysis visemes | TTS can return word/phoneme timings → better visemes |
| Integration cost | Low: one adapter, one credential | High: three vendors, three failure modes |
| Flexibility | Bound to provider's models/voices | Swap each stage independently (e.g. Claude as LLM) |

**Superseded by ADR-008.** A was the initial recommendation (an OpenAI Realtime WebRTC adapter
was drafted against the current docs), but the project owner supplied an NVIDIA API key, which
does not give access to a speech-to-speech API. The OpenAI draft was removed rather than kept as
an unused second transport.

## ADR-008 Voice pipeline on NVIDIA-hosted services (strategy B) — accepted
- **Decision:** server-orchestrated pipeline per turn: Riva ASR (Parakeet 1.1B RNNT
  multilingual) → OpenAI-compatible chat completions (`nvidia/nemotron-3.5-lightning-30b-a3b`,
  thinking disabled) → Riva TTS (Magpie TTS Multilingual, `ES-US.Isabela`), streamed to the
  browser as NDJSON. TTS runs per sentence while the LLM is still generating.
- **Verification (2026-10-28):** NVCF function IDs listed as ACTIVE through
  `api.nvcf.nvidia.com/v2/nvcf/functions`; a live TTS→ASR round trip and a full `/api/turn`
  call succeeded with the project key; `meta/llama-3.3-70b-instruct` returned 410 (end of life)
  and `nemotron-3-super-120b` / `nemotron-nano-3` returned 404 for this account.
- **Transport:** HTTP + NDJSON instead of WebRTC/WebSocket: one request per turn, abortable by
  the client for barge-in, trivially testable with `app.request()`. The cost is the client-side
  VAD and per-turn latency (~3 s to first audio measured), versus a realtime S2S API.
- **Riva over gRPC:** `@grpc/grpc-js` + `@grpc/proto-loader` (Apache-2.0) with the official
  protos vendored from `nvidia-riva/common` (MIT) in `server/riva/protos/`.
- **Lip sync:** audio-feature heuristic (RMS + spectral balance → jaw/funnel/smile) on the
  playback node. Not phoneme-level. Upgrade paths: Riva TTS phoneme/word timings, or NVIDIA
  Audio2Face-3D to generate ARKit blendshapes from the TTS audio.
- **Latency upgrades not yet done:** streaming ASR (`StreamingRecognize`), streaming TTS
  (`SynthesizeOnline`), sending audio while the user is still speaking.

## ADR-009 Realistic avatar asset — accepted (interim)
- **Context:** the owner wants a photoreal head like a Ten24 Sketchfab scan. That model is not
  downloadable and is a static scan (no rig, no blendshapes, no animations, per the Sketchfab
  API), so it cannot speak as-is.
- **Decision:** support any GLB with ARKit blendshapes (case-insensitive, `_L`/`_R` accepted),
  meshopt + KTX2 compression, and head-only models (auto-framing, whole-model head rotation).
  For local development, `npm run setup:avatar` downloads the three.js `facecap.glb` sample
  (52 ARKit blendshapes) into git-ignored `public/models/`; its licence is unstated, so it must
  not ship publicly.
- **Production path (owner action):** obtain a licensed realistic head with ARKit blendshapes
  (e.g. a scan that is retopologised and given FACS/ARKit shape keys, or an avatar-creation
  tool that exports ARKit blendshapes) and point `VITE_AVATAR_URL` at it.

## ADR-007 Tooling — accepted
- Vitest for unit tests; Playwright with the locally installed Chrome (`channel: "chrome"`)
  for browser tests (SwiftShader flags make WebGL work headless).
- No ESLint yet: strict `tsc` covers most issues; a linter will be added if the team grows or
  rules beyond type checking are needed.
- Dependencies installed with `npm install --before=<date>` to avoid packages published in the
  last two weeks (supply-chain hygiene). `npm audit`: 0 known vulnerabilities at M1.
