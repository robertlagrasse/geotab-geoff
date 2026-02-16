# Vibe Coding Journey

How AI-assisted development built Geoff from concept to deployed platform in under 48 hours.

## The Setup

- **AI tool:** Claude Code (Claude Opus) — Anthropic's CLI agent for software engineering
- **Human:** One developer, no team, no prior Geotab API experience
- **Timeline:** February 15-16, 2026

Claude Code operates as a pair-programming agent with full filesystem access, terminal execution, and the ability to read documentation, write code, run builds, and deploy — all from natural language prompts. Every file in this repository was written through conversation with Claude.

## Day 1: Concept to Working Platform (Feb 15)

### Hour 0-1: Architecture and Foundation

The project started with a single prompt describing the vision: an AI avatar that coaches fleet drivers on safety events through voice conversations. Claude designed the full architecture — React frontend, Cloud Functions backend, Firestore for real-time data, Gemini for coaching intelligence — and scaffolded the entire project in the first session.

Key prompts in this phase:
- "Design a system where an AI coach named Geoff reviews a driver's safety events from Geotab and has a voice conversation about them"
- "Set up Firebase project structure with Cloud Functions, Firestore, and Hosting"
- "Implement Google Auth with role-based routing — drivers see coaching sessions, supervisors see a dashboard"

Claude generated the full project structure: 15 React components, 8 Cloud Functions, Firestore schema with security rules, and the complete Geotab API integration — authenticating with mg-api-js, fetching ExceptionEvents, enriching them with LogRecords and posted speed limits.

**Initial commit: 18,920 lines across 60 files.**

### Hour 1-2: Coaching Intelligence

The coaching engine went through rapid iteration. The first version generated per-event coaching — Claude pointed out this would be annoying for drivers with multiple events. We pivoted to shift-level holistic coaching:

- "Don't coach event by event. Aggregate all events for a driver's shift and look for patterns"
- "Add GPS clustering — if multiple events are within 300 meters, group them as a location pattern"
- "The coaching tone should be collaborative, not punitive. Geoff is on the driver's side"

Claude wrote the Gemini prompt engineering — the system prompt that defines Geoff's personality, the structured JSON output format, and the multi-turn conversation logic that lets drivers respond naturally.

### Hour 2-4: Lip Sync and Escalation

Two major features landed in rapid succession:

**Lip sync video generation.** The prompt: "I have a Wav2Lip container running on a local GPU. Generate lip-synced video of Geoff speaking the coaching script." Claude implemented the full pipeline — Cloud TTS generates audio, the backend sends the audio + Geoff's image to the Wav2Lip API, the resulting video URL gets passed to the frontend for playback.

**Escalation system.** "Build a three-tier escalation system. Auto-escalate on data severity (5+ events, 15+ mph over). Auto-escalate on conversation red flags (road rage, impairment, intentional violations). And let drivers request supervisor involvement." Claude designed the 7-flag evaluation system with a server-side safety net that forces escalation when flags fire, even if the model output says otherwise.

### Hour 4-5: Hardening

- "The escalation triggers are too weak — a driver can admit to intentional speeding and not get flagged. Strengthen them with explicit examples"
- "Add a processing indicator when the lipsync video is generating"

## Day 2: Polish and Integration (Feb 16)

### Demo Videos

Geoff's demo videos were generated using the platform's own pipeline — the coaching scripts were written, synthesized through Cloud TTS, and lip-synced through Wav2Lip. Geoff explains his own architecture.

### MyGeotab Add-In

The biggest Day 2 feature: embedding the supervisor dashboard directly inside MyGeotab as an Add-In.

- "Build a MyGeotab Add-In that shows the supervisor dashboard inside the Geotab portal"
- "The Add-In needs to exchange a Geotab session for a Firebase custom token so Firestore listeners work"

This was the most technically challenging integration. Claude discovered through trial and error that MyGeotab doesn't execute inline `<script>` tags, that only IIFE builds (not ES modules) work in the Add-In sandbox, and that `api.getSession(callback)` is the only reliable way to get the session from the MyGeotab host. The auth flow verifies the Geotab session server-side via direct JSONRPC, then mints a Firebase custom token.

**624 lines added across 15 files** for the Add-In integration alone.

### MCP Server

- "Build an MCP server that exposes Geotab fleet data as tools for Claude Desktop"

Claude built a 6-tool FastMCP server in Python: safety events, fleet KPIs, driver rankings, vehicle details, driver history, and Ace AI queries. This lets fleet managers have natural language conversations about their fleet data through any MCP-compatible AI assistant.

## What AI Did Well

**Architecture decisions.** Claude designed the shift-level coaching approach, the GPS clustering for location patterns, and the three-tier escalation system. These weren't in the original prompt — they emerged from iterative conversation about what would actually work for fleet operations.

