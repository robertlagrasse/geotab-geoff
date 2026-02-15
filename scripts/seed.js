import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';

initializeApp({ projectId: 'geotab-geoff' });
const db = getFirestore();

const drivers = [
  { id: 'mike_johnson', name: 'Mike Johnson', email: 'mike@acmetrucking.com', role: 'driver', safetyScore: 87, streakDays: 21 },
  { id: 'sarah_thomas', name: 'Sarah Thomas', email: 'sarah@acmetrucking.com', role: 'driver', safetyScore: 72, streakDays: 0 },
  { id: 'dave_kowalski', name: 'Dave Kowalski', email: 'dave@acmetrucking.com', role: 'driver', safetyScore: 94, streakDays: 42 },
  { id: 'maria_garcia', name: 'Maria Garcia', email: 'maria@acmetrucking.com', role: 'driver', safetyScore: 81, streakDays: 7 },
  { id: 'james_wilson', name: 'James Wilson', email: 'james@acmetrucking.com', role: 'driver', safetyScore: 65, streakDays: 0 },
];

const supervisor = {
  id: 'jane_supervisor',
  name: 'Jane Sullivan',
  email: 'jane@acmetrucking.com',
  role: 'supervisor',
};

const events = [
  {
    driverId: 'mike_johnson',
    driverName: 'Mike Johnson',
    fleetId: 'acme_trucking',
    type: 'hard_brake',
    geotabEventId: 'evt_001',
    timestamp: Timestamp.fromDate(new Date('2026-02-14T14:47:00')),
    location: new GeoPoint(41.8781, -87.6298),
    geotabData: { speed: 28, deceleration: -0.45, duration: 2.3, deviceId: 'dev_014' },
    nearbyContext: {
      locationName: 'Lincoln Elementary School',
      locationType: 'school_zone',
      recentFleetEvents: 1,
      driverPatternNote: 'First event at this location',
    },
    coachingStatus: 'ready',
  },
  {
    driverId: 'sarah_thomas',
    driverName: 'Sarah Thomas',
    fleetId: 'acme_trucking',
    type: 'hard_brake',
    geotabEventId: 'evt_002',
    timestamp: Timestamp.fromDate(new Date('2026-02-14T14:32:00')),
    location: new GeoPoint(41.8819, -87.6278),
    geotabData: { speed: 31, deceleration: -0.52, duration: 1.8, deviceId: 'dev_007' },
    nearbyContext: {
      locationName: 'Route 7 & Oak Street',
      locationType: 'intersection',
      recentFleetEvents: 3,
      driverPatternNote: '3rd hard brake this week on Route 7, all between 2:30-3:00pm',
    },
    coachingStatus: 'ready',
  },
  {
    driverId: 'james_wilson',
    driverName: 'James Wilson',
    fleetId: 'acme_trucking',
    type: 'speeding',
    geotabEventId: 'evt_003',
    timestamp: Timestamp.fromDate(new Date('2026-02-14T11:15:00')),
    location: new GeoPoint(41.9100, -87.6500),
    geotabData: { speed: 72, speedLimit: 65, duration: 180, deviceId: 'dev_022' },
    nearbyContext: {
      locationName: 'I-94 Northbound',
      locationType: 'highway',
      recentFleetEvents: 0,
      driverPatternNote: '2nd speeding event this week',
    },
    coachingStatus: 'ready',
  },
  {
    driverId: 'maria_garcia',
    driverName: 'Maria Garcia',
    fleetId: 'acme_trucking',
    type: 'harsh_acceleration',
    geotabEventId: 'evt_004',
    timestamp: Timestamp.fromDate(new Date('2026-02-14T08:22:00')),
    location: new GeoPoint(41.8650, -87.6170),
    geotabData: { speed: 0, acceleration: 0.38, duration: 3.1, deviceId: 'dev_011' },
    nearbyContext: {
      locationName: 'Depot Exit Ramp',
      locationType: 'depot',
      recentFleetEvents: 5,
      driverPatternNote: 'Common fleet-wide pattern at depot exit',
    },
    coachingStatus: 'ready',
  },
  {
    driverId: 'dave_kowalski',
    driverName: 'Dave Kowalski',
    fleetId: 'acme_trucking',
    type: 'positive',
    geotabEventId: 'evt_005',
    timestamp: Timestamp.fromDate(new Date('2026-02-14T17:00:00')),
    location: null,
    geotabData: { incidentFreeWeeks: 6, safetyScore: 94, deviceId: 'dev_019' },
    nearbyContext: {
      locationName: null,
      locationType: null,
      recentFleetEvents: 0,
      driverPatternNote: 'Zero incidents for 6 consecutive weeks',
    },
    coachingStatus: 'ready',
  },
];

