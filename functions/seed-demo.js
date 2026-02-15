import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault(), projectId: 'geotab-geoff' });
const db = getFirestore();

// Driver entries matching what pollGeotabEvents would create
const drivers = [
  { id: 'b2D', name: 'Mike Johnson', deviceName: 'Demo - 32' },
  { id: 'b3A', name: 'Sarah Chen', deviceName: 'Demo - 18' },
  { id: 'b2A', name: 'Carlos Rodriguez', deviceName: 'Demo - 26' },
  { id: 'b28', name: 'Dave Kowalski', deviceName: 'Demo - 14' },
  { id: 'b35', name: 'Maria Garcia', deviceName: 'Demo - 41' },
];

const sessions = [
  // Mike Johnson — hard brake, first-time
  {
    eventId: 'demo-event-001',
    driverId: 'b2D',
    driverName: 'Mike Johnson',
    deviceName: 'Demo - 32',
    fleetId: 'demo-fleet',
    eventType: 'hard_brake',
    ruleName: 'Harsh Braking',
    status: 'ready',
    createdAt: Timestamp.now(),
    summary: 'Hard braking event on I-90 near Exit 42 — 0.58g deceleration at 62 mph',
    transcript: [
      {
        speaker: 'geoff',
        text: "Hey Mike, it's Geoff. I noticed a hard brake event on I-90 near Exit 42 about twenty minutes ago — you were doing 62 and the deceleration hit 0.58g. That's a pretty strong stop. Everything okay out there? I just want to make sure nothing happened and see if there's anything we can look at together.",
        timestamp: Timestamp.now(),
      },
    ],
    coachAnalysis: {
      eventType: 'hard_brake',
      pattern: 'none',
      sentiment: 'needs_coaching',
      recommendation: {
        type: 'following_distance',
        details: 'First hard brake event for this driver in 30 days. Deceleration of 0.58g at 62 mph suggests reactive braking. Consider discussing following distance awareness.',
        confidence: 0.7,
      },
    },
    outcome: { type: null },
  },

  // Mike Johnson — speeding, recurring
  {
    eventId: 'demo-event-002',
    driverId: 'b2D',
    driverName: 'Mike Johnson',
    deviceName: 'Demo - 32',
    fleetId: 'demo-fleet',
    eventType: 'speeding',
    ruleName: 'Posted Speeding',
    status: 'ready',
    createdAt: Timestamp.fromMillis(Date.now() - 3600000),
    summary: 'Sustained speeding on Route 9 — 78 mph in a 65 zone for 4.2 miles',
    transcript: [
      {
        speaker: 'geoff',
        text: "Mike, Geoff here again. I'm seeing a speeding stretch on Route 9 — looks like you were cruising at 78 in a 65 zone for about four miles. I've actually noticed this same stretch come up a couple times this month. No lecture here, just wondering if there's something about that road that makes it easy to creep up. Want to talk through it?",
        timestamp: Timestamp.fromMillis(Date.now() - 3600000),
      },
    ],
    coachAnalysis: {
      eventType: 'speeding',
      pattern: 'recurring_location',
      sentiment: 'pattern_detected',
      recommendation: {
        type: 'route_change',
        details: 'Third speeding event on Route 9 this month. Speed consistently 10-15 mph over limit on same 4-mile stretch. Pattern suggests road design encourages higher speed. Consider alternate route or speed alert.',
        confidence: 0.85,
      },
    },
    outcome: { type: null },
  },

  // Sarah Chen — seatbelt, positive history
  {
    eventId: 'demo-event-003',
    driverId: 'b3A',
    driverName: 'Sarah Chen',
    deviceName: 'Demo - 18',
    fleetId: 'demo-fleet',
    eventType: 'seatbelt',
    ruleName: 'Seatbelt',
    status: 'ready',
    createdAt: Timestamp.now(),
    summary: 'Seatbelt unbuckled alert — 2 minutes while stationary, re-buckled before moving',
    transcript: [
      {
        speaker: 'geoff',
        text: "Hi Sarah, it's Geoff. Quick one — I got a seatbelt alert from your truck about half an hour ago. Looks like it was off for about two minutes while you were parked, and you buckled back up before pulling out. Honestly, your safety record is excellent — 94 days with zero events before this. I just have to flag these when they come in. Was that just a quick stretch break?",
        timestamp: Timestamp.now(),
      },
    ],
    coachAnalysis: {
      eventType: 'seatbelt',
      pattern: 'none',
      sentiment: 'positive_reinforcement',
      recommendation: {
        type: 'none',
        details: 'Minor seatbelt event while stationary. Driver has exceptional 94-day clean record. Re-buckled before vehicle moved. Low concern — acknowledge good behavior.',
        confidence: 0.9,
      },
    },
    outcome: { type: null },
  },

  // Sarah Chen — harsh cornering
  {
    eventId: 'demo-event-004',
    driverId: 'b3A',
    driverName: 'Sarah Chen',
    deviceName: 'Demo - 18',
    fleetId: 'demo-fleet',
    eventType: 'harsh_cornering',
    ruleName: 'Harsh Cornering',
    status: 'ready',
    createdAt: Timestamp.fromMillis(Date.now() - 7200000),
    summary: 'Harsh cornering event at industrial park entrance — 0.42g lateral force at 28 mph',
    transcript: [
      {
        speaker: 'geoff',
        text: "Hey Sarah, Geoff again. I picked up a harsh cornering event at the industrial park entrance off Miller Road — 0.42g lateral at 28 mph. That corner's actually been showing up for a few of our drivers this week, so I think it might be a tricky turn. Were you loaded heavy today? Sometimes that changes how the truck handles through tight turns.",
        timestamp: Timestamp.fromMillis(Date.now() - 7200000),
      },
    ],
    coachAnalysis: {
      eventType: 'harsh_cornering',
      pattern: 'recurring_location',
      sentiment: 'needs_coaching',
      recommendation: {
        type: 'route_change',
        details: 'Multiple drivers flagged at same corner this week. Likely infrastructure issue — tight turn radius at industrial park entrance. Consider fleet-wide advisory or alternate entrance.',
        confidence: 0.8,
      },
    },
    outcome: { type: null },
  },

  // Carlos Rodriguez — idling, pattern
  {
    eventId: 'demo-event-005',
    driverId: 'b2A',
    driverName: 'Carlos Rodriguez',
    deviceName: 'Demo - 26',
    fleetId: 'demo-fleet',
    eventType: 'excessive_idling',
    ruleName: 'Excessive Idling',
    status: 'ready',
    createdAt: Timestamp.now(),
    summary: 'Extended idling at distribution center — 47 minutes with engine running',
    transcript: [
      {
        speaker: 'geoff',
        text: "Hey Carlos, it's Geoff. I'm seeing a 47-minute idle at the Riverside distribution center this morning. I know that location can have long wait times at the dock — I've been seeing it across a few drivers actually. Before I bring anything to the ops team, I wanted to check with you first. Was that a dock wait, or something else going on?",
        timestamp: Timestamp.now(),
      },
    ],
    coachAnalysis: {
      eventType: 'excessive_idling',
      pattern: 'fleet_wide',
      sentiment: 'needs_coaching',
      recommendation: {
        type: 'timing_adjustment',
        details: 'Multiple drivers showing 30-50 minute idles at Riverside distribution center. Likely dock scheduling issue, not driver behavior. Consider escalating to operations for dock appointment optimization.',
        confidence: 0.9,
      },
    },
    outcome: { type: null },
  },

  // Carlos Rodriguez — defensive driving positive
  {
    eventId: 'demo-event-006',
    driverId: 'b2A',
    driverName: 'Carlos Rodriguez',
    deviceName: 'Demo - 26',
    fleetId: 'demo-fleet',
    eventType: 'defensive_driving',
    ruleName: 'Defensive Driving',
    status: 'ready',
    createdAt: Timestamp.fromMillis(Date.now() - 1800000),
    summary: 'Proactive speed reduction in construction zone — slowed 15 mph before zone signage',
    transcript: [
      {
        speaker: 'geoff',
        text: "Carlos! Geoff here with some good news for once. I saw you coming up on that construction zone on Highway 35, and you started slowing down a good quarter mile before the signs even started. That's exactly the kind of anticipation that keeps everyone safe. Your scores this month have been really solid — you're in the top 10% of the fleet. Just wanted you to know that doesn't go unnoticed.",
        timestamp: Timestamp.fromMillis(Date.now() - 1800000),
      },
    ],
    coachAnalysis: {
      eventType: 'defensive_driving',
      pattern: 'none',
      sentiment: 'defensive_driving_positive',
      recommendation: {
        type: 'none',
        details: 'Proactive defensive driving behavior detected. Driver consistently performs in top 10% fleet safety scores. Positive reinforcement appropriate.',
        confidence: 0.95,
      },
    },
    outcome: { type: null },
  },
];

async function seed() {
  console.log('Seeding drivers...');
  for (const driver of drivers) {
    await db.collection('drivers').doc(driver.id).set({
      ...driver,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    console.log(`  Driver: ${driver.name} (${driver.id})`);
  }

  console.log('\nSeeding coaching sessions...');
  const batch = db.batch();

  for (const session of sessions) {
    const ref = db.collection('sessions').doc();
    batch.set(ref, session);
    console.log(`  Session: ${session.driverName} — ${session.ruleName} (${ref.id})`);
  }

  await batch.commit();
  console.log(`\nSeeded ${drivers.length} drivers and ${sessions.length} demo sessions.`);
}

seed().catch(console.error);
