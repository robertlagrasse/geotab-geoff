# Going Global: Production Readiness for International Fleet Coaching

## The Starting Point

Geoff works. One region, one language, one avatar, one set of safety assumptions. A driver in the U.S. demo database gets coached in English by a lip-synced photo of a friendly guy. The architecture is sound — the pipeline chains Geotab telemetry through Gemini coaching, Cloud TTS voice synthesis, Cloud STT transcription, and Wav2Lip video generation.

But Geotab operates in **160 countries**. A production deployment needs to coach a driver in Barcelona in Catalan, a driver in S&atilde;o Paulo in Portuguese, and a driver in Tokyo in Japanese — all with low latency, region-appropriate safety knowledge, and a professional avatar. Here's what it takes to get there.

## What We Already Have

The multilingual foundation is built. Geoff currently supports 15 languages end-to-end:

| Component | What's Done | What It Means |
|-----------|------------|---------------|
| Language selection | Driver picks language on login, stored in Firestore | Preference persists across sessions |
| Gemini coaching | `languageInstruction()` tells the model to respond in the target language | No translated prompt templates needed — Gemini handles it natively |
| Cloud TTS | 15 Neural2 male voices, one per language | Natural speech output in each language |
| Cloud STT | Language code passed to Speech-to-Text | Accurate transcription in each language |
| Date/time formatting | Locale-aware `toLocaleString()` | "Wed 3:15 PM" vs "Mi. 15:15" |

This is enough for a demo. Production needs more.

## 1. Multi-Region GPU Deployment

### The Problem

The lipsync container runs on a single NVIDIA L4 in `us-east4`. A driver in Berlin waits for a round trip to Virginia. A driver in Tokyo waits even longer. GPU inference takes 5-15 seconds — adding 200ms of network latency is noise. But the cold start is the killer: if the instance has scaled to zero, the driver waits 30-60 seconds for the container to boot, load PyTorch, and warm the model. That's acceptable when you control the demo. It's not acceptable when 10,000 drivers across 3 continents are starting shifts at 6 AM local time.

### The Architecture

Deploy the lipsync container to **3 regions** minimum:

| Region | Cloud Run Region | Coverage |
|--------|-----------------|----------|
| Americas | us-east4 or us-central1 | North/South America |
| Europe | europe-west4 (Netherlands) | EU, UK, Middle East, Africa |
| Asia-Pacific | asia-northeast1 (Tokyo) | East Asia, Australia, India |

Each region runs the same container image from Artifact Registry. The backend routes lipsync requests to the nearest region based on the fleet's configured region or the driver's locale.

### Cold Start Strategy at Scale

Scale-to-zero saves money but kills UX. At production scale:

- **Min instances = 1** per region during business hours. GPU idle cost is ~$0.75/hour per L4. Three regions, 12 hours/day = ~$27/day. That's the cost of one human coaching session.
- **Scheduled scaling**: Cloud Scheduler triggers `/health` at 5:30 AM local time to pre-warm instances before the morning shift rush.
- **Request-based warmup**: The frontend already hits `/health` on user login. At scale, the fleet management portal could fire warmup calls when a supervisor starts their shift, pre-warming for the drivers that will follow.

### Request Routing

The `LIPSYNC_API` environment variable is currently a single URL. For multi-region:

```javascript
const LIPSYNC_REGIONS = {
  'us': 'https://lipsync-xxxxx.us-east4.run.app',
  'eu': 'https://lipsync-xxxxx.europe-west4.run.app',
  'ap': 'https://lipsync-xxxxx.asia-northeast1.run.app',
};

function getLipsyncUrl(fleetRegion) {
  return LIPSYNC_REGIONS[fleetRegion] || LIPSYNC_REGIONS['us'];
}
```

The fleet's region is a natural property of the Geotab account — Geotab already knows which server a fleet lives on (my.geotab.com vs my###.geotab.com). Map Geotab server URLs to cloud regions.

## 2. Avatar Upgrade: From Wav2Lip to Synthesia

### What We Have Now

Wav2Lip takes a static photo (`geoff.png`) and an audio file, then generates a video where the lips move in sync with the speech. It's remarkable for a research model running in a container — but it has limits:

