# Ace AI Integration Patterns: Beyond One-Shot Queries

## What Is Ace AI?

Geotab's Ace AI is a natural language interface to fleet data. You send it a question in English, it queries the fleet database, and returns structured insights. It's accessed through the `GetAceResults` API method.

Most implementations treat Ace AI as a one-shot query tool: ask a question, get an answer. This guide covers how to integrate it into a conversational loop where Ace context persists through an entire interaction.

## The 3-Step API Pattern

Ace AI uses an asynchronous 3-step workflow. This is not obvious from the documentation.

### Step 1: Create a Chat

```javascript
const createResult = await geotab.call('GetAceResults', {
  serviceName: 'dna-planet-orchestration',
  functionName: 'create-chat',
  customerData: true,
  functionParameters: {},
});

const chatId = createResult?.results?.[0]?.chat_id;
```

This creates a conversation context. The `chatId` is your session identifier.

### Step 2: Send a Prompt

```javascript
const sendResult = await geotab.call('GetAceResults', {
  serviceName: 'dna-planet-orchestration',
  functionName: 'send-prompt',
  customerData: true,
  functionParameters: {
    chat_id: chatId,
    prompt: 'What are the safety patterns for vehicle Demo-09 over the last 7 days?',
  },
});

const messageGroupId =
  sendResult?.results?.[0]?.message_group_id ||
  sendResult?.results?.[0]?.message_group?.id;
```

**Note the two possible response paths for `messageGroupId`.** The API returns it in different locations depending on the query complexity. Check both.

### Step 3: Poll for Results

Ace AI processes queries asynchronously. You must poll for completion:

```javascript
// Initial wait — Ace needs time to process
await sleep(10000);  // 10 seconds

for (let attempt = 0; attempt < 6; attempt++) {
  const pollResult = await geotab.call('GetAceResults', {
    serviceName: 'dna-planet-orchestration',
    functionName: 'get-message-group',
    customerData: true,
    functionParameters: {
      message_group_id: messageGroupId,
    },
  });

  const messageGroup = pollResult?.results?.[0]?.message_group;
  const status = messageGroup?.status?.status;

  if (status === 'DONE') {
    // Extract the insight
    return extractInsight(messageGroup);
  }

  if (status === 'FAILED') {
    return null;
  }

  // Not done yet — wait and retry
  await sleep(8000);  // 8 seconds between polls
}
```

**Timing matters.** The initial 10-second wait is important — polling too early wastes API calls and often returns `IN_PROGRESS`. After that, 8-second intervals give Ace enough time between polls.

**Total timeout: ~60 seconds** (10s initial + 6 polls × 8s = 58s). Ace queries that take longer than this are probably stuck.

### Extracting the Insight

The response structure is nested:

```javascript
function extractInsight(messageGroup) {
  const messages = messageGroup.messages || {};
  let insight = '';

  for (const key of Object.keys(messages)) {
    const msg = messages[key];

    // Reasoning text — Ace's natural language analysis
    if (msg.reasoning) {
      insight += msg.reasoning + ' ';
    }

    // Data preview — structured data Ace found
    if (msg.preview_array?.length) {
      insight += `Data: ${JSON.stringify(msg.preview_array.slice(0, 3))} `;
    }
  }

  return insight.trim() || null;
}
```

The `messages` object contains multiple message objects (keyed by arbitrary IDs). Each message may have:
- `reasoning` — Ace's natural language explanation
- `preview_array` — structured data (arrays of objects with fleet data)
- Other metadata about the query

## Feeding Ace Context Into Coaching

The real power is using Ace insights as context for another AI model. In Geoff's architecture:

```
Driver selects a shift
    │
    ├─ Fetch events from MyGeotab API (structured data)
    ├─ Fetch GPS + speed limits (enrichment)
    └─ Query Ace AI (natural language context)
            │
            └─ "Driver has had 12 safety events in 7 days.
                Breakdown: Speeding: 8, Harsh Braking: 3, Hard Acceleration: 1.
                Ace AI insight: Vehicle Demo-09 shows a pattern of speeding
                events clustered around Interstate 15 southbound during
                afternoon shifts. Peak frequency is 2-4 PM."
                    │
                    ├─ This entire context string feeds into Gemini's
                    │  coaching prompt as background knowledge
                    │
                    └─ Gemini generates coaching that references
                       the pattern: "I noticed most of your speeding
                       events happened on I-15 southbound in the
                       afternoon..."
```

The key insight: **Ace provides pattern-level analysis that structured data alone can't.** The MyGeotab API tells you there were 8 speeding events. Ace tells you they're clustered on I-15 southbound during afternoon shifts. That's the difference between a report and a conversation.

