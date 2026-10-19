import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import PinDetail, { fmtDateTime } from '../components/PinDetail';
import PinRows from '../components/PinRows';
import PinsMap from '../components/PinsMap';
import DateInput from '../components/DateInput';

// Review Queue (Field Supervisors): every new pin waits here, Critical first.
// Any supervisor can review any pin. Normal pins can be cleared a whole patrol
// at a time with "Confirm all Normal"; Critical and Medium are opened one by one.
const END_REASON = {
  officer: 'by the officer',
  signed_out: 'signed out',
  inactive: 'no activity for 2 hours',
  midnight: 'at midnight',
  restart: 'OneHub restarted',
};
const VIEWS = [
  { key: 'awaiting', label: 'Awaiting review' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'all', label: 'All pins' },
];

export default function ReviewPage() {
  const [view, setView] = useState('awaiting');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [place, setPlace] = useState('');   // a link or site name from the list
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [layout, setLayout] = useState('list'); // list | map
  const [routes, setRoutes] = useState(null);   // current cycle, for the map and the link/site list
  const [pins, setPins] = useState(null);
  const [patrols, setPatrols] = useState([]);
  const [open, setOpen] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams({ view });
    if (status) params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    if (place) params.set('place', place);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    api.get(`/patrol/pins?${params}`).then(r => setPins(r.data)).catch(e => setError(e.response?.data?.error || 'Could not load the pins.'));
    api.get('/patrol/review/patrols').then(r => setPatrols(r.data)).catch(() => {});
  }, [view, status, q, place, from, to]);

  useEffect(() => { setPins(null); const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  useEffect(() => {
    api.get('/patrol/cycles').then(r => {
      const id = r.data.current_cycle_id;
      if (id) api.get(`/patrol/cycles/${id}/routes`).then(x => setRoutes(x.data)).catch(() => {});
    }).catch(() => {});
  }, []);

  // Every link and site in the current cycle, for the "Link or site" picker.
  const places = useMemo(() => {
    const links = new Set(), sites = new Set();
    for (const f of routes?.features || []) {
      if (f.geometry.type === 'LineString') links.add(f.properties.name);
      else if (f.geometry.type === 'Point') sites.add(f.properties.name);
    }
    const sort = (set) => [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
    return { links: sort(links), sites: sort(sites) };
  }, [routes]);
  const filtersOn = !!(status || q || place || from || to);

  const confirmNormal = async (p) => {
    if (!window.confirm(`Confirm all ${p.normal} Normal pin${p.normal === 1 ? '' : 's'} from ${p.officer_name}'s patrol as No action?`)) return;
    setError(''); setNotice('');
    try {
      const r = await api.post(`/patrol/patrols/${p.id}/confirm-normal`);
      setNotice(`${r.data.confirmed} Normal pin${r.data.confirmed === 1 ? '' : 's'} confirmed as No action.`);
      load();
    } catch (e) { setError(e.response?.data?.error || 'Could not confirm the pins.'); }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub Operations</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Review Queue</span>
        </div>
      </div>
      <div className="content">
        {error && <div className="login-error" role="alert">{error}</div>}
        {notice && <div style={{ background: '#EAF3DE', color: '#3B6D11', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{notice}</div>}

        {patrols.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><span className="card-title">Patrols with pins to review</span></div>
            <div className="review-patrols">
              {patrols.map(p => (
                <div key={p.id} className="review-patrol">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{p.officer_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {fmtDateTime(p.started_at)} · {p.ended_at ? `ended ${fmtDateTime(p.ended_at).slice(-5)}${END_REASON[p.end_reason] ? ` (${END_REASON[p.end_reason]})` : ''}` : 'still running'}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ color: '#A32D2D', fontWeight: 600 }}>{p.critical} Critical</span> ·{' '}
                      <span style={{ color: '#854F0B', fontWeight: 600 }}>{p.medium} Medium</span> ·{' '}
                      <span style={{ color: '#0F6E56', fontWeight: 600 }}>{p.normal} Normal</span>
                    </div>
                  </div>
                  <button className="btn btn-secondary" disabled={!p.normal} onClick={() => confirmNormal(p)}>
                    Confirm all Normal ({p.normal})
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <div className="seg">
            {VIEWS.map(v => <button key={v.key} className={view === v.key ? 'on' : ''} onClick={() => setView(v.key)}>{v.label}</button>)}
          </div>
          <select className="form-select" style={{ width: 'auto' }} value={status} onChange={e => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            <option value="critical">Critical</option>
            <option value="medium">Medium</option>
            <option value="normal">Normal</option>
          </select>
          <input className="form-input" style={{ flex: '1 1 220px', minWidth: 0 }} placeholder="Search point, observation, officer, link or site" aria-label="Search pins"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <select className="form-select" style={{ flex: '1 1 240px', minWidth: 0, maxWidth: 380 }} value={place} onChange={e => setPlace(e.target.value)} aria-label="Link or site">
            <option value="">Any link or site</option>
            {places.links.length > 0 && <optgroup label="Links">{places.links.map(n => <option key={'l' + n} value={n}>{n}</option>)}</optgroup>}
            {places.sites.length > 0 && <optgroup label="Sites">{places.sites.map(n => <option key={'s' + n} value={n}>{n}</option>)}</optgroup>}
          </select>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>From</span>
          <DateInput value={from} onChange={setFrom} style={{ width: 140 }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>to</span>
          <DateInput value={to} onChange={setTo} style={{ width: 140 }} />
          {filtersOn && <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => { setStatus(''); setQ(''); setPlace(''); setFrom(''); setTo(''); }}>✕ Clear</button>}
          <div className="seg" style={{ marginLeft: 'auto' }}>
            <button className={layout === 'list' ? 'on' : ''} onClick={() => setLayout('list')}><i className="ti ti-list" aria-hidden="true" /> List</button>
            <button className={layout === 'map' ? 'on' : ''} onClick={() => setLayout('map')}><i className="ti ti-map-2" aria-hidden="true" /> Map</button>
          </div>
        </div>

        {layout === 'map'
          ? <>
              <PinsMap pins={pins} routes={routes} onOpen={setOpen} />
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                {pins ? `${pins.length} pin${pins.length === 1 ? '' : 's'} shown. Tap one to open it.` : 'Loading…'}
              </p>
            </>
          : <PinRows pins={pins} onOpen={setOpen}
              empty={view === 'awaiting' && !filtersOn ? 'Nothing to review. New pins appear here as officers add them.' : 'No pins match.'} />}

        {open && <PinDetail pinId={open} onClose={() => setOpen(null)} onChanged={load} />}
      </div>
    </>
  );
}