- **Resolution**: Output is usable but not sharp. The face region is 96x96 pixels internally, upscaled to the source image resolution.
- **Expression**: Only the mouth moves. No eyebrow raises, no head tilts, no gestures. Geoff looks like he's reading a teleprompter.
- **Speed**: 5-15 seconds per clip on an L4 GPU. Acceptable, not great.
- **Uncanny valley**: At some point, a still photo with moving lips stops being charming and starts being unsettling.

### What Synthesia Offers

[Synthesia](https://www.synthesia.io/) (and competitors like HeyGen, D-ID, Tavus) are commercial deepfake-as-a-service platforms:

- **Custom avatars**: Film a real person for 10-15 minutes. The platform builds a personalized deepfake model. Geotab could use their own spokesperson, a regional safety officer, or different personas for different markets.
- **Full body movement**: Head tilts, hand gestures, facial expressions — not just lips.
- **Multi-language voice cloning**: The avatar speaks any language with the same person's voice. One actor, 15 languages.
- **API-driven**: Send text, receive video. Same integration pattern as the current lipsync service.
- **Speed**: Synthesia's API generates videos in seconds, with enterprise SLAs.

### Migration Path

The architecture is already modular. `generateLipsyncVideo()` in `functions/index.js` is a single function that takes an audio URL and returns a video URL. Swapping backends means changing that one function:

```javascript
// Current: self-hosted Wav2Lip on Cloud Run
async function generateLipsyncVideo(audioUrl) {
  const res = await fetch(`${LIPSYNC_API}/lipsync`, { ... });
  // Upload MP4 to Cloud Storage, return URL
}

// Future: Synthesia API
async function generateLipsyncVideo(text, language) {
  const res = await fetch('https://api.synthesia.io/v2/videos', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SYNTHESIA_API_KEY}` },
    body: JSON.stringify({
      input: [{ script: text, language, avatar: GEOFF_AVATAR_ID }],
    }),
  });
  // Poll for completion, return video URL
}
```

Note the interface shift: Synthesia takes **text** (not audio) because it handles TTS internally with the cloned voice. This simplifies the pipeline — Cloud TTS becomes unnecessary for the video path, though you'd still want it as a fallback and for audio-only delivery.

### Cost Comparison

| | Wav2Lip (self-hosted) | Synthesia (API) |
|---|---|---|
| Per video | ~$0.002 (GPU time) | ~$0.50-2.00 (API pricing) |
| Quality | Research-grade | Broadcast-grade |
| Custom avatar | Any photo | Requires filming + model training |
| Setup | Docker + GPU quota | API key |
| Latency | 5-15s | 10-60s (async) |
| Voice | Separate Cloud TTS | Built-in voice cloning |

At $0.05/session currently, switching to Synthesia would increase video cost by ~100x. But at enterprise fleet scale, the quality improvement and reduced operational complexity may justify it. And Synthesia pricing drops significantly with volume commitments.

### Hybrid Approach

Run both. Use the self-hosted Wav2Lip pipeline for routine coaching sessions where speed matters. Use Synthesia for high-stakes content: onboarding videos, safety training modules, escalation follow-ups where a supervisor-quality presentation matters. The session document already tracks `videoUrl` — the frontend doesn't care where the video came from.

## 3. Region-Specific Safety Regulations

### The Problem

Geoff currently coaches on universal driving principles: don't speed, don't brake harshly, don't follow too closely. That works for a demo. It doesn't work when a driver in Germany gets coached about speeding on an unrestricted section of the Autobahn, or when a driver in the UK needs to know that HGV speed limits differ from car limits, or when a Brazilian driver's maximum consecutive driving hours are governed by Lei do Descanso.

### What Geoff Needs to Know

| Category | Examples | Why It Matters |
|----------|----------|---------------|
| Speed limits | Autobahn variable limits, UK national speed limit by vehicle class, school zones | Coaching on "speeding" without knowing the legal limit is useless |
| Hours of Service | US FMCSA (11hr/14hr/70hr), EU Regulation 561/2006 (4.5hr/9hr/56hr), Brazil Lei do Descanso | Fatigue coaching must reference the actual legal limits |
| Vehicle-specific rules | CDL requirements, HGV restrictions, hazmat routing, ADR (dangerous goods) | A coaching session about a tanker driver needs different context than a delivery van |
| Regional enforcement | Penalty points systems, demerit points, license suspension thresholds | "This is your 5th speeding event" hits differently when the driver is 2 points from losing their license |
| Seasonal/conditional | Winter tire mandates, chain requirements, environmental zones (LEZ/ULEZ) | Context-aware coaching for conditions |

### Implementation: Regulatory Knowledge Base

Don't bake regulations into prompts. Build a structured knowledge layer:

```
regulations/
├── speed/
│   ├── DE.json    # Germany — Autobahn rules, variable limits, advisory speeds
│   ├── UK.json    # UK — national limits by road type and vehicle class
│   ├── US.json    # US — state-by-state variations, school zone rules
│   └── BR.json    # Brazil — rodovia speed classes
├── hours-of-service/
│   ├── FMCSA.json    # US federal hours of service
│   ├── EU-561.json   # EU driving/rest time regulation
│   └── BR-lei.json   # Brazil Lei do Descanso
└── vehicle-class/
    ├── CDL.json       # US commercial driver's license requirements
    └── HGV-UK.json    # UK heavy goods vehicle restrictions
