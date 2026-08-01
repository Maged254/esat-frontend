import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { logError } from '../utils/api';
import TrainingIcon from '../components/TrainingIcon';

const OPEN_STATUSES = 'requested,scheduled,pending';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—';
const STATUS_TAG = {
  requested: 'tag-navy', scheduled: 'tag-navy', pending: 'tag-amber',
};
const titleCase = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());

// Add N whole months to a yyyy-mm-dd date string, returned as a Date.
const addMonths = (dateStr, months) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + Number(months));
  return d;
};

export default function UpdateTrainingRecordsPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [hoveredId, setHoveredId] = useState(null);

  // Outcome modal
  const [modal, setModal] = useState(null); // the record being recorded
  const [outcome, setOutcome] = useState('completed');
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/training-courses').then(r => setCourses(r.data)).catch(logError);
    api.get('/training-pending-reasons').then(r => setReasons(r.data)).catch(logError);
  }, []);

  const loadRows = (courseId) => {
    setLoading(true);
    const p = new URLSearchParams({ course_id: courseId, status: OPEN_STATUSES, page: '1', pageSize: '100' });
    api.get('/training-records/tracker?' + p)
      .then(r => setRows(r.data.rows))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  const selectCourse = (c) => { setSelectedCourse(c); loadRows(c.id); };

  const openModal = (rec) => {
    setModal(rec);
    setOutcome('completed');
    setForm({ completed_at: '', pending_reason: '', scheduled_date: '', not_eligible_reason: '' });
    setError('');
  };

  const validity = selectedCourse?.validity_months;
  const expiryPreview = (outcome === 'completed' && form.completed_at && validity)
    ? addMonths(form.completed_at, validity).toLocaleDateString('en-GB') : null;

  const canSave = () => {
    if (outcome === 'completed') return !!form.completed_at && validity != null;
    if (outcome === 'pending') return !!form.pending_reason;
    if (outcome === 'scheduled') return !!form.scheduled_date;
    if (outcome === 'not_eligible') return !!form.not_eligible_reason.trim();
    return false;
  };

  const submit = async () => {
    if (!modal) return;
    setSaving(true); setError('');
    const payload = { status: outcome };
    if (outcome === 'completed') { payload.completed_at = form.completed_at; }
    else if (outcome === 'pending') payload.pending_reason = form.pending_reason;
    else if (outcome === 'scheduled') payload.scheduled_date = form.scheduled_date;
    else if (outcome === 'not_eligible') payload.not_eligible_reason = form.not_eligible_reason;
    try {
      await api.put(`/training-records/${modal.id}/update`, payload);
      setSuccessMsg(`${modal.employee_name} — ${selectedCourse.name} marked ${titleCase(outcome)}.`);
      setTimeout(() => setSuccessMsg(''), 3500);
      setModal(null);
      loadRows(selectedCourse.id);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const OUTCOMES = [
    { key: 'completed', label: 'Completed' },
    { key: 'pending', label: 'Pending' },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'not_eligible', label: 'Not Eligible' },
  ];

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Update Training Records</span>
        </div>
        <div className="topbar-right">
          {selectedCourse && <button className="btn" onClick={() => { setSelectedCourse(null); setRows([]); }}>← All trainings</button>}
        </div>
      </div>

      <div className="content graphs-content">
        {successMsg && (
          <div style={{ background: '#EAF3DE', color: '#3B6D11', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>✓ {successMsg}</div>
        )}

        {!selectedCourse && (
          <div className="card">
            <div className="card-header"><span className="card-title">Select a training type</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18, padding: 20 }}>
              {courses.map(c => {
                const hovered = hoveredId === c.id;
                return (
                  <button key={c.id}
                    onClick={() => selectCourse(c)}
                    onMouseEnter={() => setHoveredId(c.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      textAlign: 'center', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
                      padding: '32px 22px', borderRadius: 18,
                      border: `1.5px solid ${hovered ? 'var(--eg-navy)' : '#e5e7eb'}`,
                      background: hovered ? '#F0F7FF' : 'white',
                      boxShadow: hovered ? '0 10px 26px rgba(4,44,83,0.16)' : '0 1px 2px rgba(0,0,0,0.04)',
                      transform: hovered ? 'translateY(-3px)' : 'none',
                      transition: 'all 0.15s ease',
                    }}>
                    <span style={{
                      flexShrink: 0, width: 112, height: 112, borderRadius: 28,
                      background: hovered ? 'var(--eg-navy)' : '#F0F7FF',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s ease',
                    }}>
                      <TrainingIcon iconKey={c.icon} name={c.name} size={70} color={hovered ? 'white' : 'var(--eg-navy)'} />
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, color: '#0f2a4a', fontSize: 17, lineHeight: 1.3 }}>{c.name}</span>
                      <span style={{ fontSize: 13, color: c.validity_months ? '#6b7280' : '#c0392b' }}>
                        {c.validity_months ? `Valid ${c.validity_months} months` : '⚠ No validity set'}
                      </span>
                    </span>
                  </button>
                );
              })}
              {courses.length === 0 && <div style={{ color: '#9ca3af', fontSize: 13 }}>No active training types.</div>}
            </div>
          </div>
        )}

        {selectedCourse && (
          <>
            <div style={{ background: '#f3f4f6', border: '0.5px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{selectedCourse.name}</div>
                <div style={{ fontSize: 12, color: selectedCourse.validity_months ? '#6b7280' : '#c0392b' }}>
                  {selectedCourse.validity_months
                    ? `Validity ${selectedCourse.validity_months} months — completion auto-computes expiry`
                    : '⚠ No validity period set — completion is blocked until you set one in Admin → Training Courses'}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">Employees with an open request</span>
                <span className="tag tag-navy">{rows.length}</span>
              </div>
              <table className="table-hover-soft">
                <thead><tr><th>Employee</th><th>Project / Client</th><th>Requested</th><th>Current Status</th><th></th></tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td>
                        <div className="emp-cell"><div>
                          <div className="emp-name">{r.employee_name}</div>
                          <div className="emp-id">{r.national_id || r.employee_number || '—'}{r.job_title ? ` · ${r.job_title}` : ''}</div>
                        </div></div>
                      </td>
                      <td>{r.project || '—'}{r.client ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.client}</div> : ''}</td>
                      <td>{fmtDate(r.requested_at)}</td>
                      <td>
                        <span className={`tag ${STATUS_TAG[r.status] || 'tag-gray'}`}>{titleCase(r.status)}</span>
                        {r.status === 'pending' && r.pending_reason ? <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.pending_reason}</div> : ''}
                        {r.status === 'scheduled' && r.scheduled_date ? <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{fmtDate(r.scheduled_date)}</div> : ''}
                      </td>
                      <td><button className="btn btn-primary btn-sm" onClick={() => openModal(r)}>Record →</button></td>
                    </tr>
                  ))}
                  {!loading && !rows.length && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#6b7280', padding: 32 }}>No open requests for this training</td></tr>}
                  {loading && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>Loading…</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Outcome modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setModal(null)}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 460, maxWidth: '92vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a4a' }}>{selectedCourse.name}</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>{modal.employee_name} · {modal.national_id || modal.employee_number || '—'}</div>

            {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {OUTCOMES.map(o => (
                <button key={o.key} className={`btn btn-sm ${outcome === o.key ? 'btn-primary' : ''}`} onClick={() => { setOutcome(o.key); setError(''); }}>{o.label}</button>
              ))}
            </div>

            {outcome === 'completed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {validity == null && (
                  <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
                    No validity period is set for this training, so an expiry can't be computed. Set one in Admin → Training Courses first.
                  </div>
                )}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Completion Date <span style={{ color: '#e24b4a' }}>*</span></label>
                  <input className="form-input" type="date" value={form.completed_at} onChange={e => setForm(f => ({ ...f, completed_at: e.target.value }))} style={{ height: 38 }} />
                  {expiryPreview && <div style={{ fontSize: 12, color: '#3B6D11', marginTop: 6 }}>Expiry will be <b>{expiryPreview}</b> ({validity} months).</div>}
                </div>
              </div>
            )}

            {outcome === 'pending' && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Pending Reason <span style={{ color: '#e24b4a' }}>*</span></label>
                <select className="form-select" value={form.pending_reason} onChange={e => setForm(f => ({ ...f, pending_reason: e.target.value }))} style={{ height: 38 }}>
                  <option value="">Select a reason...</option>
                  {reasons.map(r => <option key={r.id} value={r.label}>{r.label}</option>)}
                </select>
                {reasons.length === 0 && <div style={{ fontSize: 12, color: '#c0392b', marginTop: 6 }}>No pending reasons defined. Add them in Admin → Training Pending Reasons.</div>}
              </div>
            )}

            {outcome === 'scheduled' && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Scheduled Date <span style={{ color: '#e24b4a' }}>*</span></label>
                <input className="form-input" type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} style={{ height: 38 }} />
              </div>
            )}

            {outcome === 'not_eligible' && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Reason <span style={{ color: '#e24b4a' }}>*</span></label>
                <input className="form-input" value={form.not_eligible_reason} onChange={e => setForm(f => ({ ...f, not_eligible_reason: e.target.value }))} placeholder="Why is this employee not eligible?" style={{ height: 38 }} />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={submit} disabled={saving || !canSave()}>{saving ? 'Saving...' : 'Save outcome'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
