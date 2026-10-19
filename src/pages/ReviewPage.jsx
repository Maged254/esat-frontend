import React, { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';
import PinDetail, { fmtDateTime } from '../components/PinDetail';
import PinRows from '../components/PinRows';

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
  const [pins, setPins] = useState(null);
  const [patrols, setPatrols] = useState([]);
  const [open, setOpen] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams({ view });
    if (status) params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    api.get(`/patrol/pins?${params}`).then(r => setPins(r.data)).catch(e => setError(e.response?.data?.error || 'Could not load the pins.'));
    api.get('/patrol/review/patrols').then(r => setPatrols(r.data)).catch(() => {});
  }, [view, status, q]);

  useEffect(() => { setPins(null); const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

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
          <input className="form-input" style={{ flex: '1 1 220px', minWidth: 0 }} placeholder="Search point, observation, officer or route" aria-label="Search pins"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>

        <PinRows pins={pins} onOpen={setOpen}
          empty={view === 'awaiting' ? 'Nothing to review. New pins appear here as officers add them.' : 'No pins match.'} />

        {open && <PinDetail pinId={open} onClose={() => setOpen(null)} onChanged={load} />}
      </div>
    </>
  );
}
