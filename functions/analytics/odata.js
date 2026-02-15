// Data Connector OData integration for fleet analytics
// See: guides/DATA_CONNECTOR.md

const GEOTAB_DATABASE = process.env.GEOTAB_DATABASE;
const GEOTAB_USERNAME = process.env.GEOTAB_USERNAME;
const GEOTAB_PASSWORD = process.env.GEOTAB_PASSWORD;
// US server = 2, EU = 1, CA = 3, AU = 4
const ODATA_SERVER = process.env.ODATA_SERVER || 'odata-connector-2';

function getAuthHeader() {
  const authString = `${GEOTAB_DATABASE}/${GEOTAB_USERNAME}`;
  const b64 = Buffer.from(authString).toString('base64');
  return `Basic ${b64}`;
}

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
    const text = await response.text();
    throw new Error(`OData ${table} error ${response.status}: ${text}`);
  }

  const data = await response.json();
  let rows = data.value || [];

  // Handle pagination
  let nextLink = data['@odata.nextLink'];
  while (nextLink && rows.length < 5000) {
    const nextRes = await fetch(nextLink, {
      headers: {
        Authorization: getAuthHeader(),
        Accept: 'application/json',
      },
    });
    const nextData = await nextRes.json();
    rows = rows.concat(nextData.value || []);
    nextLink = nextData['@odata.nextLink'];
  }

  return rows;
}

export async function fetchFleetAnalytics() {
  const results = {};

  // Fetch last 14 days of vehicle KPIs
  try {
    results.vehicleKpis = await odataQuery('VehicleKpi_Daily', {
      search: 'last_14_day',
      select: 'Device_Name,Device_SerialNo,Local_Date,Trip_Distance_Km,Total_Driving_Duration_Seconds,Total_Idling_Duration_Seconds,Trip_Count,Stop_Count',
      top: 2000,
    });
  } catch (err) {
    console.error('OData VehicleKpi_Daily error:', err.message);
    results.vehicleKpis = [];
  }

  // Fetch last 14 days of vehicle safety
  try {
    results.vehicleSafety = await odataQuery('VehicleSafety_Daily', {
      search: 'last_14_day',
      select: 'Device_Name,Local_Date,Safety_Score,HarshBraking_Count,HarshCornering_Count,Speeding_Count,Speeding_Duration_Seconds,SeatbeltOff_Count',
      top: 2000,
    });
  } catch (err) {
    console.error('OData VehicleSafety_Daily error:', err.message);
    results.vehicleSafety = [];
  }

  // Fetch driver safety scores
  try {
    results.driverSafety = await odataQuery('DriverSafety_Daily', {
      search: 'last_14_day',
      select: 'Driver_Name,Local_Date,Safety_Score,HarshBraking_Count,HarshCornering_Count,Speeding_Count',
      top: 2000,
    });
  } catch (err) {
    console.error('OData DriverSafety_Daily error:', err.message);
    results.driverSafety = [];
  }

  // Aggregate into summaries
  const summary = aggregateAnalytics(results);
  return { raw: results, summary };
}

