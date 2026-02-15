import { useState, useEffect } from 'react';
import { doc, updateDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth.jsx';

export default function ActionQueue({ actions, sessions }) {
  const { user } = useAuth();
  const [expandedId, setExpandedId] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [selectedEventData, setSelectedEventData] = useState(null);

  // When an action is expanded, load its linked session
  useEffect(() => {
    if (!expandedId) {
      setSessionData(null);
      setSelectedEventId(null);
      setSelectedEventData(null);
      return;
    }

    const action = actions.find((a) => a.id === expandedId);
    if (!action?.sessionId) return;

    // Try from already-loaded sessions first
    const cached = sessions?.find((s) => s.id === action.sessionId);
    if (cached) {
      setSessionData(cached);
      if (cached.eventSummaries?.length) setSelectedEventId(cached.eventSummaries[0].eventId);
      return;
    }

    // Otherwise listen to Firestore
    const unsubscribe = onSnapshot(doc(db, 'sessions', action.sessionId), (snapshot) => {
      if (snapshot.exists()) {
        const data = { id: snapshot.id, ...snapshot.data() };
        setSessionData(data);
        if (data.eventSummaries?.length && !selectedEventId) {
          setSelectedEventId(data.eventSummaries[0].eventId);
        }
      }
    });
    return unsubscribe;
  }, [expandedId]);

  // Load full event data when selected
  useEffect(() => {
    if (!selectedEventId) { setSelectedEventData(null); return; }
    const unsubscribe = onSnapshot(doc(db, 'events', selectedEventId), (snapshot) => {
      if (snapshot.exists()) setSelectedEventData({ id: snapshot.id, ...snapshot.data() });
    });
    return unsubscribe;
  }, [selectedEventId]);

  const handleResolve = async (actionId, resolution) => {
    await updateDoc(doc(db, 'actions', actionId), {
      status: resolution,
      supervisorId: user.uid,
      resolvedAt: Timestamp.now(),
    });
    if (expandedId === actionId) setExpandedId(null);
  };

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
    <div className="action-queue">
      <h2>Supervisor Action Queue</h2>
      {actions.length === 0 ? (
        <p className="empty-state">No pending actions.</p>
      ) : (
        actions.map((action) => (
          <div key={action.id} className={`action-card ${expandedId === action.id ? 'expanded' : ''}`}>
            <div
              className="action-header"
              onClick={() => setExpandedId(expandedId === action.id ? null : action.id)}
              style={{ cursor: 'pointer' }}
            >
              <span className="action-type">{action.type?.replace(/_/g, ' ')}</span>
              <span className="driver-name">{action.driverName}</span>
              <span className="timestamp">
                {action.createdAt?.toDate?.()?.toLocaleString('en-US', {
                  weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
                }) || ''}
              </span>
            </div>

            <div className="action-body">
              <p className="action-summary">{action.summary}</p>
              <p className="coach-rationale">{action.coachRationale}</p>
              {action.driverInput && (
                <p className="driver-input">
                  <strong>Driver said:</strong> "{action.driverInput}"
                </p>
              )}
            </div>

            {/* Expanded detail view */}
            {expandedId === action.id && sessionData && (
              <div className="action-detail">
                <div className="action-detail-columns">
                  {/* Left: Transcript */}
                  <div className="action-transcript-panel">
                    <h3>Conversation</h3>
                    <div className="action-transcript-scroll">
                      {sessionData.transcript?.map((entry, i) => (
                        <div key={i} className={`transcript-entry ${entry.speaker}`}>
                          <strong>{entry.speaker === 'geoff' ? 'Geoff' : sessionData.driverName || 'Driver'}:</strong>
                          <p>{entry.text}</p>
                        </div>
                      ))}
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

                    {sessionData.eventSummaries?.length > 0 && (
                      <div className="event-list-panel">
                        <h3>Events ({sessionData.eventSummaries.length})</h3>
                        <div className="event-list-scroll">
                          {sessionData.eventSummaries.map((evt) => (
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

                    {/* Event details */}
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

                <div className="action-buttons">
                  <button
                    className="approve-btn"
                    onClick={() => handleResolve(action.id, 'reviewed')}
                  >
                    Mark Reviewed
                  </button>
                  <button
                    className="deny-btn"
                    onClick={() => handleResolve(action.id, 'dismissed')}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Collapsed: just show a hint to click */}
            {expandedId !== action.id && (
              <div
                className="action-expand-hint"
                onClick={() => setExpandedId(action.id)}
              >
                View session details
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
