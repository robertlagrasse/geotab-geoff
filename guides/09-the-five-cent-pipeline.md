# The $0.05 Pipeline: How to Estimate AI Service Costs Before You Build

## Why This Matters

Most hackathon projects don't think about cost until someone asks "how much would this cost to run?" The answer is usually a shrug. But if you can say "$0.05 per session, $1 per driver per month, 500x cheaper than the manual alternative" — that's not a feature. That's a business case.

This guide shows how to estimate per-unit costs for a multi-service AI pipeline, using Geoff's coaching pipeline as the worked example.

## The Framework

Every AI pipeline has a cost structure that looks like this:

```
User action → Service A → Service B → Service C → Result
                  $X         $Y         $Z

Cost per action = $X + $Y + $Z
Cost per user per month = (cost per action) × (actions per month)
```

The key is knowing the pricing model for each service and estimating the volume per action.

## Geoff's Pipeline: Worked Example

A typical coaching session: Geoff delivers initial coaching (video), driver responds twice via voice, Geoff responds twice more.

### Service 1: Gemini 2.0 Flash (Coaching Generation)

**Pricing model:** Per token (input + output)
- Input: ~$0.10 per 1M tokens
- Output: ~$0.40 per 1M tokens

**Per coaching turn:**
- System prompt + event data + conversation history: ~2,000 input tokens
- Coaching response: ~500 output tokens

**Per session (3 turns):**
- Input: 3 × 2,000 = 6,000 tokens = $0.0006
- Output: 3 × 500 = 1,500 tokens = $0.0006
- **Total: ~$0.001**

### Service 2: Cloud Text-to-Speech (Neural2)

**Pricing model:** Per character
- Neural2 voices: $16 per 1M characters

**Per coaching turn:**
- Coaching response: ~500 characters
- Cost: 500 × $0.000016 = $0.008

**Per session (3 turns):**
- 3 × $0.008 = **$0.024**

### Service 3: Cloud Run GPU — Wav2Lip (Lipsync Video)

**Pricing model:** Per second of GPU time
- NVIDIA L4: ~$0.000325/second

**Per video:**
- Processing time: ~10 seconds GPU
- Cost: 10 × $0.000325 = $0.00325

**Per session (3 videos):**
- 3 × $0.00325 ≈ **$0.006** (rounded down due to faster warm requests)

### Service 4: Cloud Speech-to-Text (Driver Voice Input)

**Pricing model:** Per 15-second interval
- Enhanced model: $0.009 per 15 seconds

**Per voice input:**
- Average driver response: ~10 seconds
- Cost: 1 interval × $0.009 = $0.009

**Per session (2 voice inputs):**
- 2 × $0.009 = **$0.018**

### Service 5: Firestore + Cloud Storage

**Pricing model:** Per operation + per GB stored
- Firestore reads: $0.06 per 100K
- Firestore writes: $0.18 per 100K
- Storage: $0.026 per GB/month

**Per session:**
- ~20 Firestore reads, ~10 writes, ~5MB video storage
- **Total: <$0.001**

### Rolled Up

| Service | Per Session | What It Does |
|---------|-----------|--------------|
| Gemini 2.0 Flash | $0.001 | 3 coaching generations |
| Cloud TTS (Neural2) | $0.024 | 3 audio syntheses |
| Cloud Run GPU (L4) | $0.006 | 3 lip-synced videos |
| Cloud STT (Enhanced) | $0.018 | 2 voice transcriptions |
| Firestore + Storage | <$0.001 | Session state, assets |
| **Total** | **~$0.05** | |

## From Per-Session to Per-Driver-Per-Month

```
Sessions per driver per month = shifts per month × sessions per shift
                              = 20 shifts × 1 session
                              = 20 sessions

Cost per driver per month = 20 × $0.05 = $1.00
```

For a 200-driver fleet: **$200/month for 100% coverage.**

## The Comparison That Sells It

A human safety coach costs $40-60/hour. A coaching session (pull up data, have the conversation, document) takes ~30 minutes.

