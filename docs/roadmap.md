# Roadmap

Legend: ✅ done and verified · 🟡 partially done · ⬜ not started

## M0 — Discovery and planning ✅
Repository audit, stack selection, ADRs (`docs/architecture/decisions.md`).

## M1 — 3D application shell ✅
- ✅ Runnable app, production build passes.
- ✅ Scene, lighting, constrained orbit controls, loading overlay, WebGL/GLB failure fallbacks.
- ✅ Placeholder avatar; GLB avatars (meshopt + KTX2, head-bone or head-only), verified with the
  facecap demo head: 13/13 channels bound, no page errors (e2e).
- ✅ Face rig (ARKit channels, layering, morph binding incl. `_L`/`_R` names).

## M2 — Conversational voice ✅
- ✅ NVIDIA pipeline: Riva ASR → Nemotron LLM (streamed) → Riva TTS per sentence, NDJSON stream.
- ✅ Explicit mic permission after a click, visible mic indicator + level meter, captions.
- ✅ Mic denied / missing / server not configured / provider errors shown as recoverable errors.
- ✅ Barge-in (VAD during playback aborts the request and playback) and Interrupt button.
- ✅ Deterministic teardown: mic tracks stopped, requests aborted, audio nodes released.
- ✅ Live e2e (`E2E_LIVE=1`): fake-mic Spanish question → transcript → spoken answer → back to listening.
- ⬜ Barge-in is unit-tested at the state level but not verified end-to-end with real speakers.
- ⬜ Latency: ~3 s to first audio. Next: streaming ASR/TTS.

## M3 — Facial animation 🟡
- ✅ Audio-feature lip sync on the actual playback audio (live e2e verifies the mouth opens).
- ⬜ Phoneme/viseme-accurate lip sync (Riva timings or Audio2Face-3D).

## M4 — Natural expression and movement 🟡
- ✅ Blink, idle head motion.
- ⬜ Gaze/saccades, eye bones on GLB, listening vs. speaking postures, emotion-driven expressions
  (Magpie offers emotional voice variants), gesture layer with priority rules.

## M5 — Reliability and usability 🟡
- ✅ App-level error boundary with mic release message.
- ⬜ Reconnect/backoff for transient provider errors, code splitting (bundle 1.3 MB), keyboard and
  screen-reader pass, mobile review, echo handling on speakers.

## M6 — Security, testing, deployment ⬜
CSP, auth in front of `/api/turn` for public deployments, shared rate-limit store, deployment
guide, final limitations report.

## MVP acceptance checklist
| Criterion | Status |
|---|---|
| App starts | ✅ |
| 3D avatar visible | ✅ placeholder + demo realistic head (licensed asset still needed) |
| User can explicitly enable microphone | ✅ |
| Voice interaction yields AI spoken response | ✅ live e2e |
| Mouth responds to actual speech output | ✅ heuristic (not phoneme-level) |
| Basic blinking and head movement | ✅ |
| States and recoverable errors visible | ✅ |
| User can interrupt speech | ✅ button + barge-in (barge-in not verified with real speakers) |
| No private credentials in the browser | ✅ bundle scanned; key only in server env |
| Setup, testing, limitations documented | ✅ |
