# Podcast: The 18,920-Line First Commit

**Duration:** 7:54
**Speakers:** Alex (male), Maya (female)
**Generated with:** Google Cloud TTS Neural2-D (Alex) + Neural2-C (Maya), assembled with ffmpeg

---

**MAYA:** So today we're talking about something that sounds almost impossible. Eighteen thousand, nine hundred and twenty lines of code. Sixty files. One commit. And it was generated in under fifty minutes. Alex, you were there when this happened. Walk us through it.

**ALEX:** Yeah, so this was the first commit of a project called Geotab Geoff. It's an AI-powered fleet safety coaching platform. An animated avatar coaches truck drivers about their safety events through actual voice conversations. The whole thing, React frontend, Cloud Functions backend, Firestore database, Geotab API integration, Gemini AI prompts, all of it, came out of a single conversation with Claude Code.

**MAYA:** Okay, but let's back up. Most developers I know use AI assistants to write one file at a time. Write me a component. Now write the API endpoint. Now the database schema. You're saying that's the wrong approach?

**ALEX:** It's like hiring an architect and asking them to design one room at a time, without ever showing them the floor plan. Each prompt starts from scratch. The AI has to guess what the rest of the system looks like. And when you finally wire everything together, nothing fits. The frontend calls APIs that don't exist. The database schema doesn't support the queries you need. The patterns are inconsistent across files.

**MAYA:** So the alternative is, describe the entire system at once and let the AI hold the full architecture in context.

**ALEX:** Exactly. And the initial prompt needs three specific things. First, the vision. Not features, but the system's purpose and the user experience. For Geoff, it was something like: design a system where an AI coach reviews a driver's safety events and has a voice conversation about them. Drivers see their shifts, select one, and Geoff delivers coaching through a lip-synced video. Supervisors see a dashboard with escalated sessions.

**MAYA:** That's pretty high-level though. How does the AI know what tech stack to use?

**ALEX:** That's the second thing. You specify the tech stack explicitly. React plus Vite on Firebase Hosting. Cloud Functions v2 with Node.js 20. Firestore for real-time data. Gemini 2.0 Flash for coaching intelligence. Cloud TTS for voice. If you let the AI pick the stack, it'll choose what it knows best, not what fits your constraints. You know your deployment target, your team's skills, your budget. The AI doesn't.

**MAYA:** And the third thing?

**ALEX:** The data flow. This is the most important part. You describe how data moves through the system, step by step. Poll the Geotab API for safety events, store them in Firestore. Group events by driver and shift. When a driver opens a session, fetch their events plus GPS data plus speed limits. Send everything to Gemini to generate a coaching script. Synthesize it to audio. Generate a lip-synced video. Play it in the browser. Driver responds via voice. Transcribe. Send back to Gemini for multi-turn conversation. Evaluate for escalation. Escalated sessions go to the supervisor queue.

**MAYA:** That's a ten step pipeline. And describing it up front forces the AI to design APIs and data models that actually connect to each other.

**ALEX:** Right. Without the data flow, you get sixty files that don't talk to each other. With it, every component knows about every other component. The React frontend calls the right Cloud Functions. The Firestore schema supports the queries the frontend needs. The Gemini prompts output JSON that the frontend can actually render.

**MAYA:** So what do you actually get from this approach? Eighteen thousand lines is a lot. Is it all good code?

**ALEX:** You get three things. Coherent architecture, meaning everything connects properly. Working boilerplate, meaning auth flows, routing, Firestore listeners, error handling, loading states, all the boring stuff that takes forever to write by hand. And consistent patterns, meaning if the first Cloud Function handles errors a certain way, they all do. But you don't get production-quality logic. The coaching prompts need tuning. The escalation thresholds are wrong. The UI is functional but not polished. And you don't get edge cases or domain expertise.

**MAYA:** So the first commit is a foundation, not a finished product.

**ALEX:** Exactly. And here's where the iteration pattern gets interesting. The first commit was eighteen thousand nine hundred lines. The second commit? Plus one hundred one, minus thirty three. Fix coaching quality and location detection. Third commit, plus two twenty nine, minus twenty eight. Add lipsync video and escalation. Fourth commit, plus eighteen, minus three. Strengthen escalation triggers.

**MAYA:** So the initial commit is massive, and then every commit after that is surgical.

**ALEX:** That's the key insight. You're not building from scratch anymore. You're refining a working system. Each conversation with the AI starts from a codebase that already works, so it can focus on the specific improvement you need. It's a completely different workflow than building file by file.

**MAYA:** Let's talk practical tips. If someone listening right now wants to try this approach, what should they know?

**ALEX:** Six things. One, don't split the initial prompt. Frontend in one prompt and backend in another loses cross-stack coherence. One prompt, one architecture. Two, name things in your prompt. Say a function called beginCoaching that takes a session ID, not just an endpoint to start coaching. Names propagate through the codebase. Three, describe the user journey, not the implementation. The driver logs in, sees their shifts, selects one, and Geoff starts talking. Don't say, create a shift list component with a click handler.

**MAYA:** What about the other three?

**ALEX:** Four, include your deployment target. Saying Firebase Hosting plus Cloud Functions tells the AI to use Firebase-specific patterns instead of generic Express. Five, run it immediately after generation. Do not read eighteen thousand lines. Build it, deploy it, click through it. The bugs you find by using it are more valuable than the bugs you find by reading it. And six, version control before you touch anything. That first commit is your foundation. Every change after that is a diff you can reason about.

**MAYA:** So what's the meta-lesson here? What's actually happening when the AI generates eighteen thousand lines in fifty minutes?

**ALEX:** It's not about writing code fast. It's about holding architecture in context. A human developer building this system would make the same decisions. React for the frontend. Firestore for real-time data. Cloud Functions for the backend. But they'd make those decisions incrementally, over days, often discovering conflicts between early and late decisions. The AI makes all the decisions simultaneously, with full visibility into how they interact. That's the superpower. Not faster typing. Coherent complexity.

**MAYA:** Coherent complexity. I like that. So to summarize: describe the whole system in one prompt, include vision, tech stack, and data flow. Let the AI generate the full scaffold. Then iterate surgically from a working foundation. Don't build room by room. Show the AI the whole floor plan.

**ALEX:** That's it. And version control that first commit. It's the most valuable commit in the repo.
