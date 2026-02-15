import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.jsx';
import Login from './components/auth/Login';
import DriverHome from './components/driver/DriverHome';
import CoachingSession from './components/driver/CoachingSession';
import DashboardHome from './components/dashboard/DashboardHome';
import RoleSelect from './components/auth/RoleSelect';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, userProfile, loading } = useAuth();

  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (!userProfile?.role) return <Navigate to="/role" />;
  if (allowedRoles && !allowedRoles.includes(userProfile?.role)) {
    return <Navigate to="/" />;
  }

  return children;
}

function AppRouter() {
  const { user, userProfile, loading } = useAuth();

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/role" element={user ? <RoleSelect /> : <Navigate to="/login" />} />
      <Route
        path="/driver"
        element={
          <ProtectedRoute allowedRoles={['driver']}>
            <DriverHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/driver/session/:sessionId"
        element={
          <ProtectedRoute allowedRoles={['driver']}>
            <CoachingSession />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/*"
        element={
          <ProtectedRoute allowedRoles={['supervisor', 'admin']}>
            <DashboardHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          user ? (
            !userProfile?.role ? (
              <Navigate to="/role" />
            ) : userProfile.role === 'driver' ? (
              <Navigate to="/driver" />
            ) : (
              <Navigate to="/dashboard" />
            )
          ) : (
            <Navigate to="/login" />
          )
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  );
}
