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

## What AI Couldn't Do

**Run the GPU.** Wav2Lip requires an NVIDIA GPU. Claude configured the Docker container and API, but the actual hardware (RTX 4060 Ti) and Cloudflare tunnel setup required manual work.

**Geotab demo data.** Creating the demo database, understanding which events were available, and interpreting the telemetry required human domain judgment.

**Design taste.** The visual design, Geoff's avatar image, and the decision to make him look like a friendly trucker rather than a corporate mascot — those were human choices.

**Judgment calls.** When to escalate, how aggressive the safety triggers should be, what constitutes "hostile" driver behavior — these are policy decisions that required human input, even though AI implemented the logic.

## By the Numbers

| Metric | Value |
|--------|-------|
| Total development time | ~20 hours across 2 days |
| Lines of code (JS/JSX) | ~4,700 |
| Lines of code (Python) | ~5,200 |
| Cloud Functions | 7 deployed |
| React components | 15 |
| MCP tools | 6 |
| Geotab API methods used | 6 (Get, ExceptionEvent, Driver, LogRecord, GetRoadMaxSpeeds, GetAceResults) |
| GCP services | 8 (Vertex AI, Cloud TTS, Cloud STT, Firebase Auth, Hosting, Functions, Firestore, Cloud Storage) |
| Git commits | 8 (large, feature-complete commits rather than incremental) |

## Tools Used

- **Claude Code** (Claude Opus) — primary development tool for all code, architecture, and documentation
- **Gemini 2.0 Flash** — runtime AI for coaching generation and multi-turn conversation
- **Google Cloud TTS** — voice synthesis
- **Wav2Lip** — lip sync video generation
- **Firebase CLI** — deployment
- **Cloudflare Tunnel** — exposing local GPU to cloud functions
