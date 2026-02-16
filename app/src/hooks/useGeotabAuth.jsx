import { useState, useEffect } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { AuthContext } from './useAuth.jsx';

const GEOTAB_AUTH_URL = import.meta.env.VITE_GEOTAB_AUTH_URL ||
  'https://us-central1-geotab-geoff.cloudfunctions.net/geotabAuth';

/**
 * Auth provider for the MyGeotab Add-In context.
 * Exchanges the Geotab session for a Firebase custom token.
 */
export function GeotabAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let profileUnsub = null;

    async function authenticate() {
      const api = window._geotabApi;
      if (!api) {
        console.warn('[Geoff] No Geotab API available');
        setLoading(false);
        return;
      }

      try {
        // Get session via callback (the only reliable method in MyGeotab Add-In context)
        const session = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('getSession timeout')), 5000);
          api.getSession((s) => { clearTimeout(timeout); resolve(s); });
        });

        if (!session || !session.database || !session.userName || !session.sessionId) {
          throw new Error('Incomplete session data');
        }

        const database = session.database;
        const userName = session.userName;
        const sessionId = session.sessionId;
        const server = session.server || session.path || 'my.geotab.com';

        // Exchange for Firebase custom token
        const res = await fetch(GEOTAB_AUTH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ database, userName, sessionId, server }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Auth exchange failed: ${res.status} ${text}`);
        }

        const { token } = await res.json();
        console.log('[Geoff] Firebase token obtained');

        // Sign into Firebase
        const credential = await signInWithCustomToken(auth, token);
        const firebaseUser = credential.user;
        setUser(firebaseUser);
        console.log('[Geoff] Firebase auth success:', firebaseUser.uid);

        // Listen to profile doc
        profileUnsub = onSnapshot(doc(db, 'users', firebaseUser.uid), (profileDoc) => {
          if (profileDoc.exists()) {
            setUserProfile(profileDoc.data());
          } else {
            setUserProfile({ name: userName, role: 'supervisor' });
          }
          setLoading(false);
        });
      } catch (err) {
        console.error('[Geoff] Auth failed:', err);
        setLoading(false);
      }
    }

    authenticate();

    return () => {
      if (profileUnsub) profileUnsub();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, userProfile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