function aggregateAnalytics({ vehicleKpis, vehicleSafety, driverSafety }) {
  // Fleet-wide KPIs
  const totalDistance = vehicleKpis.reduce((sum, r) => sum + (r.Trip_Distance_Km || 0), 0);
  const totalDriveSeconds = vehicleKpis.reduce((sum, r) => sum + (r.Total_Driving_Duration_Seconds || 0), 0);
  const totalIdleSeconds = vehicleKpis.reduce((sum, r) => sum + (r.Total_Idling_Duration_Seconds || 0), 0);
  const totalTrips = vehicleKpis.reduce((sum, r) => sum + (r.Trip_Count || 0), 0);

  // Safety aggregates
  const totalHarshBrakes = vehicleSafety.reduce((sum, r) => sum + (r.HarshBraking_Count || 0), 0);
  const totalHarshCorners = vehicleSafety.reduce((sum, r) => sum + (r.HarshCornering_Count || 0), 0);
  const totalSpeeding = vehicleSafety.reduce((sum, r) => sum + (r.Speeding_Count || 0), 0);
  const totalSeatbeltOff = vehicleSafety.reduce((sum, r) => sum + (r.SeatbeltOff_Count || 0), 0);

  // Average safety score (from most recent day per vehicle)
  const latestByVehicle = {};
  for (const row of vehicleSafety) {
    const name = row.Device_Name;
    if (!latestByVehicle[name] || row.Local_Date > latestByVehicle[name].Local_Date) {
      latestByVehicle[name] = row;
    }
  }
  const safetyScores = Object.values(latestByVehicle)
    .map((r) => r.Safety_Score)
    .filter((s) => s != null);
  const avgSafetyScore = safetyScores.length
    ? safetyScores.reduce((a, b) => a + b, 0) / safetyScores.length
    : null;

  // Daily trends for charting
  const dailyKpis = {};
  for (const row of vehicleKpis) {
    const date = row.Local_Date?.split('T')[0];
    if (!date) continue;
    if (!dailyKpis[date]) {
      dailyKpis[date] = { date, distance: 0, driveHours: 0, idleHours: 0, trips: 0 };
    }
    dailyKpis[date].distance += (row.Trip_Distance_Km || 0);
    dailyKpis[date].driveHours += (row.Total_Driving_Duration_Seconds || 0) / 3600;
    dailyKpis[date].idleHours += (row.Total_Idling_Duration_Seconds || 0) / 3600;
    dailyKpis[date].trips += (row.Trip_Count || 0);
  }

  const dailySafety = {};
  for (const row of vehicleSafety) {
    const date = row.Local_Date?.split('T')[0];
    if (!date) continue;
    if (!dailySafety[date]) {
      dailySafety[date] = { date, harshBrakes: 0, harshCorners: 0, speeding: 0, seatbeltOff: 0 };
    }
    dailySafety[date].harshBrakes += (row.HarshBraking_Count || 0);
    dailySafety[date].harshCorners += (row.HarshCornering_Count || 0);
    dailySafety[date].speeding += (row.Speeding_Count || 0);
    dailySafety[date].seatbeltOff += (row.SeatbeltOff_Count || 0);
  }

  // Top/bottom drivers by safety
  const driverScores = {};
  for (const row of driverSafety) {
    const name = row.Driver_Name;
    if (!name) continue;
    if (!driverScores[name]) {
      driverScores[name] = { name, totalEvents: 0, latestScore: null, latestDate: null };
    }
    driverScores[name].totalEvents +=
      (row.HarshBraking_Count || 0) + (row.HarshCornering_Count || 0) + (row.Speeding_Count || 0);
    if (!driverScores[name].latestDate || row.Local_Date > driverScores[name].latestDate) {
      driverScores[name].latestScore = row.Safety_Score;
      driverScores[name].latestDate = row.Local_Date;
    }
  }

  return {
    fleet: {
      totalDistanceKm: Math.round(totalDistance),
      totalDistanceMiles: Math.round(totalDistance * 0.621371),
      totalDriveHours: Math.round(totalDriveSeconds / 3600),
      totalIdleHours: Math.round(totalIdleSeconds / 3600),
      idlePercentage: totalDriveSeconds > 0
        ? Math.round((totalIdleSeconds / (totalDriveSeconds + totalIdleSeconds)) * 100)
        : 0,
      totalTrips,
      avgSafetyScore: avgSafetyScore != null ? Math.round(avgSafetyScore * 10) / 10 : null,
    },
    safetyEvents: {
      harshBrakes: totalHarshBrakes,
      harshCorners: totalHarshCorners,
      speeding: totalSpeeding,
      seatbeltOff: totalSeatbeltOff,
      total: totalHarshBrakes + totalHarshCorners + totalSpeeding + totalSeatbeltOff,
    },
    dailyKpis: Object.values(dailyKpis).sort((a, b) => a.date.localeCompare(b.date)),
    dailySafety: Object.values(dailySafety).sort((a, b) => a.date.localeCompare(b.date)),
    driverRankings: Object.values(driverScores).sort((a, b) => a.totalEvents - b.totalEvents),
  };
}
