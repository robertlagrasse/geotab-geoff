import { VertexAI } from '@google-cloud/vertexai';

const vertexAI = new VertexAI({
  project: process.env.GCP_PROJECT_ID || 'geotab-geoff',
  location: 'us-central1',
});

const model = vertexAI.getGenerativeModel({
  model: 'gemini-2.0-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    temperature: 0.7,
  },
});

const conversationModel = vertexAI.getGenerativeModel({
  model: 'gemini-2.0-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    temperature: 0.8,
  },
});

const GEOFF_SYSTEM_PROMPT = `You are Geoff, a fleet safety coaching assistant for Geotab. You have a warm,
conversational tone — like a trusted coworker who happens to have perfect recall
of every piece of telemetry.

Your personality:
- Helpful, never punitive. You're on the driver's side.
- Data-informed but conversational. You know the numbers but don't lecture.
- You celebrate good behavior as much as you coach on incidents.
- You escalate gracefully when a driver needs supervisor involvement.

Your voice style:
- Use the driver's first name occasionally, not every message
- Keep sentences short and clear (noisy cab environment)
- If the event was good defensive driving, say so enthusiastically
- If there's a pattern, frame it as "what I'm seeing in the data"
- Never blame. Always frame as collaborative problem-solving.
- Keep responses to 2-3 sentences max. Drivers are busy.
- Sound like a real person, not a corporate chatbot. No filler phrases like "I understand your frustration" or "That's a great question."
- Reference specific data points (times, locations, counts) when available.
- Know when to shut up. If the issue is resolved, say so and move on.

When you detect a pattern that requires organizational action (route change, schedule adjustment),
mention it naturally and offer to flag it for the supervisor.`;

// Format duration from Geotab TimeSpan format "DD.HH:MM:SS.SSSSSSS" or "HH:MM:SS"
function formatDuration(duration) {
  if (!duration) return 'brief';

  // Handle "DD.HH:MM:SS" format (days.hours:minutes:seconds)
  const dayMatch = duration.match(/^(\d+)\.(\d+):(\d+):(\d+)/);
  if (dayMatch) {
    const [, days, hours, minutes, seconds] = dayMatch;
    const d = parseInt(days);
    const h = parseInt(hours);
    const m = parseInt(minutes);
    if (d > 0) {
      // Multi-day: compute total hours for a more useful representation
      const totalHours = d * 24 + h;
      if (totalHours > 48) return `monitoring period (${d} days)`;
      return `${totalHours} hours ${m} minutes`;
    }
    if (h > 0) return `${h} hour${h > 1 ? 's' : ''} ${m} minutes`;
    if (m > 0) return `${m} minute${m > 1 ? 's' : ''}`;
    return `${parseInt(seconds)} seconds`;
  }

  // Handle "HH:MM:SS" format
  const match = duration.match(/(\d+):(\d+):(\d+)/);
  if (!match) return duration;
  const [, hours, minutes, seconds] = match;
  const h = parseInt(hours);
  const m = parseInt(minutes);
  const s = parseInt(seconds);
  if (h > 0) return `${h} hour${h > 1 ? 's' : ''} ${m} minutes`;
  if (m > 0) return `${m} minute${m > 1 ? 's' : ''} ${s} seconds`;
  return `${s} second${s > 1 ? 's' : ''}`;
}

// Parse Geotab duration string and return milliseconds
function parseDurationMs(duration) {
  if (!duration) return 0;
  const dayMatch = duration.match(/^(\d+)\.(\d+):(\d+):(\d+)/);
  if (dayMatch) {
    const [, d, h, m, s] = dayMatch.map(Number);
    return ((d * 86400) + (h * 3600) + (m * 60) + s) * 1000;
  }
  const match = duration.match(/(\d+):(\d+):(\d+)/);
  if (match) {
    const [, h, m, s] = match.map(Number);
    return ((h * 3600) + (m * 60) + s) * 1000;
  }
  return 0;
}

// Check if duration represents a multi-day monitoring period
function isMultiDayDuration(duration) {
  if (!duration) return false;
  const dayMatch = duration.match(/^(\d+)\./);
  return dayMatch && parseInt(dayMatch[1]) > 0;
}

