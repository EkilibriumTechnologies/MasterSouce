# Native Song Generation (Lyria 3 Pro)

MasterSauce can generate complete songs inside a Song Journey for **Pro Studio** users while preserving the existing Suno export workflow.

## Production prerequisites

1. Create or select a Google Cloud project with billing enabled.
2. Enable the Vertex AI API (`aiplatform.googleapis.com`).
3. Create a service account for MasterSauce and grant it **Vertex AI User** (`roles/aiplatform.user`).
4. Create a JSON key for that service account.
5. In Supabase Storage, create a **private** bucket named `generated-songs`.
6. Configure the runtime environment variables below.
7. Set `NATIVE_MUSIC_GENERATION_ENABLED=true` only after the provider and bucket are ready.

## PowerShell: convert the service-account JSON to one-line Base64

```powershell
$path = "C:\path\to\mastersauce-lyria-service-account.json"
$bytes = [System.IO.File]::ReadAllBytes($path)
[Convert]::ToBase64String($bytes)
```

Copy the single Base64 line into `GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON_BASE64`. Do not commit the JSON key or Base64 value to Git.

## Runtime variables

```text
NATIVE_MUSIC_GENERATION_ENABLED=true
GOOGLE_CLOUD_PROJECT_ID=<your-google-cloud-project-id>
GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON_BASE64=<base64-service-account-json>
GOOGLE_LYRIA_MODEL=lyria-3-pro-preview
GOOGLE_LYRIA_TIMEOUT_MS=210000
MASTERSAUCE_GENERATED_AUDIO_BUCKET=generated-songs
```

Optional owner/comp testing without a paid Stripe subscription:

```text
NATIVE_MUSIC_GENERATION_ALLOWLIST=owner@example.com
```

This allowlist affects only native music generation. It does not change Stripe billing or the user's plan elsewhere.

## Product behavior

- Free: no native song generation.
- Creator ($9): keeps Song Architect + Suno export; no native song generation.
- Pro Studio ($24): 20 native full-song generations per month.
- Native usage is counted from persisted `project_generations` rows with `source = 'lyria'`.
- Generated audio is stored in the private Supabase bucket.
- Playback requires an authenticated Project owner and redirects to a short-lived signed Storage URL.
- Suno remains available even if Lyria is disabled or temporarily unavailable.

## Rollback

Set:

```text
NATIVE_MUSIC_GENERATION_ENABLED=false
```

The rest of MasterSauce and the Suno workflow continue to operate.
