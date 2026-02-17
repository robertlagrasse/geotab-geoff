# OData Data Connector Cookbook: Fleet Analytics Without the SDK

## What Is the OData Data Connector?

Geotab's OData Data Connector provides a standard OData v4 interface to fleet data. Unlike the MyGeotab API (which uses JSONRPC and the mg-api-js SDK), OData uses standard HTTP GET requests with query parameters. This makes it ideal for analytics dashboards, reporting, and integration with BI tools.

**When to use OData vs. MyGeotab API:**

| | MyGeotab API | OData Data Connector |
|---|---|---|
| **Best for** | Real-time operations, individual records | Analytics, aggregations, trends |
| **Tables** | Raw entities (ExceptionEvent, Device, User) | Pre-aggregated views (VehicleKpi_Daily, DriverSafety_Daily) |
| **Auth** | Username/password or session | Basic auth (database/username) |
| **Pagination** | resultsLimit parameter | Standard OData `@odata.nextLink` |
| **Use case** | "Get this driver's events from today" | "Show fleet safety trends over 14 days" |

## Authentication

OData uses HTTP Basic auth. The username format is `database/userName`:

```javascript
function getAuthHeader() {
  const authString = `${GEOTAB_DATABASE}/${GEOTAB_USERNAME}`;
  const b64 = Buffer.from(authString).toString('base64');
  return `Basic ${b64}`;
}
```

**No password in the auth string.** The OData connector uses the database/username combination for authentication. This is different from the MyGeotab API which requires a password.

## Server Selection

OData endpoints are region-specific:

| Region | Server | URL Base |
|--------|--------|----------|
| US | `odata-connector-2` | `https://odata-connector-2.geotab.com/odata/v4/svc/` |
| EU | `odata-connector-1` | `https://odata-connector-1.geotab.com/odata/v4/svc/` |
| CA | `odata-connector-3` | `https://odata-connector-3.geotab.com/odata/v4/svc/` |
| AU | `odata-connector-4` | `https://odata-connector-4.geotab.com/odata/v4/svc/` |

For the demo database (US), use `odata-connector-2`.

## The Generic Query Function

