import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'crypto';

/**
 * Exchange a Geotab session for a Firebase custom token.
 * Validates the session by calling GetSystemTimeUtc via direct JSONRPC, then mints a token.
 */
export async function exchangeGeotabSession(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { database, userName, sessionId, server } = req.body;

  if (!database || !userName || !sessionId || !server) {
    res.status(400).json({ error: 'Missing required fields: database, userName, sessionId, server' });
    return;
  }

  // Validate server param — must end with .geotab.com
  if (!server.endsWith('.geotab.com')) {
    res.status(400).json({ error: 'Invalid server: must end with .geotab.com' });
    return;
  }

  try {
    // Verify session via direct JSONRPC call (mg-api-js doesn't support session-based auth)
    const geotabRes = await fetch(`https://${server}/apiv1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'GetSystemTimeUtc',
        params: {
          credentials: { database, userName, sessionId },
        },
      }),
    });

    const geotabData = await geotabRes.json();
    if (geotabData.error) {
      throw new Error(geotabData.error.message || JSON.stringify(geotabData.error));
    }

    // Generate deterministic Firebase UID from database:userName
    const raw = `${database}:${userName}`.toLowerCase();
    const uid = 'geotab_' + createHash('sha256').update(raw).digest('hex').slice(0, 28);

    // Ensure users/{uid} doc exists with supervisor role
    const db = getFirestore();
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      await userRef.set({
        name: userName,
        role: 'supervisor',
        geotabDatabase: database,
        geotabUser: userName,
        createdAt: Timestamp.now(),
      });
    }

    // Mint Firebase custom token
    const customToken = await getAuth().createCustomToken(uid, {
      role: 'supervisor',
      geotabDatabase: database,
    });

    res.json({ token: customToken, uid });
  } catch (err) {
    console.error('Geotab session exchange failed:', err.message);
    res.status(401).json({ error: 'Invalid Geotab session' });
  }
}
