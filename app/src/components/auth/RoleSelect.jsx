import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useNavigate } from 'react-router-dom';
import { LANGUAGES } from '../../config/languages.js';

export default function RoleSelect() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [selectedLanguage, setSelectedLanguage] = useState(userProfile?.language || 'en-US');

  const selectRole = async (role) => {
    await setDoc(doc(db, 'users', user.uid), {
      name: user.displayName,
      email: user.email,
      role,
      language: selectedLanguage,
      createdAt: new Date(),
    }, { merge: true });

    // useAuth's onSnapshot will pick up the role change;
    // navigate immediately — ProtectedRoute will allow access once profile updates
    navigate(role === 'driver' ? '/driver' : '/dashboard');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Geoff</h1>
        <p>How are you using Geoff today?</p>
        <select
          className="driver-select"
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
          style={{ marginBottom: '0.75rem' }}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.label}</option>
          ))}
        </select>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button onClick={() => selectRole('driver')} className="google-login-btn">
            I'm a Driver
          </button>
          <button
            onClick={() => selectRole('supervisor')}
            className="google-login-btn"
            style={{ background: '#475569' }}
          >
            I'm a Supervisor
          </button>
        </div>
      </div>
    </div>
  );
}
