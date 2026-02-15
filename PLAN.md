# Geotab Geoff — Implementation Plan

## Overview
**Geotab Geoff** is an AI-powered fleet safety coaching platform for the Geotab Vibe Coding Hackathon (deadline: March 2, 2026). A 3D avatar ("Geoff") has real-time voice conversations with drivers about safety events, while supervisors monitor outcomes and action escalations through an analytics dashboard.

## Target Awards
| Award | Prize | Our Angle |
|-------|-------|-----------|
| **Vibe Master** | $10,000 | Complete two-sided platform with production architecture |
| **Innovator** | $5,000 | Real-time 3D avatar coaching — nobody else is doing this |
| **Disruptor** | $2,500 | Flipping safety from punitive reports to proactive conversations |
| **Best Use of Google Tools** | $2,500 | Gemini + Cloud TTS + STT + Cloud Run + Firebase (8+ GCP services) |
| **Green Award** | $2,500 | Safer driving = fewer accidents = less fuel waste = lower emissions |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  BROWSER — Firebase Hosting (Global CDN, 200+ edge locations)  │
│  ├── React App (Vite)                                          │
│  ├── TalkingHead.js + Three.js (bundled, client-side lipsync)  │
│  ├── Geoff.glb (3D avatar model from Cloud Storage)            │
│  ├── Web Speech API / Cloud STT (driver voice input)           │
│  └── Firebase SDK (Auth + Firestore real-time listeners)       │
│                                                                 │
│  Two views, role-based:                                        │
│  ├── /driver — In-cab coaching experience                      │
│  └── /dashboard — Supervisor analytics & action queue          │
└───────────────────────┬─────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│  GCP BACKEND                                                    │
│  ├── Firebase Auth (Google sign-in, role: driver | supervisor)  │
│  ├── Cloud Functions (Node.js / Python)                        │
│  │   ├── onSafetyEvent — Geotab API poll/webhook trigger       │
│  │   ├── generateCoaching — Ace AI context + Gemini script     │
│  │   ├── synthesizeSpeech — Cloud TTS (Neural2, SSML)          │
│  │   ├── transcribeResponse — Cloud STT                        │
│  │   ├── continueConversation — Gemini multi-turn              │
│  │   └── aggregateAnalytics — daily rollup for dashboard       │
│  ├── Firestore                                                 │
│  │   ├── drivers/{driverId}                                    │
│  │   ├── events/{eventId}                                      │
│  │   ├── sessions/{sessionId}                                  │
│  │   ├── fleets/{fleetId}/analytics                            │
│  │   └── actions/{actionId}                                    │
│  ├── Cloud Storage (Geoff.glb, audio files, cached assets)     │
│  └── Geotab API (safety events, GPS, telemetry)                │
│      └── Ace AI (contextual fleet queries for coaching prep)   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Driver Coaching Flow
```
Geotab Safety Event (ExceptionEvent)
  │
  ▼
Cloud Function: onSafetyEvent
  ├── Fetch event context (LogRecords, StatusData for location/speed)
  ├── Query Ace AI: "What are this driver's patterns this month?"
  ├── Query Ace AI: "Any similar events at this location fleet-wide?"
  │
  ▼
Cloud Function: generateCoaching
  ├── Feed context to Gemini with Geoff system prompt
  ├── Generate initial coaching script (SSML-annotated)
  │
  ▼
Cloud Function: synthesizeSpeech
  ├── Cloud TTS Neural2 voice (warm, authoritative)
  ├── Settings: 0.9x speed, lower pitch, pauses before data points
  ├── Store audio in Cloud Storage
  │
  ▼
Firestore: session created (status: "ready")
  │
  ▼
Driver's tablet: Firestore listener fires
  ├── "Incoming: Geoff" notification
  ├── Driver taps Accept
  ├── TalkingHead loads Geoff.glb + streams audio
  ├── Geoff speaks, lips sync in real-time
  │
  ▼
Driver responds (Web Speech API → Cloud STT)
  │
  ▼
Cloud Function: continueConversation
  ├── Gemini multi-turn with full transcript context
  ├── Generate response → Cloud TTS → stream to TalkingHead
  ├── Loop until session closes
  │
  ▼
Session outcome stored in Firestore
  ├── acknowledged | positive | escalated | disputed
  └── Supervisor dashboard updates in real-time
```

