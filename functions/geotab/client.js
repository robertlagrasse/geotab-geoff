import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const GeotabApi = require('mg-api-js');

// Built-in rule ID → human-readable name mapping
const BUILTIN_RULES = {
  RuleHarshBrakingId: 'Harsh Braking',
  RuleHarshCorneringId: 'Harsh Cornering',
  RuleHardAccelerationId: 'Hard Acceleration',
  RulePostedSpeedingId: 'Posted Speeding',
  RuleSpeedingId: 'Speeding',
  RuleSeatbeltId: 'Seatbelt',
  RuleExcessiveIdlingId: 'Excessive Idling',
  RuleReverseId: 'Reverse',
  RuleAfterHoursUsageId: 'After Hours Usage',
  RuleJackrabbitStartsId: 'Jackrabbit Starts',
  RuleLongDrivingId: 'Long Driving Without Rest',
  RulePassengerSeatbeltId: 'Passenger Seatbelt',
};

// Map rule types to coaching categories
const RULE_CATEGORIES = {
  'Harsh Braking': 'hard_brake',
  'Harsh Cornering': 'harsh_cornering',
  'Hard Acceleration': 'hard_acceleration',
  'Posted Speeding': 'speeding',
  'Speeding': 'speeding',
  'Max Speed': 'speeding',
  'Seatbelt': 'seatbelt',
  'Excessive Idling': 'excessive_idling',
  'Reverse': 'reverse',
  'After Hours Usage': 'after_hours',
  'Jackrabbit Starts': 'hard_acceleration',
  'Long Driving Without Rest': 'fatigue',
  'Passenger Seatbelt': 'seatbelt',
};

// Lazy-initialized SDK client — handles auth, session caching, server redirection
let api = null;
function getApi() {
  if (!api) {
    api = new GeotabApi({
      credentials: {
        database: process.env.GEOTAB_DATABASE,
        userName: process.env.GEOTAB_USERNAME,
        password: process.env.GEOTAB_PASSWORD,
      },
      path: process.env.GEOTAB_SERVER || 'my.geotab.com',
    }, {
      timeout: 30,
      rememberMe: true,
    });
  }
  return api;
}

// Compute the effective lookup time for an event, accounting for multi-day durations
function getEventLookupTime(event) {
  let lookupTime = new Date(event.activeFrom);
  if (event.duration) {
    const dayMatch = event.duration.match(/^(\d+)\./);
    if (dayMatch && parseInt(dayMatch[1]) > 0) {
      const parsed = event.duration.match(/^(\d+)\.(\d+):(\d+):(\d+)/);
      if (parsed) {
        const durationMs = (parseInt(parsed[1]) * 86400 + parseInt(parsed[2]) * 3600 + parseInt(parsed[3]) * 60 + parseInt(parsed[4])) * 1000;
        lookupTime = new Date(lookupTime.getTime() + durationMs);
      }
    }
  }
  return lookupTime;
}

