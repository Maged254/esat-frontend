import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from './api';

const AuthContext = createContext(null);
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour of inactivity auto-logs out
const IDLE_CHECK_INTERVAL_MS = 30 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
const LAST_ACTIVITY_KEY = 'esat_last_activity';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('esat_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('esat_token');
    if (token) {
      api.get('/auth/me')
        .then(res => {
          const userData = { ...res.data, name: res.data.full_name || res.data.name };
          setUser(userData);
          localStorage.setItem('esat_user', JSON.stringify(userData));
        })
        .catch(() => logout())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('esat_token', res.data.token);
    localStorage.setItem('esat_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = useCallback(() => {
    localStorage.removeItem('esat_token');
    localStorage.removeItem('esat_user');
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    setUser(null);
  }, []);

  const refreshUser = async () => {
    const res = await api.get('/auth/me');
    const userData = { ...res.data, name: res.data.full_name || res.data.name };
    setUser(userData);
    localStorage.setItem('esat_user', JSON.stringify(userData));
    return userData;
  };

  // Auto-logout after IDLE_TIMEOUT_MS of no mouse/keyboard/touch/scroll activity.
  // Last-activity is persisted to localStorage (not just a JS variable) so idle
  // time survives a tab reload/discard (laptop sleep, mobile backgrounding,
  // Chrome memory-saver) instead of resetting to "now" on remount.
  useEffect(() => {
    if (!user) return;

    const stored = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY), 10);
    if (stored && Date.now() - stored >= IDLE_TIMEOUT_MS) {
      sessionStorage.setItem('esat_idle_logout', '1');
      logout();
      return;
    }

    const markActive = () => localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    markActive();
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, markActive, { passive: true }));

    const interval = setInterval(() => {
      const last = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY), 10) || Date.now();
      if (Date.now() - last >= IDLE_TIMEOUT_MS) {
        sessionStorage.setItem('esat_idle_logout', '1');
        logout();
      }
    }, IDLE_CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, markActive));
      clearInterval(interval);
    };
  }, [user, logout]);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