const sessions = [
  {
    eventType: 'hard_brake',
    driverId: 'mike_johnson',
    driverName: 'Mike Johnson',
    fleetId: 'acme_trucking',
    status: 'completed',
    createdAt: Timestamp.fromDate(new Date('2026-02-14T14:50:00')),
    completedAt: Timestamp.fromDate(new Date('2026-02-14T14:55:00')),
    summary: 'Hard brake near Lincoln Elementary — defensive driving positive',
    transcript: [
      { speaker: 'geoff', text: "Hey Mike, Geoff here. Got a sec? I saw that stop near Lincoln Elementary around 2:47. Looked at the data — you went from 28 to 4 pretty quick, but the deceleration curve was controlled. Honestly? Looks like good defensive driving to me. Just wanted to check in. Everything okay out there?", timestamp: Timestamp.fromDate(new Date('2026-02-14T14:50:30')) },
      { speaker: 'driver', text: "Yeah, a kid ran out into the crosswalk. I saw them early enough to brake smoothly.", timestamp: Timestamp.fromDate(new Date('2026-02-14T14:51:15')) },
      { speaker: 'geoff', text: "That's exactly what I thought from the data. Controlled stop, good reaction time. I'm marking this as a defensive driving positive. Nice work, Mike.", timestamp: Timestamp.fromDate(new Date('2026-02-14T14:51:45')) },
    ],
    coachAnalysis: {
      eventType: 'hard_brake',
      pattern: 'none',
      sentiment: 'defensive_driving_positive',
      recommendation: { type: 'none', details: '', confidence: 0.92 },
    },
    outcome: { type: 'positive' },
  },
  {
    eventType: 'hard_brake',
    driverId: 'sarah_thomas',
    driverName: 'Sarah Thomas',
    fleetId: 'acme_trucking',
    status: 'escalated',
    createdAt: Timestamp.fromDate(new Date('2026-02-14T14:35:00')),
    completedAt: null,
    summary: '3rd hard brake this week on Route 7 — school dismissal pattern',
    transcript: [
      { speaker: 'geoff', text: "Sarah, this is the third time this week we've had a hard stop on Route 7 near that school. I don't think it's you — I think it's the route timing hitting school dismissal. Want me to flag a schedule adjustment for your supervisor? You'd leave 15 minutes later but skip the chaos.", timestamp: Timestamp.fromDate(new Date('2026-02-14T14:35:30')) },
      { speaker: 'driver', text: "I can't change my route without dispatch approval, but yeah, that school zone is getting worse every day at that time.", timestamp: Timestamp.fromDate(new Date('2026-02-14T14:36:20')) },
      { speaker: 'geoff', text: "Totally understand — that's above your pay grade and mine. I've flagged it for your supervisor with the data. Three events, same stretch, same time window. The pattern is clear. Should hear back soon.", timestamp: Timestamp.fromDate(new Date('2026-02-14T14:36:50')) },
    ],
    coachAnalysis: {
      eventType: 'hard_brake',
      pattern: 'recurring_location',
      sentiment: 'pattern_detected',
      recommendation: { type: 'timing_adjustment', details: 'Shift Route 7 departure to 3:15pm to avoid school dismissal at 2:30pm', confidence: 0.87 },
    },
    outcome: { type: 'escalated', driverResponse: "Can't change route without dispatch approval" },
  },
  {
    eventType: 'speeding',
    driverId: 'james_wilson',
    driverName: 'James Wilson',
    fleetId: 'acme_trucking',
    status: 'disputed',
    createdAt: Timestamp.fromDate(new Date('2026-02-14T11:20:00')),
    completedAt: null,
    summary: 'Speeding on I-94 — 72 in 65 zone',
    transcript: [
      { speaker: 'geoff', text: "Hey James, Geoff here. I noticed you were running about 72 on I-94 this morning in the 65 zone. That's the second time this week. Want to talk about what's going on?", timestamp: Timestamp.fromDate(new Date('2026-02-14T11:20:30')) },
      { speaker: 'driver', text: "Traffic flow was 70 plus. Going 65 in that traffic is more dangerous than keeping pace. You'd know that if you actually drove.", timestamp: Timestamp.fromDate(new Date('2026-02-14T11:21:10')) },
      { speaker: 'geoff', text: "Fair point about traffic flow — that's a real consideration. The data does show surrounding traffic was moving fast. I'll flag this for your supervisor to review the context. No judgment from me, just want to make sure everyone's on the same page about the policy.", timestamp: Timestamp.fromDate(new Date('2026-02-14T11:21:45')) },
    ],
    coachAnalysis: {
      eventType: 'speeding',
      pattern: 'recurring_driver',
      sentiment: 'needs_coaching',
      recommendation: { type: 'route_change', details: 'Review speed management policy for I-94 corridor', confidence: 0.65 },
    },
    outcome: { type: 'disputed', driverResponse: 'Traffic flow was 70+, unsafe to go slower' },
  },
  {
    eventType: 'positive',
    driverId: 'dave_kowalski',
    driverName: 'Dave Kowalski',
    fleetId: 'acme_trucking',
    status: 'completed',
    createdAt: Timestamp.fromDate(new Date('2026-02-14T17:05:00')),
    completedAt: Timestamp.fromDate(new Date('2026-02-14T17:07:00')),
    summary: '6 weeks incident-free — positive reinforcement',
    transcript: [
      { speaker: 'geoff', text: "Dave! Geoff here. No incidents this week. That's six weeks running. Just wanted to say — nice driving. Keep it up.", timestamp: Timestamp.fromDate(new Date('2026-02-14T17:05:30')) },
      { speaker: 'driver', text: "Thanks Geoff. Appreciate it.", timestamp: Timestamp.fromDate(new Date('2026-02-14T17:06:00')) },
    ],
    coachAnalysis: {
      eventType: 'positive',
      pattern: 'none',
      sentiment: 'positive_reinforcement',
      recommendation: { type: 'none', details: '', confidence: 1.0 },
    },
    outcome: { type: 'acknowledged' },
  },
  {
    eventType: 'hard_brake',
    driverId: 'sarah_thomas',
    driverName: 'Sarah Thomas',
    fleetId: 'acme_trucking',
    status: 'ready',
    createdAt: Timestamp.fromDate(new Date('2026-02-14T14:32:00')),
    completedAt: null,
    summary: 'New: Hard brake on Route 7 — awaiting driver',
    transcript: [
      { speaker: 'geoff', text: "Sarah, Geoff again. I know we just talked, but there's been another hard brake on Route 7. Same stretch, same time. The data is pretty clear at this point — this route timing isn't working. I've already flagged it, but wanted you to know I see what's happening. You're doing fine. It's the schedule that needs to change.", timestamp: Timestamp.fromDate(new Date('2026-02-14T14:32:30')) },
    ],
    coachAnalysis: {
      eventType: 'hard_brake',
      pattern: 'recurring_location',
      sentiment: 'pattern_detected',
      recommendation: { type: 'timing_adjustment', details: 'Shift Route 7 departure to 3:15pm', confidence: 0.93 },
    },
    outcome: { type: null },
  },
];