**API integration.** Zero prior Geotab API experience. Claude read the SDK docs, wrote the authentication flow, mapped built-in rule IDs to human-readable names, and handled the async Ace AI query lifecycle (create chat → send prompt → poll for results).

**Cross-cutting concerns.** The MyGeotab Add-In required coordinating Vite build config, IIFE bundling, CORS headers, Firebase Auth custom tokens, Geotab session verification, and Firestore security rules — all working together. Claude held the full context and wired it up.

**Persona design.** Geoff's coaching personality — warm, data-informed, never punitive, celebrates good behavior — was refined through conversation. The escalation system's specific safety triggers (road rage language, impairment mentions, intentional violation admissions) came from discussing what a real fleet safety manager would need to know.

## Day 3: Competition Analysis and Cloud Migration (Feb 16, evening)

### Competitive Evaluation

Asked Claude to evaluate the project against the official judging criteria. Claude fetched the competition guide, hackathon ideas doc, tutorial design doc (which contains the weighted scoring rubric), and the Luma registration page. The result was a gap analysis that identified three critical missing pieces: no root README, no documentation of the AI-assisted development process, and no license file.

- "Thoroughly consult all sources in COMPETITION.md. Evaluate this project against the stated scoring criteria. Why do we win? Why do we lose?"

The evaluation scored us 6.4/10 before fixes. The biggest insight: the "Vibe Factor" criterion (15% of score) requires documenting prompts used and the AI development journey — and we had nothing.

### Force Multiplier Narrative

The original README described Geoff as a coaching tool. But the real innovation is the structural shift: Geoff isn't a scoreboard that tells supervisors where to coach — **Geoff does the coaching directly**. This is the same leap speech analytics brought to contact centers.

Claude researched contact center speech analytics ROI data and found the exact parallel:
- Before speech analytics: QA analysts manually reviewed 1-2% of calls. 98% went unmonitored.
- After: 100% automated analysis. QA staff cut in half. 15-25% customer satisfaction improvement.
- Documented savings: HomeServe GBP 5M over 6 years, Elavon $1.7M in one quarter.

This research reshaped the entire project narrative. We updated the README to lead with the business case, not the technology.

### Cloud Run GPU Migration

