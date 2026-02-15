import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, where, limit } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../../firebase';
import { useAuth } from '../../hooks/useAuth.jsx';
import LiveFeed from './LiveFeed';
import ActionQueue from './ActionQueue';
import Analytics from './Analytics';

export default function DashboardHome() {
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('feed');
  const [sessions, setSessions] = useState([]);
  const [actions, setActions] = useState([]);

  useEffect(() => {
    const sessionsQuery = query(
      collection(db, 'sessions'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubSessions = onSnapshot(sessionsQuery, (snapshot) => {
      setSessions(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    const actionsQuery = query(
      collection(db, 'actions'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    const unsubActions = onSnapshot(actionsQuery, (snapshot) => {
      setActions(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubSessions();
      unsubActions();
    };
  }, []);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="brand">
          <h1>Geoff</h1>
          <span className="subtitle">Fleet Intelligence</span>
        </div>
        <nav className="dashboard-nav">
          <button
            className={activeTab === 'feed' ? 'active' : ''}
            onClick={() => setActiveTab('feed')}
          >
            Live Feed
          </button>
          <button
            className={activeTab === 'actions' ? 'active' : ''}
            onClick={() => setActiveTab('actions')}
          >
            Action Queue {actions.length > 0 && <span className="badge">{actions.length}</span>}
          </button>
          <button
            className={activeTab === 'analytics' ? 'active' : ''}
            onClick={() => setActiveTab('analytics')}
          >
            Analytics
          </button>
        </nav>
        <div className="user-info">
          <span>{userProfile?.name}</span>
          <button onClick={() => signOut(auth)} className="logout-btn">Sign Out</button>
        </div>
      </header>

      <main className="dashboard-content">
        {activeTab === 'feed' && <LiveFeed sessions={sessions} />}
        {activeTab === 'actions' && <ActionQueue actions={actions} sessions={sessions} />}
        {activeTab === 'analytics' && <Analytics sessions={sessions} />}
      </main>
    </div>
  );
}