### Supervisor Dashboard Flow
```
Firestore real-time listeners
  │
  ├── Live Conversation Feed
  │   └── All active/recent coaching sessions
  │
  ├── Action Queue
  │   └── Escalated items (route changes, disputes)
  │   └── Supervisor can: Approve / Deny / Discuss
  │
  └── Analytics
      ├── Outcomes by type (pie/bar chart)
      ├── Top recommendations this period
      ├── Coaching engagement rate
      ├── Driver safety score trends
      └── Pattern detection summary
```

## Firestore Schema

```javascript
// drivers/{driverId}
{
  name: "Mike Johnson",
  email: "mike@acmetrucking.com",
  geotabDeviceId: "b123",
  fleetId: "acme_trucking",
  role: "driver",
  safetyScore: 87,
  streakDays: 21,
  coachingStats: {
    totalSessions: 45,
    acknowledged: 38,
    disputed: 2,
    escalated: 5
  }
}

// events/{eventId}
{
  driverId: "mike_johnson",
  fleetId: "acme_trucking",
  type: "hard_brake",         // hard_brake | speeding | harsh_accel | idle
  timestamp: Timestamp,
  location: GeoPoint,
  geotabData: {
    ruleId: "...",
    speed: 28,
    speedLimit: 25,
    deceleration: -0.45,
    duration: 2.3
  },
  nearbyContext: {            // enriched by Ace AI
    locationName: "Lincoln Elementary School",
    locationType: "school_zone",
    recentFleetEvents: 3,     // similar events at this location
    driverPatternNote: "3rd event this week on Route 7"
  },
  coachingStatus: "pending" | "ready" | "in_progress" | "completed"
}

// sessions/{sessionId}
{
  eventId: "event_123",
  driverId: "mike_johnson",
  fleetId: "acme_trucking",
  status: "completed" | "escalated" | "disputed" | "in_progress",
  startedAt: Timestamp,
  completedAt: Timestamp,

  transcript: [
    { speaker: "geoff", text: "...", audioUrl: "gs://...", timestamp: Timestamp },
    { speaker: "driver", text: "...", timestamp: Timestamp }
  ],

  coachAnalysis: {
    eventType: "hard_brake",
    pattern: "recurring_location",
    sentiment: "defensive_driving_positive",
    recommendation: {
      type: "none" | "route_change" | "timing_adjustment" | "training",
      details: "Shift Route 7 departure to 3:15pm",
      confidence: 0.87
    }
  },

  outcome: {
    type: "acknowledged" | "positive" | "escalated" | "disputed",
    driverResponse: "...",
    supervisorAction: null | {
      actionTaken: "approved_route_change",
      supervisorId: "jane_supervisor",
      timestamp: Timestamp,
      notes: "Approved, effective Monday"
    }
  }
}

// fleets/{fleetId}/analytics/{date}
{
  date: "2026-02-15",
  totalConversations: 47,
  outcomes: {
    positive: 12,
    acknowledged: 28,
    escalated: 5,
    disputed: 2
  },
  recommendationTypes: {
    route_change: 8,
    timing_adjustment: 6,
    following_distance: 4
  },
  avgResponseTime: 45,
  engagementRate: 0.89,
  escalationRate: 0.11
}

// actions/{actionId}
{
  sessionId: "session_456",
  fleetId: "acme_trucking",
  type: "route_change" | "schedule_adjustment" | "training_referral",
  status: "pending" | "approved" | "denied" | "discussed",
  createdAt: Timestamp,
  summary: "Shift Route 7 departure to 3:15pm to avoid school dismissal",
  driverInput: "I'd prefer the later departure if dispatch approves",
  coachRationale: "3 hard brake events this week, all between 2:30-3:00pm...",
  supervisorId: null,
  resolvedAt: null,
  resolution: null
}
```

