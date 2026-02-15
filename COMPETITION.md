# Geotab Vibe Coding Competition — Reference Guide

> **Our north star as we develop the project.**

## Competition Overview

- **Event**: Geotab Vibe Coding Competition
- **Dates**: February 12 – March 2, 2026
- **Registration**: https://lu.ma/h6ldbaxp
- **Official Guide**: https://github.com/fhoffa/geotab-vibe-guide

## Prizes

| Award | Prize | Criteria |
|-------|-------|----------|
| **Vibe Master** | $10,000 | Best overall project |
| **The Innovator** | $5,000 | Most creative/innovative solution |
| **Most Collaborative** | $2,500 | Best community engagement |

Additional recognition awards available.

## Development Paths

| Path | Focus |
|------|-------|
| A | AI-Powered Fleet Management Tools |
| B | Safety & Compliance Solutions |
| C | Data Visualization & Analytics |
| D | Driver Experience & Engagement |
| E | Integration & Automation |
| F | Sustainability & Efficiency |

**Our project (Geoff) spans paths B, D, and E** — safety coaching, driver engagement, and Geotab API integration.

## Our Alignment: Idea 2.1 "SafeDrive Coach"

From the official hackathon ideas guide, our project maps directly to:

> **SafeDrive Coach** — An AI-powered coaching system that analyzes driving patterns from Geotab data and provides personalized safety recommendations. Uses exception events, speed data, and driver behavior patterns to deliver contextual coaching.

Key APIs we use:
- `Get` — `ExceptionEvent` (safety events with rule violations)
- `Get` — `Driver` (driver profiles)
- `Get` — `LogRecord` (GPS + speed telemetry at event time)
- `GetRoadMaxSpeeds` — Posted speed limits at event locations
- `GetAceResults` — Geotab Ace AI context for enriched coaching

## Judging Tips (from official guide)

1. **Ace integration is highly valued** — Projects that meaningfully use Geotab's Ace AI score better. We integrate Ace context into coaching prompts.

2. **MCP implementations score well** — Model Context Protocol integrations demonstrate technical sophistication.

3. **Documentation outweighs feature count** — A well-documented project with fewer features beats a feature-rich project with poor docs. Prioritize clear README, architecture docs, and demo videos.

4. **Practical business value matters** — Judges look for real-world fleet management applicability, not just technical demos.

5. **Show your vibe coding process** — The competition celebrates AI-assisted development. Document how AI tools helped build the project.

## What Makes Geoff Stand Out

- **End-of-shift holistic coaching** — Not per-event alerts, but a conversational AI coach that reviews the entire shift
- **Ace AI integration** — Enriches coaching with Geotab's own AI insights
- **Lip-synced avatar** — Wav2Lip GPU-powered video responses (pending GPU quota)
- **Two-way conversation** — Driver can ask questions, drill into specific events
- **Positive reinforcement** — Clean shifts get encouraging check-ins, not silence
- **Real Geotab data** — Uses actual ExceptionEvents, LogRecords, and speed limits

## Technical Stack

- **Frontend**: React + Vite, deployed on Firebase Hosting
- **Backend**: Firebase Cloud Functions v2 (Node.js)
- **AI**: Google Vertex AI / Gemini 2.0 Flash for coaching generation
- **TTS**: Google Cloud Text-to-Speech
- **Lipsync**: Wav2Lip on Cloud Run with NVIDIA L4 GPU
- **Database**: Cloud Firestore
- **Telematics**: Geotab SDK (MyGeotab API)

## Key Deadlines

- **Submission deadline**: March 2, 2026
- **Required**: Working demo, source code, documentation

## Resources

- [Official Vibe Guide & README](https://github.com/fhoffa/geotab-vibe-guide)
- [Hackathon Ideas](https://github.com/fhoffa/geotab-vibe-guide/blob/main/guides/HACKATHON_IDEAS.md)
- [Geotab SDK Docs](https://geotab.github.io/sdk/)
- [MyGeotab API Reference](https://geotab.github.io/sdk/software/api/reference/)
- [Registration (Luma)](https://lu.ma/h6ldbaxp)
