import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from './api';

const AuthContext = createContext(null);
// Idle auto-logout. The phone shell gets a longer window than the desktop: an
// office machine is shared and gets left unlocked, whereas a phone sits behind
// its own lock screen and is expected to be backgrounded for hours between a
// morning site visit and the afternoon. Neither can outlive the 8h token.
const IDLE_TIMEOUT_MS = 60 * 60 * 1000;            // desktop: 1 hour
const IDLE_TIMEOUT_MOBILE_MS = 4 * 60 * 60 * 1000; // phone shell: 4 hours
// Read at check time rather than captured on mount, so moving between the two
// surfaces takes effect immediately instead of at the next remount.
const idleLimit = () =>
  (typeof window !== 'undefined' && window.location.pathname.startsWith('/m'))
    ? IDLE_TIMEOUT_MOBILE_MS : IDLE_TIMEOUT_MS;
const IDLE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
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
    // The login response omits some fields (e.g. profile_picture); pull the
    // full profile from /auth/me so the sidebar avatar shows immediately
    // instead of only after the next page refresh.
    let userData = res.data.user;
    try {
      const me = await api.get('/auth/me');
      userData = { ...res.data.user, ...me.data, name: me.data.full_name || me.data.name };
    } catch { /* fall back to the login payload */ }
    localStorage.setItem('esat_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
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

  // Auto-logout after idleLimit() of no mouse/keyboard/touch/scroll activity,
  // or as soon as a backend redeploy invalidates the session.
  // Last-activity is persisted to localStorage (not just a JS variable) so idle
  // time survives a tab reload/discard (laptop sleep, mobile backgrounding,
  // Chrome memory-saver) instead of resetting to "now" on remount.
  useEffect(() => {
    if (!user) return;

    const stored = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY), 10);
    if (stored && Date.now() - stored >= idleLimit()) {
      sessionStorage.setItem('esat_idle_logout', '1');
      logout();
      return;
    }

    const markActive = () => localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    markActive();
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, markActive, { passive: true }));

    const interval = setInterval(() => {
      const last = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY), 10) || Date.now();
      if (Date.now() - last >= idleLimit()) {
        sessionStorage.setItem('esat_idle_logout', '1');
        logout();
        return;
      }
      // Session-validity check: a 401 here (e.g. the backend rejecting a
      // token issued before its current boot time, after a redeploy) is
      // handled globally by the response interceptor in api.js.
      api.get('/auth/ping').catch(() => {});
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