```
Human coaching cost: $50/hour × 0.5 hours = $25/session
AI coaching cost: $0.05/session
Ratio: 500:1
```

A 200-driver fleet coaching 10% of shifts manually:
- 200 drivers × 20 shifts × 10% = 400 sessions/month
- 400 × $25 = **$10,000/month for 10% coverage**

Same fleet with AI coaching 100% of shifts:
- 200 drivers × 20 shifts × 100% = 4,000 sessions/month
- 4,000 × $0.05 = **$200/month for 100% coverage**

**50x less money, 10x more coverage.** Combined: 500x cost advantage.

## How to Estimate Your Own Pipeline

### Step 1: Map the Service Chain

Draw your pipeline as a sequence of service calls:

```
User input → LLM → TTS → GPU inference → Storage → Response
```

### Step 2: Identify the Pricing Model

For each service, find the billing unit:

| Service Type | Typical Billing Unit |
|-------------|---------------------|
| LLM (Gemini, GPT, Claude) | Per token (input + output) |
| Text-to-Speech | Per character |
| Speech-to-Text | Per 15-second interval |
| GPU compute | Per second |
| Storage | Per GB/month |
| API calls | Per request or per 1K requests |
| Bandwidth | Per GB transferred |

### Step 3: Estimate Volume Per Action

For each service, estimate how much one user action consumes:

```
One coaching session:
├── LLM: 3 calls × (2K input + 500 output tokens)
├── TTS: 3 calls × 500 characters
├── GPU: 3 calls × 10 seconds
├── STT: 2 calls × 10 seconds
└── Storage: 3 videos × 1.5MB
```

**Tip:** Build the pipeline first, then measure actual usage. Estimates are good for planning; actual measurements are needed for accurate cost projections.

### Step 4: Multiply

```
Cost per action = Σ (volume per service × price per unit)
Cost per user per month = cost per action × actions per user per month
Fleet cost per month = cost per user per month × number of users
```

### Step 5: Compare to the Manual Alternative

This is the step most people skip. The AI pipeline's absolute cost is interesting. The AI pipeline's cost relative to the manual process is **compelling.**

Find out:
- How much does the manual process cost per unit? ($/hour × hours)
- What percentage of units get processed manually? (coverage)
- What would 100% coverage cost manually? (usually impossibly expensive)

The narrative writes itself: "X% of the cost, Y times the coverage."

## Common Cost Traps

### 1. TTS Is More Expensive Than You Think

Cloud TTS Neural2 at $16/1M characters sounds cheap until you realize a typical response is 500 characters. That's $0.008 per response. Three responses = $0.024. TTS is often the single most expensive component in a voice pipeline.

**Mitigation:** Keep responses concise. A 300-character response costs 40% less than a 500-character one.

### 2. GPU Cold Starts Are Free But Slow

With `min-instances=0`, you don't pay for idle GPU time. But cold starts take 20-30 seconds. If your users notice the delay, you might need `min-instances=1`, which adds ~$28/day just for the GPU.

**Mitigation:** Application-level warmup (ping the GPU service on user login). This costs one cold start per idle period, but the cost is negligible.

### 3. Storage Accumulates

Video files add up. 3 videos × 1.5MB × 4,000 sessions/month = 18GB/month of new storage. At $0.026/GB, that's only $0.47/month. But after a year, you're storing 216GB.

**Mitigation:** Lifecycle policies. Delete videos older than 30 days unless the session was escalated.

### 4. LLMs Are Cheap (For Now)

Gemini 2.0 Flash at $0.001 per session is essentially free in the pipeline. But if you switch to a more expensive model (GPT-4, Claude Opus), the LLM cost can 10-50x. Always cost out the specific model you're using, not a generic "LLM" line item.

## The One-Liner

When someone asks what your AI pipeline costs, have a one-liner ready:

> "$0.05 per session. $1 per driver per month. 500x cheaper than a human doing the same job."

That's not a technical metric. That's a pitch.
