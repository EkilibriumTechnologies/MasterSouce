# MasterSouce (Next.js + FFmpeg)

MasterSouce is an affordable, simple, smart automatic mastering web app for independent musicians and AI music creators.

This MVP is intentionally **not** a DAW or pro mastering suite. It prioritizes:
- simplicity
- speed
- above-average output quality
- clean UX
- affordable product direction

## A) Proposed Project Structure

```txt
app/
  api/
    master/route.ts
    capture-email/route.ts
    download/route.ts
  layout.tsx
  page.tsx
components/
  upload-form.tsx
  audio-compare.tsx
  email-capture-form.tsx
lib/
  audio/
    analyze-track.ts
    mastering-pipeline.ts
  email/
    capture-email.ts
  storage/
    temp-files.ts
  genre-presets.ts
.env.example
next.config.js
tsconfig.json
package.json
README.md
```

## B) Architecture Decisions (Brief)

- **Next.js App Router + TypeScript:** modern full-stack baseline with server routes for processing.
- **Server-side FFmpeg processing:** keeps DSP hidden and simple for users (no client-side complexity).
- **Hybrid engine design:** genre preset foundation + adaptive analysis modifiers.
- **Temp storage abstraction:** local temp files now, clean migration path to S3/GCS later.
- **Email gate abstraction:** lead capture now via in-memory service, easy swap to DB/CRM later.
- **Subscription-ready layout:** API boundaries are modular for future Firebase Auth + Stripe integration.

## C) MVP Mastering Pipeline

1. Validate upload (type/size)
2. Save temp input
3. Run analysis:
   - approximate LUFS
   - peak estimate
   - low-end / low-mid / harshness / air tendency
   - already-limited heuristic
4. Build chain:
   - preset EQ/compression/saturation profile
   - adaptive modifiers from analysis
   - gain push toward loudness mode target
   - limiter and ceiling control
5. Render mastered WAV
6. Generate 30-second before/after MP3 previews
7. Return preview URLs + gated final download state
8. Capture email to unlock final download
9. Serve final file from download endpoint
10. Cleanup expired temp files on requests

## D) Approximate vs Studio-Grade Behavior

This MVP intentionally uses practical FFmpeg heuristics:
- LUFS and tonal detection are **approximate** from FFmpeg logs, not full mastering-grade metering.
- Adaptive EQ and dynamics are **rule-based heuristics**, not AI model-driven perceptual mastering.
- Limiter behavior is conservative and tuned for speed/reliability, not elite studio transparency.

What this delivers now:
- reliably better loudness balance for many creator tracks
- fast turnaround
- low-friction UX

What it is not yet:
- replacement for high-end human mastering
- deep manual control chain
- true-peak oversampled mastering workflow

## Legal / Safety Positioning

- Users are responsible for having rights to uploaded content.
- This app is a processing tool and does not assume ownership of user music.
- No feature is designed or marketed for bypassing platform detection systems.
- Any metadata handling should be framed as cleanup/privacy/export normalization only.

## Run Locally

1. Install dependencies:
   - `npm install`
2. Configure ffmpeg binary path in `.env.local`:
   - Windows local dev can use an absolute path, for example:
     - `FFMPEG_BIN=C:\Users\...\ffmpeg.exe`
3. Verify ffmpeg:
   - `ffmpeg -version`
4. Start:
   - `npm run dev`
5. Open:
   - [http://localhost:3000](http://localhost:3000)

## Netlify FFmpeg Configuration

- The app resolves ffmpeg in this order:
  1. `FFMPEG_BIN` (except Windows-style paths on Netlify)
  2. bundled `ffmpeg-static` binary
  3. `/usr/bin/ffmpeg` on Linux environments
  4. `ffmpeg` from PATH
- On Netlify, do **not** set a Windows path for `FFMPEG_BIN`.
- Recommended Netlify setup:
  - leave `FFMPEG_BIN` unset to use packaged ffmpeg
  - or set `FFMPEG_BIN=/usr/bin/ffmpeg` only if your build/runtime image guarantees it

## Internal FFmpeg Runtime Diagnostics

- Internal endpoint: `GET /api/internal/ffmpeg-runtime`
- Protection:
  - set `INTERNAL_DIAGNOSTICS_TOKEN` in environment
  - send `x-internal-token: <token>` header (or `?token=<token>` query param)
  - if token is missing/invalid, endpoint returns `404`
- Response includes:
  - resolved ffmpeg path
  - whether absolute path exists (if absolute path is used)
  - whether `ffmpeg -version` succeeded
  - truncated `ffmpeg -version` output for diagnostics
  - runtime platform info (`platform`, `netlify`, `node`)

### Local test

1. Set `.env.local`:
   - `FFMPEG_BIN=<your windows ffmpeg.exe path>`
   - `INTERNAL_DIAGNOSTICS_TOKEN=<any strong random token>`
2. Run:
   - `npm run dev`
3. Call:
   - `curl -H "x-internal-token: <token>" http://localhost:3000/api/internal/ffmpeg-runtime`
4. Confirm:
   - `ok: true`
   - `ffmpeg.versionCommandOk: true`
   - `ffmpeg.resolvedPath` matches expected local path

### Netlify test

1. In Netlify env vars:
   - set `INTERNAL_DIAGNOSTICS_TOKEN=<strong random token>`
   - leave `FFMPEG_BIN` unset (recommended), or set Linux-safe value
2. After deploy, call:
   - `curl -H "x-internal-token: <token>" https://<your-site>/api/internal/ffmpeg-runtime`
3. Confirm runtime availability:
   - `runtime.netlify: true`
   - `ok: true`
   - `ffmpeg.versionCommandOk: true`
   - `ffmpeg.resolvedPath` is Linux-compatible (not Windows path)

## Notes

- Current persistence is in-memory for leads and temp-file references; restarting the server resets it.
- Free usage limits are not enforced yet, but architecture allows adding per-user quota checks.
- This is the first batch scaffold only; auth/subscriptions/history/queues come in later phases.