### The Context Builder

```javascript
export async function queryAceContext(driverId, eventData) {
  const geotab = getApi();

  // First: structured event history (fast, reliable)
  const recentEvents = await geotab.call('Get', {
    typeName: 'ExceptionEvent',
    search: {
      deviceSearch: { id: eventData.rawData?.deviceId },
      fromDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    resultsLimit: 50,
  });

  let context = `Driver has had ${recentEvents.length} safety events in the past 7 days.`;

  // Add rule breakdown
  const ruleCounts = {};
  for (const e of recentEvents) {
    const name = BUILTIN_RULES[e.rule?.id] || e.rule?.id;
    ruleCounts[name] = (ruleCounts[name] || 0) + 1;
  }
  context += ` Breakdown: ${Object.entries(ruleCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => `${name}: ${count}`)
    .join(', ')}.`;

  // Then: Ace AI insight (slow, may fail — wrapped in timeout)
  try {
    const aceInsight = await Promise.race([
      queryAceAI(eventData),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Ace timeout')), 60000)
      ),
    ]);
    if (aceInsight) {
      context += ` Ace AI insight: ${aceInsight}`;
    }
  } catch (aceErr) {
    console.warn('Ace AI query skipped:', aceErr.message);
    // Ace is optional — coaching continues without it
  }

  return context;
}
```

**Critical design decision: Ace AI is optional.** The coaching system works without it — the structured event data provides enough context for basic coaching. Ace adds depth (pattern analysis, timing insights, location clustering), but if it times out or fails, the system degrades gracefully.

## Prompt Design for Ace Queries

The quality of Ace's response depends heavily on your prompt:

**Bad prompt:**
```
Tell me about this driver
```

**Good prompt:**
```
What are the safety patterns for vehicle Demo-09 over the last 7 days?
Focus on Posted Speeding events. Return key insights about frequency and timing.
```

Tips:
- **Name the vehicle/driver specifically** — Ace works better with concrete identifiers
- **Specify the time window** — "last 7 days" gives Ace a clear scope
- **Name the event type** — "Posted Speeding events" focuses the analysis
- **Ask for specific dimensions** — "frequency and timing" tells Ace what to analyze

## Multi-Turn Ace Conversations

The `chatId` from Step 1 supports multi-turn conversations. You can send follow-up prompts to the same chat:

```javascript
// First query
const chatId = await createAceChat();
await sendAcePrompt(chatId, 'What are the speeding patterns for Demo-09?');
const result1 = await pollAceResult(messageGroupId1);

// Follow-up query — same chat context
await sendAcePrompt(chatId, 'How does this compare to the fleet average?');
const result2 = await pollAceResult(messageGroupId2);
```

The follow-up query has context from the first query. Ace remembers what "this" refers to.

**We don't use this in production** because the 60-second timeout per query makes multi-turn Ace conversations too slow for real-time coaching. But for batch analysis or MCP tool interactions where latency is acceptable, it's powerful.

## Error Handling Patterns

### Timeout Protection

```javascript
const aceInsight = await Promise.race([
  queryAceAI(eventData),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Ace timeout')), 60000)
  ),
]);
```

Always wrap Ace calls in a timeout. The polling loop has its own internal timeout, but `Promise.race` provides an outer safety net.

### Graceful Degradation

```javascript
try {
  const aceContext = await queryAceContext(driverId, eventData);
  coachingPrompt += aceContext;
} catch (err) {
  console.warn('Ace context unavailable:', err.message);
  // Coaching proceeds with structured data only
}
```

Never let an Ace failure break your primary workflow.

### Rate Limiting

Ace AI has usage limits. If you're polling frequently or running batch queries, implement backoff:

```javascript
let aceCallCount = 0;
const ACE_MAX_CALLS_PER_MINUTE = 10;

async function rateLimitedAceQuery(eventData) {
  if (aceCallCount >= ACE_MAX_CALLS_PER_MINUTE) {
    console.warn('Ace rate limit reached, skipping');
    return null;
  }
  aceCallCount++;
  setTimeout(() => aceCallCount--, 60000);
  return queryAceAI(eventData);
}
```

## Summary

| Pattern | Use Case | Latency |
|---------|----------|---------|
| One-shot query | Quick fleet insight | ~15-30s |
| Context builder | Enrich coaching prompts | ~15-30s (parallel with other fetches) |
| Multi-turn chat | Deep analysis | ~30-60s per turn |
| Batch analysis | Fleet-wide patterns | Minutes (sequential) |

The 3-step async pattern (create-chat → send-prompt → poll) is the foundation. Everything else is how you wrap it — with timeouts, graceful degradation, and prompt design that extracts maximum value from each query.