```javascript
async function odataQuery(table, options = {}) {
  const { select, filter, search, top } = options;
  const baseUrl = `https://${ODATA_SERVER}.geotab.com/odata/v4/svc/${table}`;

  const params = new URLSearchParams();
  if (select) params.set('$select', select);
  if (filter) params.set('$filter', filter);
  if (search) params.set('$search', search);
  if (top) params.set('$top', String(top));

  const url = `${baseUrl}?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Authorization: getAuthHeader(),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`OData ${table} error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  let rows = data.value || [];

  // Handle pagination
  let nextLink = data['@odata.nextLink'];
  while (nextLink && rows.length < 5000) {
    const nextRes = await fetch(nextLink, {
      headers: { Authorization: getAuthHeader(), Accept: 'application/json' },
    });
    const nextData = await nextRes.json();
    rows = rows.concat(nextData.value || []);
    nextLink = nextData['@odata.nextLink'];
  }

  return rows;
}
```

**Key points:**
- `$search` is Geotab-specific — used for time ranges like `last_14_day`
- `$select` limits returned columns (reduces response size significantly)
- `$filter` uses OData filter syntax for conditions
- `$top` limits row count
- Pagination follows `@odata.nextLink` automatically
- Safety cap at 5000 rows prevents runaway queries

## Useful Tables and Queries

### Vehicle KPIs (Daily)

Fleet utilization metrics aggregated per vehicle per day:

```javascript
const vehicleKpis = await odataQuery('VehicleKpi_Daily', {
  search: 'last_14_day',
  select: 'Device_Name,Device_SerialNo,Local_Date,Trip_Distance_Km,' +
          'Total_Driving_Duration_Seconds,Total_Idling_Duration_Seconds,' +
          'Trip_Count,Stop_Count',
  top: 2000,
});
```

**Available columns:** `Device_Name`, `Device_SerialNo`, `Local_Date`, `Trip_Distance_Km`, `Total_Driving_Duration_Seconds`, `Total_Idling_Duration_Seconds`, `Trip_Count`, `Stop_Count`, and more.

### Vehicle Safety (Daily)

Safety event counts and scores per vehicle per day:

```javascript
const vehicleSafety = await odataQuery('VehicleSafety_Daily', {
  search: 'last_14_day',
  select: 'Device_Name,Local_Date,Safety_Score,' +
          'HarshBraking_Count,HarshCornering_Count,' +
          'Speeding_Count,Speeding_Duration_Seconds,SeatbeltOff_Count',
  top: 2000,
});
```

### Driver Safety (Daily)

Same as vehicle safety but keyed by driver:

```javascript
const driverSafety = await odataQuery('DriverSafety_Daily', {
  search: 'last_14_day',
  select: 'Driver_Name,Local_Date,Safety_Score,' +
          'HarshBraking_Count,HarshCornering_Count,Speeding_Count',
  top: 2000,
});
```

## Aggregation Recipes

### Fleet-Wide KPIs

```javascript
function aggregateFleetKpis(vehicleKpis) {
  return {
    totalDistanceKm: Math.round(
      vehicleKpis.reduce((sum, r) => sum + (r.Trip_Distance_Km || 0), 0)
    ),
    totalDriveHours: Math.round(
      vehicleKpis.reduce((sum, r) => sum + (r.Total_Driving_Duration_Seconds || 0), 0) / 3600
    ),
    totalIdleHours: Math.round(
      vehicleKpis.reduce((sum, r) => sum + (r.Total_Idling_Duration_Seconds || 0), 0) / 3600
    ),
    totalTrips: vehicleKpis.reduce((sum, r) => sum + (r.Trip_Count || 0), 0),
  };
}
```

### Average Safety Score (Latest Per Vehicle)

```javascript
function getAvgSafetyScore(vehicleSafety) {
  // Get most recent day per vehicle
  const latestByVehicle = {};
  for (const row of vehicleSafety) {
    const name = row.Device_Name;
    if (!latestByVehicle[name] || row.Local_Date > latestByVehicle[name].Local_Date) {
      latestByVehicle[name] = row;
    }
  }

  const scores = Object.values(latestByVehicle)
    .map(r => r.Safety_Score)
    .filter(s => s != null);

  return scores.length
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
    : null;
}
```

### Daily Trends (For Charts)

```javascript
function getDailyTrends(vehicleKpis) {
  const daily = {};
  for (const row of vehicleKpis) {
    const date = row.Local_Date?.split('T')[0];
    if (!date) continue;
    if (!daily[date]) {
      daily[date] = { date, distance: 0, driveHours: 0, idleHours: 0, trips: 0 };
    }
    daily[date].distance += row.Trip_Distance_Km || 0;
    daily[date].driveHours += (row.Total_Driving_Duration_Seconds || 0) / 3600;
    daily[date].idleHours += (row.Total_Idling_Duration_Seconds || 0) / 3600;
    daily[date].trips += row.Trip_Count || 0;
  }
  return Object.values(daily).sort((a, b) => a.date.localeCompare(b.date));
}
```

### Driver Rankings

```javascript
function getDriverRankings(driverSafety) {
  const scores = {};
  for (const row of driverSafety) {
    const name = row.Driver_Name;
    if (!name) continue;
    if (!scores[name]) {
      scores[name] = { name, totalEvents: 0, latestScore: null, latestDate: null };
    }
    scores[name].totalEvents +=
      (row.HarshBraking_Count || 0) +
      (row.HarshCornering_Count || 0) +
      (row.Speeding_Count || 0);
    if (!scores[name].latestDate || row.Local_Date > scores[name].latestDate) {
      scores[name].latestScore = row.Safety_Score;
      scores[name].latestDate = row.Local_Date;
    }
  }

  return Object.values(scores).sort((a, b) => a.totalEvents - b.totalEvents);
}
```

## Putting It All Together

A single function that returns a complete fleet analytics dashboard payload:

```javascript
export async function fetchFleetAnalytics() {
  // Fetch all three tables in parallel
  const [vehicleKpis, vehicleSafety, driverSafety] = await Promise.all([
    odataQuery('VehicleKpi_Daily', { search: 'last_14_day', top: 2000,
      select: 'Device_Name,Local_Date,Trip_Distance_Km,Total_Driving_Duration_Seconds,Total_Idling_Duration_Seconds,Trip_Count' }),
    odataQuery('VehicleSafety_Daily', { search: 'last_14_day', top: 2000,
      select: 'Device_Name,Local_Date,Safety_Score,HarshBraking_Count,HarshCornering_Count,Speeding_Count,SeatbeltOff_Count' }),
    odataQuery('DriverSafety_Daily', { search: 'last_14_day', top: 2000,
      select: 'Driver_Name,Local_Date,Safety_Score,HarshBraking_Count,HarshCornering_Count,Speeding_Count' }),
  ]);

  return {
    fleet: aggregateFleetKpis(vehicleKpis),
    avgSafetyScore: getAvgSafetyScore(vehicleSafety),
    dailyKpis: getDailyTrends(vehicleKpis),
    driverRankings: getDriverRankings(driverSafety),
  };
}
```

## Tips

1. **Always use `$select`** — OData tables have many columns. Selecting only what you need can reduce response size by 80%.

2. **Use `$search` for time ranges** — Geotab's custom `$search` parameter (`last_7_day`, `last_14_day`, `last_30_day`) is more reliable than constructing `$filter` date comparisons.

3. **Paginate with a safety cap** — Follow `@odata.nextLink` for complete results, but cap at a reasonable number (5000) to prevent runaway queries on large fleets.

4. **Parallel fetch** — Tables are independent. Always fetch VehicleKpi_Daily, VehicleSafety_Daily, and DriverSafety_Daily in parallel with `Promise.all()`.

5. **Aggregate client-side** — OData doesn't support `GROUP BY` or `SUM` in queries. Fetch the raw daily rows and aggregate in your code.

6. **Cache aggressively** — Fleet analytics data changes daily. Cache results for 15-30 minutes to avoid hitting the OData endpoint on every dashboard load.