```

Each JSON file contains structured rules that get injected into the Gemini coaching prompt as context. The fleet's country and vehicle class determine which regulation files load. This keeps the system prompt stable while varying the regulatory context:

```
REGULATORY CONTEXT FOR THIS DRIVER:
- Country: Germany (DE)
- Vehicle class: HGV > 7.5t
- Applicable speed regulations: [loaded from DE.json]
- Hours of service: EU Regulation 561/2006 — max 4.5hr continuous, 9hr daily, 56hr weekly
- Current shift duration: 3hr 45min (approaching 4.5hr continuous limit)
```

Now when Geoff coaches on a speeding event, he knows whether the driver was on an unrestricted Autobahn section or a 60 km/h urban zone. When he detects a long shift, he knows whether the driver is approaching EU or FMCSA limits.

### Geotab as the Data Source

Geotab already tracks much of this. The GO device knows the vehicle, the fleet configuration includes vehicle class, and the MyGeotab rules engine can encode regional speed limits. The Geotab SDK's `GetRoadMaxSpeeds` already returns posted speed limits from their map data. The opportunity is to **correlate** what Geotab knows about the rules with what Gemini knows about the coaching conversation.

The Ace AI integration is the natural bridge here. Today we query Ace for driver history context. In production, Ace queries could include regulatory questions: "Is this driver approaching their weekly driving hours limit?" or "What are the speed restrictions for this vehicle class in this region?"

## 4. Cultural Coaching Adaptation

### Beyond Translation

Language is the easy part. Culture is harder. A coaching style that works in the US — casual, first-name basis, "hey, let's talk about what happened" — may not land the same way in Japan, where hierarchical communication norms are different, or in Germany, where directness is valued but informality with a machine might feel odd.

### Personality Variants

The system prompt that defines Geoff's personality is a single block of text today. For production:

```javascript
const PERSONALITY_VARIANTS = {
  'en-US': { tone: 'casual-warm', nameUsage: 'first-name', humor: true },
  'de-DE': { tone: 'professional-direct', nameUsage: 'formal', humor: false },
  'ja-JP': { tone: 'respectful-indirect', nameUsage: 'family-name-san', humor: false },
  'es-ES': { tone: 'warm-expressive', nameUsage: 'first-name', humor: true },
  'ar-XA': { tone: 'respectful-formal', nameUsage: 'formal', humor: false },
};
```

These feed into the system prompt as behavioral guidelines. Gemini adapts its output — not just the language, but the communication style. This is where having a language model as the coaching engine pays off: you don't need to build 15 different coaching engines. You need one engine with 15 sets of cultural parameters.

### Escalation Sensitivity

The 7 escalation triggers need cultural calibration. "I'll keep doing what I'm doing" is an intentional violation flag in the US. In some cultures, it's a face-saving response that means "I heard you, I'll think about it." The escalation system needs regional thresholds, not universal ones. A server-side config per region adjusts trigger sensitivity without changing the model logic.

## 5. Data Residency and Compliance

### Where the Data Lives

Today everything runs through `us-central1` (Firestore, Cloud Functions) and `us-east4` (lipsync GPU). For international production:

- **EU fleets** need GDPR compliance. Driver coaching transcripts are personal data. Firestore regional instances in `europe-west` keep EU data in the EU.
- **Voice recordings** (the audio blobs sent for STT) are biometric data in some jurisdictions. Process and discard — don't store raw audio longer than needed for transcription.
- **Video assets** in Cloud Storage need the same regional treatment. A German driver's coaching video should live in an EU bucket.

### Multi-Region Firestore

Firestore supports [multi-region locations](https://cloud.google.com/firestore/docs/locations). Deploy separate Firestore instances per regulatory region:

| Region | Firestore Location | Covers |
|--------|-------------------|--------|
| Americas | nam5 (US) | US, Canada, Latin America |
| Europe | eur3 (EU) | EU, UK, Middle East |
| Asia-Pacific | asia-southeast1 | East Asia, Australia, India |

The fleet's regulatory region determines which Firestore instance holds their data. Cloud Functions in each region talk to the local Firestore.

### Consent and Transparency

Drivers need to know they're talking to an AI. This is already obvious in the current UX — Geoff is clearly an avatar. But regulatory frameworks like the EU AI Act require explicit disclosure for AI systems that interact with humans. The coaching session should include a consent acknowledgment on first use, and the session transcript should be available to the driver on request.

## 6. Production Monitoring

### What to Watch

| Metric | Why | Alert Threshold |
|--------|-----|----------------|
| TTS latency by language | Some languages may have slower voice models | > 3s |
| STT accuracy by language | Accented speech, noisy environments | Word error rate > 20% |
| Gemini language compliance | Did the model actually respond in the requested language? | Any English in non-English session |
| Lipsync GPU utilization by region | Capacity planning | > 80% sustained |
| Cold start frequency by region | UX impact | > 10% of requests hitting cold instances |
| Escalation rates by region | Cultural calibration check | Statistical outlier vs fleet average |
| Session completion rate by language | Are drivers in some languages dropping off more? | < 70% completion |

### Language Quality Auditing

Automated spot-checks: for a sample of non-English sessions, ask Gemini to evaluate whether the coaching response was actually in the correct language and whether it was natural (not machine-translation-quality). Log the results. This catches the case where Gemini silently falls back to English or produces awkward translations.

## 7. Deployment Roadmap

### Phase 1: Current State (Done)
- Single region (us-central1 + us-east4 GPU)
- 15 languages in Gemini + TTS + STT
- Self-hosted Wav2Lip avatar
- Universal coaching personality
- No regulatory context

### Phase 2: Multi-Region
- Deploy lipsync containers to 3 regions
- Add request routing by fleet region
- Implement min-instance scheduling for business hours
- Add language quality monitoring

### Phase 3: Regulatory Intelligence
- Build structured regulation knowledge base (speed, HoS, vehicle class)
- Inject regulatory context into Gemini coaching prompts
- Integrate with Geotab's regional rule sets
- Add regional escalation threshold configuration

### Phase 4: Professional Avatar
- Evaluate Synthesia / HeyGen for enterprise avatar quality
- Film custom Geotab spokesperson, build deepfake model
- Implement hybrid pipeline (self-hosted for routine, API for premium)
- Add voice cloning for consistent persona across languages

### Phase 5: Cultural Adaptation
- Implement personality variants per language/region
- Calibrate escalation triggers for cultural context
- Add consent/transparency flows for EU AI Act compliance
- Deploy multi-region Firestore for data residency

### Phase 6: Enterprise Scale
- Multi-tenant architecture (multiple fleet customers per deployment)
- SSO integration beyond Google Auth
- Audit logging and compliance reporting
- SLA monitoring and automated failover between regions

## The Bottom Line

The architecture is modular by design. The lipsync service is a container — deploy it anywhere GPUs are available. The coaching intelligence is a prompt — add regulatory context without rewriting the engine. The language support is a config — add a voice and a locale code. The avatar is a single integration point — swap Wav2Lip for Synthesia by changing one function.

Going from "works in a demo" to "coaches 100,000 drivers across 30 countries" is not a rewrite. It's configuration, regional deployment, and domain knowledge. The hardest part isn't the engineering — it's curating accurate regulatory knowledge for every country Geotab operates in. That's a content problem, not a code problem. And it's exactly the kind of problem that scales well with AI assistance.
