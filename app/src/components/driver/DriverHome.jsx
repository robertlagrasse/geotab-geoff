import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';

const beginCoachingFn = httpsCallable(functions, 'beginCoaching');
const LIPSYNC_URL = import.meta.env.VITE_LIPSYNC_URL || '';

// Warm up the GPU lipsync service on login so it's ready by coaching time
if (LIPSYNC_URL) {
  fetch(`${LIPSYNC_URL}/health`, { signal: AbortSignal.timeout(5000) }).catch(() => {});
}

// Replace "Demo" in coaching text with user's name
function personalizeText(text, name) {
  if (!text || !name) return text;
  return text
    .replace(/\bDemo\s*-\s*\d+\b/gi, name)
    .replace(/\bDemo\d+\b/gi, name)
    .replace(/\bDemo\b/gi, name)
    .replace(/\bDriver\b/g, name);
}


export default function DriverHome() {
  const { user, userProfile } = useAuth();
  const [pendingEvents, setPendingEvents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const navigate = useNavigate();

  const userName = user?.displayName?.split(' ')[0] || 'Driver';

  // Load drivers from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'drivers'), (snapshot) => {
      const realDrivers = snapshot.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name || doc.data().deviceName || doc.id,
      }));

      if (realDrivers.length > 0) {
        setDrivers(realDrivers);
        if (!selectedDriver) setSelectedDriver(realDrivers[0].id);
      }
    });
    return unsubscribe;
  }, []);

  // Listen to pending events for the shift summary card
  useEffect(() => {
    if (!selectedDriver) return;

    const q = query(
      collection(db, 'events'),
      where('driverId', '==', selectedDriver),
      where('coachingStatus', '==', 'pending'),
      orderBy('timestamp', 'asc')
    );

    console.log('[DriverHome] Querying pending events for driver:', selectedDriver);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('[DriverHome] Got', snapshot.size, 'pending events');
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setPendingEvents(data);
    }, (error) => {
      console.error('[DriverHome] Events query error:', error);
    });

    return unsubscribe;
  }, [selectedDriver]);

  // Load sessions for selected driver
  useEffect(() => {
    if (!selectedDriver) return;

    const q = query(
      collection(db, 'sessions'),
      where('driverId', '==', selectedDriver),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setSessions(data);
    });

    return unsubscribe;
  }, [selectedDriver]);

  const activeSessions = sessions.filter((s) => s.status === 'ready' || s.status === 'in_progress');
  const completedSessions = sessions.filter(
    (s) => s.status !== 'ready' && s.status !== 'in_progress'
  );

  const p = (text) => personalizeText(text, userName);

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Count pending events by type for pills
  const eventTypeCounts = {};
  pendingEvents.forEach((evt) => {
    const t = evt.type || 'unknown';
    eventTypeCounts[t] = (eventTypeCounts[t] || 0) + 1;
  });

  const handleBeginCoaching = async () => {
    if (isStarting) return;
    setIsStarting(true);

    try {
      const selectedDriverData = drivers.find((d) => d.id === selectedDriver);
      const result = await beginCoachingFn({
        driverId: selectedDriver,
        driverName: selectedDriverData?.name || 'Driver',
        deviceName: pendingEvents[0]?.deviceName || '',
        fleetId: pendingEvents[0]?.fleetId || 'default',
      });
      navigate(`/driver/session/${result.data.sessionId}`);
    } catch (err) {
      console.error('Failed to begin coaching:', err);
      setIsStarting(false);
    }
  };

  return (
    <div className="driver-home">
      <header className="driver-header">
        <h1>Geoff</h1>
        <div className="driver-info">
          <select
            className="driver-select"
            value={selectedDriver}
            onChange={(e) => setSelectedDriver(e.target.value)}
          >
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button onClick={() => signOut(auth)} className="logout-btn">
            Sign Out
          </button>
        </div>
      </header>

      {drivers.length === 0 && (
        <p className="empty-state">No drivers loaded. Connect Geotab demo database and run pollGeotabEvents to populate.</p>
      )}

      {/* Loading interstitial */}
      {isStarting && (
        <div className="coaching-loading-interstitial">
          <div className="coaching-loading-spinner" />
          <p>Geoff is preparing your session...</p>
        </div>
      )}

      {/* Shift Summary Card */}
      {!isStarting && selectedDriver && (
        <section className="shift-summary-card">
          {pendingEvents.length > 0 ? (
            <>
              <div className="shift-summary-header">
                <span className="shift-event-count">{pendingEvents.length}</span>
                <span className="shift-event-label">
                  event{pendingEvents.length !== 1 ? 's' : ''} to review
                </span>
              </div>
              <div className="shift-type-pills">
                {Object.entries(eventTypeCounts).map(([type, count]) => (
                  <span key={type} className={`type-pill ${type}`}>
                    {count} {type}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="shift-summary-header clean-shift">
              <span className="shift-event-label">No events — clean shift!</span>
            </div>
          )}
          <button
            className="begin-coaching-btn"
            onClick={handleBeginCoaching}
          >
            {pendingEvents.length > 0 ? 'Begin Coaching' : 'Check In With Geoff'}
          </button>
        </section>
      )}

      {/* Active Session */}
      {!isStarting && activeSessions.length > 0 && (
        <section className="pending-sessions">
          <h2>Active Session</h2>
          {activeSessions.map((session) => (
            <div key={session.id} className="session-card incoming">
              <div className="session-info">
                <strong>{session.summary || `${session.eventCount || 1} events`}</strong>
                <span>{p(session.summary)}</span>
                <span className="session-time">{formatTime(session.createdAt)}</span>
              </div>
              <div className="session-actions">
                <button
                  className="accept-btn"
                  onClick={() => navigate(`/driver/session/${session.id}`)}
                >
                  Continue
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Past Sessions */}
      {!isStarting && (
        <section className="completed-sessions">
          <h2>Past Sessions</h2>
          {completedSessions.length === 0 ? (
            <p className="empty-state">No coaching sessions for {userName} yet.</p>
          ) : (
            completedSessions.map((session) => (
              <div
                key={session.id}
                className="session-card completed"
                onClick={() => navigate(`/driver/session/${session.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <div className="session-info">
                  <strong>{session.eventCount ? `${session.eventCount} events` : session.ruleName || session.eventType}</strong>
                  <span>{p(session.summary)}</span>
                  <span className="session-time">{formatTime(session.createdAt)}</span>
                </div>
                <div className="session-outcome-badge">
                  <span className={`outcome-badge ${session.outcome?.type || session.status}`}>
                    {session.outcome?.type || session.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}