export async function fetchSafetyEvents() {
  const geotab = getApi();
  const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const events = await geotab.call('Get', {
    typeName: 'ExceptionEvent',
    search: { fromDate },
    resultsLimit: 100,
  });

  if (!events?.length) return [];

  const ruleIds = [...new Set(events.map((e) => e.rule?.id).filter(Boolean))];
  const customRuleIds = ruleIds.filter((id) => !BUILTIN_RULES[id]);

  // Fetch reference entities in parallel — each result is named, no index tracking
  const [allDevices, allUsers, customRules] = await Promise.all([
    geotab.call('Get', { typeName: 'Device' }),
    geotab.call('Get', { typeName: 'User' }),
    customRuleIds.length
      ? geotab.call('Get', { typeName: 'Rule' })
      : Promise.resolve([]),
  ]);

  // Build lookup maps
  const deviceMap = {};
  const userMap = {};
  const ruleMap = { ...BUILTIN_RULES };

  (allDevices || []).forEach((d) => { deviceMap[d.id] = d; });
  (allUsers || []).forEach((u) => { userMap[u.id] = u; });
  (customRules || []).forEach((r) => { ruleMap[r.id] = r.name; });

  // Build GPS enrichment calls — one per event, results map 1:1
  const gpsBatchCalls = [];
  const gpsBatchMeta = [];

  for (const event of events) {
    const deviceId = event.device?.id;
    if (!deviceId) continue;

    const lookupTime = getEventLookupTime(event);
    const fromTime = new Date(lookupTime.getTime() - 30000);
    const toTime = new Date(lookupTime.getTime() + 30000);

    gpsBatchCalls.push(['Get', {
      typeName: 'LogRecord',
      search: {
        deviceSearch: { id: deviceId },
        fromDate: fromTime.toISOString(),
        toDate: toTime.toISOString(),
      },
      resultsLimit: 5,
    }]);
    gpsBatchMeta.push(event);
  }

  // Execute GPS lookups in batches of 20
  const BATCH_SIZE = 20;
  const allGpsResults = [];

  for (let i = 0; i < gpsBatchCalls.length; i += BATCH_SIZE) {
    const batch = gpsBatchCalls.slice(i, i + BATCH_SIZE);
    try {
      const results = await geotab.multiCall(batch);
      allGpsResults.push(...results);
    } catch (err) {
      console.error('GPS batch fetch error:', err);
      allGpsResults.push(...new Array(batch.length).fill([]));
    }
  }

  // Fetch posted speed limits for speeding events
  const speedLimitCalls = [];
  const speedLimitIndices = [];

  for (let i = 0; i < gpsBatchMeta.length; i++) {
    const event = gpsBatchMeta[i];
    const ruleId = event.rule?.id;
    const ruleName = ruleMap[ruleId] || '';

    if (ruleId === 'RulePostedSpeedingId' || ruleId === 'RuleSpeedingId' ||
        ruleName.toLowerCase().includes('speed')) {
      const deviceId = event.device?.id;
      const lookupTime = getEventLookupTime(event);

      speedLimitCalls.push(['GetRoadMaxSpeeds', {
        deviceSearch: { id: deviceId },
        fromDate: new Date(lookupTime.getTime() - 10000).toISOString(),
        toDate: new Date(lookupTime.getTime() + 30000).toISOString(),
      }]);
      speedLimitIndices.push(i);
    }
  }

  const speedLimitMap = {};
  if (speedLimitCalls.length > 0) {
    for (let i = 0; i < speedLimitCalls.length; i += BATCH_SIZE) {
      const batch = speedLimitCalls.slice(i, i + BATCH_SIZE);
      const batchIndices = speedLimitIndices.slice(i, i + BATCH_SIZE);
      try {
        const results = await geotab.multiCall(batch);
        for (let j = 0; j < results.length; j++) {
          const roadSpeeds = results[j] || [];
          if (roadSpeeds.length > 0) {
            const event = gpsBatchMeta[batchIndices[j]];
            const eventTime = new Date(event.activeFrom).getTime();
            let closest = roadSpeeds[0];
            let closestDiff = Math.abs(new Date(closest.k).getTime() - eventTime);
            for (const rs of roadSpeeds) {
              const diff = Math.abs(new Date(rs.k).getTime() - eventTime);
              if (diff < closestDiff) { closest = rs; closestDiff = diff; }
            }
            speedLimitMap[batchIndices[j]] = closest.v;
          }
        }
      } catch (err) {
        console.warn('Speed limit batch fetch error:', err.message);
      }
    }
  }

  // Build final enriched events
  const enriched = [];
  for (let i = 0; i < gpsBatchMeta.length; i++) {
    const event = gpsBatchMeta[i];
    const logRecords = allGpsResults[i] || [];

    const deviceId = event.device?.id;
    const driverId = event.driver?.id;
    const ruleId = event.rule?.id;

    const device = deviceMap[deviceId];
    const user = userMap[driverId];
    const ruleName = ruleMap[ruleId] || ruleId || 'Safety Event';
    const category = RULE_CATEGORIES[ruleName] || 'safety_event';

    const driverName = user
      ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
      : device?.name || 'Unknown Driver';

    let location = null;
    let vehicleSpeed = 0;
    if (logRecords.length > 0) {
      const closest = logRecords.reduce((best, lr) => {
        const diff = Math.abs(new Date(lr.dateTime) - new Date(event.activeFrom));
        const bestDiff = Math.abs(new Date(best.dateTime) - new Date(event.activeFrom));
        return diff < bestDiff ? lr : best;
      });
      vehicleSpeed = closest.speed || 0;
      if (closest.longitude !== 0 || closest.latitude !== 0) {
        location = {
          latitude: closest.latitude,
          longitude: closest.longitude,
          speed: vehicleSpeed,
        };
      }
    }

    const speedLimit = speedLimitMap[i] || null;

    enriched.push({
      id: event.id,
      driverId: driverId || deviceId || 'unknown',
      driverName,
      deviceName: device?.name || 'Unknown Vehicle',
      type: category,
      ruleName,
      timestamp: event.activeFrom,
      location: location || null,
      rawData: {
        ruleId: ruleId || null,
        deviceId: deviceId || null,
        driverId: driverId || null,
        duration: event.duration || null,
        distance: event.distance || 0,
        speed: vehicleSpeed,
        speedLimit: speedLimit || null,
        state: event.state || null,
      },
    });
  }

  return enriched;
}

