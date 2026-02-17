# Steal From Another Industry: A Framework for AI Product Design

## The Pattern

Every industry has structural bottlenecks — places where human capacity limits how much work gets done. Most of these bottlenecks have already been solved in at least one other industry, usually by the same pattern: replace human-in-the-loop review with automated analysis, then redirect human attention to exceptions.

The framework:

1. **Identify the bottleneck** in your target industry
2. **Find the solved parallel** in another industry
3. **Map the transformation** — what changed, what the results were, what the numbers look like
4. **Apply the pattern** with the specific technology available today

## The Case Study: Fleet Safety Coaching

### Step 1: The Bottleneck

Fleet safety managers are responsible for coaching hundreds of drivers. Real coaching is a one-on-one conversation about what happened on the road today. A safety manager coaching 5-10 drivers per week out of 200 is doing triage, not coaching. **The supervisor is the bottleneck.**

### Step 2: The Solved Parallel

Contact centers had the exact same structural problem 10 years ago. QA analysts could manually review 8-20 calls per day. With thousands of daily interactions, only 1-2% of calls were ever monitored — 98% went completely unreviewed.

Speech analytics changed everything. 100% of calls got analyzed automatically. QA staff was cut in half, and the remaining staff shifted from listening to calls to coaching agents on flagged interactions.

### Step 3: The Numbers

The contact center transformation is well-documented:

- HomeServe/Verint: 22% CSAT increase, GBP 5M+ savings over 6 years
- Elavon: $1.7M revenue retained in one quarter
- Industry-wide: 15-25% customer satisfaction improvement, 35% faster agent improvement cycles
- Gartner: conversational AI in contact centers will reduce agent labor costs by $80 billion by 2026

The key metric: **coverage went from 1-2% to 100%.**

### Step 4: Apply the Pattern

Geoff is speech analytics for fleet safety:

| Contact Center | Fleet Safety |
|---------------|-------------|
| QA analyst listens to calls | Safety manager reviews driver events |
| 1-2% call coverage | ~5% driver coaching coverage |
| Speech analytics reviews 100% | Geoff coaches 100% of drivers |
| QA staff handles flagged calls | Supervisors handle escalated sessions |
| $80B cost reduction projected | 500x cost reduction per session |

The technology is different (Gemini + Wav2Lip instead of speech-to-text + sentiment analysis), but the structural transformation is identical: automate the routine, escalate the exceptions, achieve 100% coverage.

## How to Find Your Parallel

### Start With the Bottleneck, Not the Technology

Don't start with "what can AI do?" Start with "where is a human reviewing things one at a time, and falling behind?"

Examples of bottlenecks:
- **Medical imaging:** Radiologists reviewing scans one at a time
- **Code review:** Senior engineers reviewing PRs one at a time
- **Insurance claims:** Adjusters evaluating claims one at a time
- **Legal discovery:** Lawyers reviewing documents one at a time
- **Education:** Teachers grading assignments one at a time

### Search for the Solved Version

For each bottleneck, ask: "Has any industry solved the problem of reviewing [X] at scale?"

- Medical imaging → Pathology already automated slide screening (Paige AI)
- Code review → Contact centers already automated call review (speech analytics)
- Insurance claims → Credit scoring already automated risk assessment
- Legal discovery → Email already automated spam detection at scale
- Education → Contact centers already automated agent coaching

The solved version doesn't have to be in the same industry. It just has to solve the same structural problem: too many items to review, not enough reviewers.

### Map the Transformation

Once you find the parallel, document exactly what changed:

1. **Before:** What percentage of items got reviewed?
2. **After:** What percentage gets analyzed automatically?
3. **Human role shift:** What do the humans do now instead?
4. **Results:** Cost reduction, quality improvement, speed improvement
5. **Timeline:** How long did the transformation take?

### Apply With Current Technology

The technology that solved the parallel problem 10 years ago might not be available for your target industry. But the pattern is the same, and today's AI tools (LLMs, vision models, speech models) often fill the gap.

Contact centers used specialized speech-to-text + keyword spotting + sentiment analysis. Fleet safety coaching uses general-purpose AI (Gemini for coaching generation, Cloud TTS for speech, Wav2Lip for avatar). The generalist AI tools of 2026 can do what required specialized tools in 2016.

## Why This Framework Wins Hackathons

### 1. Instant Credibility

When you say "we're doing what speech analytics did for contact centers," you're not making a speculative pitch. You're pointing at a $80B transformation that already happened and saying "we're doing that for fleet safety." Judges can evaluate your claim against real evidence.

### 2. Quantified ROI

The solved parallel gives you real numbers. You don't have to guess at the business impact — you can cite industry studies, name specific companies, and show specific results. Then you map those results to your target industry with your specific cost analysis.

### 3. Narrative Structure

"Here's a problem. Another industry had the same problem. They solved it. Here's how we're applying that solution." This is a story judges remember. Feature lists are forgettable. Industry transformations are not.

### 4. Defensible Differentiation

If another team builds a fleet safety dashboard, they're competing on features. If you build "speech analytics for fleet safety," you're competing on vision. These are different conversations, and vision wins at hackathons.

## Other Parallels Worth Exploring

| Target Industry | Bottleneck | Solved Parallel | Transformation |
|----------------|-----------|-----------------|---------------|
| Fleet safety | Coaching drivers at scale | Contact center speech analytics | 1-2% → 100% coverage |
| Real estate | Evaluating properties | Automated underwriting in insurance | Manual appraisal → algorithmic valuation |
| Recruiting | Screening candidates | Spam detection in email | Manual review → automated scoring + human exceptions |
| Compliance | Reviewing transactions | Fraud detection in banking | Sample audits → 100% monitoring |
| Agriculture | Inspecting crops | Quality control in manufacturing | Spot checks → continuous automated inspection |

The framework is general. The key insight is always the same: **find the industry that already automated the review process, and bring that pattern to the industry that hasn't.**
