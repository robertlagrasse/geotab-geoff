import { onRequest, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { generateCoachingScript, generateShiftCoachingScript, generatePositiveCoachingScript, continueConversation } from './coaching/generator.js';
import { synthesizeSpeech } from './speech/tts.js';
import { transcribeAudio } from './speech/stt.js';
import { fetchSafetyEvents, queryAceContext } from './geotab/client.js';
import { fetchFleetAnalytics } from './analytics/odata.js';
import { exchangeGeotabSession } from './geotab/auth.js';

initializeApp();

const db = getFirestore();
const storage = getStorage();

// Lipsync service — Cloud Run with NVIDIA L4 GPU in us-east4
const LIPSYNC_API = process.env.LIPSYNC_API_URL || '';
const LIPSYNC_BUCKET = 'geotab-geoff-assets';

async function generateLipsyncVideo(audioUrl) {
  if (!LIPSYNC_API) return null;

  try {
    // Download the TTS audio
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) return null;
    const audioBuffer = await audioRes.arrayBuffer();

    // Send audio to Cloud Run lipsync service (geoff.png is baked into the container)
    const boundary = '----GeoffLipsync' + Date.now();
    const parts = [];
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="speech.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`);
    parts.push(Buffer.from(audioBuffer));
    parts.push(`\r\n--${boundary}--\r\n`);

    const body = Buffer.concat(parts.map((p) => typeof p === 'string' ? Buffer.from(p) : p));

    const lipsyncRes = await fetch(`${LIPSYNC_API}/lipsync`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });

    if (!lipsyncRes.ok) {
      console.warn('Lipsync service returned', lipsyncRes.status);
      return null;
    }

    // Cloud Run returns raw MP4 bytes — upload to Cloud Storage
    const videoBytes = Buffer.from(await lipsyncRes.arrayBuffer());
    const videoFilename = `lipsync/video_${Date.now()}.mp4`;
    const bucket = storage.bucket(LIPSYNC_BUCKET);
    const file = bucket.file(videoFilename);
    await file.save(videoBytes, { contentType: 'video/mp4' });
    // Bucket has uniform access with allUsers:objectViewer — no per-object ACL needed
    return `https://storage.googleapis.com/${LIPSYNC_BUCKET}/${videoFilename}`;
  } catch (err) {
    console.warn('Lipsync generation failed, falling back to audio:', err.message);
    return null;
  }
}

// Events just accumulate until the driver starts a shift coaching session
export const onSafetyEvent = onDocumentCreated(
  { document: 'events/{eventId}', region: 'us-central1' },
  async (event) => {
    const eventData = event.data.data();
    const eventId = event.params.eventId;
    console.log(`New safety event ${eventId} for driver ${eventData.driverId} — awaiting shift coaching`);
  }
);

