import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { useAuth } from '../../hooks/useAuth.jsx';
import GeoffAvatar from './GeoffAvatar';

const driverRespondFn = httpsCallable(functions, 'driverRespond');

// Replace all "Demo" device name patterns with the given name
function personalizeText(text, name) {
  if (!text || !name) return text;
  return text
    .replace(/\bDemo\s*-\s*\d+\b/gi, name)
    .replace(/\bDemo\d+\b/gi, name)
    .replace(/\bDemo\b/gi, name)
    .replace(/\bDriver\b/g, name);
}


export default function CoachingSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [session, setSession] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [selectedEventData, setSelectedEventData] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [avatarReady, setAvatarReady] = useState(false);
  const [initialSpoken, setInitialSpoken] = useState(false);
  const [showEndOptions, setShowEndOptions] = useState(false);
  const avatarRef = useRef(null);
  const recognitionRef = useRef(null);
  const transcriptEndRef = useRef(null);

  // The logged-in user's first name from Google
  const userName = user?.displayName?.split(' ')[0] || 'Driver';

  // Rotating transportation verbs for the loading state
  const drivingPhrases = [
    'Checking mirrors...',
    'Merging into traffic...',
    'Shifting gears...',
    'Navigating route...',
    'Fueling up...',
    'Scanning the road ahead...',
    'Adjusting mirrors...',
    'Plotting course...',
    'Cruising along...',
    'Signaling turn...',
  ];
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    if (!isProcessing) return;
    setPhraseIndex(Math.floor(Math.random() * drivingPhrases.length));
    const interval = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % drivingPhrases.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [isProcessing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen to session
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'sessions', sessionId), (snapshot) => {
      if (snapshot.exists()) {
        setSession({ id: snapshot.id, ...snapshot.data() });
      }
    });
    return unsubscribe;
  }, [sessionId]);

  // Fetch full event data when an event is selected from the sidebar
  useEffect(() => {
    if (!selectedEventId) {
      setSelectedEventData(null);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, 'events', selectedEventId), (snapshot) => {
      if (snapshot.exists()) {
        setSelectedEventData({ id: snapshot.id, ...snapshot.data() });
      }
    });
    return unsubscribe;
  }, [selectedEventId]);

  // Auto-select the first event when session loads
  useEffect(() => {
    if (session?.eventSummaries?.length && !selectedEventId) {
      setSelectedEventId(session.eventSummaries[0].eventId);
    }
  }, [session?.eventSummaries]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.transcript?.length]);

  // Speak Geoff's initial message when avatar is ready AND auth is loaded
  useEffect(() => {
    if (authLoading) return;
    if (avatarReady && session?.transcript?.length && !initialSpoken) {
      const firstGeoff = session.transcript.find((t) => t.speaker === 'geoff');
      if (firstGeoff) {
        const personalized = personalizeText(firstGeoff.text, userName);
        avatarRef.current?.speak(personalized, firstGeoff.audioUrl || null, firstGeoff.videoUrl || null);
        setInitialSpoken(true);
      }
    }
  }, [avatarReady, session, initialSpoken, authLoading, userName]);

  const p = (text) => personalizeText(text, userName);

  const sendResponse = async (text) => {
    if (!text.trim() || isProcessing) return;
    setIsProcessing(true);
    setTextInput('');

    try {
      const result = await driverRespondFn({
        sessionId,
        driverText: text.trim(),
        driverName: userName,
      });
      if (result.data.message) {
        avatarRef.current?.speak(result.data.message, result.data.audioUrl, result.data.videoUrl || null);
      }
    } catch (err) {
      console.error('Failed to send response:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser. Please use Chrome.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (ev) => {
      const transcript = ev.results[0][0].transcript;
      sendResponse(transcript);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const handleEndSession = async (outcomeType) => {
    avatarRef.current?.stop();
    await updateDoc(doc(db, 'sessions', sessionId), {
      status: outcomeType === 'disputed' ? 'disputed' : 'completed',
      completedAt: Timestamp.now(),
      'outcome.type': outcomeType,
    });
    navigate('/driver');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendResponse(textInput);
    }
  };

  if (!session || authLoading) return <div className="loading">Loading session...</div>;

  const isSessionActive = session.status === 'ready' || session.status === 'in_progress' || session.status === 'escalated';
  const eventSummaries = session.eventSummaries || [];
  const turnCount = session.transcript?.filter((t) => t.speaker === 'driver').length || 0;

  // Determine map location — from selected event or first event with location
  const eventForMap = selectedEventData;
  const location = eventForMap?.location;
  const hasLocation = location && (location.latitude || location.lat);
  const lat = location?.latitude || location?.lat;
  const lng = location?.longitude || location?.lng || location?.lon;

  const severityColor = (severity) => {
    switch (severity) {
      case 'high': return 'var(--geoff-red)';
      case 'medium': return 'var(--geoff-yellow)';
      default: return 'var(--geoff-green)';
    }
  };

  return (
    <div className="coaching-session-layout">
      <div className="session-top-bar">
        <button className="back-btn" onClick={() => navigate('/driver')}>Back</button>
        <span className="session-event-type">
          {session.summary || `${session.eventCount || 1} events`}
        </span>
        <span className="session-device">{session.deviceName}</span>
        <span className={`session-status ${session.status}`}>{session.status}</span>
      </div>

      <div className="session-columns">
        {/* Left: Avatar + Conversation */}
        <div className="session-conversation">
          <div className="avatar-container">
            <GeoffAvatar ref={avatarRef} onReady={() => setAvatarReady(true)} />
          </div>

          <div className="transcript">
            {session.transcript?.map((entry, i) => (
              <div key={i} className={`transcript-entry ${entry.speaker}`}>
                <strong>{entry.speaker === 'geoff' ? 'Geoff' : 'You'}:</strong>
                <p>{entry.speaker === 'geoff' ? p(entry.text) : entry.text}</p>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>

          {isSessionActive && (
            <div className="session-controls">
              {isProcessing && (
                <div className="geoff-processing-indicator">
                  <span className="processing-icon" />
                  <span className="processing-phrase">{drivingPhrases[phraseIndex]}</span>
                </div>
              )}
              <div className="input-row">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isProcessing
                      ? 'Geoff is thinking...'
                      : turnCount === 0
                        ? 'Tell Geoff what happened...'
                        : 'Continue the conversation...'
                  }
                  disabled={isProcessing}
                  className="text-input"
                />
                <button
                  className={`mic-btn ${isListening ? 'listening' : ''}`}
                  onClick={toggleListening}
                  disabled={isProcessing}
                  title="Voice input"
                >
                  {isListening ? '...' : 'Mic'}
                </button>
                <button
                  className="send-btn"
                  onClick={() => sendResponse(textInput)}
                  disabled={isProcessing || !textInput.trim()}
                >
                  Send
                </button>
              </div>

              {turnCount > 0 && !showEndOptions && (
                <button
                  className="end-session-toggle"
                  onClick={() => setShowEndOptions(true)}
                >
                  End session
                </button>
              )}

              {(turnCount === 0 || showEndOptions) && (
                <div className="outcome-buttons">
                  <button onClick={() => handleEndSession('acknowledged')} className="outcome-btn acknowledge">
                    Got it, thanks
                  </button>
                  <button onClick={() => handleEndSession('disputed')} className="outcome-btn dispute">
                    I disagree
                  </button>
                  {showEndOptions && (
                    <button className="outcome-btn cancel" onClick={() => setShowEndOptions(false)}>
                      Keep talking
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {!isSessionActive && (
            <div className="session-closed">
              <p>This session is {session.status}.</p>
              <button onClick={() => navigate('/driver')} className="back-link">
                Back to sessions
              </button>
            </div>
          )}
        </div>

        {/* Right: Map + Event List + Event Details */}
        <div className="session-sidebar">
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
              <p>{selectedEventId ? 'Location data unavailable for this event' : 'Select an event to view location'}</p>
            </div>
          )}

          {/* Scrollable Event List */}
          {eventSummaries.length > 0 && (
            <div className="event-list-panel">
              <h3>Shift Events ({eventSummaries.length})</h3>
              <div className="event-list-scroll">
                {eventSummaries.map((evt) => (
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

          {/* Event Detail Panel — shown when an event is selected */}
          {selectedEventData && (
            <div className="event-details">
              <h3>Event Details</h3>
              <div className="detail-row">
                <span className="detail-label">Rule</span>
                <span className="detail-value">{selectedEventData.ruleName || selectedEventData.type}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Vehicle</span>
                <span className="detail-value">{selectedEventData.deviceName || '—'}</span>
              </div>
              {selectedEventData.timestamp && (
                <div className="detail-row">
                  <span className="detail-label">Time</span>
                  <span className="detail-value">
                    {(selectedEventData.timestamp.toDate
                      ? selectedEventData.timestamp.toDate()
                      : new Date(selectedEventData.timestamp)
                    ).toLocaleString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </span>
                </div>
              )}
              {selectedEventData.rawData?.duration && (
                <div className="detail-row">
                  <span className="detail-label">Duration</span>
                  <span className="detail-value">{selectedEventData.rawData.duration}</span>
                </div>
              )}
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
              {selectedEventData.rawData?.speed > 0 && selectedEventData.rawData?.speedLimit > 0 && selectedEventData.rawData.speed > selectedEventData.rawData.speedLimit && (
                <div className="detail-row">
                  <span className="detail-label">Over Limit</span>
                  <span className="detail-value" style={{ color: '#e74c3c', fontWeight: 600 }}>
                    +{Math.round((selectedEventData.rawData.speed - selectedEventData.rawData.speedLimit) * 0.621371)} mph
                  </span>
                </div>
              )}
              {hasLocation && (
                <div className="detail-row">
                  <span className="detail-label">Coordinates</span>
                  <span className="detail-value detail-small">{lat?.toFixed(4)}, {lng?.toFixed(4)}</span>
                </div>
              )}
            </div>
          )}

          {session.coachAnalysis?.recommendation?.type !== 'none' && session.coachAnalysis?.recommendation?.details && (
            <div className="event-recommendation">
              <h3>Recommendation</h3>
              <p>{p(session.coachAnalysis.recommendation.details)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
