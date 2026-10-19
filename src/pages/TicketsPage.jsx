import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import PinDetail from '../components/PinDetail';
import PinRows from '../components/PinRows';
import PinsMap from '../components/PinsMap';
import DateInput from '../components/DateInput';

// Tickets: pins a supervisor marked "Action needed". PM Coordinators comment
// and close them; a supervisor or PM can reopen one. The Director can see them
// all. Open tickets list Critical first, oldest first within each status.
// The same List / Map switch and link-or-site and date filters as the Review
// Queue; the dates are the day the pin was added.
const TICKET_LIMIT = 500;
const eatDay = (iso) => new Date(new Date(iso).getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);

export default function TicketsPage() {
  const [state, setState] = useState('open');
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');
  const [layout, setLayout] = useState('list');
  const [place, setPlace] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [routes, setRoutes] = useState(null);

  const load = useCallback(() => {
    api.get(`/patrol/tickets?state=${state}`).then(r => setRows(r.data)).catch(e => setError(e.response?.data?.error || 'Could not load the tickets.'));
  }, [state]);
  useEffect(() => { setRows(null); load(); }, [load]);

  useEffect(() => {
    api.get('/patrol/cycles').then(r => {
      const id = r.data.current_cycle_id;
      if (id) api.get(`/patrol/cycles/${id}/routes`).then(x => setRoutes(x.data)).catch(() => {});
    }).catch(() => {});
  }, []);

  const places = useMemo(() => {
    const links = new Set(), sites = new Set();
    for (const f of routes?.features || []) {
      if (f.geometry.type === 'LineString') links.add(f.properties.name);
      else if (f.geometry.type === 'Point') sites.add(f.properties.name);
    }
    const sort = (set) => [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
    return { links: sort(links), sites: sort(sites) };
  }, [routes]);

  // At most a few hundred tickets, so the filters run here.
  const shown = useMemo(() => {
    if (!rows) return null;
    const needle = q.trim().toLowerCase();
    return rows.filter(p =>
      (!place || p.nearest_route_name === place || p.nearest_site_name === place)
      && (!from || eatDay(p.created_at) >= from)
      && (!to || eatDay(p.created_at) <= to)
      && (!needle || [p.name, p.observation_label, p.officer_name, p.nearest_route_name, p.nearest_site_name, p.last_comment]
        .some(v => (v || '').toLowerCase().includes(needle))));
  }, [rows, place, from, to, q]);
  const filtersOn = !!(place || from || to || q);

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub Operations</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Tickets</span>
        </div>
      </div>
      <div className="content">
        {error && <div className="login-error" role="alert">{error}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <div className="seg">
            <button className={state === 'open' ? 'on' : ''} onClick={() => setState('open')}>Open</button>
            <button className={state === 'closed' ? 'on' : ''} onClick={() => setState('closed')}>Closed</button>
          </div>
          <input className="form-input" style={{ flex: '1 1 220px', minWidth: 0 }} placeholder="Search point, observation, officer, link, site or comment" aria-label="Search tickets"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <select className="form-select" style={{ flex: '1 1 240px', minWidth: 0, maxWidth: 380 }} value={place} onChange={e => setPlace(e.target.value)} aria-label="Link or site">
            <option value="">Any link or site</option>
            {places.links.length > 0 && <optgroup label="Links">{places.links.map(n => <option key={'l' + n} value={n}>{n}</option>)}</optgroup>}
            {places.sites.length > 0 && <optgroup label="Sites">{places.sites.map(n => <option key={'s' + n} value={n}>{n}</option>)}</optgroup>}
          </select>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Pin added from</span>
          <DateInput value={from} onChange={setFrom} style={{ width: 140 }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>to</span>
          <DateInput value={to} onChange={setTo} style={{ width: 140 }} />
          {filtersOn && <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => { setPlace(''); setFrom(''); setTo(''); setQ(''); }}>✕ Clear</button>}
          <div className="seg" style={{ marginLeft: 'auto' }}>
            <button className={layout === 'list' ? 'on' : ''} onClick={() => setLayout('list')}><i className="ti ti-list" aria-hidden="true" /> List</button>
            <button className={layout === 'map' ? 'on' : ''} onClick={() => setLayout('map')}><i className="ti ti-map-2" aria-hidden="true" /> Map</button>
          </div>
        </div>

        {layout === 'map'
          ? (shown ? <PinsMap pins={shown} routes={routes} onOpen={setOpen} limit={TICKET_LIMIT} /> : <div className="card" style={{ padding: 18, fontSize: 13 }}>Loading…</div>)
          : <PinRows pins={shown} onOpen={setOpen} showTicket
              empty={filtersOn ? 'No tickets match.' : state === 'open' ? 'No open tickets.' : 'No closed tickets yet.'} />}
        {open && <PinDetail pinId={open} onClose={() => setOpen(null)} onChanged={load} />}
      </div>
    </>
  );
}