// Called by driver app to begin a holistic shift coaching session
export const beginCoaching = onCall(
  { region: 'us-central1', timeoutSeconds: 120 },
  async (request) => {
    const { driverId, driverName, deviceName, fleetId, language } = request.data;
    const uid = request.auth?.uid;
    if (!uid) throw new Error('Unauthenticated');
    if (!driverId) throw new Error('driverId is required');

    // 1. Query all pending events for this driver
    const eventsSnapshot = await db
      .collection('events')
      .where('driverId', '==', driverId)
      .where('coachingStatus', '==', 'pending')
      .orderBy('timestamp', 'asc')
      .get();

    const events = eventsSnapshot.empty
      ? []
      : eventsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // 2. Fetch Ace AI context for richer coaching insights
    let aceContext = null;
    if (events.length > 0) {
      try {
        aceContext = await queryAceContext(driverId, events[0]);
      } catch (err) {
        console.warn('[beginCoaching] Ace context fetch failed, continuing without:', err.message);
      }
    }

    // 3. Generate shift coaching script with Gemini
    const lang = language || 'en-US';
    const script = events.length > 0
      ? await generateShiftCoachingScript(events, aceContext, lang)
      : await generatePositiveCoachingScript(driverName || 'Driver', lang);

    // 4. Synthesize TTS and generate lipsync video
    const sessionId = `shift_${Date.now()}`;
    const audioUrl = await synthesizeSpeech(script.initialMessage, sessionId, lang);
    const videoUrl = await generateLipsyncVideo(audioUrl);

    // 5. Compute shift period
    const timestamps = events
      .map((e) => {
        if (!e.timestamp) return null;
        return e.timestamp.toDate ? e.timestamp.toDate() : new Date(e.timestamp);
      })
      .filter((d) => d && !isNaN(d.getTime()));
    const shiftPeriod = {
      from: timestamps.length > 0 ? Timestamp.fromDate(new Date(Math.min(...timestamps))) : Timestamp.now(),
      to: timestamps.length > 0 ? Timestamp.fromDate(new Date(Math.max(...timestamps))) : Timestamp.now(),
    };

    // 6. Create session
    const sessionRef = await db.collection('sessions').add({
      eventIds: events.map((e) => e.id),
      eventSummaries: script.eventSummaries || [],
      eventCount: events.length,
      shiftPeriod,
      language: lang,
      driverId,
      driverName: driverName || (events[0]?.driverName) || 'Driver',
      deviceName: deviceName || (events[0]?.deviceName) || '',
      fleetId: fleetId || (events[0]?.fleetId) || 'default',
      status: 'ready',
      createdAt: Timestamp.now(),
      summary: script.summary,
      transcript: [
        {
          speaker: 'geoff',
          text: script.initialMessage,
          audioUrl,
          videoUrl: videoUrl || null,
          timestamp: Timestamp.now(),
        },
      ],
      coachAnalysis: script.analysis,
      outcome: { type: null },
    });

    // 7. Batch-update all events to coached
    if (!eventsSnapshot.empty) {
      const batch = db.batch();
      eventsSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { coachingStatus: 'coached' });
      });
      await batch.commit();
    }

    return { sessionId: sessionRef.id };
  }
);

// Called by driver app to send a response and get Geoff's reply
export const driverRespond = onCall(
  { region: 'us-central1' },
  async (request) => {
    const { sessionId, driverText, driverName } = request.data;
    const uid = request.auth?.uid;
    if (!uid) throw new Error('Unauthenticated');

    const sessionRef = db.collection('sessions').doc(sessionId);
    const session = await sessionRef.get();
    if (!session.exists) throw new Error('Session not found');

    const sessionData = session.data();

    // Add driver's message to transcript
    await sessionRef.update({
      transcript: FieldValue.arrayUnion({
        speaker: 'driver',
        text: driverText,
        timestamp: Timestamp.now(),
      }),
      status: 'in_progress',
    });

    // Generate Geoff's response with the driver's real name
    const updatedSession = await sessionRef.get();
    const realName = driverName || sessionData.driverName || 'Driver';
    const sessionLang = sessionData.language || 'en-US';
    const response = await continueConversation(
      updatedSession.data().transcript,
      sessionData.coachAnalysis,
      realName,
      sessionData.eventSummaries || null,
      sessionLang
    );

    // Synthesize response audio and generate lipsync video
    const audioUrl = await synthesizeSpeech(response.message, `${sessionId}_${Date.now()}`, sessionLang);
    const videoUrl = await generateLipsyncVideo(audioUrl);

    // Add Geoff's reply
    await sessionRef.update({
      transcript: FieldValue.arrayUnion({
        speaker: 'geoff',
        text: response.message,
        audioUrl,
        videoUrl: videoUrl || null,
        timestamp: Timestamp.now(),
      }),
    });

    // If Geoff recommends escalation, create an action
    if (response.escalate) {
      await db.collection('actions').add({
        sessionId,
        driverId: sessionData.driverId,
        driverName: sessionData.driverName,
        fleetId: sessionData.fleetId,
        type: response.escalate.type,
        status: 'pending',
        createdAt: Timestamp.now(),
        summary: response.escalate.details,
        driverInput: driverText,
        coachRationale: response.escalate.rationale,
      });

      await sessionRef.update({ status: 'escalated' });
    }

    return { message: response.message, audioUrl, videoUrl: videoUrl || null };
  }
);

