import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDuration,
  parseDurationMs,
  isMultiDayDuration,
  formatDistance,
  formatSpeed,
  distanceMeters,
  clusterEventsByLocation,
  applyEscalationSafetyNet,
} from '../coaching/generator.js';

// ── Duration formatting ─────────────────────────────────────────────

describe('formatDuration', () => {
  it('returns "brief" for null/undefined', () => {
    assert.equal(formatDuration(null), 'brief');
    assert.equal(formatDuration(undefined), 'brief');
  });

  it('parses HH:MM:SS format', () => {
    assert.equal(formatDuration('00:02:30'), '2 minutes 30 seconds');
    assert.equal(formatDuration('01:15:00'), '1 hour 15 minutes');
    assert.equal(formatDuration('03:00:00'), '3 hours 0 minutes');
    assert.equal(formatDuration('00:00:45'), '45 seconds');
  });

  it('parses DD.HH:MM:SS format (multi-day monitoring periods)', () => {
    assert.equal(formatDuration('21.04:46:21'), 'monitoring period (21 days)');
    assert.equal(formatDuration('1.02:30:00'), '26 hours 30 minutes');
    assert.equal(formatDuration('0.01:15:00'), '1 hour 15 minutes');
  });

  it('handles single-second durations', () => {
    assert.equal(formatDuration('00:00:01'), '1 second');
  });

  it('returns raw string for unrecognized format', () => {
    assert.equal(formatDuration('garbage'), 'garbage');
  });
});

// ── Duration parsing (milliseconds) ────────────────────────────────

describe('parseDurationMs', () => {
  it('returns 0 for null/undefined', () => {
    assert.equal(parseDurationMs(null), 0);
    assert.equal(parseDurationMs(undefined), 0);
  });

  it('parses HH:MM:SS to milliseconds', () => {
    assert.equal(parseDurationMs('01:00:00'), 3600000);
    assert.equal(parseDurationMs('00:01:00'), 60000);
    assert.equal(parseDurationMs('00:00:01'), 1000);
  });

  it('parses DD.HH:MM:SS to milliseconds', () => {
    assert.equal(parseDurationMs('1.00:00:00'), 86400000);
    assert.equal(parseDurationMs('2.12:00:00'), 2 * 86400000 + 12 * 3600000);
  });
});

// ── Multi-day detection ─────────────────────────────────────────────

describe('isMultiDayDuration', () => {
  it('detects multi-day durations', () => {
    assert.equal(isMultiDayDuration('21.04:46:21'), true);
    assert.equal(isMultiDayDuration('1.00:00:00'), true);
  });

  it('rejects non-multi-day durations', () => {
    assert.ok(!isMultiDayDuration('00:30:00'));
    assert.ok(!isMultiDayDuration('0.12:00:00'));
    assert.ok(!isMultiDayDuration(null));
    assert.ok(!isMultiDayDuration(undefined));
  });
});

// ── Unit conversions ────────────────────────────────────────────────

describe('formatDistance', () => {
  it('returns null for zero/negative/null', () => {
    assert.equal(formatDistance(null), null);
    assert.equal(formatDistance(0), null);
    assert.equal(formatDistance(-5), null);
  });

  it('formats short distances in meters', () => {
    assert.equal(formatDistance(50), '50 meters');
  });

  it('formats longer distances in miles', () => {
    assert.equal(formatDistance(1609.344), '1.0 miles');
    assert.equal(formatDistance(8046.72), '5.0 miles');
  });
});

describe('formatSpeed', () => {
  it('returns null for zero/negative/null', () => {
    assert.equal(formatSpeed(null), null);
    assert.equal(formatSpeed(0), null);
    assert.equal(formatSpeed(-10), null);
  });

  it('converts km/h to mph', () => {
    assert.equal(formatSpeed(100), '62 mph');
    assert.equal(formatSpeed(60), '37 mph');
    assert.equal(formatSpeed(160.934), '100 mph');
  });
});

// ── Haversine distance ──────────────────────────────────────────────

describe('distanceMeters', () => {
  it('returns 0 for identical points', () => {
    assert.equal(distanceMeters(40.0, -74.0, 40.0, -74.0), 0);
  });

  it('calculates known distance (NYC to Newark ~15km)', () => {
    const d = distanceMeters(40.7128, -74.0060, 40.7357, -74.1724);
    assert.ok(d > 14000 && d < 16000, `Expected ~15km, got ${d}`);
  });

  it('points 100m apart are within tolerance', () => {
    // ~0.001 degrees latitude ≈ 111 meters
    const d = distanceMeters(40.0, -74.0, 40.001, -74.0);
    assert.ok(d > 100 && d < 120, `Expected ~111m, got ${d}`);
  });
});

// ── GPS clustering ──────────────────────────────────────────────────