const actions = [
  {
    sessionId: 'placeholder',
    driverId: 'sarah_thomas',
    driverName: 'Sarah Thomas',
    fleetId: 'acme_trucking',
    type: 'timing_adjustment',
    status: 'pending',
    createdAt: Timestamp.fromDate(new Date('2026-02-14T14:37:00')),
    summary: 'Shift Route 7 departure to 3:15pm to avoid school dismissal congestion',
    driverInput: "Can't change route without dispatch approval, but agrees the timing is the problem",
    coachRationale: '3 hard brake events this week on Route 7, all between 2:30-3:00pm near Lincoln Elementary. School dismissal causes pedestrian congestion. Pattern is clear and recurring.',
  },
  {
    sessionId: 'placeholder',
    driverId: 'james_wilson',
    driverName: 'James Wilson',
    fleetId: 'acme_trucking',
    type: 'dispute_review',
    status: 'pending',
    createdAt: Timestamp.fromDate(new Date('2026-02-14T11:22:00')),
    summary: 'Review speeding policy for I-94 corridor — driver disputes 72 in 65 citing traffic flow',
    driverInput: 'Traffic flow was 70+, unsafe to go slower',
    coachRationale: "Driver's 2nd speeding event this week on I-94. Driver argues traffic flow makes 65mph unsafe. Data confirms surrounding traffic was above speed limit. Policy review recommended.",
  },
  {
    sessionId: 'placeholder',
    driverId: 'maria_garcia',
    driverName: 'Maria Garcia',
    fleetId: 'acme_trucking',
    type: 'route_change',
    status: 'pending',
    createdAt: Timestamp.fromDate(new Date('2026-02-14T08:30:00')),
    summary: 'Investigate depot exit ramp — 5 harsh acceleration events fleet-wide this month',
    driverInput: 'The ramp grade is steep and the merge is short',
    coachRationale: '5 harsh acceleration events from multiple drivers at depot exit ramp. Likely infrastructure issue, not driver behavior. Recommend engineering review or route modification.',
  },
];

const analytics = {
  date: '2026-02-14',
  totalConversations: 47,
  outcomes: { positive: 12, acknowledged: 28, escalated: 5, disputed: 2 },
  recommendationTypes: { timing_adjustment: 8, route_change: 6, following_distance: 4, training: 2 },
  avgResponseTime: 45,
  engagementRate: 0.89,
  escalationRate: 0.11,
};

async function seed() {
  console.log('Seeding drivers...');
  for (const driver of drivers) {
    await db.collection('users').doc(driver.id).set(driver);
  }
  await db.collection('users').doc(supervisor.id).set(supervisor);

  console.log('Seeding events...');
  for (const event of events) {
    await db.collection('events').add({ ...event, createdAt: Timestamp.now() });
  }

  console.log('Seeding sessions...');
  for (const session of sessions) {
    await db.collection('sessions').add(session);
  }

  console.log('Seeding actions...');
  for (const action of actions) {
    await db.collection('actions').add(action);
  }

  console.log('Seeding analytics...');
  await db.collection('fleets').doc('acme_trucking').collection('analytics').doc('2026-02-14').set(analytics);

  console.log('Done! Seeded:');
  console.log(`  ${drivers.length + 1} users (${drivers.length} drivers + 1 supervisor)`);
  console.log(`  ${events.length} events`);
  console.log(`  ${sessions.length} sessions`);
  console.log(`  ${actions.length} actions`);
  console.log('  1 analytics doc');
}

seed().catch(console.error);
