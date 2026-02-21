# Vibe Coding Journey

How AI-assisted development built Geoff from concept to deployed platform in under 48 hours.

## The Setup

- **AI tool:** Claude Code (Claude Opus) — Anthropic's CLI agent for software engineering
- **Human:** One developer, no team, no prior Geotab API experience
- **Timeline:** February 15-17, 2026
- **Status:** Submitted February 17, 2026

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

### Full Demo Run

After the fix, we cleared all Firestore data (sessions, events, actions, drivers) and re-polled Geotab — 90 fresh events loaded. Warmed the lipsync service, ran the app, and confirmed end-to-end: driver selects a shift, Geoff generates coaching with Gemini, synthesizes speech with Cloud TTS, generates lip-synced video on Cloud Run GPU, and plays it back in the browser. Working.

### UI Polish: Geotab Branding and Google Auth Visibility

- "Let's doll up the interface. Show my email address next to the dropdown. The name should be Geotab Geoff. Stick the Geotab logo to the left of Geoff."

Updated the driver home header: "Geotab" in brand green (#00843D) followed by "Geoff" in the existing blue. Added the user's Google email address next to the driver dropdown — a small touch that makes the Google Auth integration immediately visible to judges.

## Day 4: Competition Optimization (Feb 16, late evening)

### Systematic Gap Analysis

The final phase was pure optimization — scoring the project against the official judging rubric and closing gaps methodically. The prompt that kicked it off:

- "Read all of your memory files. Understand the rules of the contest. Evaluate our code against the rules. Score the project. Tell me why we win. Tell me why we lose."

Claude produced a weighted gap analysis: Innovation 9.0, Technical 7.0, UX 6.5, Vibe 7.0, Business 9.0 — total 7.7/10. The conversation that followed was a series of human corrections and AI execution:

**Human corrects AI on scope:** Claude recommended adding Geotab write operations and mid-conversation Ace queries to boost Innovation. The human pushed back:
- "I don't think adding more features is the way forward right now. The rules specifically caution against this. We're going to stay limited in our scope and focused on iterative excellence."

The human was right — the contest guide explicitly warns against over-engineering. Claude also incorrectly described Ace AI as a "one-shot" integration. The human corrected this: Ace context flows into `coachAnalysis` and `eventSummaries`, which persist through the entire multi-turn conversation. Not one-shot at all.

**Test infrastructure from zero to complete in one prompt:**
- "Do everything necessary to satisfy the testing requirements. Go!"

Claude built the entire test infrastructure in a single pass: 31 backend tests (Node.js built-in test runner — zero dependencies), 4 React component tests (Vitest + Testing Library), GitHub Actions CI pipeline, CI badge in README, and fixed all lint errors. This is what vibe coding looks like at its best — the human says *what*, the AI figures out *how* and *how much*.

**Human corrects AI on cold start assessment:** Claude flagged GPU cold start as a UX risk. The human corrected:
- "You are wrong on cold start latency. We have accounted for that. We thump the container on user login and warm everything up explicitly. Besides, I'm the one driving the demo and shooting the video."

Claude verified: two-layer warmup exists (module-level health ping on login + component-level check on mount), combined with in-process model caching. The risk was already mitigated. This is a pattern in the collaboration — the human maintains operational awareness of what's deployed and working, while the AI can lose track of features it implemented in earlier sessions.

### Server-Side Speech-to-Text: Human Catches the Real Problem

The SCORING.md flagged "Voice input is Chrome-only" as a UX gap — the frontend used the browser's Web Speech API (`window.SpeechRecognition`), which only works in Chrome. Claude's initial recommendation was to add a fallback message for non-Chrome users.

The human pushed back:
- "Are you sure about the voice input being Chrome only? I thought we were recording and doing STT on the server side."

Claude checked the code — the human was wrong about what was already implemented (the backend had a `transcribeAudio` function but the frontend never called it), but right about the correct architecture. Then the human delivered the real insight:
- "No. Use server-side STT. In the real world, noise and accents screw up client-side STT. Implement server-side STT and note the reasons."

This is a pattern that repeated throughout the project: the AI identifies the *symptom* (Chrome-only), but the human identifies the *real problem* (client-side STT is wrong for fleet drivers). Truck cabs are noisy. Loading docks are noisy. Fleet drivers have diverse accents. Browser-side speech recognition is optimized for quiet rooms with standard accents — the exact opposite of the deployment environment.

Claude implemented the fix in one pass: exposed the existing `transcribeAudio` as a callable Cloud Function, replaced `window.SpeechRecognition` with `MediaRecorder` (which works in all modern browsers), and wired the audio blob to the server for transcription via Google Cloud Speech-to-Text with the enhanced model. The result:
- **Cross-browser**: MediaRecorder works in Chrome, Firefox, Safari, Edge
- **Better accuracy**: Cloud STT enhanced model handles ambient noise and accents
- **Consistent**: Same transcription quality regardless of client device

The backend `transcribeAudio` function had been sitting in `functions/speech/stt.js` since Day 1, imported but never exposed. The infrastructure was already there — it just needed the human's domain knowledge to recognize it should be the primary path, not a backup.

### Score Trajectory

The gap analysis process moved the score from 7.7 → 8.675 across focused optimization:

| Phase | Innovation | Technical | UX | Vibe | Business | Total |
|-------|-----------|-----------|-----|------|----------|-------|
| Before optimization | 8.5 | 7.0 | 6.5 | 7.0 | 9.0 | **7.7** |
| After tests + CI | 9.0 | 8.5 | 7.0 | 8.5 | 9.0 | **8.4** |
| After UX corrections | 9.0 | 8.5 | 7.5 | 8.5 | 9.0 | **8.5** |
| After prompts + git analysis | 9.0 | 8.5 | 7.5 | 9.0 | 9.0 | **8.575** |
| After server-side STT | 9.0 | 8.5 | 8.0 | 9.0 | 9.0 | **8.675** |
| After cost analysis + demo move | 9.0 | 8.5 | 8.0 | 9.0 | 9.5 | **8.725** |

---

## Git Commit History Analysis

46 commits over 6 days. Every line of code written through conversation with Claude.

```
Feb 15 17:10  bd6f115  Initial commit: Geotab Geoff AI coaching platform          [18,920 lines, 60 files]
Feb 15 18:00  01d3650  Fix coaching conversation quality + location detection      [+101 -33, 3 files]
Feb 15 19:55  163aa12  Add lipsync video, processing indicator, escalation         [+229 -28, 5 files]
Feb 15 20:25  7b4126f  Strengthen escalation triggers                              [+18 -3, 1 file]
Feb 15 22:33  ed2af09  Add Geoff intro demo video and script                       [+19, 2 files]
Feb 16 07:32  2cdb067  Add competition demo video — Geoff explains the platform    [+27, 2 files]
Feb 16 08:49  e8eaadc  Force Google account picker on sign-in                      [+1, 1 file]
Feb 16 14:36  bcd29d5  Add MyGeotab Add-In for supervisor dashboard                [+624 -61, 15 files]
Feb 16 14:57  0226538  Add README, vibe coding journey, MIT license                [+333, 3 files]
Feb 16 15:28  18194b4  Reframe README with contact center ROI narrative            [+27 -7, 1 file]
Feb 16 15:34  68b9c47  Migrate lipsync from local GPU to Cloud Run                 [+14 -21, 2 files]
Feb 16 15:35  8cb99bd  Document Cloud Run GPU migration in journey                 [+35 -6, 1 file]
Feb 16 15:44  2945ce7  Refactor lipsync: in-process model loading                  [+150 -23, 1 file]
Feb 16 15:44  2115819  Document cold start optimization in journey                 [+20, 1 file]
Feb 16 16:20  9cc4c5e  Fix lipsync video — remove makePublic on uniform bucket     [+51 -1, 2 files]
Feb 16 16:48  11020e1  Add Geotab branding and user email to header                [+24 -1, 3 files]
Feb 16 18:01  82226f1  Fix CSS not loading in MyGeotab, restyle with Zenith        [+577 -389, 6 files]
Feb 16 18:17  e328c70  Add screenshots and MyGeotab PDFs                           [+1, 6 files]
Feb 16 18:33  a428be9  Add competition scoring and gap analysis                    [+185, 1 file]
Feb 16 18:43  71cc5aa  Add test suite (35 tests), CI pipeline, lint fixes          [+1704 -57, 19 files]
Feb 16 18:48  01937d6  Update scoring: cold start mitigated, UX 7.0→7.5           [+10 -11, 1 file]
Feb 16 19:00  2a4f1db  Replace browser Web Speech API with server-side Cloud STT   [+89 -42, 4 files]
Feb 16 19:06  19d2d00  Document server-side STT decision in vibe coding journey    [+16, 1 file]
Feb 16 19:24  6ff6976  Move demos, add cost analysis, update scoring               [+44 -8, 3 files]
Feb 16 19:28  e542491  Fix Cloud Functions count, add score trajectory             [+3 -3, 1 file]
Feb 16 19:42  0a694f5  Add screenshots to README                                   [+22, 1 file]
Feb 16 19:59  e12e8e2  Add comprehensive evaluation with evidence for every claim  [+338, 1 file]
Feb 16 20:08  c924b43  Link evaluation docs from README                            [+7, 1 file]
Feb 16 20:40  00ce4cf  Fix cost analysis math: $25/session (500x)                  [+5 -5, 1 file]
Feb 16 20:45  3aad79f  Remove obsolete docs, fix README function names             [+6 -112, 3 files]
Feb 16 20:50  80725fe  Remove outdated demo videos                                 [3 files deleted]
Feb 16 21:12  ba0252e  Add 9-video "Geoff Explains" series with scripts            [+237, 12 files]
Feb 16 21:35  12b6e3f  Add YouTube playlist link for Geoff Explains                [+4, 1 file]
Feb 16 21:46  7403105  Add NotebookLM explainer videos, update README              [+18 -1, 1 file]
Feb 16 22:01  09ebf2d  Add remaining NotebookLM explainer videos                   [+7 -1, 1 file]
Feb 17 07:59  85b9db9  Add demo video YouTube link to docs                         [+9 -5, 2 files]
Feb 17 10:07  46666a1  Add "My Name's Geoff" meme video to docs                    [+12, 2 files]
Feb 17 11:30  1ac4b50  Update status: submitted, Reddit engagement                  [+45 -15, 2 files]
Feb 17 13:00  d191e49  Add 12 comprehensive guides for vibe coding                  [+2688, 14 files]
Feb 17 14:30  21307e5  Add AI-generated podcast: The 18,920-Line First Commit       [+26, 2 files]
Feb 17 16:00  d5db972  Add 11 AI-generated podcast episodes (02-12)                 [11 MP3 files]
Feb 18 -----  -------  (Reddit bot experiment — added and removed)                 [2 commits]
Feb 19 19:35  09e34d4  Add multilingual coaching — 15 languages E2E                [+118 -26, 9 files]
Feb 19 19:40  83af1c1  Add multilingual coaching demo videos                        [2 MP4 files]
Feb 20 07:11  8c227dd  Add Ready for Barcelona section to README                    [+16, 1 file]
Feb 20 07:43  c601265  Add Guide 13: Going Global — production readiness roadmap    [+307, 3 files]
```

### Development Cadence

| Phase | Time | Commits | Pattern |
|-------|------|---------|---------|
| **Foundation** (Feb 15, 5-6pm) | 50 min | 1 | Massive initial scaffold — 18,920 lines |
| **Coaching quality** (Feb 15, 6-8pm) | 2.5 hr | 3 | Rapid iteration on core product |
| **Demo content** (Feb 15-16 overnight) | 9 hr gap | 2 | Human-driven creative work |
| **Integration burst** (Feb 16, 2-3pm) | 1 hr | 4 | MyGeotab Add-In + README + narrative reframe |
| **Cloud migration** (Feb 16, 3-4pm) | 1 hr | 4 | GPU migration + optimization + bug fix |
| **Polish** (Feb 16, 4-6pm) | 2 hr | 3 | Branding, CSS, screenshots |
| **Competition prep** (Feb 16, 6-7pm) | 1 hr | 3 | Scoring, tests, CI |
| **Hardening** (Feb 16, 7-8pm) | 1 hr | 5 | Server-side STT, cost analysis, screenshots, evaluation doc |
| **Content pipeline** (Feb 16, 8-10pm) | 2 hr | 6 | 9-video Geoff Explains series + NotebookLM + YouTube |
| **Demo & meme** (Feb 17, 8-10am) | 2 hr | 2 | Demo video edit, "My Name's Geoff" meme — submission day |
| **Knowledge sharing** (Feb 17, afternoon) | 4 hr | 3 | 12 guides, 12 podcast episodes, community materials |
| **Multilingual** (Feb 19, evening) | 1 hr | 2 | 15 languages across Gemini, TTS, STT — plan + implement + deploy |
| **Global roadmap** (Feb 20, morning) | 1 hr | 2 | Guide 13, README updates, Barcelona positioning |

### What the History Shows

**The AI is a force multiplier, not a replacement.** The 50-minute initial commit (18,920 lines) is only possible because Claude held the entire architecture in context — React app, Cloud Functions, Firestore schema, Geotab API integration, Gemini prompts — and generated everything coherently. A human writing that volume would take days. But the human directed every decision: what to build, what to prioritize, when to stop.

**Iteration is fast and fearless.** Three commits in 2.5 hours refined the coaching engine from basic per-event alerts to shift-level holistic coaching with GPS clustering and escalation enforcement. When something isn't right, you just tell the AI what's wrong and it fixes it.

**The human catches what the AI misses.** Multiple corrections during the competition optimization phase — the AI flagged risks that were already mitigated (cold start), recommended features the contest explicitly warns against (scope creep), and got the Ace AI integration wrong (described it as one-shot when it persists through conversation). The human's operational knowledge and judgment corrected the AI's analysis each time.

**Documentation is nearly free.** 6 of 21 commits are pure documentation — README, journey, scoring, migration notes. When the AI can write docs from context it already holds, there's no excuse for an undocumented project.

---

## The Meme Video: Vibe Coding in Real Time

The ["My Name's Geoff"](https://youtube.com/shorts/GTz1UZnx7T8) meme video is a micro case study in human-AI collaboration speed. The entire creative pipeline — from idea to uploaded YouTube Short — happened in a single conversation:

1. Human: "Get the audio from this meme video, there's a geotab.png, create a video that shows Geotab then cuts to Geoff lipsyncing the 'my name is Jeff' audio"
2. Claude: Downloaded the meme audio with yt-dlp, analyzed the waveform to find the speech at 2.8-3.8s, trimmed it, generated Cloud TTS for the Geotab intro, sent the meme audio + Geoff's image to the local Wav2Lip container, assembled both parts with ffmpeg
3. Result: 9-second video, start to finish in under 5 minutes

No storyboarding. No video editing software. One natural language prompt produced a complete multimedia artifact using the project's own AI pipeline. This is what vibe coding looks like when the tools are already built.

## Day 5: Knowledge Sharing at Scale (Feb 17, afternoon)

### 12 Comprehensive Guides

After submission, the focus shifted to helping others. One prompt — "What other material might we develop based on this project that helps other people vibe code more effectively?" — produced 12 topics. A second prompt — "Write comprehensive guides for all of these" — and Claude generated 2,688 lines across 14 files:

1. **The 18,920-Line First Commit** — Full-stack architecture prompting
2. **Steal From Another Industry** — Cross-domain product design
3. **AI Evaluating AI** — Gap analysis loops for hackathon optimization
4. **Server-Side Safety Net** — Deterministic overrides for LLM outputs
5. **MyGeotab Add-In Gotchas** — 9 undocumented issues for Add-In developers
6. **Ace AI Integration Patterns** — 3-step async API and conversational context
7. **OData Data Connector Recipes** — Fleet analytics queries
8. **Cloud Run GPU on a Budget** — Scale-to-zero NVIDIA L4
9. **The Five-Cent Pipeline** — Per-unit cost estimation framework
10. **MCP Server Patterns** — FastMCP and Claude Desktop integration
11. **When to Correct the AI** — The human judgment layer
12. **Prompt to Multimedia** — Composable AI content pipelines

### 12 AI-Generated Podcast Episodes

Then the question: "Can we turn these into podcasts?" The pipeline:

1. Claude wrote two-voice transcripts (Alex and Maya) for each guide — not just readings, but structured conversations with questions, examples, and analysis
2. Google Cloud TTS Neural2 generated audio per segment (Neural2-D for Alex, Neural2-C for Maya)
3. ffmpeg assembled segments with natural silence gaps, applied EBU R128 loudness normalization, and exported to MP3

**12 episodes, ~46 minutes of total content, generated from one conversation.** The first episode (The 18,920-Line First Commit, 7:54) was hand-crafted to dial in the voice settings and pacing. Then a reusable Python script batch-processed the remaining 11 episodes — ~200 TTS API calls completing in about 15 minutes.

This is vibe coding applied to content creation. The human decides *what knowledge to share*. The AI writes the scripts, generates the audio, and assembles the final product. Cost: roughly $2 in TTS API calls for the entire series.

### Community Engagement Across Multiple Channels

The "Most Collaborative" prize goes to the participant most active in helping others on Reddit and GitHub. We went all-in:

**Geotab SDK Discussions** (github.com/Geotab/sdk/discussions):
- [Show and Tell #463](https://github.com/Geotab/sdk/discussions/463) — Full project showcase with API usage details
- [Q&A #464](https://github.com/Geotab/sdk/discussions/464) — 9 undocumented MyGeotab Add-In gotchas with code examples
- [General #465](https://github.com/Geotab/sdk/discussions/465) — All 12 guides and podcast episodes shared as resources

**Official Vibe Guide Repo** (github.com/fhoffa/geotab-vibe-guide):
- [PR #81](https://github.com/fhoffa/geotab-vibe-guide/pull/81) — Added Community-Contributed Guides section to RESOURCES.md, linking 9 guides covering Geotab integration patterns, architecture decisions, and vibe coding process

**Reddit** ([competition thread](https://www.reddit.com/r/GEOTAB/comments/1r242zb/the_geotab_vibe_coding_2026_competition_register/)) — The thread was entirely empty before we started posting. We were the first participant to engage and have maintained daily contributions:
- Full project showcase with architecture breakdown, cost analysis, and resource links
- Copy-paste Ace AI 3-step async pipeline — the create-chat → send-prompt → poll pattern with gotchas that cost us time (messageGroupId location inconsistency, required initial wait, customerData flag)
- Reusable prompt for converting technical guides into two-voice podcast episodes — showing others how to generate multimedia content from their own docs
- Security checklist for first-time vibe coders — hardcoded secrets, .gitignore setup, credential rotation, and an AI-generated repo scanning prompt
- Video editing tip for demo videos (prompt-based silence removal with ffmpeg)
- Guide 13 (Going Global) shared as a production readiness roadmap
- Active engagement with other participants' questions and projects

## Day 6: Multilingual Coaching (Feb 19)

### 15 Languages in One Session

The prompt: "Add a language dropdown to the RoleSelect page so drivers choose what language Geoff coaches in. Affects Gemini coaching output, TTS voice, and STT recognition. 15 languages, default English."

Claude planned the change across 7 files, then implemented it in a single pass:

1. **Shared config** (`app/src/config/languages.js`) — 15 languages from English to Turkish
2. **RoleSelect dropdown** — language saved to Firestore user profile, persists across logins
3. **Gemini prompts** — `languageInstruction()` helper appends "You MUST respond entirely in {language}" for non-English sessions. Gemini handles multilingual natively — no translated prompts needed
4. **Cloud TTS** — 15 Neural2 male voices, one per language. Date formatting in coaching prompts uses the language locale
5. **Cloud STT** — language code passed through to Speech-to-Text for accurate transcription
6. **Session persistence** — language stored on the session doc so `driverRespond` reads it from Firestore, not from the frontend

The entire feature — plan, implement, build, deploy — took one conversation. The architecture was clean because the existing code already parameterized `language` in TTS and STT (from the `ttsProxy` endpoint) — it just wasn't wired through the coaching pipeline.

### The Catalan Voice Problem

Testing revealed Catalan sounded female. Investigation showed Google Cloud TTS only offers **one Catalan voice** (`ca-ES-Standard-B`, female) — no male option exists. The fix: a per-language pitch override map. Catalan gets `-6.0` semitones (vs `-1.5` default), which deepens the voice enough to sound plausibly masculine without sounding robotic. A pragmatic workaround for a platform limitation.

This is a good example of how multilingual support surfaces edge cases you can't anticipate from English-only development. Each language has different TTS voice availability, different Neural2 coverage, and different acoustic characteristics.

### Going Global: The Production Roadmap

With multilingual working, the natural question: what does it take to go from demo to global production? The human framed the scope:

- "Geoff is a modular system. The avatar is a container. For international support, we'd need containers in other regions. We'd want to upgrade from Wav2Lip to something like Synthesia. And Geoff needs to know actual safety regulations — not just 'don't speed.'"

Claude wrote a comprehensive production readiness guide ([Guide 13: Going Global](guides/13-going-global.md)) covering 7 dimensions: multi-region GPU deployment (3 Cloud Run regions with cold start scheduling), the avatar upgrade path from Wav2Lip to Synthesia (one function swap), a regulatory knowledge base architecture (structured JSON per country injected into Gemini prompts), cultural coaching adaptation (personality variants per region), data residency for GDPR, production monitoring, and a 6-phase deployment roadmap.

The key insight the human contributed: the hardest part of going global isn't engineering — it's curating accurate regulatory knowledge for 160 countries. Speed limits, hours-of-service rules, vehicle class restrictions, penalty point systems — all vary by jurisdiction. That's a content problem, not a code problem. The architecture handles it cleanly (inject regulatory context into the Gemini prompt), but someone has to write the regulation files. Geotab's own rule engine and Ace AI are the natural data sources.

## What AI Couldn't Do

**Run the GPU.** Wav2Lip requires an NVIDIA GPU. Claude configured the Docker container, API, and Cloud Run deployment, but the initial local GPU setup (RTX 4060 Ti, Cloudflare tunnel) required manual work. The migration to Cloud Run GPU was fully AI-driven.

**Geotab demo data.** Creating the demo database, understanding which events were available, and interpreting the telemetry required human domain judgment.

**Design taste.** The visual design, Geoff's avatar image, and the decision to make him look like a friendly trucker rather than a corporate mascot — those were human choices.

**Judgment calls.** When to escalate, how aggressive the safety triggers should be, what constitutes "hostile" driver behavior — these are policy decisions that required human input, even though AI implemented the logic.

## By the Numbers

| Metric | Value |
|--------|-------|
| Total development time | ~26 hours across 6 days |
| Lines of code (JS/JSX) | ~4,800 |
| Lines of code (Python) | ~5,200 |
| Cloud Functions | 8 deployed |
| React components | 15 |
| MCP tools | 6 |
| Geotab API methods used | 6 (Get, ExceptionEvent, Driver, LogRecord, GetRoadMaxSpeeds, GetAceResults) |
| Languages supported | 15 (en, es, ca, fr, pt, de, zh, hi, ar, ja, ko, it, nl, pl, tr) |
| Guides | 13 |
| GCP services | 9 (Vertex AI, Cloud TTS, Cloud STT, Firebase Auth, Hosting, Functions, Firestore, Cloud Storage, Cloud Run GPU) |

## Tools Used

- **Claude Code** (Claude Opus) — primary development tool for all code, architecture, and documentation
- **Gemini 2.0 Flash** — runtime AI for coaching generation and multi-turn conversation
- **Google Cloud TTS** — voice synthesis
- **Wav2Lip on Cloud Run** — lip sync video generation (NVIDIA L4 GPU, us-east4)
- **Firebase CLI** — deployment
- **gcloud CLI** — Cloud Run GPU deployment and quota management
