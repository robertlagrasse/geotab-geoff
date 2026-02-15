import { useMemo, useState, useEffect } from 'react';

const FLEET_ANALYTICS_URL = import.meta.env.VITE_FLEET_ANALYTICS_URL || '';

export default function Analytics({ sessions }) {
  const [fleetData, setFleetData] = useState(null);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [fleetError, setFleetError] = useState(null);

  // Fetch Data Connector OData analytics
  useEffect(() => {
    if (!FLEET_ANALYTICS_URL) return;
    setFleetLoading(true);
    fetch(FLEET_ANALYTICS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setFleetData(data.summary);
        setFleetLoading(false);
      })
      .catch((err) => {
        console.error('Fleet analytics fetch error:', err);
        setFleetError(err.message);
        setFleetLoading(false);
      });
  }, []);

  // Session-based coaching analytics
  const stats = useMemo(() => {
    const outcomes = {};
    const eventTypes = {};
    const recommendationTypes = {};

    sessions.forEach((s) => {
      const outcome = s.outcome?.type || s.status;
      outcomes[outcome] = (outcomes[outcome] || 0) + 1;

      const eventType = s.ruleName || s.eventType;
      if (eventType) {
        eventTypes[eventType] = (eventTypes[eventType] || 0) + 1;
      }

      const recType = s.coachAnalysis?.recommendation?.type;
      if (recType && recType !== 'none') {
        recommendationTypes[recType] = (recommendationTypes[recType] || 0) + 1;
      }
    });

    const total = sessions.length;
    const acknowledged = (outcomes.acknowledged || 0) + (outcomes.positive || 0);
    const engagementRate = total > 0 ? ((acknowledged / total) * 100).toFixed(0) : 0;
    const escalationRate =
      total > 0 ? (((outcomes.escalated || 0) / total) * 100).toFixed(0) : 0;

    return { outcomes, eventTypes, recommendationTypes, total, engagementRate, escalationRate };
  }, [sessions]);

  return (
    <div className="analytics">
      <h2>Coaching Analytics</h2>

      {/* Coaching Stats */}
      <div className="stats-cards">
        <div className="stat-card">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">Total Sessions</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.engagementRate}%</span>
          <span className="stat-label">Engagement Rate</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.escalationRate}%</span>
          <span className="stat-label">Escalation Rate</span>
        </div>
      </div>

      {/* Fleet KPIs from Data Connector */}
      {fleetData && (
        <>
          <h3 className="section-heading">Fleet Overview (14 days)</h3>
          <div className="stats-cards">
            <div className="stat-card">
              <span className="stat-value">{fleetData.fleet?.totalDistanceMiles?.toLocaleString()}</span>
              <span className="stat-label">Miles Driven</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{fleetData.fleet?.totalDriveHours?.toLocaleString()}</span>
              <span className="stat-label">Drive Hours</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{fleetData.fleet?.idlePercentage}%</span>
              <span className="stat-label">Idle Time</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{fleetData.fleet?.totalTrips?.toLocaleString()}</span>
              <span className="stat-label">Total Trips</span>
            </div>
            {fleetData.fleet?.avgSafetyScore != null && (
              <div className="stat-card">
                <span className="stat-value">{fleetData.fleet.avgSafetyScore}</span>
                <span className="stat-label">Avg Safety Score</span>
              </div>
            )}
          </div>

          {/* Safety Events from Data Connector */}
          {fleetData.safetyEvents?.total > 0 && (
            <div className="analytics-section">
              <h3>Fleet Safety Events (14 days)</h3>
              <div className="bar-chart">
                {[
                  { label: 'Harsh Braking', count: fleetData.safetyEvents.harshBrakes, cls: '' },
                  { label: 'Harsh Cornering', count: fleetData.safetyEvents.harshCorners, cls: '' },
                  { label: 'Speeding', count: fleetData.safetyEvents.speeding, cls: 'secondary' },
                  { label: 'Seatbelt Off', count: fleetData.safetyEvents.seatbeltOff, cls: 'accent' },
                ]
                  .filter((r) => r.count > 0)
                  .sort((a, b) => b.count - a.count)
                  .map((row) => (
                    <div key={row.label} className="bar-row">
                      <span className="bar-label">{row.label}</span>
                      <div className="bar-track">
                        <div
                          className={`bar-fill ${row.cls}`}
                          style={{ width: `${(row.count / fleetData.safetyEvents.total) * 100}%` }}
                        />
                      </div>
                      <span className="bar-count">{row.count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Daily Safety Trend */}
          {fleetData.dailySafety?.length > 0 && (
            <div className="analytics-section">
              <h3>Daily Safety Trend</h3>
              <div className="daily-trend">
                {fleetData.dailySafety.map((day) => {
                  const total = day.harshBrakes + day.harshCorners + day.speeding + day.seatbeltOff;
                  const maxEvents = Math.max(...fleetData.dailySafety.map(
                    (d) => d.harshBrakes + d.harshCorners + d.speeding + d.seatbeltOff
                  ));
                  return (
                    <div key={day.date} className="trend-bar" title={`${day.date}: ${total} events`}>
                      <div
                        className="trend-fill"
                        style={{ height: `${maxEvents > 0 ? (total / maxEvents) * 100 : 0}%` }}
                      />
                      <span className="trend-label">
                        {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'narrow' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Driver Rankings */}
          {fleetData.driverRankings?.length > 0 && (
            <div className="analytics-section">
              <h3>Driver Rankings (fewest events = safest)</h3>
              <div className="driver-rankings">
                {fleetData.driverRankings.slice(0, 10).map((driver, i) => (
                  <div key={driver.name} className="ranking-row">
                    <span className="ranking-position">#{i + 1}</span>
                    <span className="ranking-name">{driver.name}</span>
                    <span className="ranking-events">{driver.totalEvents} events</span>
                    {driver.latestScore != null && (
                      <span className="ranking-score">Score: {Math.round(driver.latestScore)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {fleetLoading && (
        <p className="empty-state">Loading fleet analytics from Geotab Data Connector...</p>
      )}

      {fleetError && (
        <p className="empty-state">Fleet analytics unavailable: {fleetError}</p>
      )}

      {/* Session-based charts */}
      <div className="analytics-section">
        <h3>Coaching Outcomes</h3>
        <div className="bar-chart">
          {Object.entries(stats.outcomes)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <div key={type} className="bar-row">
                <span className="bar-label">{type.replace(/_/g, ' ')}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${(count / stats.total) * 100}%` }}
                  />
                </div>
                <span className="bar-count">{count}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="analytics-section">
        <h3>Event Types</h3>
        <div className="bar-chart">
          {Object.entries(stats.eventTypes)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <div key={type} className="bar-row">
                <span className="bar-label">{type.replace(/_/g, ' ')}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill secondary"
                    style={{ width: `${(count / stats.total) * 100}%` }}
                  />
                </div>
                <span className="bar-count">{count}</span>
              </div>
            ))}
        </div>
      </div>

      {Object.keys(stats.recommendationTypes).length > 0 && (
        <div className="analytics-section">
          <h3>Top Recommendations</h3>
          <div className="bar-chart">
            {Object.entries(stats.recommendationTypes)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => (
                <div key={type} className="bar-row">
                  <span className="bar-label">{type.replace(/_/g, ' ')}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill accent"
                      style={{ width: `${(count / stats.total) * 100}%` }}
                    />
                  </div>
                  <span className="bar-count">{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
