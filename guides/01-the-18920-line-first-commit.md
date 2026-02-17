# The 18,920-Line First Commit: How to Prompt for a Full-Stack Architecture in One Shot

## The Conventional Approach Is Wrong

Most people using AI coding assistants work file by file. "Write me a React component for X." "Now write the API endpoint." "Now the database schema." Each prompt starts from scratch, and the AI has to infer context from whatever you've told it so far.

This is like hiring an architect and asking them to design one room at a time without showing them the floor plan.

The alternative: describe the entire system in one prompt and let the AI hold the full architecture in context while it generates everything coherently.

## What We Did

The first commit of Geotab Geoff — an AI-powered fleet safety coaching platform — was 18,920 lines across 60 files. It included:

- 15 React components with routing, auth, and state management
- 8 Cloud Functions (Node.js) with Firestore triggers and HTTP endpoints
- Complete Firestore schema with security rules
- Geotab API integration (authentication, event fetching, data enrichment)
- Gemini AI coaching prompt engineering with structured JSON output
- Cloud TTS and STT integration
- Role-based routing (driver view vs. supervisor dashboard)
- Firebase Hosting configuration

All generated in under 50 minutes through conversation with Claude Code.

## The Prompt Structure That Works

Your initial prompt needs three things:

### 1. The Vision (What and Why)

Don't just describe features. Describe the system's purpose and the user experience:

```
Design a system where an AI coach named Geoff reviews a driver's
safety events from Geotab and has a voice conversation about them.
Drivers see their recent shifts, select one, and Geoff delivers
personalized coaching through a lip-synced video. Supervisors see
a dashboard with all active coaching sessions and an action queue
for escalated cases.
```

This gives the AI enough context to make coherent decisions across the entire stack. It knows the frontend needs two views, the backend needs coaching generation AND escalation logic, and the data model needs to connect drivers → events → sessions → actions.

### 2. The Tech Stack (Constraints)

Be specific about your technology choices. Don't let the AI pick:

```
- React + Vite on Firebase Hosting
- Cloud Functions v2 (Node.js 20) for the backend
- Firestore for real-time data
- Gemini 2.0 Flash via Vertex AI for coaching intelligence
- Google Cloud TTS for voice synthesis
- Firebase Auth with Google sign-in
- mg-api-js SDK v3.0.0 for the Geotab API
```

Why this matters: if the AI picks the tech stack, it'll choose what it knows best, not what fits your constraints. You know your deployment target, your team's skills, and your budget. The AI doesn't.

### 3. The Data Flow (How Things Connect)

Describe how data moves through the system:

```
1. Poll Geotab API for ExceptionEvents → store in Firestore
2. Group events by driver and shift
3. When a driver opens a session, fetch their events + GPS data +
   posted speed limits + Ace AI context
4. Send everything to Gemini to generate a coaching script
5. Synthesize the script to audio via Cloud TTS
6. Generate lip-synced video via Wav2Lip
7. Play the video in the browser
8. Driver responds via voice → transcribe → send back to Gemini
   for multi-turn conversation
9. Evaluate every response for escalation triggers
10. Escalated sessions appear in the supervisor action queue
```

This is the most important part. It forces the AI to design APIs, data models, and component hierarchies that actually connect. Without it, you get 60 files that don't talk to each other.

## What You Get vs. What You Don't

### You Get

- **Coherent architecture.** Every component knows about every other component. The React frontend calls the right Cloud Functions. The Firestore schema supports the queries the frontend needs. The Gemini prompts output JSON that the frontend can render.

- **Working boilerplate.** Auth flow, routing, Firestore listeners, error handling, loading states — all the boring stuff that takes forever to write manually.

- **Consistent patterns.** If the first Cloud Function uses a certain error handling pattern, they all do. If the first React component uses a certain state management approach, they all do.

### You Don't Get

- **Production-quality logic.** The coaching prompts will need tuning. The escalation thresholds will be too weak or too strong. The UI will be functional but not polished.

- **Edge cases.** The AI generates the happy path. Error recovery, offline handling, rate limiting — these come in subsequent iterations.

- **Domain expertise.** The AI doesn't know that 15 mph over the speed limit is a critical safety event but 3 mph over is noise. Domain-specific logic needs human input.

## The Iteration Pattern

The first commit is a foundation, not a product. The real work happens in the next 5-10 commits:

```
Commit 1:  18,920 lines — full scaffold
Commit 2:  +101 -33   — fix coaching quality + location detection
Commit 3:  +229 -28   — add lipsync video, escalation
Commit 4:  +18 -3     — strengthen escalation triggers
Commit 5:  +624 -61   — add MyGeotab Add-In
```

Notice the pattern: the first commit is massive, then every subsequent commit is surgical. You're not building from scratch anymore — you're refining a working system. Each conversation with the AI starts from a codebase that already works, so the AI can focus on the specific improvement you need.

## Practical Tips

**1. Don't split the initial prompt.** If you describe the frontend in one prompt and the backend in another, the AI loses cross-stack coherence. One prompt, one architecture.

**2. Name things in your prompt.** "A function called `beginCoaching` that takes a session ID" is better than "an endpoint to start coaching." Names propagate through the codebase and make everything grep-able.

**3. Describe the user journey, not the implementation.** "The driver logs in, sees their recent shifts, selects one, and Geoff starts talking" is better than "create a shift list component with a click handler that calls the coaching API."

**4. Include your deployment target.** "Firebase Hosting + Cloud Functions" tells the AI to use Firebase-specific patterns (Firestore triggers, Firebase Auth, etc.) instead of generic Express.js patterns.

**5. Run it immediately after generation.** Don't read 18,920 lines. Build it, deploy it, click through it. The bugs you find by using it are more valuable than the bugs you find by reading it.

**6. Version control before you touch anything.** That first commit is your foundation. Every change after that is a diff you can reason about, revert, or learn from.

## The Meta-Lesson

The 18,920-line first commit isn't about writing code fast. It's about **holding architecture in context.** A human developer building this system would make the same decisions — React for the frontend, Firestore for real-time data, Cloud Functions for the backend — but they'd make them incrementally, often discovering conflicts between early and late decisions. The AI makes all the decisions simultaneously, with full visibility into how they interact.

This is the actual superpower of AI-assisted development: not faster typing, but **coherent complexity.**