describe('clusterEventsByLocation', () => {
  it('returns empty array when no clusters exist', () => {
    const events = [
      { location: { latitude: 40.0, longitude: -74.0 } },
      { location: { latitude: 41.0, longitude: -75.0 } },
    ];
    const clusters = clusterEventsByLocation(events);
    assert.equal(clusters.length, 0);
  });

  it('clusters events at the same location', () => {
    const events = [
      { location: { latitude: 40.0, longitude: -74.0 } },
      { location: { latitude: 40.0001, longitude: -74.0001 } },
      { location: { latitude: 40.0002, longitude: -74.0002 } },
    ];
    const clusters = clusterEventsByLocation(events);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].eventIndices.length, 3);
  });

  it('creates separate clusters for distant events', () => {
    const events = [
      { location: { latitude: 40.0, longitude: -74.0 } },
      { location: { latitude: 40.0001, longitude: -74.0001 } },
      { location: { latitude: 41.0, longitude: -75.0 } },
      { location: { latitude: 41.0001, longitude: -75.0001 } },
    ];
    const clusters = clusterEventsByLocation(events);
    assert.equal(clusters.length, 2);
  });

  it('ignores events without location data', () => {
    const events = [
      { location: { latitude: 40.0, longitude: -74.0 } },
      { location: null },
      { location: { latitude: 40.0001, longitude: -74.0001 } },
    ];
    const clusters = clusterEventsByLocation(events);
    assert.equal(clusters.length, 1);
    assert.deepEqual(clusters[0].eventIndices, [0, 2]);
  });

  it('respects custom radius', () => {
    // ~111 meters apart
    const events = [
      { location: { latitude: 40.0, longitude: -74.0 } },
      { location: { latitude: 40.001, longitude: -74.0 } },
    ];
    // Default 300m radius — should cluster
    assert.equal(clusterEventsByLocation(events, 300).length, 1);
    // 50m radius — should NOT cluster
    assert.equal(clusterEventsByLocation(events, 50).length, 0);
  });
});

// ── Escalation safety net ───────────────────────────────────────────

describe('applyEscalationSafetyNet', () => {
  it('does nothing when no flags are triggered', () => {
    const parsed = {
      message: 'Drive safe!',
      escalation_check: {
        aggressive_driving: false,
        impairment: false,
        intentional_violations: false,
        hostility: false,
        vehicle_issues: false,
        data_severity: false,
        driver_requested: false,
      },
      escalate: null,
    };
    applyEscalationSafetyNet(parsed);
    assert.equal(parsed.escalate, null);
  });

  it('does nothing when model already escalated', () => {
    const parsed = {
      message: 'Flagging this for your supervisor.',
      escalation_check: {
        aggressive_driving: true,
        impairment: false,
        intentional_violations: false,
        hostility: false,
        vehicle_issues: false,
        data_severity: false,
        driver_requested: false,
      },
      escalate: { type: 'safety_concern', details: 'Road rage', rationale: 'Trigger A' },
    };
    const original = { ...parsed.escalate };
    applyEscalationSafetyNet(parsed);
    assert.deepEqual(parsed.escalate, original);
  });

  it('forces escalation when model misses a single trigger', () => {
    const parsed = {
      message: 'Sounds good!',
      escalation_check: {
        aggressive_driving: false,
        impairment: true,
        intentional_violations: false,
        hostility: false,
        vehicle_issues: false,
        data_severity: false,
        driver_requested: false,
      },
      escalate: null,
    };
    applyEscalationSafetyNet(parsed);
    assert.notEqual(parsed.escalate, null);
    assert.equal(parsed.escalate.type, 'safety_concern');
    assert.ok(parsed.escalate.details.includes('impairment'));
  });

  it('forces escalation when model misses multiple triggers', () => {
    const parsed = {
      message: 'Take care out there.',
      escalation_check: {
        aggressive_driving: true,
        impairment: false,
        intentional_violations: true,
        hostility: true,
        vehicle_issues: false,
        data_severity: true,
        driver_requested: false,
      },
      escalate: null,
    };
    applyEscalationSafetyNet(parsed);
    assert.notEqual(parsed.escalate, null);
    assert.ok(parsed.escalate.details.includes('aggressive_driving'));
    assert.ok(parsed.escalate.details.includes('intentional_violations'));
    assert.ok(parsed.escalate.details.includes('hostility'));
    assert.ok(parsed.escalate.details.includes('data_severity'));
  });

  it('forces escalation for data_severity alone (5+ events threshold)', () => {
    const parsed = {
      message: "You're doing fine.",
      escalation_check: {
        aggressive_driving: false,
        impairment: false,
        intentional_violations: false,
        hostility: false,
        vehicle_issues: false,
        data_severity: true,
        driver_requested: false,
      },
      escalate: null,
    };
    applyEscalationSafetyNet(parsed);
    assert.notEqual(parsed.escalate, null);
    assert.ok(parsed.escalate.details.includes('data_severity'));
  });

  it('forces escalation for driver_requested', () => {
    const parsed = {
      message: 'Let me look into that.',
      escalation_check: {
        aggressive_driving: false,
        impairment: false,
        intentional_violations: false,
        hostility: false,
        vehicle_issues: false,
        data_severity: false,
        driver_requested: true,
      },
      escalate: null,
    };
    applyEscalationSafetyNet(parsed);
    assert.notEqual(parsed.escalate, null);
    assert.ok(parsed.escalate.details.includes('driver_requested'));
  });

  it('handles missing escalation_check gracefully', () => {
    const parsed = { message: 'Hello', escalate: null };
    applyEscalationSafetyNet(parsed);
    assert.equal(parsed.escalate, null);
  });

  it('handles all-false flags correctly', () => {
    const parsed = {
      message: 'All clear.',
      escalation_check: {
        aggressive_driving: false,
        impairment: false,
        intentional_violations: false,
        hostility: false,
        vehicle_issues: false,
        data_severity: false,
        driver_requested: false,
      },
      escalate: null,
    };
    applyEscalationSafetyNet(parsed);
    assert.equal(parsed.escalate, null);
  });
});
