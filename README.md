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
2. Ensure FFmpeg is installed and available in PATH:
   - `ffmpeg -version`
3. Start:
   - `npm run dev`
4. Open:
   - [http://localhost:3000](http://localhost:3000)

## Notes

- Current persistence is in-memory for leads and temp-file references; restarting the server resets it.
- Free usage limits are not enforced yet, but architecture allows adding per-user quota checks.
- This is the first batch scaffold only; auth/subscriptions/history/queues come in later phases.