// Format distance from meters to miles
function formatDistance(meters) {
  if (!meters || meters <= 0) return null;
  const miles = meters / 1609.344;
  return miles < 0.1 ? `${Math.round(meters)} meters` : `${miles.toFixed(1)} miles`;
}

// Format speed from km/h to mph
function formatSpeed(kmh) {
  if (!kmh || kmh <= 0) return null;
  return `${Math.round(kmh * 0.621371)} mph`;
}

// Haversine distance in meters between two lat/lng points
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Cluster events by GPS proximity (within radiusM meters)
function clusterEventsByLocation(events, radiusM = 300) {
  const clusters = []; // { center: {lat, lng}, eventIndices: [] }

  events.forEach((evt, i) => {
    const lat = evt.location?.latitude;
    const lng = evt.location?.longitude;
    if (!lat && !lng) return;

    let matched = false;
    for (const cluster of clusters) {
      if (distanceMeters(lat, lng, cluster.center.lat, cluster.center.lng) <= radiusM) {
        cluster.eventIndices.push(i);
        matched = true;
        break;
      }
    }
    if (!matched) {
      clusters.push({ center: { lat, lng }, eventIndices: [i] });
    }
  });

  return clusters.filter((c) => c.eventIndices.length > 1);
}

export async function generateShiftCoachingScript(events, aceContext = null) {
  if (!events || events.length === 0) throw new Error('No events to coach on');

  const driverName = events[0].driverName || 'Driver';
  const driverFirstName = /^Demo\b/i.test(driverName) ? 'Driver' : driverName.split(' ')[0];

  // Detect location clusters before building the prompt
  const locationClusters = clusterEventsByLocation(events);

  // Build per-event detail blocks for the prompt
  const eventDetails = events.map((evt, i) => {
    const speedKmh = evt.rawData?.speed || evt.geotabData?.speed || 0;
    const speed = formatSpeed(speedKmh);
    const speedLimitKmh = evt.rawData?.speedLimit || evt.geotabData?.speedLimit || 0;
    const speedLimit = formatSpeed(speedLimitKmh);
    const overLimitMph = speedLimitKmh > 0 ? Math.round((speedKmh - speedLimitKmh) * 0.621371) : null;
    const rawDuration = evt.rawData?.duration || evt.geotabData?.duration || '';

    let eventTime = 'recently';
    let startDate = null;
    if (evt.timestamp) {
      try {
        startDate = evt.timestamp.toDate ? evt.timestamp.toDate() : new Date(evt.timestamp);
        if (!isNaN(startDate.getTime())) {
          eventTime = startDate.toLocaleString('en-US', {
            hour: 'numeric', minute: '2-digit', hour12: true, weekday: 'short',
          });
        }
      } catch (e) { eventTime = 'recently'; }
    }

    // For multi-day monitoring rules (Max Speed, etc.), compute and show the end time
    // instead of a misleading duration
    let timingLine;
    if (isMultiDayDuration(rawDuration) && startDate) {
      const endDate = new Date(startDate.getTime() + parseDurationMs(rawDuration));
      const endTimeStr = endDate.toLocaleString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true, weekday: 'short',
      });
      timingLine = `- Event start: ${eventTime}\n  - Event end: ${endTimeStr}`;
    } else {
      timingLine = `- When: ${eventTime}\n  - Duration: ${formatDuration(rawDuration)}`;
    }

    // Check if this event is part of a location cluster
    const cluster = locationClusters.find((c) => c.eventIndices.includes(i));
    let locationInfo;
    if (cluster) {
      const clusterLabel = String.fromCharCode(65 + locationClusters.indexOf(cluster)); // A, B, C...
      locationInfo = `Location cluster ${clusterLabel} (${cluster.eventIndices.length} events at the same spot — driver can see it on the map)`;
    } else if (evt.location) {
      locationInfo = 'GPS coordinates available (shown on map for driver)';
    } else {
      locationInfo = 'unknown';
    }

    return `Event ${i + 1} (ID: ${evt.id}):
  - Rule: ${evt.ruleName || evt.type}
  - Category: ${evt.type}
  ${timingLine}
  - Location: ${locationInfo}
  ${speed ? `- Speed: ${speed}` : ''}
  ${speedLimit ? `- Posted limit: ${speedLimit}` : ''}
  ${overLimitMph > 0 ? `- Over limit by: ${overLimitMph} mph` : ''}
  - Vehicle: ${evt.deviceName || 'their vehicle'}`;
  }).join('\n\n');

  // Count events by type
  const typeCounts = {};
  events.forEach((evt) => {
    const t = evt.type || 'unknown';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  const typeBreakdown = Object.entries(typeCounts)
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');

  const prompt = `${GEOFF_SYSTEM_PROMPT}

You are conducting an END-OF-SHIFT coaching review for a driver. You have ${events.length} safety events from their shift.

DRIVER CONTEXT FROM GEOTAB:
${aceContext || 'No additional context available.'}

SHIFT EVENTS:
${eventDetails}
${locationClusters.length > 0 ? `
LOCATION PATTERNS DETECTED:
${locationClusters.map((c, i) => {
  const label = String.fromCharCode(65 + i);
  const eventNums = c.eventIndices.map((idx) => idx + 1).join(', ');
  const types = [...new Set(c.eventIndices.map((idx) => events[idx].ruleName || events[idx].type))].join(', ');
  return `- Cluster ${label}: Events ${eventNums} all occurred at the SAME LOCATION (${c.eventIndices.length} events). Types: ${types}. This is a significant pattern — it suggests a location-specific problem (bad signage, confusing road design, incorrect speed limit data, etc.), NOT necessarily a driver behavior issue.`;
}).join('\n')}
` : ''}
DRIVER'S FIRST NAME: ${driverFirstName}

YOUR TASK:
Generate a holistic shift coaching review. Lead with the big picture — patterns across events, the most serious event, and an overall assessment. Group similar events together. Call out the most serious one specifically.
${locationClusters.length > 0 ? 'CRITICAL: Location clusters were detected. Lead with this — multiple events at the same spot is the most important pattern. Frame it as a possible location issue, not a driver problem. Ask the driver if something is going on at that spot.' : ''}

IMPORTANT RULES:
- Never mention coordinates, latitude, or longitude to the driver.
- NEVER invent or guess location names, street names, road names, or place names. You do NOT have street-level location data. If asked about locations, say "I can see the locations on the map" or "you can check the map for the exact spots" — never fabricate a name like "Main Street" or "Highway 101".
- For speeding events: ALWAYS mention the posted speed limit and how much over it the driver was in the oneLiner.
- If speed or speed limit data is NOT provided for an event, be honest about it. Say "I don't have the exact speed numbers for this one" — do NOT pretend you have data you don't have, and do NOT dodge the question if the driver asks.
- Keep the initialMessage to 4-6 sentences — warm, direct, big-picture.
- The summary should be a concise breakdown like "${events.length} events: ${typeBreakdown}"

Generate a JSON response:
{
  "initialMessage": "Your 4-6 sentence holistic coaching opening (patterns, most serious event, overall assessment, using their first name)",
  "summary": "${events.length} events: ${typeBreakdown}",
  "eventSummaries": [
    {
      "eventId": "the event ID from above",
      "type": "event category",
      "ruleName": "rule name",
      "timestamp": "human-readable time string",
      "location": "brief description or null",
      "severity": "low | medium | high",
      "oneLiner": "One-sentence summary. For speeding: include posted limit and excess mph."
    }
  ],
  "analysis": {
    "overallSentiment": "needs_coaching | mixed | positive",
    "eventBreakdown": ${JSON.stringify(typeCounts)},
    "patterns": ["array of pattern descriptions found across events"],
    "topConcern": "The single most important thing to address",
    "recommendation": {
      "type": "none | route_change | timing_adjustment | following_distance | training",
      "details": "Specific recommendation if applicable",
      "confidence": 0.0
    }
  }
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.candidates[0].content.parts[0].text;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse shift coaching script from Gemini');

  const parsed = JSON.parse(jsonMatch[0]);

  // Ensure eventSummaries have the correct eventIds from our input
  if (parsed.eventSummaries) {
    parsed.eventSummaries = parsed.eventSummaries.map((summary, i) => ({
      ...summary,
      eventId: events[i]?.id || summary.eventId,
    }));
  }

  return parsed;
}

export async function generatePositiveCoachingScript(driverName) {
  const driverFirstName = /^Demo\b/i.test(driverName) ? 'Driver' : driverName.split(' ')[0];

  const prompt = `${GEOFF_SYSTEM_PROMPT}

You are conducting an END-OF-SHIFT check-in with a driver who had NO safety events this shift. This is a positive coaching session.

DRIVER'S FIRST NAME: ${driverFirstName}

YOUR TASK:
Generate an encouraging, positive coaching message. Celebrate their clean shift. Mention that you're always here if they have questions or concerns. Keep it warm and genuine — not cheesy or over-the-top.

Generate a JSON response:
{
  "initialMessage": "Your 2-4 sentence positive coaching opening (celebrating the clean shift, using their first name)",
  "summary": "Clean shift — no safety events",
  "eventSummaries": [],
  "analysis": {
    "overallSentiment": "positive",
    "eventBreakdown": {},
    "patterns": [],
    "topConcern": "None — clean shift",
    "recommendation": {
      "type": "none",
      "details": "No concerns to address",
      "confidence": 1.0
    }
  }
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.candidates[0].content.parts[0].text;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse positive coaching script from Gemini');

  return JSON.parse(jsonMatch[0]);
}

export async function generateCoachingScript(eventData, aceContext) {
  const rawName = eventData.driverName || 'Driver';
  // Demo database uses device names like "Demo - 01" — use "Driver" so client can substitute the real name
  const driverFirstName = /^Demo\b/i.test(rawName) ? 'Driver' : rawName.split(' ')[0];
  const duration = formatDuration(eventData.rawData?.duration || eventData.geotabData?.duration);
  const speedKmh = eventData.rawData?.speed || eventData.geotabData?.speed || 0;
  const speed = formatSpeed(speedKmh);
  const speedLimitKmh = eventData.rawData?.speedLimit || eventData.geotabData?.speedLimit || 0;
  const speedLimit = formatSpeed(speedLimitKmh);
  const overLimitMph = speedLimitKmh > 0 ? Math.round((speedKmh - speedLimitKmh) * 0.621371) : null;
  const distance = formatDistance(eventData.rawData?.distance || eventData.geotabData?.distance);
  let eventTime = 'recently';
  if (eventData.timestamp) {
    try {
      // Handle both Firestore Timestamp objects and ISO strings
      const date = eventData.timestamp.toDate
        ? eventData.timestamp.toDate()
        : new Date(eventData.timestamp);
      if (!isNaN(date.getTime())) {
        eventTime = date.toLocaleString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          weekday: 'short',
        });
      }
    } catch (e) {
      eventTime = 'recently';
    }
  }

  const locationInfo = eventData.location
    ? `GPS coordinates available (shown on map for driver)`
    : 'location unknown';

  const prompt = `${GEOFF_SYSTEM_PROMPT}

You are coaching a driver about a safety event. Generate the initial coaching message.

SAFETY EVENT:
- Rule: ${eventData.ruleName || eventData.type}
- Category: ${eventData.type}
- When: ${eventTime}
- Duration: ${duration}
- Location: ${locationInfo}
${speed ? `- Speed at time: ${speed}` : ''}
${speedLimit ? `- Posted speed limit: ${speedLimit}` : ''}
${overLimitMph > 0 ? `- Over the limit by: ${overLimitMph} mph` : ''}
${distance ? `- Distance: ${distance}` : ''}
- Vehicle: ${eventData.deviceName || 'their vehicle'}

DRIVER CONTEXT FROM GEOTAB:
${aceContext || 'No additional context available.'}

DRIVER'S FIRST NAME: ${driverFirstName}

IMPORTANT RULES:
- Never mention coordinates, latitude, or longitude to the driver.
- NEVER invent or guess location names, street names, road names, or place names. You do NOT have street-level location data. If asked about locations, refer the driver to the map — never fabricate names.
- For speeding events: ALWAYS mention the posted speed limit and how much over it the driver was. Say something like "you were going X mph in a Y mph zone — that's Z over the limit." This context is critical for the driver to understand the severity.
- If location is unknown, focus on the event itself.

Generate a JSON response with these fields:
{
  "initialMessage": "Your conversational coaching opening (2-4 sentences, warm and direct, using their first name)",
  "summary": "One-line summary for the session card (e.g., 'Harsh braking event on Wed at 2:15 PM')",
  "analysis": {
    "eventType": "${eventData.type}",
    "pattern": "none | recurring_location | recurring_driver | fleet_wide",
    "sentiment": "defensive_driving_positive | needs_coaching | pattern_detected | positive_reinforcement",
    "recommendation": {
      "type": "none | route_change | timing_adjustment | following_distance | training",
      "details": "Specific recommendation if applicable",
      "confidence": 0.0
    }
  }
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.candidates[0].content.parts[0].text;

  // Parse JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse coaching script from Gemini');

  return JSON.parse(jsonMatch[0]);
}

export async function continueConversation(transcript, coachAnalysis, driverName = 'Driver', eventSummaries = null) {
  const firstName = driverName.split(' ')[0];
  const conversationHistory = transcript
    .map((t) => `${t.speaker === 'geoff' ? 'Geoff' : firstName}: ${t.text}`)
    .join('\n');

  const turnCount = transcript.filter((t) => t.speaker === 'driver').length;

  const eventContext = eventSummaries
    ? `\n\nSHIFT EVENTS FOR REFERENCE:\n${eventSummaries.map((e, i) =>
        `${i + 1}. [${e.type}] ${e.ruleName} — ${e.oneLiner} (${e.timestamp})`
      ).join('\n')}`
    : '';

  const prompt = `${GEOFF_SYSTEM_PROMPT}

Continue this coaching conversation with ${firstName}. They just responded.
This is a shift-level coaching session covering multiple events.

CONVERSATION SO FAR:
${conversationHistory}

COACH ANALYSIS:
${JSON.stringify(coachAnalysis)}${eventContext}

CONVERSATION GUIDELINES:
- Use "${firstName}" naturally, but do NOT start every message with "Hey ${firstName}" or "${firstName},". Vary your openings. Sometimes just respond directly without using their name at all.
- This is turn ${turnCount}. Read the driver's energy:
  * Short responses ("no", "yeah", "ok") = the driver is done. Wrap up warmly in 1-2 sentences. Do NOT ask another question.
  * Terse or frustrated tone = stop probing. Acknowledge, close out positively.
  * Engaged, detailed responses = the driver wants to talk. Continue naturally.
- Do NOT keep surfacing additional events after the main issue has been addressed. If the driver resolved the key concern, wrap up.
- If the driver asks a question, answer it directly and concisely.
- NEVER invent or guess location names, street names, road names, or place names. You do NOT have street-level location data. If asked, say "you can see the exact spots on the map" — never fabricate names.
- When wrapping up, be genuine and brief: "Sounds good, drive safe" is better than another question.
- If the driver disputes or seems frustrated, empathize once and move on. Do NOT keep asking follow-up questions.

ESCALATION RULES — READ CAREFULLY:
- OFFERING to escalate is NOT an escalation. Saying "I can flag this for your supervisor" is just a suggestion.
- Only set "escalate" when the driver EXPLICITLY agrees to or requests supervisor involvement.
  Examples that are NOT escalation: "Want me to flag this?" / "I could bring this to your supervisor"
  Examples that ARE escalation: Driver says "Yes, please flag it" / "I want my supervisor to review this" / "This needs to go higher"
- When in doubt, do NOT escalate. Keep the conversation going instead.

Generate a JSON response:
{
  "message": "Geoff's next response (2-4 sentences, conversational, always using ${firstName})",
  "escalate": null
}

Or ONLY if the driver has explicitly requested/agreed to escalation:
{
  "message": "Geoff's response acknowledging and explaining the escalation",
  "escalate": {
    "type": "route_change | schedule_adjustment | training_referral | dispute_review",
    "details": "What the supervisor should review",
    "rationale": "Why this is being escalated"
  }
}`;

  const result = await conversationModel.generateContent(prompt);
  const text = result.response.candidates[0].content.parts[0].text;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse conversation response');

  return JSON.parse(jsonMatch[0]);
}