// TTS proxy for frontend audio synthesis
export const ttsProxy = onRequest(
  { region: 'us-central1', cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      const { text, language } = req.body;

      if (!text) {
        res.status(400).json({ error: 'text is required' });
        return;
      }

      // Use our TTS module to generate audio
      const audioUrl = await synthesizeSpeech(text, `tts_${Date.now()}`, language || 'en-US');
      res.json({ audioUrl });
    } catch (err) {
      console.error('TTS proxy error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Polling endpoint to fetch new Geotab safety events
export const pollGeotabEvents = onRequest(
  { region: 'us-central1', timeoutSeconds: 300 },
  async (req, res) => {
    try {
      const events = await fetchSafetyEvents();
      let newCount = 0;

      for (const event of events) {
        // Check if we already have this event
        const existing = await db
          .collection('events')
          .where('geotabEventId', '==', event.id)
          .get();

        if (existing.empty) {
          await db.collection('events').add({
            geotabEventId: event.id,
            driverId: event.driverId,
            driverName: event.driverName,
            deviceName: event.deviceName,
            type: event.type,
            ruleName: event.ruleName,
            timestamp: Timestamp.fromDate(new Date(event.timestamp)),
            location: event.location,
            rawData: event.rawData,
            coachingStatus: 'pending',
            createdAt: Timestamp.now(),
          });
          newCount++;
        }
      }

      // Also sync the driver list to Firestore for the frontend dropdown
      await syncDriverList(events);

      res.json({ total: events.length, new: newCount });
    } catch (err) {
      console.error('Error polling Geotab:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Fleet analytics endpoint — fetches Data Connector OData
export const fleetAnalytics = onRequest(
  { region: 'us-central1', cors: true, timeoutSeconds: 120 },
  async (req, res) => {
    try {
      const analytics = await fetchFleetAnalytics();
      res.json(analytics);
    } catch (err) {
      console.error('Fleet analytics error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Server-side speech-to-text transcription
// Uses Google Cloud STT instead of browser Web Speech API for:
// - Cross-browser support (Firefox, Safari, Edge — not just Chrome)
// - Better accuracy in noisy environments (truck cabs, warehouses, loading docks)
// - Better accent handling (fleet drivers are diverse)
// - Consistent behavior regardless of client device
export const transcribe = onCall(
  { region: 'us-central1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new Error('Unauthenticated');

    const { audio, language } = request.data;
    if (!audio) throw new Error('audio (base64) is required');

    const audioBuffer = Buffer.from(audio, 'base64');
    const transcript = await transcribeAudio(audioBuffer, language || 'en-US');
    return { transcript };
  }
);

// Geotab session → Firebase custom token exchange (for MyGeotab Add-In)
export const geotabAuth = onRequest(
  { region: 'us-central1', cors: true },
  exchangeGeotabSession
);

// Helper: sync unique drivers from events into Firestore drivers collection
async function syncDriverList(events) {
  const seen = new Set();
  for (const event of events) {
    const key = event.driverId;
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const driverRef = db.collection('drivers').doc(key);
    const existing = await driverRef.get();
    if (!existing.exists) {
      await driverRef.set({
        id: key,
        name: event.driverName || event.deviceName || key,
        deviceName: event.deviceName || key,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    } else {
      await driverRef.update({
        name: event.driverName || event.deviceName || key,
        deviceName: event.deviceName || key,
        updatedAt: Timestamp.now(),
      });
    }
  }
}