// Fetch driver context: recent event patterns + optional Ace AI insight
export async function queryAceContext(driverId, eventData) {
  const geotab = getApi();

  try {
    const recentEvents = await geotab.call('Get', {
      typeName: 'ExceptionEvent',
      search: {
        deviceSearch: { id: eventData.rawData?.deviceId || eventData.geotabData?.deviceId },
        fromDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      resultsLimit: 50,
    });

    const eventCount = recentEvents?.length || 0;
    let context = `Driver has had ${eventCount} safety events in the past 7 days.`;

    const ruleCounts = {};
    for (const e of recentEvents || []) {
      const ruleId = e.rule?.id;
      const name = BUILTIN_RULES[ruleId] || ruleId;
      ruleCounts[name] = (ruleCounts[name] || 0) + 1;
    }

    const breakdowns = Object.entries(ruleCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => `${name}: ${count}`)
      .join(', ');

    if (breakdowns) {
      context += ` Breakdown: ${breakdowns}.`;
    }

    try {
      const aceInsight = await Promise.race([
        queryAceAI(eventData),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Ace timeout')), 60000)),
      ]);
      if (aceInsight) {
        context += ` Ace AI insight: ${aceInsight}`;
      }
    } catch (aceErr) {
      console.warn('Ace AI query skipped:', aceErr.message);
    }

    return context;
  } catch (err) {
    console.error('Context query failed:', err);
    return 'Unable to fetch driver context.';
  }
}

// 3-step Ace AI query: create-chat → send-prompt → poll get-message-group
async function queryAceAI(eventData) {
  const geotab = getApi();

  // Step 1: Create chat
  const createResult = await geotab.call('GetAceResults', {
    serviceName: 'dna-planet-orchestration',
    functionName: 'create-chat',
    customerData: true,
    functionParameters: {},
  });

  const chatId = createResult?.results?.[0]?.chat_id;
  if (!chatId) {
    console.warn('Ace create-chat returned no chat_id');
    return null;
  }

  // Step 2: Send prompt
  const ruleName = eventData.ruleName || eventData.type || 'safety event';
  const prompt = `What are the safety patterns for vehicle ${eventData.deviceName || 'this vehicle'} over the last 7 days? Focus on ${ruleName} events. Return key insights about frequency and timing.`;

  const sendResult = await geotab.call('GetAceResults', {
    serviceName: 'dna-planet-orchestration',
    functionName: 'send-prompt',
    customerData: true,
    functionParameters: {
      chat_id: chatId,
      prompt,
    },
  });

  const messageGroupId =
    sendResult?.results?.[0]?.message_group_id ||
    sendResult?.results?.[0]?.message_group?.id;

  if (!messageGroupId) {
    console.warn('Ace send-prompt returned no message_group_id');
    return null;
  }

  // Step 3: Poll for results (initial 10s wait, then every 8s, max 6 attempts)
  await sleep(10000);

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
      const messages = messageGroup.messages || {};
      let insight = '';

      for (const key of Object.keys(messages)) {
        const msg = messages[key];
        if (msg.reasoning) {
          insight += msg.reasoning + ' ';
        }
        if (msg.preview_array?.length) {
          insight += `Data: ${JSON.stringify(msg.preview_array.slice(0, 3))} `;
        }
      }

      return insight.trim() || null;
    }

    if (status === 'FAILED') {
      console.warn('Ace query failed');
      return null;
    }

    await sleep(8000);
  }

  console.warn('Ace query timed out after polling');
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
