# Security and privacy

## Credentials
- `NVIDIA_API_KEY` is read only by the server (`server/config.ts`) from the environment or a
  local `.env` (git-ignored). `.env.example` holds placeholders only.
- Anything prefixed `VITE_` is compiled into the public bundle. Never put secrets there.
- The browser never contacts NVIDIA; all provider calls go through `/api/turn`.
- `/api/health` reports only whether voice is configured (tested). Provider error details are
  logged server-side and replaced by generic messages in responses (tested).
- Verified 2026-10-28: the key string does not occur in `dist/` or any tracked file.
- A key that has been pasted into chats, tickets, or screenshots should be rotated at
  build.nvidia.com before any shared or public deployment.

## Abuse controls
- `/api/turn`: per-IP fixed-window rate limit (`TURN_RATE_LIMIT`, default 30/min), request body
  limit (~30 s of audio), history validation (≤ 12 messages, ≤ 2000 chars, user/assistant only).
- The limiter is in-memory and per-process; behind a reverse proxy every client shares one IP.
  A public deployment needs authentication and a shared limiter keyed on the real client.

## Microphone and audio
- The microphone opens only after the user clicks **Start conversation**; a red "Mic on"
  indicator with a level meter is shown while it is live; **End conversation**, errors, and
  page unload stop all tracks.
- Audio is captured only to detect and send the user's utterances; it is not stored by this
  application (server processes it in memory).
- Third-party processing: utterance audio and transcripts are sent to NVIDIA-hosted services
  (Riva ASR/TTS via NVCF, LLM via integrate.api.nvidia.com). The UI states this.
  NVIDIA's API terms and data-retention policy apply.

## Personal data
- No accounts, analytics, or persistent storage. Conversation history is kept in browser memory
  only (last 12 messages) and is sent with each turn so the model has context.
- No identity impersonation: avatars and voices must not imitate real people without consent.

## Assets and dependencies
- `facecap.glb` (demo head) has no stated licence: local development only, git-ignored.
- Vendored Riva protos: MIT (nvidia-riva/common). gRPC packages: Apache-2.0.
- Install with `npm install --before=<date ≥14 days ago>`, then `npm audit` (0 vulnerabilities
  on 2026-10-28).

## Deployment checklist (M6)
- [ ] HTTPS only (required for `getUserMedia` outside localhost).
- [ ] Content-Security-Policy restricting `connect-src` to self.
- [ ] Authentication and shared rate limiting on `/api/turn`.
- [ ] Secrets from the host's secret manager; rotated key.
- [ ] Re-scan the built bundle for secrets.
- [ ] Licensed avatar asset.
