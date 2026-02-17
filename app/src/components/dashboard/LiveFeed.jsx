import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const statusColors = {
  completed: '#2B6436',
  in_progress: '#0078D3',
  escalated: '#CC8400',
  disputed: '#C51A11',
  ready: '#8DA4B9',
};

export default function LiveFeed({ sessions }) {
  const [expandedId, setExpandedId] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [selectedEventData, setSelectedEventData] = useState(null);

  const expandedSession = sessions.find((s) => s.id === expandedId);

  // Auto-select first event when expanding
  useEffect(() => {
    if (expandedSession?.eventSummaries?.length) {
      setSelectedEventId(expandedSession.eventSummaries[0].eventId);
    } else {
      setSelectedEventId(null);
      setSelectedEventData(null);
    }
  }, [expandedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load full event data when selected
  useEffect(() => {
    if (!selectedEventId) { setSelectedEventData(null); return; }
    const unsubscribe = onSnapshot(doc(db, 'events', selectedEventId), (snapshot) => {
      if (snapshot.exists()) setSelectedEventData({ id: snapshot.id, ...snapshot.data() });
    });
    return unsubscribe;
  }, [selectedEventId]);

  const severityColor = (severity) => {
    switch (severity) {
      case 'high': return 'var(--geoff-red)';
      case 'medium': return 'var(--geoff-yellow)';
      default: return 'var(--geoff-green)';
    }
  };

  const location = selectedEventData?.location;
  const hasLocation = location && (location.latitude || location.lat);
  const lat = location?.latitude || location?.lat;
  const lng = location?.longitude || location?.lng || location?.lon;

  return (
    <div className="live-feed">
      <h2>Live Coaching Feed</h2>
      {sessions.length === 0 ? (
        <p className="empty-state">No coaching sessions yet.</p>
      ) : (
        <div className="feed-list">
          {sessions.map((session) => (
            <div key={session.id} className={`feed-item ${expandedId === session.id ? 'expanded' : ''}`}>
              <div
                className="status-dot"
                style={{ backgroundColor: statusColors[session.status] || 'gray' }}
              />
              <div className="feed-details" style={{ flex: 1 }}>
                <div
                  className="feed-header"
                  onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <strong>{session.driverName || 'Driver'}</strong>
                  <span className="event-type">
                    {session.eventCount ? `${session.eventCount} events` : session.eventType}
                  </span>
                  <span className="timestamp">
                    {session.createdAt?.toDate?.()?.toLocaleString('en-US', {
                      weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
                    }) || ''}
                  </span>
                </div>
                <div className="outcome">
                  Status: {session.status}
                  {session.outcome?.type && ` — ${session.outcome.type}`}
                </div>
                {session.summary && (
                  <div className="feed-summary">{session.summary}</div>
                )}

                {/* Expanded detail view */}
                {expandedId === session.id && (
                  <div className="action-detail">
                    <div className="action-detail-columns">
                      {/* Left: Transcript */}
                      <div className="action-transcript-panel">
                        <h3>Conversation</h3>
                        <div className="action-transcript-scroll">
                          {session.transcript?.map((entry, i) => (
                            <div key={i} className={`transcript-entry ${entry.speaker}`}>
                              <strong>{entry.speaker === 'geoff' ? 'Geoff' : session.driverName || 'Driver'}:</strong>
                              <p>{entry.text}</p>
                            </div>
                          ))}
                          {(!session.transcript || session.transcript.length === 0) && (
                            <p className="empty-state">No conversation yet.</p>
                          )}
                        </div>
                      </div>

                      {/* Right: Map + Event List */}
                      <div className="action-sidebar-panel">
                        {hasLocation ? (
                          <div className="event-map">
                            <iframe
                              title="Event location"
                              src={`https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`}
                              className="map-iframe"
                              allowFullScreen
                              loading="lazy"
                              referrerPolicy="no-referrer-when-downgrade"
                            />
                          </div>
                        ) : (
                          <div className="event-map no-location">
                            <p>{selectedEventId ? 'No location data' : 'Select an event'}</p>
                          </div>
                        )}

                        {session.eventSummaries?.length > 0 && (
                          <div className="event-list-panel">
                            <h3>Events ({session.eventSummaries.length})</h3>
                            <div className="event-list-scroll">
                              {session.eventSummaries.map((evt) => (
                                <div
                                  key={evt.eventId}
                                  className={`event-list-item ${selectedEventId === evt.eventId ? 'selected' : ''}`}
                                  style={{ borderLeftColor: severityColor(evt.severity) }}
                                  onClick={() => setSelectedEventId(
                                    selectedEventId === evt.eventId ? null : evt.eventId
                                  )}
                                >
                                  <div className="event-list-item-header">
                                    <span className="event-list-rule">{evt.ruleName || evt.type}</span>
                                    <span className="event-list-time">{evt.timestamp}</span>
                                  </div>
                                  <p className="event-list-oneliner">{evt.oneLiner}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedEventData && (
                          <div className="event-details">
                            <h3>Event Details</h3>
                            <div className="detail-row">
                              <span className="detail-label">Rule</span>
                              <span className="detail-value">{selectedEventData.ruleName || selectedEventData.type}</span>
                            </div>
                            {selectedEventData.rawData?.speed > 0 && (
                              <div className="detail-row">
                                <span className="detail-label">Speed</span>
                                <span className="detail-value">{Math.round(selectedEventData.rawData.speed * 0.621371)} mph</span>
                              </div>
                            )}
                            {selectedEventData.rawData?.speedLimit > 0 && (
                              <div className="detail-row">
                                <span className="detail-label">Speed Limit</span>
                                <span className="detail-value">{Math.round(selectedEventData.rawData.speedLimit * 0.621371)} mph</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
