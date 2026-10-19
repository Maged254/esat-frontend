import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { AREAS, userAreas, homeFor } from '../utils/areas';

// The tile screen: shown only to people who hold more than one area. Anyone with one
// area is sent straight into it -- a screen with a single choice is just a
// click in the way.
const TILES = [
  { key: 'people', blurb: 'Employees, training, PPE, audits and mobile lines.', accent: '#8BD86F' },
  { key: 'ops', blurb: 'Route patrol: routes, patrols, pins and tickets.', accent: '#F5C518' },
];

export default function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const mine = userAreas(user);
  const tiles = TILES.filter(t => mine.includes(t.key));
  // Otherwise the tab keeps the name of whichever area was open before.
  React.useEffect(() => { document.title = 'OneHub'; }, []);
  if (tiles.length < 2) return <Navigate to={homeFor(user)} replace />;

  const firstName = (user?.name || '').split(' ')[0];

  return (
    <div className="login-page" style={{ flexDirection: 'column', gap: 28, padding: '32px 16px' }}>
      <div style={{ color: '#fff', textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 600 }}>{firstName ? `Welcome, ${firstName}` : 'Welcome'}</div>
        <div style={{ fontSize: 14, opacity: 0.75, marginTop: 4 }}>Choose where to work</div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'center', width: '100%', maxWidth: 820 }}>
        {tiles.map(t => {
          const area = AREAS[t.key];
          return (
            <button
              key={t.key}
              onClick={() => navigate(area.home)}
              className="area-tile"
              style={{ '--tile-accent': t.accent }}
            >
              <img src={area.logo} alt={area.name} style={{ width: '100%', maxWidth: 300, height: 'auto' }} />
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>{t.blurb}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: t.accent }}>Open <i className="ti ti-arrow-right" aria-hidden="true" /></span>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => { if (window.confirm('Sign out?')) logout(); }}
        style={{ background: 'none', border: 0, color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
      >
        Sign out
      </button>
    </div>
  );
}
