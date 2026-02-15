import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useNavigate } from 'react-router-dom';

export default function RoleSelect() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const selectRole = async (role) => {
    await setDoc(doc(db, 'users', user.uid), {
      name: user.displayName,
      email: user.email,
      role,
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