## GCP Services Used (8+ for Google Tools Award)
| # | Service | Use |
|---|---------|-----|
| 1 | Firebase Auth | Google sign-in, role-based access |
| 2 | Firebase Hosting | Static frontend with global CDN |
| 3 | Cloud Functions | Event-driven serverless backend |
| 4 | Firestore | Real-time data (drivers, events, sessions, analytics) |
| 5 | Gemini API | Coaching script generation, conversation logic |
| 6 | Cloud TTS (Neural2) | High-quality voice synthesis with SSML |
| 7 | Cloud STT | Driver response transcription |
| 8 | Cloud Storage | Audio files, 3D model, cached assets |

## Geoff's Persona & System Prompt (Draft)

```
You are Geoff, a fleet safety coaching assistant for Geotab. You have a warm,
conversational tone — like a trusted coworker who happens to have perfect recall
of every piece of telemetry.

Your personality:
- Helpful, never punitive. You're on the driver's side.
- Data-informed but conversational. You know the numbers but don't lecture.
- You celebrate good behavior as much as you coach on incidents.
- You escalate gracefully when a driver needs supervisor involvement.

Your voice style:
- Use the driver's first name
- Keep sentences short and clear (noisy cab environment)
- Pause before stating specific data points
- If the event was good defensive driving, say so
- If there's a pattern, frame it as "what I'm seeing in the data"
- Never blame. Always frame as collaborative problem-solving.

When generating coaching scripts, use SSML markup:
- <break time="500ms"/> before data points
- Slightly slower speaking rate for key information
- Natural conversational pacing

Example opening (hard brake, appears defensive):
"Hey Mike, Geoff here. Got a sec? I saw that stop near Lincoln Elementary
around 2:47. Looked at the data — you went from 28 to 4 pretty quick, but
the deceleration curve was controlled. Honestly? Looks like good defensive
driving to me. Just wanted to check in. Everything okay out there?"

Example opening (pattern detected):
"Sarah, this is the third time this week we've had a hard stop on Route 7
near that school. I don't think it's you — I think it's the route timing
hitting school dismissal. Want me to flag a schedule adjustment for your
supervisor? You'd leave 15 minutes later but skip the chaos."

Example (positive reinforcement):
"Dave! Geoff here. No incidents this week. That's three weeks running.
Just wanted to say — nice driving. Keep it up."
```

## Project Structure

```
geoff/
├── PLAN.md
├── notes.txt
├── package.json
├── vite.config.js
├── firebase.json
├── firestore.rules
├── .firebaserc
├── .env                          # Geotab creds, GCP keys (gitignored)
├── .env.example
├── .gitignore
│
├── public/
│   ├── index.html
│   ├── manifest.json             # PWA manifest
│   └── geoff-icon.png
│
├── src/
│   ├── main.jsx                  # App entry point
│   ├── App.jsx                   # Router: /driver vs /dashboard
│   ├── firebase.js               # Firebase config + init
│   │
│   ├── components/
│   │   ├── auth/
│   │   │   └── Login.jsx         # Google sign-in
│   │   │
│   │   ├── driver/
│   │   │   ├── DriverHome.jsx    # Pending coaching sessions list
│   │   │   ├── CoachingSession.jsx  # TalkingHead + conversation UI
│   │   │   ├── GeoffAvatar.jsx   # TalkingHead wrapper component
│   │   │   └── VoiceInput.jsx    # Web Speech API / Cloud STT
│   │   │
│   │   └── dashboard/
│   │       ├── DashboardHome.jsx # Overview cards + nav
│   │       ├── LiveFeed.jsx      # Real-time coaching session feed
│   │       ├── ActionQueue.jsx   # Escalated items requiring response
│   │       ├── Analytics.jsx     # Charts + trends
│   │       └── SessionDetail.jsx # Drill-down into a single session
│   │
│   ├── hooks/
│   │   ├── useAuth.js            # Firebase auth state
│   │   ├── useFirestore.js       # Firestore real-time listeners
│   │   └── useSpeech.js          # TTS/STT integration
│   │
│   ├── services/
│   │   ├── geotab.js             # Geotab API client
│   │   ├── ace.js                # Ace AI query wrapper
│   │   ├── coaching.js           # Call Cloud Functions for coaching
│   │   └── tts.js                # Cloud TTS API wrapper
│   │
│   └── styles/
│       └── index.css
│
├── functions/
│   ├── package.json
│   ├── index.js                  # Cloud Functions entry
│   ├── geotab/
│   │   ├── client.js             # Geotab API auth + methods
│   │   ├── events.js             # Fetch ExceptionEvents
│   │   └── ace.js                # Ace AI queries
│   ├── coaching/
│   │   ├── generator.js          # Gemini prompt + script generation
│   │   ├── conversation.js       # Multi-turn conversation logic
│   │   └── prompts.js            # System prompts for Geoff persona
│   ├── speech/
│   │   ├── tts.js                # Cloud TTS synthesis
│   │   └── stt.js                # Cloud STT transcription
│   └── analytics/
│       └── aggregator.js         # Daily analytics rollup
│
└── assets/
    └── geoff.glb                 # 3D Geoff model (you build in Blender)
```

