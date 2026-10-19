import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

// The bell in the OneHub Operations sidebar: new Critical/Medium pins, ticket
// changes and the hourly Normal summary. Checks every minute while open in the
// background; opening an item goes to the pin and marks it read.
const POLL_MS = 60 * 1000;
const ICON = {
  pin_critical: ['ti-alert-octagon', '#E24B4A'],
  pin_medium: ['ti-alert-triangle', '#EF9F27'],
  ticket_opened: ['ti-ticket', '#E24B4A'],
  ticket_closed: ['ti-circle-check', '#1D9E75'],
  ticket_reopened: ['ti-refresh-alert', '#EF9F27'],
  normal_summary: ['ti-list-check', '#1D9E75'],
};
const ago = (d) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function NotificationBell({ onNavigate }) {
  const [data, setData] = useState({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const boxRef = useRef(null);

  const load = useCallback(() => {
    api.get('/patrol/notifications').then(r => setData(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const go = async (n) => {
    setOpen(false);
    if (!n.read_at) {
      api.post('/patrol/notifications/read', { ids: [n.id] }).catch(() => {});
      setData(d => ({ unread: Math.max(0, d.unread - 1), items: d.items.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x) }));
    }
    onNavigate?.();
    if (n.pin_id) navigate(`/ops/${n.kind.startsWith('ticket') ? 'tickets' : 'review'}?pin=${n.pin_id}`);
    else navigate('/ops/review');
  };

  const readAll = async () => {
    await api.post('/patrol/notifications/read', {}).catch(() => {});
    setData(d => ({ unread: 0, items: d.items.map(x => ({ ...x, read_at: x.read_at || new Date().toISOString() })) }));
  };

  return (
    <div className="bell-wrap" ref={boxRef}>
      <button className="bell-btn" onClick={() => { setOpen(o => !o); if (!open) load(); }} aria-haspopup="true" aria-expanded={open}
        aria-label={data.unread ? `Notifications, ${data.unread} unread` : 'Notifications'}>
        <i className="ti ti-bell" aria-hidden="true" />
        <span>Notifications</span>
        {data.unread > 0 && <span className="bell-badge">{data.unread > 99 ? '99+' : data.unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <b>Notifications</b>
            {data.unread > 0 && <button onClick={readAll}>Mark all read</button>}
          </div>
          {data.items.length === 0 && <div className="bell-empty">Nothing yet. New Critical and Medium pins and ticket changes appear here.</div>}
          {data.items.map(n => {
            const [icon, colour] = ICON[n.kind] || ['ti-bell', '#6b7280'];
            return (
              <button key={n.id} className={`bell-item${n.read_at ? '' : ' unread'}`} onClick={() => go(n)}>
                <i className={`ti ${icon}`} style={{ color: colour }} aria-hidden="true" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="bell-title">{n.title}</span>
                  {n.body && <span className="bell-body">{n.body}</span>}
                  <span className="bell-time">{ago(n.created_at)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
