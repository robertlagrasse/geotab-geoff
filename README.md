# Geotab Geoff — AI Fleet Safety Coach

<p align="center">
  <img src="geoff.png" alt="Geoff — AI Fleet Safety Coach" width="300">
</p>

**Geoff coaches every driver, after every shift, about every safety event.** Not with a report. Not with an email. With a real conversation.

**Live demo:** [geotab-geoff.web.app](https://geotab-geoff.web.app)

---

## The Problem

Fleet safety managers are responsible for coaching hundreds — sometimes thousands — of drivers. But real coaching takes time: a one-on-one conversation about what happened on the road today. Most fleets can only coach a fraction of their drivers, usually after something's already gone wrong. The rest get a report they never read.

Most fleet safety tools try to solve this by building better scoreboards — gathering data, ranking drivers, and telling supervisors where to focus. That helps prioritize, but it doesn't scale. The supervisor is still the bottleneck. A safety manager coaching 5-10 drivers per week out of 200 is doing triage, not coaching.

## The Insight: What Speech Analytics Did for Contact Centers

Contact centers had the same structural problem. QA analysts could manually review 8-20 calls per day. With thousands of daily interactions, only **1-2% of calls were ever monitored** — [98% went completely unreviewed](https://www.ringcentral.com/us/en/blog/ai-quality-management-why-your-contact-center-cant-rely-only-on-manual-qa-anymore/). Feedback was delayed, decontextualized, and based on random samples.

Speech analytics changed everything. **100% of calls got analyzed automatically.** [QA staff was cut in half](https://callminer.com/blog/how-speech-analytics-can-reduce-costs-improve-contact-center-efficiency-case-study-examples) — and the remaining staff shifted from listening to calls to coaching agents on flagged interactions. The results:

- [HomeServe/Verint](https://www.verint.com/case-studies/homeserve-reduces-customer-effort/): 22% CSAT increase, **GBP 5M+ savings over 6 years**
- [Elavon](https://www.callcentrehelper.com/speech-analytics-where-is-the-best-return-on-investment-25773.htm): **$1.7M revenue retained in one quarter**
- Industry-wide: [15-25% customer satisfaction improvement](https://www.qevalpro.com/blog/agent-performance-management-kpis-proven-strategies/), [35% faster agent improvement cycles](https://www.qevalpro.com/blog/agent-performance-management-kpis-proven-strategies/)
- Gartner predicts conversational AI in contact centers will [reduce agent labor costs by $80 billion by 2026](https://www.gartner.com/en/newsroom/press-releases/2022-08-31-gartner-predicts-conversational-ai-will-reduce-contac)

## Geoff Is Speech Analytics for Fleet Safety

Geoff isn't a scoreboard that tells supervisors where to coach. **Geoff does the coaching.** Every driver, every shift, 100% coverage — the same leap from 1-2% to 100% that transformed contact centers. Supervisors don't review events; they handle the exceptions Geoff flags.

The result: every driver gets coached, every shift gets reviewed, and your safety team focuses on the cases that truly need a human touch.

---

## How It Works

1. **Geotab GO devices** record safety events in real time — speeding, harsh braking, aggressive acceleration
2. **Geoff polls the Geotab API** using the official SDK, enriching each event with GPS coordinates, posted speed limits, and context from Geotab's Ace AI
3. **Shift-level analysis** — not event-by-event alerts. GPS clustering detects location patterns (e.g., four speeding events at the same intersection = a signage problem, not a driver problem)
4. **Gemini 2.0 Flash** generates a personalized coaching script for the driver's specific shift
5. **Cloud Text-to-Speech** synthesizes the script into natural speech
6. **Wav2Lip on Cloud Run GPU** generates a lip-synced video of Geoff delivering the coaching
7. **The driver talks back** — voice or text input drives a multi-turn conversation with Gemini
8. **Escalation system** evaluates every response against 7 safety triggers (road rage, impairment, intentional violations, hostility, vehicle defects, data severity, driver requests). Flagged sessions go to the supervisor action queue with full context

---

## Features

### Driver Experience
- Lip-synced avatar delivers coaching face-to-face, not as a wall of text
- Two-way voice conversation — drivers respond naturally and Geoff adapts
- End-of-shift holistic review with pattern detection across events
- Positive reinforcement on clean shifts (not just silence)

### Supervisor Dashboard
- Real-time session feed with live status updates
- Action queue for escalated sessions — approve, deny, or discuss
- Fleet analytics via OData Data Connector
- Embedded as a **MyGeotab Add-In** so supervisors stay in their existing tool

### Escalation Intelligence
- Three-tier system: data-driven (auto), conversation-driven (auto), driver-requested
- 7 boolean safety flags evaluated on every turn (aggressive driving, impairment, intentional violations, hostility, vehicle defects, data severity, driver requests)
- Server-side safety net forces escalation when flags fire, even if the model doesn't

### MCP Server
- 6-tool Model Context Protocol server for Claude Desktop integration
- Tools: `get_safety_events`, `get_fleet_kpis`, `get_driver_rankings`, `get_vehicle_details`, `get_driver_history`, `ask_ace`
- Enables conversational fleet management from any MCP-compatible AI assistant

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  BROWSER — Firebase Hosting                                  │
│  ├── React + Vite                                            │
│  ├── Driver view: avatar coaching sessions (/driver)         │
│  ├── Supervisor view: dashboard + action queue (/dashboard)  │
│  └── MyGeotab Add-In: supervisor dashboard inside MyGeotab   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  GCP BACKEND                                                 │
│  ├── Cloud Functions v2 (Node.js 20)                         │
│  │   ├── pollGeotabEvents — Geotab API → Firestore           │
│  │   ├── generateCoaching — Ace context + Gemini script       │
│  │   ├── chat — multi-turn conversation with escalation       │
│  │   ├── speak — Cloud TTS + Wav2Lip video generation         │
│  │   ├── transcribe — Cloud Speech-to-Text                    │
│  │   ├── fleetAnalytics — OData Data Connector                │
│  │   └── geotabAuth — MyGeotab session → Firebase token       │
│  ├── Firestore (drivers, events, sessions, actions)           │
│  ├── Cloud Storage (audio, video, avatar assets)              │
│  ├── Vertex AI — Gemini 2.0 Flash                             │
│  └── Cloud Run + NVIDIA L4 GPU (Wav2Lip lipsync, us-east4)   │
│                                                               │
│  GEOTAB APIs                                                  │
│  ├── MyGeotab API (mg-api-js SDK v3.0.0)                      │
│  │   ├── ExceptionEvent, Driver, LogRecord                    │
│  │   └── GetRoadMaxSpeeds                                     │
│  ├── Ace AI (GetAceResults — pattern analysis + insights)     │
│  └── OData Data Connector (fleet-wide analytics)              │
│                                                               │
│  MCP SERVER (Python / FastMCP)                                │
│  └── 6 tools for Claude Desktop fleet management              │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite, Firebase Hosting |
| Backend | Cloud Functions v2 (Node.js 20) |
| Database | Cloud Firestore (real-time listeners) |
| AI Coach | Gemini 2.0 Flash via Vertex AI |
| Text-to-Speech | Google Cloud TTS Neural2-D |
| Speech-to-Text | Google Cloud Speech-to-Text |
| Lip Sync | Wav2Lip on Cloud Run with NVIDIA L4 GPU |
| Geotab API | mg-api-js SDK v3.0.0 |
| Fleet Analytics | OData Data Connector |
| MCP Server | Python + FastMCP |
| MyGeotab Add-In | IIFE build, externally hosted |

---

## Geotab API Integration

Geoff uses **all three Geotab data channels**:

- **MyGeotab API** (via official SDK) — `ExceptionEvent`, `Driver`, `LogRecord`, `GetRoadMaxSpeeds` for real-time safety events and GPS context
- **Ace AI** — `GetAceResults` for natural language insights about driver history and fleet patterns, fed into coaching prompts
- **OData Data Connector** — fleet-wide KPIs and analytics for the supervisor dashboard

---

## Demo

Two demo videos show Geoff in action — Geoff himself explains the platform:

- **Intro** (`scripts/geoff-intro.mp4`) — 2-minute overview of what Geoff does and why
- **Full demo** (`scripts/geoff-demo.mp4`) — 5-minute deep dive into the architecture, coaching flow, escalation system, and Geotab API integration

---

## Project Structure

```
geoff/
├── app/                    # React frontend (Vite)
│   └── src/
│       ├── components/
│       │   ├── auth/       # Login, role selection
│       │   ├── driver/     # Coaching session, avatar, voice input
│       │   └── dashboard/  # Live feed, action queue, analytics
│       └── hooks/          # Auth, Geotab session management
├── functions/              # Cloud Functions v2 backend
│   ├── coaching/           # Gemini coaching generation + escalation
│   ├── geotab/             # API client, Ace AI, MyGeotab auth
│   ├── speech/             # TTS + STT
│   └── analytics/          # OData fleet analytics
├── mcp-server/             # MCP server for Claude Desktop
├── scripts/                # Demo videos and seed data
├── PLAN.md                 # Detailed architecture and design
├── COMPETITION.md          # Competition alignment and strategy
└── VIBE_CODING_JOURNEY.md  # AI-assisted development process
```

---

## Getting Started

See [INSTANT_START_WITH_CLAUDE.md](INSTANT_START_WITH_CLAUDE.md) for a complete guide to running this project with Claude Code, including credentials setup and step-by-step prompts.

### Prerequisites
- Node.js 20+
- Firebase CLI (`npm i -g firebase-tools`)
- Geotab demo database credentials
- GCP project with Vertex AI, Cloud TTS, Cloud STT enabled

### Quick Start
```bash
# Clone and install
git clone https://github.com/robertlagrasse/geotab-geoff.git
cd geotab-geoff
cd functions && npm install && cd ..
cd app && npm install && cd ..

# Configure environment
cp .env.example functions/.env
# Edit functions/.env with your Geotab and GCP credentials

# Build and deploy
cd app && npm run build && cd ..
firebase deploy

# Poll Geotab for safety events
curl -s https://pollgeotabevents-pdqai5yj3a-uc.a.run.app
```

---

## Built With AI

This project was built entirely using AI-assisted development (vibe coding) with **Claude Code** (Claude Opus). See [VIBE_CODING_JOURNEY.md](VIBE_CODING_JOURNEY.md) for the full story of how AI tools shaped every aspect of the project — from architecture to implementation to this README.

---

## License

[MIT](LICENSE)
