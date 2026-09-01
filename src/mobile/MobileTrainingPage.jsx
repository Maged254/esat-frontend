import React, { useEffect, useState } from 'react';
import api, { logError } from '../utils/api';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '';
const titleCase = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());

// Same reading of a record as the Tracker: a completed certificate is described
// by its expiry state, anything else by its status.
const stateOf = (r) => {
  if (r.status !== 'completed') return { label: titleCase(r.status), bg: '#FEF3C7', fg: '#92400E' };
  if (r.expiry_state === 'superseded') return { label: 'Previous', bg: '#F3F4F6', fg: '#6B7280' };
  if (r.expiry_state === 'expired') return { label: 'Expired', bg: '#FDE8E8', fg: '#A32D2D' };
  if (r.expiry_state === 'expiring') return { label: 'Expiring soon', bg: '#FEF3C7', fg: '#92400E' };
  return { label: 'Valid', bg: '#DCFCE7', fg: '#166534' };
};
const isImage = (name) => /\.(jpe?g|png|heic|heif|gif|webp)$/i.test(name || '');

export default function MobileTrainingPage() {
  const [term, setTerm] = useState('');
  const [people, setPeople] = useState([]);
  const [searching, setSearching] = useState(false);
  const [person, setPerson] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cert, setCert] = useState(null);      // the record being viewed
  const [certUrl, setCertUrl] = useState(null);
  const [certError, setCertError] = useState('');

  useEffect(() => {
    if (person || term.trim().length < 2) { setPeople([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      api.get(`/employees?search=${encodeURIComponent(term.trim())}&status=active`)
        .then(r => setPeople((r.data.rows || r.data || []).slice(0, 25)))
        .catch(logError).finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [term, person]);

  const open = (p) => {
    setPerson(p); setLoading(true); setError(''); setRecords([]);
    // Keyed on national ID rather than the name so two people who share a name
    // can never merge into one list.
    api.get(`/training-records/tracker?national_id=${encodeURIComponent(p.national_id || '')}&page=1&pageSize=100`)
      .then(r => setRecords(r.data.rows || []))
      .catch(e => { logError(e); setError('Could not load their training.'); })
      .finally(() => setLoading(false));
  };

  const back = () => { setPerson(null); setRecords([]); setError(''); };

  // The certificate is fetched with the token in a header and shown from a local
  // blob, so no signed URL or token ever lands in the address bar.
  const openCert = async (r) => {
    setCert(r); setCertUrl(null); setCertError('');
    try {
      const res = await fetch(`${api.defaults.baseURL}/training-records/${r.id}/certificate/download?preview=1`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('esat_token')}` },
      });
      if (!res.ok) throw new Error();
      setCertUrl(URL.createObjectURL(await res.blob()));
    } catch {
      setCertError('Could not load the certificate.');
    }
  };
  const closeCert = () => {
    if (certUrl) URL.revokeObjectURL(certUrl);
    setCert(null); setCertUrl(null); setCertError('');
  };

  if (!person) {
    return (
      <>
        <input className="m-input" placeholder="Name, employee number…" value={term}
               onChange={e => setTerm(e.target.value)} autoComplete="off" />
        {term.trim().length < 2 ? (
          <div className="m-empty">Type at least two letters.</div>
        ) : searching && !people.length ? (
          <div className="m-empty">Searching…</div>
        ) : !people.length ? (
          <div className="m-empty">Nobody matches “{term.trim()}”.</div>
        ) : (
          <div style={{ marginTop: 10 }}>
            {people.map(p => (
              <button className="m-row" key={p.id} onClick={() => open(p)}>
                <span>
                  <span style={{ fontWeight: 600, color: '#0f2a4a', fontSize: 14 }}>{p.full_name}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#6b7280', marginTop: 3 }}>
                    {[p.national_id, p.job_title, p.project].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <i className="ti ti-chevron-right" style={{ color: '#9ca3af' }} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <button className="m-btn" style={{ flex: 'none', marginBottom: 12 }} onClick={back}>← Search again</button>
      <div className="m-card">
        <div className="m-card-title">{person.full_name}</div>
        <div className="m-card-sub">
          {[person.national_id, person.job_title].filter(Boolean).join(' · ')}<br />
          {[person.project, person.client, person.organization].filter(Boolean).join(' · ')}
        </div>
      </div>

      {error && <div className="m-error">{error}</div>}
      {loading ? <div className="m-empty">Loading…</div>
        : !records.length ? <div className="m-empty">No training records.</div>
        : records.map(r => {
          const st = stateOf(r);
          return (
            <div className="m-card" key={r.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div className="m-card-title" style={{ fontSize: 14 }}>{r.course_name}</div>
                <span style={{ background: st.bg, color: st.fg, borderRadius: 999, padding: '3px 9px',
                               fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{st.label}</span>
              </div>
              <div className="m-card-sub">
                {r.status === 'completed'
                  ? (r.expiry_date ? `Completed ${fmtDate(r.completed_at)} · expires ${fmtDate(r.expiry_date)}`
                                   : `Completed ${fmtDate(r.completed_at)} · no expiry`)
                  : (r.pending_reason || 'Waiting')}
              </div>
              {r.has_certificate && (
                <div className="m-card-actions">
                  <button className="m-btn" onClick={() => openCert(r)}>View certificate</button>
                </div>
              )}
            </div>
          );
        })}

      {cert && (
        <div className="m-sheet">
          <div className="m-sheet-bar">
            <span>{cert.course_name}</span>
            <button className="m-topbar-link" onClick={closeCert}>Close</button>
          </div>
          <div className="m-sheet-body">
            {certError ? <div className="m-empty" style={{ color: '#fca5a5' }}>{certError}</div>
              : !certUrl ? <div className="m-empty">Loading…</div>
              : isImage(cert.original_filename)
                ? <img src={certUrl} alt={cert.course_name} />
                : <iframe src={certUrl} title={cert.course_name} />}
          </div>
        </div>
      )}
    </>
  );
}
