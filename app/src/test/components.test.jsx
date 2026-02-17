import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock firebase before any component imports
vi.mock('../firebase', () => ({
  auth: {},
  googleProvider: {},
  db: {},
  storage: {},
  functions: {},
  default: {},
}));

// Mock useAuth hook
vi.mock('../hooks/useAuth.jsx', () => ({
  useAuth: () => ({ user: null, userProfile: null, loading: false }),
  AuthProvider: ({ children }) => children,
  AuthContext: {},
}));

// Mock firebase/auth
vi.mock('firebase/auth', () => ({
  signInWithPopup: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteField: vi.fn(),
  onSnapshot: vi.fn(),
}));

import Login from '../components/auth/Login';
import RoleSelect from '../components/auth/RoleSelect';

describe('Login', () => {
  it('renders the login page with app name and sign-in button', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    expect(screen.getByText('Geoff')).toBeInTheDocument();
    expect(screen.getByText('Fleet Intelligence')).toBeInTheDocument();
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
  });

  it('has a clickable Google sign-in button', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    const button = screen.getByText('Sign in with Google');
    expect(button.tagName).toBe('BUTTON');
  });
});

describe('RoleSelect', () => {
  it('renders role selection options', () => {
    render(
      <MemoryRouter>
        <RoleSelect />
      </MemoryRouter>
    );
    expect(screen.getByText('Geoff')).toBeInTheDocument();
    expect(screen.getByText("I'm a Driver")).toBeInTheDocument();
    expect(screen.getByText("I'm a Supervisor")).toBeInTheDocument();
  });

  it('shows the role prompt', () => {
    render(
      <MemoryRouter>
        <RoleSelect />
      </MemoryRouter>
    );
    expect(screen.getByText('How are you using Geoff today?')).toBeInTheDocument();
  });
});
