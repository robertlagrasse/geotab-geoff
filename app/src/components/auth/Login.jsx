import { signInWithPopup } from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { auth, googleProvider, db } from '../../firebase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useEffect } from 'react';

export default function Login() {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();

  // After login, send to role selection (role is cleared on each login)
  useEffect(() => {
    if (user && userProfile) {
      if (userProfile.role) {
        navigate(userProfile.role === 'driver' ? '/driver' : '/dashboard');
      } else {
        navigate('/role');
      }
    }
  }, [user, userProfile, navigate]);

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const userRef = doc(db, 'users', result.user.uid);
      const existing = await getDoc(userRef);

      if (!existing.exists()) {
        await setDoc(userRef, {
          name: result.user.displayName,
          email: result.user.email,
          createdAt: new Date(),
        });
      } else {
        // Clear role so user is always prompted to choose on login
        await updateDoc(userRef, { role: deleteField() });
      }
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Geoff</h1>
        <p>Fleet Intelligence</p>
        <button onClick={handleGoogleLogin} className="google-login-btn">
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
