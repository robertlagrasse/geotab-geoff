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

  useEffect(() => {
    if (!expandedId) {
      setSessionData(null);
      setSelectedEventId(null);
      setSelectedEventData(null);
      return;
    }

    const action = actions.find((a) => a.id === expandedId);
    if (!action?.sessionId) return;

    const cached = sessions?.find((s) => s.id === action.sessionId);
    if (cached) {
      setSessionData(cached);
      if (cached.eventSummaries?.length) setSelectedEventId(cached.eventSummaries[0].eventId);
      return;
    }

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

  const typeLabel = (type) => {
    switch (type) {
      case 'safety_concern': return 'Safety Concern';
      case 'training_referral': return 'Training Referral';
      case 'immediate_action': return 'Immediate Action';
      case 'performance_review': return 'Performance Review';
      default: return 'Action Required';
    }
  };

  const severityClass = (type) => {
    switch (type) {
      case 'immediate_action': return 'critical';
      case 'safety_concern': return 'warning';
      default: return 'info';
    }
  };

  const severityDotColor = (sev) => {
    switch (sev) {
      case 'critical': return '#C51A11';
      case 'warning': return '#CC8400';
      default: return '#0078D3';
    }
  };

  return (
    <div className="action-queue">
      <h2>Supervisor Action Queue</h2>
      {actions.length === 0 ? (
        <p className="empty-state">No pending actions.</p>
      ) : (
        <div className="feed-list">
          {actions.map((action) => {
            const isExpanded = expandedId === action.id;
            const severity = severityClass(action.type);
            return (
              <div key={action.id} className={`feed-item ${isExpanded ? 'expanded' : ''}`}>
                <div
                  className="status-dot"
                  style={{ backgroundColor: severityDotColor(severity) }}
                />
                <div className="feed-details">
                  <div
                    className="feed-header"
                    onClick={() => setExpandedId(isExpanded ? null : action.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <strong>{action.driverName}</strong>
                    <span className={`aq-badge aq-badge--${severity}`}>
                      {typeLabel(action.type)}
                    </span>
                    <span className="timestamp">
                      {action.createdAt?.toDate?.()?.toLocaleString('en-US', {
                        weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
                      }) || ''}
                    </span>
                  </div>
                  {!isExpanded && action.summary && (
                    <div className="feed-summary">{action.summary}</div>
                  )}

                  {isExpanded && (
                    <div className="aq-expanded">
                      {action.driverInput && (
                        <div className="aq-quote">
                          <span className="aq-label">Driver said</span>
                          <p>"{action.driverInput}"</p>
                        </div>
                      )}

                      {action.coachRationale && (
                        <div className="aq-rationale">
                          <span className="aq-label">Coach rationale</span>
                          <p>{action.coachRationale}</p>
                        </div>
                      )}

                      <div className="aq-actions">
                        <button className="aq-btn aq-btn--primary" onClick={() => handleResolve(action.id, 'reviewed')}>
                          Mark Reviewed
                        </button>
                        <button className="aq-btn aq-btn--secondary" onClick={() => handleResolve(action.id, 'dismissed')}>
                          Dismiss
                        </button>
                      </div>

                      {sessionData && (
                        <div className="aq-detail">
                          <div className="action-detail-columns">
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
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
