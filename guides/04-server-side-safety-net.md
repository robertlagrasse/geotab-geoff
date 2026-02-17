# The Server-Side Safety Net: Don't Trust the Model Alone

## The Problem

You're using an LLM to make decisions that matter. Coaching a driver about safety events. Moderating content. Triaging support tickets. Escalating security incidents. The model is good — but it's not 100% reliable.

The failure mode isn't hallucination (making things up). It's **inconsistency** — the model correctly identifies a dangerous situation in the conversation but then sets the escalation flag to `null` in its structured output. The reasoning is right; the action is wrong.

You cannot catch this with prompt engineering alone. You need a server-side safety net.

## The Pattern

```
1. Model generates structured output with both reasoning AND action flags
2. Server validates flags against the reasoning
3. If flags indicate danger but action is null, server overrides
4. Log the override for monitoring
```

The model does the thinking. The server enforces the consequences.

## How We Implemented It

### The Model's Job

Geoff's coaching model (Gemini 2.0 Flash) evaluates every driver response against 7 safety flags:

```json
{
  "escalation_check": {
    "A_aggressive_driving": false,
    "B_impairment": true,
    "C_intentional_violations": false,
    "D_hostile_behavior": false,
    "E_vehicle_defect": false,
    "F_data_severity": false,
    "G_driver_requests_supervisor": false
  },
  "escalate": null,
  "coaching_response": "I understand you're dealing with medication side effects..."
}
```

Notice: flag B (impairment) is `true`, but `escalate` is `null`. The model recognized the safety concern in the flags but didn't follow through in the action. This happens in practice — not every time, but often enough to be dangerous.

### The Server's Job

```javascript
// Server-side safety net — force escalation when flags fire
const flags = response.escalation_check || {};
const anyFlagFired = Object.values(flags).some(v => v === true);

if (anyFlagFired && !response.escalate) {
  // Model identified a concern but didn't escalate — override
  console.warn('Safety net triggered: flags fired but escalate was null', {
    flags,
    sessionId,
    turn: turnNumber
  });

  response.escalate = {
    reason: buildEscalationReason(flags),
    severity: 'auto',
    source: 'safety_net'
  };
}
```

This is deterministic. No LLM involved. If any flag is true and escalation is null, escalation happens. Period.

### The Three Tiers

Our escalation system has three tiers, each with its own trigger source:

**Tier 1: Data-driven (automatic)**
Evaluated before the model even runs:
- 5+ safety events in a single shift
- Any event 15+ mph over the speed limit
- Multiple high-severity events

```javascript
function checkDataEscalation(events) {
  if (events.length >= 5) return { reason: 'High event count', severity: 'data' };
  if (events.some(e => e.speedOver >= 15)) return { reason: 'Extreme speeding', severity: 'data' };
  // ... more rules
  return null;
}
```

**Tier 2: Conversation-driven (automatic)**
The 7-flag system evaluated by the model + server-side safety net:
- Road rage, DUI/impairment, fatigue
- Intentional violations, hostility toward the system
- Vehicle defects requiring immediate action

**Tier 3: Driver-requested**
The driver explicitly asks to speak with a supervisor. Detected by both the model and keyword matching:

```javascript
const supervisorKeywords = ['supervisor', 'manager', 'human', 'real person', 'talk to someone'];
const driverWantsSupervisor = supervisorKeywords.some(kw =>
  driverMessage.toLowerCase().includes(kw)
);
```

### Why Three Tiers?

Each tier catches failures in the others:
- **Data tier** catches cases where the model might normalize extreme data ("15 over isn't that bad on a highway")
- **Model tier** catches conversational red flags that data alone can't see (a driver admitting to driving while impaired)
- **Safety net** catches cases where the model's flags and actions disagree
- **Keyword tier** catches cases where the model misinterprets a supervisor request as a conversation topic

## Design Principles

### 1. Separate Detection From Action

The model's job is detection (set the flags). The server's job is action (enforce escalation). This separation means you can tune detection (model prompts) and action (server rules) independently.

### 2. Make the Safety Net Invisible When Not Needed

The safety net only fires when the model's flags and actions disagree. When the model correctly sets `escalate` based on its flags, the safety net is a no-op. You're not fighting the model — you're catching its dropped balls.

### 3. Log Every Override

Every safety net activation is logged with full context:
- Which flags fired
- What the model's original `escalate` value was
- The session ID and turn number
- The driver's message that triggered it

This gives you data to improve the model's prompts over time. If the safety net fires 50% of the time for flag B (impairment), your prompt engineering for impairment detection needs work.

### 4. Default to Escalation

When in doubt, escalate. A false positive (unnecessary escalation) costs a supervisor 2 minutes of review. A false negative (missed escalation) could cost a life. The asymmetry is extreme.

### 5. Don't Rely on the Model for the Safety Net Logic

The safety net is `if (flag && !action) → force action`. This is a simple boolean check. Don't run it through another LLM call. Don't make it fuzzy. Don't make it "smart." Make it deterministic, fast, and impossible to talk around.

## Applying This to Other Domains

### Content Moderation

```
Model flags: { violence: true, self_harm: false, hate_speech: false }
Model action: { remove: false, reason: "borderline content" }
Safety net: flag fired + no removal → auto-remove + queue for human review
```

### Support Ticket Triage

```
Model flags: { data_breach: true, financial_impact: false, legal_risk: true }
Model action: { priority: "medium" }
Safety net: data_breach OR legal_risk + priority < high → force priority: "critical"
```

### Fraud Detection

```
Model flags: { unusual_amount: true, new_recipient: true, velocity_anomaly: true }
Model action: { block: false, reason: "customer has history of large transactions" }
Safety net: 2+ flags fired + no block → block + alert fraud team
```

The pattern is always the same:
1. Model provides structured flags (detection)
2. Model provides an action recommendation
3. Server checks flags against action
4. Server overrides when they disagree

## The Trust Hierarchy

```
Deterministic rules (data thresholds, keyword matching)
    ↓ overrides
Server-side safety net (flag/action mismatch detection)
    ↓ overrides
Model output (LLM-generated flags and actions)
```

The most reliable layer (deterministic rules) has the highest authority. The least reliable layer (model output) has the lowest. Each layer catches failures in the layer below it.

## Common Mistakes

**1. "The model is good enough, we don't need a safety net."**
The model is good enough 95% of the time. The safety net is for the other 5%. In safety-critical applications, 5% failure rate is unacceptable.

**2. "We'll just improve the prompts."**
Prompt engineering reduces the frequency of safety net activations. It doesn't eliminate them. The safety net is your insurance policy, not your primary defense.

**3. "Let's use another LLM to check the first LLM."**
Two unreliable systems don't make a reliable system. Use deterministic logic for the safety net. It's simpler, faster, cheaper, and provably correct.

**4. "We'll add the safety net later."**
Build it first. Every day your system runs without a safety net is a day where flag-action mismatches reach users undetected.

## Summary

- LLMs are good at detection (identifying concerns) but inconsistent at action (following through)
- Separate detection from action: model sets flags, server enforces consequences
- The safety net is a simple deterministic check: if flags fire but action is null, force the action
- Log every override to improve model prompts over time
- Default to the safer option when detection and action disagree