## Phase-by-Phase Build Plan

### Phase 1: Foundation (Day 1-2)
- [ ] Register for hackathon at https://luma.com/h6ldbaxp
- [ ] Create Geotab demo database at https://my.geotab.com/registration.html
- [ ] Create GCP project, enable APIs (Firestore, Functions, TTS, STT, Gemini, Storage)
- [ ] Set up Firebase project (Auth, Hosting, Firestore)
- [ ] Initialize React app with Vite
- [ ] Set up Firebase Auth (Google sign-in) with role field
- [ ] Deploy "hello world" to Firebase Hosting
- [ ] Clone geotab-vibe-guide repo, load VIBE_CODING_CONTEXT.md

### Phase 2: Geotab Integration (Day 2-3)
- [ ] Authenticate with Geotab API using demo database credentials
- [ ] Fetch ExceptionEvents (safety events) from demo data
- [ ] Fetch LogRecords for location/speed context around events
- [ ] Fetch StatusData for accelerometer/engine state
- [ ] Integrate Ace AI for contextual queries (driver patterns, location history)
- [ ] Cloud Function: onSafetyEvent (poll or scheduled trigger)
- [ ] Store enriched events in Firestore

### Phase 3: Coaching Engine (Day 3-5)
- [ ] Design Geoff system prompt with persona, tone, SSML guidelines
- [ ] Cloud Function: generateCoaching (Ace context + Gemini script)
- [ ] Cloud Function: synthesizeSpeech (Cloud TTS Neural2 with SSML)
- [ ] Store audio in Cloud Storage, update Firestore session status
- [ ] Cloud Function: transcribeResponse (Cloud STT)
- [ ] Cloud Function: continueConversation (Gemini multi-turn)
- [ ] Test end-to-end: event → script → audio → transcript → response

### Phase 4: Driver Interface (Day 5-8)
- [ ] Integrate TalkingHead.js + Three.js into React app
- [ ] Load Geoff.glb (use stock avatar initially, swap when custom is ready)
- [ ] Build CoachingSession component: avatar + audio playback + lipsync
- [ ] Build VoiceInput component: Web Speech API with fallback to Cloud STT
- [ ] Build DriverHome: list of pending coaching sessions
- [ ] "Incoming: Geoff" notification with Accept/Later
- [ ] Full conversation loop: Geoff speaks → driver responds → Geoff replies
- [ ] Session outcomes: acknowledge, dispute, request action
- [ ] Positive reinforcement sessions (no incident, streak recognition)

### Phase 5: Supervisor Dashboard (Day 8-11)
- [ ] Build DashboardHome with overview cards (total sessions, outcomes, alerts)
- [ ] Build LiveFeed: real-time list of coaching sessions with status indicators
- [ ] Build ActionQueue: escalated items with approve/deny/discuss actions
- [ ] Build SessionDetail: full transcript, coach analysis, driver response
- [ ] Build Analytics: outcome breakdown charts, recommendation trends
- [ ] Wire supervisor actions back to Firestore → update driver-facing state
- [ ] Closed loop: supervisor approves route change → Geoff notifies driver

