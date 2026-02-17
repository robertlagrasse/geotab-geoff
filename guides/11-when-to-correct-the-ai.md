# When to Correct the AI: The Human Judgment Layer in Vibe Coding

## The Misconception

"AI wrote all the code" doesn't mean "the human did nothing." The human's role in vibe coding isn't typing — it's judgment. Knowing when the AI is wrong, knowing what the AI can't know, and correcting course before mistakes compound.

This guide documents specific moments from building Geotab Geoff where human correction was essential, and the patterns that emerge from them.

## Category 1: The AI Doesn't Know Your Operational Context

### Example: "Cold start will kill your demo"

During the gap analysis phase, Claude flagged cold start latency as a critical risk:

> "Cloud Run with min-instances=0 means a 26-second cold start on the first lipsync request. This will kill the live demo."

**The correction:**

> "You are wrong on cold start latency. We have accounted for that. We thump the container on user login and warm everything up explicitly. Besides, I'm the one driving the demo and shooting the video."

Claude didn't know about the two-layer warmup strategy (health ping on login + in-process model caching). It also didn't know the demo was creator-driven — the developer controls the timing, not a random user.

**Pattern:** The AI evaluates risks based on architecture, not operations. It doesn't know about your deployment scripts, your warmup strategy, your testing process, or who's running the demo. When the AI flags an operational risk, check whether you've already mitigated it.

### Example: Recommending scope creep

Claude suggested adding features that the contest rules explicitly warned against:

> "Consider adding real-time event streaming, a mobile app, and a trend analysis dashboard across shifts."

**The correction:**

The contest hackathon guide says: "Don't try to build everything. Pick one problem, solve it well." Adding real-time streaming would expand the scope without improving the judging score.

**Pattern:** The AI doesn't read the meta-rules. It optimizes for "better product" when it should optimize for "better submission." Humans read the room; AI reads the codebase.

## Category 2: The AI Gets Domain Details Wrong

### Example: Describing Ace AI as one-shot

In the evaluation document, Claude wrote:

> "Ace AI provides a one-shot natural language insight about the driver's fleet patterns."

**The correction:**

Ace AI context persists through the entire coaching conversation. The insight from Ace is injected into the Gemini prompt and stays in context for every subsequent turn. It's not one-shot — it's persistent context enrichment.

**Pattern:** The AI summarizes code behavior based on the function it reads, not the system it's part of. `queryAceContext()` looks like a one-shot function in isolation. But it feeds into `generateCoaching()`, which feeds into `driverRespond()`, and the context carries through. The AI sees the tree; the human sees the forest.

### Example: Escalation trigger sensitivity

The first version of the escalation system was too lenient:

```
Human: "A driver can admit to intentional speeding and not get flagged.
        Strengthen the triggers with explicit examples."
```

Claude had implemented the 7 escalation flags but set the detection bar too high. The AI didn't have the domain intuition for what constitutes dangerous driver behavior in a fleet safety context. "I was going 20 over because I was late" should trigger flag C (intentional violations) — but the AI's prompt engineering didn't catch that phrasing.

**Pattern:** Safety-critical thresholds require domain judgment. The AI implements the mechanism; the human calibrates the sensitivity.

## Category 3: The AI Makes Technically Correct But Practically Wrong Choices

### Example: makePublic on a uniform-access bucket

The lipsync video generation code included:

```javascript
await file.makePublic();
```

This is a valid Cloud Storage API call. But the bucket (`geotab-geoff-assets`) uses **uniform bucket-level access**, which prohibits per-object ACL changes. The bucket already had `allUsers:objectViewer` at the IAM level — every object was already public. The `makePublic()` call was both unnecessary and the thing breaking the pipeline.

The error was buried in the catch block — the function logged a warning and returned `null` instead of the perfectly good video URL. The video was generated, uploaded, and stored correctly. Then the cleanup call broke it.

**Pattern:** The AI writes defensively (make the file public to be safe), but doesn't check whether the defensive code conflicts with existing configuration. The human notices that videos work in Cloud Storage but not in the app, traces the error to the ACL call, and removes one line.

### Example: Browser-based speech recognition

The initial implementation used the Web Speech API for voice input — Chrome only. Claude implemented what was technically simpler (client-side STT with a browser API). But the competition judges might use Firefox or Safari.

**The correction:**

```
Human: "Replace browser Web Speech API with server-side Cloud STT.
        Works in all browsers. Better accuracy in noisy environments."
```

The AI chose the path of least resistance. The human chose the path of maximum compatibility.

**Pattern:** "Works on my machine" isn't enough. The AI builds for the development environment; the human builds for the deployment environment.

## Category 4: Design Taste

### Example: Geoff's personality

The AI can generate a character description. The human decides:
- Geoff looks like a friendly trucker, not a corporate mascot
- Geoff wears a Geotab vest — subtle branding
- Geoff celebrates clean shifts (not just flagging problems)
- Geoff's tone is collaborative, not punitive

These are design taste decisions that the AI can implement but can't originate. The AI doesn't know what feels right for the product.

### Example: CSS in MyGeotab

When the MyGeotab Add-In loaded with no CSS (because MyGeotab strips the `<head>`), the AI proposed several solutions. The human chose the one that felt right: inject Geotab's Zenith design system styles to match the parent application's look and feel. This wasn't the technically simplest fix — but it was the right one for the user experience.

**Pattern:** Design taste is the hardest thing to delegate to AI. The AI generates options; the human picks the one that serves the user.

## The Correction Framework

When working with AI, run every significant output through this checklist:

### 1. Does the AI know my operational context?
- Deployment environment
- Who's running the demo
- What's already deployed
- What mitigations are already in place

### 2. Is the AI getting domain details right?
- Does the description match how the system actually behaves?
- Are the thresholds appropriate for the domain?
- Is the terminology correct?

### 3. Is the AI optimizing for the right goal?
- Building a better product vs. building a better submission
- Technical simplicity vs. deployment compatibility
- Feature completeness vs. scope discipline

### 4. Does this feel right?
- Design taste
- User experience
- Brand alignment
- The thing you can't articulate but know when you see it

## The Meta-Lesson

The AI is a force multiplier, not a replacement. It generates 18,920 lines in 50 minutes. It writes tests, docs, CI pipelines, deployment configs. It implements complex multi-service pipelines from a paragraph of description.

But it can't:
- Know what you've already deployed
- Feel what the user experience should be
- Read the meta-rules of a competition
- Calibrate safety thresholds for a domain it doesn't operate in
- Make design taste decisions

The human who works with AI effectively isn't the one who prompts best. It's the one who **corrects best** — who catches the AI's blind spots, applies domain judgment, and maintains the vision that the AI implements.

Every correction is a teaching moment. Document them. They're the most valuable part of your development story.