The lipsync service had been running on a local RTX 4060 Ti exposed via Cloudflare tunnel — fragile, requires manual setup, not reproducible. Claude checked GCP GPU quotas and discovered we already had NVIDIA L4 allocation in us-east4 (not us-central1 where we'd been looking).

- "Check on GPU quota status"
- Claude: "You already have GPU quota. Just not where you think. NVIDIA L4 in us-east4: 2 GPUs allocated."

The existing Docker image was already in Artifact Registry from an earlier build attempt. Claude deployed it to Cloud Run in us-east4 with a single command, updated the backend to send audio and receive MP4 bytes (instead of the old tunnel URL-rewriting approach), and uploaded results to Cloud Storage. The entire migration — discovery, deployment, backend update, function redeploy — took about 15 minutes.

### Lipsync Cold Start Optimization

After deploying to Cloud Run, we discussed cold start latency. The frontend already hit `/health` on user login to wake the instance — but Claude pointed out this only handled the Cloud Run instance spin-up (~30-60s). The deeper problem: `app.py` shelled out to `python3 inference.py` as a **subprocess for every request**, meaning PyTorch, CUDA, and the 435MB model weights were loaded from scratch every single time.

- Human: "These things spin down to zero instances when not in use. Cold start will be an issue. Did we add the warmup?"
- Claude: "Already there — `/health` on login wakes the instance. But `/health` just returns ok. The model loads per-request because `run_wav2lip` shells out to a new subprocess every time."
- Human: "How much acceleration from adding a `/warmup` endpoint?"
- Claude: "Practically zero. The subprocess architecture doesn't share state between calls. A `/warmup` wouldn't help because the model is loaded fresh in every subprocess. What would actually help: refactoring to keep the model in-process."

| | Subprocess (before) | In-process (after) |
|---|---|---|
| Cloud Run cold start | 30-60s | 30-60s |
| Model load | ~8-10s **every request** | ~8-10s **once at startup** |
| Per-request inference | ~5-15s | ~5-15s |
| **Total subsequent requests** | **~15-25s** | **~5-15s** |

Claude refactored `app.py` to load the Wav2Lip model, run face detection on `geoff.png`, and cache the face coordinates — all at module level during container startup. The model stays in GPU memory across requests. The face detection result is reused since Geoff's image never changes. Every request after startup skips ~8-10s of initialization and goes straight to inference.

This is a good example of AI-human collaboration on performance optimization. The human identified the operational concern (cold starts). The AI diagnosed the root cause (subprocess architecture, not instance spin-up) and proposed the right fix (in-process model loading) instead of the obvious-but-wrong fix (warmup endpoint).

### Container Rebuild and Deployment

Rebuilding the container with the refactored `app.py` required navigating Cloud Build quota restrictions. The first attempts failed:

```
ERROR: (gcloud.builds.submit) FAILED_PRECONDITION: due to quota restrictions,
Cloud Build cannot run builds of this machine type in this region
```

Both default and `e2-highcpu-32` machine types were quota-restricted in us-central1. Claude tried us-east4 instead — the build succeeded in 12 minutes, producing a 6GB image with PyTorch, CUDA 12.1, and the Wav2Lip model weights baked in.

Deployed to Cloud Run and verified:

```
$ curl -s https://lipsync-248120812416.us-east4.run.app/health
{"status":"ok","model_loaded":true,"device":"cuda"}
```

### End-to-End Pipeline Validation

With the new container live, we ran a full pipeline test simulating every step the backend takes:

| Step | What | Result | Time |
|------|------|--------|------|
| 1 | Cloud TTS (text → MP3) | 77KB MP3 | ~1s |
| 2 | Upload to Cloud Storage | `gs://geotab-geoff-assets/audio/` | <1s |
| 3 | Download from Cloud Storage | 77KB, HTTP 200 | <1s |
| 4 | Cloud Run `/lipsync` (MP3 → MP4) | 629KB MP4, HTTP 200 | **8.1s** |
| 5 | Upload video to Cloud Storage | `gs://geotab-geoff-assets/lipsync/` | <1s |

Output: 9.7s H.264 video at 1024x1536, 25fps with AAC audio. The cold start penalty (first request including TTS) was 26.6s. Warm subsequent requests: 8.1s for a 10-second video, 2.3s for a 2-second clip. The in-process model optimization was clearly working.

### The makePublic Bug

Everything tested clean from the CLI — but the app showed only the static Geoff image, no video. The human reported the issue. Claude checked Cloud Function logs:

```
Lipsync generation failed, falling back to audio: Cannot update access control
for an object when uniform bucket-level access is enabled.
```

Root cause: `generateLipsyncVideo()` called `file.makePublic()` after uploading the video to Cloud Storage. But the bucket `geotab-geoff-assets` uses **uniform bucket-level access**, which prohibits per-object ACL changes. The irony: the bucket already had `allUsers:objectViewer` at the IAM level — every object was already public. The `makePublic()` call was both unnecessary and the thing breaking the pipeline.

The fix was a one-line deletion. The video bytes were being generated, uploaded, and stored correctly — then the function threw on the redundant ACL call, caught the error, logged a warning, and returned `null` instead of the perfectly good video URL. A classic case of the error being in the cleanup, not the work.

- Claude: removed `file.makePublic()`, redeployed functions
- Human: "Boom! It's working."

This bug illustrates a subtlety of Cloud Storage access control that's easy to miss: when uniform bucket-level access is enabled, per-object ACL operations don't just become unnecessary — they actively fail. The E2E test from the CLI didn't catch it because it used `gcloud storage cp` (which doesn't call `makePublic`), while the Cloud Function did.

## What AI Couldn't Do

**Run the GPU.** Wav2Lip requires an NVIDIA GPU. Claude configured the Docker container, API, and Cloud Run deployment, but the initial local GPU setup (RTX 4060 Ti, Cloudflare tunnel) required manual work. The migration to Cloud Run GPU was fully AI-driven.

**Geotab demo data.** Creating the demo database, understanding which events were available, and interpreting the telemetry required human domain judgment.

**Design taste.** The visual design, Geoff's avatar image, and the decision to make him look like a friendly trucker rather than a corporate mascot — those were human choices.

**Judgment calls.** When to escalate, how aggressive the safety triggers should be, what constitutes "hostile" driver behavior — these are policy decisions that required human input, even though AI implemented the logic.

## By the Numbers

| Metric | Value |
|--------|-------|
| Total development time | ~24 hours across 3 days |
| Lines of code (JS/JSX) | ~4,700 |
| Lines of code (Python) | ~5,200 |
| Cloud Functions | 7 deployed |
| React components | 15 |
| MCP tools | 6 |
| Geotab API methods used | 6 (Get, ExceptionEvent, Driver, LogRecord, GetRoadMaxSpeeds, GetAceResults) |
| GCP services | 9 (Vertex AI, Cloud TTS, Cloud STT, Firebase Auth, Hosting, Functions, Firestore, Cloud Storage, Cloud Run GPU) |

## Tools Used

- **Claude Code** (Claude Opus) — primary development tool for all code, architecture, and documentation
- **Gemini 2.0 Flash** — runtime AI for coaching generation and multi-turn conversation
- **Google Cloud TTS** — voice synthesis
- **Wav2Lip on Cloud Run** — lip sync video generation (NVIDIA L4 GPU, us-east4)
- **Firebase CLI** — deployment
- **gcloud CLI** — Cloud Run GPU deployment and quota management