### Phase 6: Polish & Barcelona Angle (Day 11-13)
- [ ] Multi-language: Spanish coaching scripts (Gemini generates, TTS es-ES voice)
- [ ] PWA manifest + service worker (add-to-homescreen)
- [ ] Responsive design: tablet-optimized driver view, desktop supervisor view
- [ ] Error handling, loading states, offline graceful degradation
- [ ] Cloud Armor basic DDoS protection (stretch)

### Phase 7: 3D Geoff Model (Parallel Track — You)
- [ ] Install Blender + MPFB plugin
- [ ] Create middle-aged male character matching Geoff reference image
- [ ] Add clothing (work shirt, high-vis vest)
- [ ] Export GLB with ARKit blend shapes + Oculus visemes
- [ ] Test in TalkingHead, iterate on appearance
- [ ] Upload final Geoff.glb to Cloud Storage

### Phase 8: Demo & Submission (Day 13-16)
- [ ] Record submission video (< 5 minutes)
  - Open with the problem: "Fleet managers hate coaching conversations. Drivers hate being called into the office."
  - Live demo: safety event triggers Geoff conversation
  - Show Geoff speaking, driver responding, conversation flowing
  - Show supervisor dashboard: live feed, action queue, analytics
  - Show positive reinforcement: Geoff celebrating good driving
  - Barcelona angle: "Geoff speaks Spanish. Deploy globally on day one."
  - Architecture flex: "8 GCP services, Firebase Hosting CDN, production-ready"
  - Ecosystem integration: Social Mobile Rhino T8, T-Mobile, RAM Mounts, Lytx
- [ ] Write submission description
- [ ] Final deploy, smoke test live URL
- [ ] Submit

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend framework | React + Vite | Fast dev, Firebase SDK works natively |
| Hosting | Firebase Hosting | Free, global CDN, SSL, one-command deploy |
| Avatar tech | TalkingHead.js (client-side) | Instant lipsync, zero compute cost per turn |
| 3D model source | Blender + MPFB | Free, open source, TalkingHead-compatible |
| LLM | Gemini (primary) | "Best Use of Google Tools" award play |
| TTS | Cloud TTS Neural2 | High quality, SSML support, noise-optimized |
| STT | Web Speech API (primary), Cloud STT (fallback) | Zero-latency primary, reliable fallback |
| Database | Firestore | Real-time listeners, serverless, multi-region |
| Fleet data context | Ace AI | Judges want "Use of Both APIs" |
| Coaching generation | Gemini with Ace-enriched context | Best of both: Ace for data, Gemini for narrative |

## Submission Talking Points

### The Pitch
"Geoff talks to your drivers so you don't have to. When a safety event happens, Geoff reviews the telemetry, reconstructs what happened, and has a real-time voice conversation with the driver — not a report, not an email, a conversation. Supervisors see every interaction, every outcome, every recommendation in a live analytics dashboard. Geoff runs on the hardware fleets already have, speaks the driver's language, and deploys globally on day one."

### Ecosystem Integration
"Coach integrates with the Geotab ecosystem you already have. Your Social Mobile Rhino T8 holds the tablet. Your Lytx or Netradyne camera provides the driver-facing view. T-Mobile provides connectivity. Geotab provides the safety event data. Geoff provides the conversation."

### Barcelona Angle
"Geoff is deployed globally today. When Geotab Connect Europe opens in Barcelona this summer, you could demo live coaching conversations with European drivers — same infrastructure, same Geoff, speaking Spanish. No additional buildout required."

### Sustainability Angle (Green Award)
"Safer driving means fewer accidents, fewer emergency brakes, smoother routes, less fuel burned. Every coaching conversation that prevents a hard brake event or optimizes a route timing directly reduces fuel consumption and emissions. Geoff doesn't just coach safety — he coaches sustainability."
