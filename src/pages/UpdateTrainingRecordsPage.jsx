import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { logError } from '../utils/api';
import TrainingIcon from '../components/TrainingIcon';
import DateInput from '../components/DateInput';

const OPEN_STATUSES = 'requested,scheduled,pending';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—';
const STATUS_TAG = {
  requested: 'tag-navy', scheduled: 'tag-navy', pending: 'tag-amber',
  completed: 'tag-green', cancelled: 'tag-red', cancel: 'tag-red', not_eligible: 'tag-gray', exit: 'tag-gray',
};

// Completed records narrowed by the derived expiry state. NB "expired" is NOT
// here: it maps to the renewal REQUESTS, not completed certs (handled in rowParams).
const EXPIRY_VIEWS = { valid: 'valid', expiring: 'expiring', superseded: 'superseded' };
const VIEW_TITLE = {
  '': 'Employees with an open request', all: 'All records',
  valid: 'Valid certificates', expiring: 'Expiring within 60 days',
  expired: 'Expired — renewal requested', superseded: 'Previous certificates',
  completed: 'Completed records',
};

// Was this certificate already past its expiry? A superseded record keeps its
// real state ("Expired"), so we need this rather than the live expiry bucket
// (which excludes superseded rows on purpose).
const isPastExpiry = (r) => r.expiry_date && new Date(r.expiry_date).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);

// A completed record is shown by its expiry state, not a flat green "Completed" --
// an expired certificate must never read as fine at a glance. A superseded
// (renewed-over) record is history: it keeps its own state, just muted.
const rowTag = (r) => {
  if (r.status !== 'completed') return STATUS_TAG[r.status] || 'tag-gray';
  if (r.expiry_state === 'superseded') return 'tag-gray';
  if (r.expiry_state === 'expired') return 'tag-red';
  if (r.expiry_state === 'expiring') return 'tag-amber';
  return 'tag-green';
};
const rowLabel = (r) => {
  if (r.status !== 'completed') return titleCase(r.status);
  // History keeps the label it earned -- an expired cert stays "Expired", it is
  // never relabelled "Renewed"; the renewal is the separate new record.
  if (r.expiry_state === 'superseded') return isPastExpiry(r) ? 'Expired' : 'Previous';
  if (r.expiry_state === 'expired') return 'Expired';
  if (r.expiry_state === 'expiring') return 'Expiring Soon';
  return 'Completed';
};
const rowExpiryNote = (r) => {
  if (r.status !== 'completed' || !r.expiry_date) return null;
  if (r.expiry_state === 'superseded') return isPastExpiry(r)
    ? { text: `Expired on ${fmtDate(r.expiry_date)}`, color: '#9ca3af' }
    : { text: `Superseded · was valid to ${fmtDate(r.expiry_date)}`, color: '#9ca3af' };
  if (r.expiry_state === 'expired') return { text: `Expired ${fmtDate(r.expiry_date)}`, color: '#c0392b' };
  if (r.expiry_state === 'expiring') return { text: `Expires ${fmtDate(r.expiry_date)}`, color: '#B26B00' };
  return { text: `Valid until ${fmtDate(r.expiry_date)}`, color: '#9ca3af' };
};
const toInputDate = (d) => d ? new Date(d).toISOString().slice(0, 10) : '';
const titleCase = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());

// Default to active employees (matches the Employees list default).
const EMPTY_FILTERS = { search: '', national_id: '', job_title: '', employment_status: 'active', resource_type: '', department: '', project: '', client: '', current_status: '' };

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
  const [summary, setSummary] = useState({});   // per-course expired/expiring/open counts
  const [stats, setStats] = useState(null);     // counts for the selected course

  // Filters for the open-request list (mirrors the Employees bar, minus SAN/Last Audit)
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filterOptions, setFilterOptions] = useState({ projects: [], departments: [], clients: [] });

  // Outcome modal
  const [modal, setModal] = useState(null); // the record being recorded
  const [outcome, setOutcome] = useState('completed');
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/training-courses').then(r => setCourses(r.data)).catch(logError);
    api.get('/training-pending-reasons').then(r => setReasons(r.data)).catch(logError);
    api.get('/employees/filter-options').then(r => setFilterOptions(r.data)).catch(logError);
    loadSummary();
  }, []);

  // Per-course expired / expiring / open counts for the tile grid, so the renewal
  // backlog is visible before a training is even picked.
  const loadSummary = () => {
    api.get('/training-records/expiry-summary')
      .then(r => setSummary(Object.fromEntries(r.data.map(s => [s.course_id, s]))))
      .catch(logError);
  };

  const rowParams = (courseId) => {
    const cs = filters.current_status;
    const view = EXPIRY_VIEWS[cs];
    const base = { course_id: courseId, page: '1', pageSize: '100' };
    // Everywhere but "All records", the raw expired certificate line is hidden
    // (its renewal request stands in for it in the working views).
    if (cs !== 'all') base.hide_expired_cert = '1';
    if (cs === 'expired') {
      base.expiry = 'renewal_due';        // → the renewal requests (Status Requested + "Expired on")
    } else if (view) {
      base.status = 'completed';          // valid / expiring / superseded certs
    } else if (cs === '') {
      base.status = OPEN_STATUSES;        // default worklist = genuine new requests only
      base.new_only = '1';
    } else if (cs !== 'all') {
      base.status = cs;                   // requested / scheduled / pending / not_eligible / cancelled
    }
    const p = new URLSearchParams(base);
    if (view) p.append('expiry', view);
    if (filters.search) p.append('search', filters.search);
    if (filters.national_id) p.append('national_id', filters.national_id);
    if (filters.job_title) p.append('job_title', filters.job_title);
    if (filters.employment_status) p.append('employment_status', filters.employment_status);
    if (filters.resource_type) p.append('resource_type', filters.resource_type);
    if (filters.department) p.append('department', filters.department);
    if (filters.project) p.append('projects', filters.project);
    if (filters.client) p.append('clients', filters.client);
    return p;
  };

  const loadRows = (courseId) => {
    setLoading(true);
    const p = rowParams(courseId);
    api.get('/training-records/tracker?' + p)
      .then(r => setRows(r.data.rows))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
    // /stats drops the status+expiry filters itself, so the same params give the
    // full picture for this course under the current people-filters.
    api.get('/training-records/stats?' + p).then(r => setStats(r.data)).catch(() => setStats(null));
  };

  // Re-query when a filter changes (only while a course is selected).
  useEffect(() => { if (selectedCourse) loadRows(selectedCourse.id); /* eslint-disable-next-line */ }, [filters]);

  const selectCourse = (c) => { setSelectedCourse(c); loadRows(c.id); };

  // mode 'record' edits this record in place; mode 'renew' creates a NEW completed
  // record and leaves this one as history (see POST /training-records/:id/renew).
  const openModal = (rec, mode = 'record') => {
    setModal({ ...rec, mode });
    if (mode === 'renew') {
      setOutcome('completed');
      setForm({ completed_at: '', pending_reason: '', scheduled_date: '', not_eligible_reason: '' });
      setError('');
      return;
    }
    // Start on the record's own outcome so an already-recorded one (e.g. a valid
    // certificate) opens with its current values, ready to correct.
    const known = ['completed', 'pending', 'scheduled', 'not_eligible'];
    setOutcome(known.includes(rec.status) ? rec.status : 'completed');
    setForm({
      completed_at: toInputDate(rec.completed_at),
      pending_reason: rec.pending_reason || '',
      scheduled_date: toInputDate(rec.scheduled_date),
      not_eligible_reason: rec.not_eligible_reason || '',
    });
    setError('');
  };

  const isRenew = modal?.mode === 'renew';
  const validity = selectedCourse?.validity_months;
  // A renewal dated on/before the previous completion is rejected, so don't
  // preview an expiry the save can't produce.
  const renewDateInvalid = isRenew && !!form.completed_at && !!modal.completed_at &&
    new Date(form.completed_at) <= new Date(modal.completed_at);
  const expiryPreview = (outcome === 'completed' && form.completed_at && validity && !renewDateInvalid)
    ? addMonths(form.completed_at, validity).toLocaleDateString('en-GB') : null;

  const canSave = () => {
    if (isRenew) {
      if (!form.completed_at || validity == null) return false;
      // The server enforces this too; checking here keeps the button honest.
      return !modal.completed_at || new Date(form.completed_at) > new Date(modal.completed_at);
    }
    if (outcome === 'completed') return !!form.completed_at && validity != null;
    if (outcome === 'pending') return !!form.pending_reason;
    if (outcome === 'scheduled') return !!form.scheduled_date;
    if (outcome === 'not_eligible') return !!form.not_eligible_reason.trim();
    return false;
  };

  const submit = async () => {
    if (!modal) return;
    setSaving(true); setError('');
    try {
      if (isRenew) {
        await api.post(`/training-records/${modal.id}/renew`, { completed_at: form.completed_at });
        setSuccessMsg(`${modal.employee_name} — ${selectedCourse.name} renewed. The previous (expired) certificate stays on file as history.`);
      } else {
        const payload = { status: outcome };
        if (outcome === 'completed') { payload.completed_at = form.completed_at; }
        else if (outcome === 'pending') payload.pending_reason = form.pending_reason;
        else if (outcome === 'scheduled') payload.scheduled_date = form.scheduled_date;
        else if (outcome === 'not_eligible') payload.not_eligible_reason = form.not_eligible_reason;
        await api.put(`/training-records/${modal.id}/update`, payload);
        setSuccessMsg(`${modal.employee_name} — ${selectedCourse.name} marked ${titleCase(outcome)}.`);
      }
      setTimeout(() => setSuccessMsg(''), 3500);
      setModal(null);
      loadRows(selectedCourse.id);
      loadSummary();
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
                      {/* What this training needs from HR right now. */}
                      <span style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                        {summary[c.id]?.open > 0 && <span className="tag tag-navy">{summary[c.id].open} open</span>}
                        {summary[c.id]?.expired > 0 && <span className="tag tag-red">{summary[c.id].expired} expired</span>}
                        {summary[c.id]?.expiring > 0 && <span className="tag tag-amber">{summary[c.id].expiring} expiring</span>}
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
            <div style={{ background: '#F0F7FF', outline: '2px solid var(--eg-navy)', boxShadow: 'var(--wf-shadow-hover)', borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <span style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 14, background: 'var(--eg-navy)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrainingIcon iconKey={selectedCourse.icon} name={selectedCourse.name} size={36} color="white" />
              </span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontWeight: 600, fontSize: 16, color: '#0f2a4a' }}>{selectedCourse.name}</div>
                <div style={{ fontSize: 12, color: selectedCourse.validity_months ? '#6b7280' : '#c0392b' }}>
                  {selectedCourse.validity_months
                    ? `Validity ${selectedCourse.validity_months} months`
                    : '⚠ No validity period set — completion is blocked until you set one in Admin → Training Courses'}
                </div>
              </div>
              {/* Worklist: what needs actioning for this training. Each chip is a filter. */}
              {stats && (
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {[
                    { key: '', label: 'Open requests', value: stats.open || 0, tag: 'tag-navy' },
                    { key: 'expired', label: 'Expired', value: stats.renewal_due || 0, tag: 'tag-red' },
                    { key: 'expiring', label: 'Expiring ≤60d', value: stats.expiring || 0, tag: 'tag-amber' },
                  ].map(chip => (
                    <button key={chip.key || 'open'} onClick={() => setFilters(p => ({ ...p, current_status: chip.key }))}
                      title={`Show ${chip.label.toLowerCase()}`}
                      style={{
                        cursor: 'pointer', textAlign: 'center', minWidth: 96, padding: '8px 12px', borderRadius: 10,
                        background: 'white', border: `1.5px solid ${filters.current_status === chip.key ? 'var(--eg-navy)' : '#e5e7eb'}`,
                        boxShadow: filters.current_status === chip.key ? 'var(--wf-shadow-hover)' : 'none',
                      }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#0f2a4a' }}>{chip.value}</div>
                      <div style={{ marginTop: 2 }}><span className={`tag ${chip.tag}`}>{chip.label}</span></div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search + filter bar (Employees-style, minus SAN & Last Audit) */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', flexShrink: 0, paddingTop: 6 }}>Search</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <input className="form-input" placeholder="Search name..." value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 150 }} />
                    <input className="form-input" placeholder="Search national ID..." value={filters.national_id} onChange={e => setFilters(p => ({ ...p, national_id: e.target.value }))} style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 140 }} />
                    <input className="form-input" placeholder="Search job title..." value={filters.job_title} onChange={e => setFilters(p => ({ ...p, job_title: e.target.value }))} style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 140 }} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', flexShrink: 0, paddingTop: 6 }}>Filter</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 120 }} value={filters.employment_status} onChange={e => setFilters(p => ({ ...p, employment_status: e.target.value }))}>
                      <option value="">All Status</option><option value="active">Active</option><option value="exit">Exit</option>
                    </select>
                    <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 120 }} value={filters.resource_type} onChange={e => setFilters(p => ({ ...p, resource_type: e.target.value }))}>
                      <option value="">All Resources</option><option value="inhouse">Inhouse</option><option value="outsource">Outsource</option><option value="intern">Intern</option>
                    </select>
                    <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 130 }} value={filters.department} onChange={e => setFilters(p => ({ ...p, department: e.target.value }))}>
                      <option value="">All Departments</option>
                      {filterOptions.departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 150 }} value={filters.project} onChange={e => setFilters(p => ({ ...p, project: e.target.value }))}>
                      <option value="">All Projects</option>
                      {filterOptions.projects.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 120 }} value={filters.client} onChange={e => setFilters(p => ({ ...p, client: e.target.value }))}>
                      <option value="">All Clients</option>
                      {(filterOptions.clients || []).map(cl => <option key={cl} value={cl}>{cl}</option>)}
                    </select>
                    <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 170 }} value={filters.current_status} onChange={e => setFilters(p => ({ ...p, current_status: e.target.value }))} title="Training status">
                      <option value="all">All records</option>
                      <optgroup label="Open requests">
                        <option value="">All open requests</option>
                        <option value="requested">Requested</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="pending">Pending</option>
                      </optgroup>
                      <optgroup label="Completed certificates">
                        <option value="valid">Valid</option>
                        <option value="expiring">Expiring soon (≤60d)</option>
                        <option value="expired">Expired</option>
                        <option value="superseded">Previous (renewed over)</option>
                        <option value="completed">All completed</option>
                      </optgroup>
                      <optgroup label="Other outcomes">
                        <option value="not_eligible">Not eligible</option>
                        <option value="cancelled">Cancelled</option>
                      </optgroup>
                    </select>
                    <button className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12 }} onClick={() => setFilters(EMPTY_FILTERS)}>✕ Clear</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">{VIEW_TITLE[filters.current_status] || (filters.current_status ? `${titleCase(filters.current_status)} records` : 'Employees with an open request')}</span>
                <span className="tag tag-navy">{rows.length}</span>
              </div>
              <table className="table-hover-soft">
                <thead><tr><th>Employee</th><th>Project / Client</th><th>Requested</th><th>Current Status</th><th>Last Update (HR)</th><th></th></tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td>
                        <div className="emp-cell"><div>
                          <div className="emp-name">{r.employee_name}</div>
                          <div className="emp-id">{r.national_id || r.employee_number || '—'}</div>
                          {r.job_title ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.job_title}</div> : ''}
                        </div></div>
                      </td>
                      <td>{r.project || '—'}{r.client ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.client}</div> : ''}</td>
                      <td>{fmtDate(r.requested_at)}{r.requested_by_name ? <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.requested_by_name}</div> : (r.prior_expiry_date ? <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Auto · on expiry</div> : '')}</td>
                      <td>
                        <span className={`tag ${rowTag(r)}`}>{rowLabel(r)}</span>
                        {r.status === 'pending' && r.pending_reason ? <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.pending_reason}</div> : ''}
                        {r.status === 'scheduled' && r.scheduled_date ? <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{fmtDate(r.scheduled_date)}</div> : ''}
                        {/* Auto-opened renewal request: show which certificate expired. */}
                        {r.prior_expiry_date && ['requested', 'scheduled', 'pending'].includes(r.status) ? <div style={{ fontSize: 11, color: '#c0392b', marginTop: 2 }}>Expired on {fmtDate(r.prior_expiry_date)}</div> : ''}
                        {rowExpiryNote(r) ? <div style={{ fontSize: 11, color: rowExpiryNote(r).color, marginTop: 2 }}>{rowExpiryNote(r).text}</div> : ''}
                      </td>
                      <td>
                        {r.recorded_at
                          ? <>{fmtDate(r.recorded_at)}{r.recorded_by_name ? <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.recorded_by_name}</div> : ''}</>
                          : <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {r.expiry_state === 'superseded'
                          // History: the renewal request / current cert is the row to act on.
                          ? <span style={{ fontSize: 11, color: '#9ca3af' }}>History</span>
                          : r.expiry_state === 'expired'
                            // Reference line (All records only). The renewal happens on its
                            // auto-opened request under Expired, so no action here.
                            ? <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>
                            : r.expiry_state === 'expiring'
                              // Not expired yet: allow a proactive early renewal.
                              ? <>
                                  <button className="btn btn-primary btn-sm" onClick={() => openModal(r, 'renew')}>Renew →</button>
                                  <button className="btn btn-sm" style={{ marginLeft: 6 }} title="Correct this certificate without replacing it" onClick={() => openModal(r)}>Edit</button>
                                </>
                              : <button className="btn btn-primary btn-sm" onClick={() => openModal(r)}>{['requested', 'scheduled', 'pending'].includes(r.status) ? 'Record →' : 'Edit →'}</button>}
                      </td>
                    </tr>
                  ))}
                  {!loading && !rows.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#6b7280', padding: 32 }}>No {filters.current_status ? `${titleCase(filters.current_status).toLowerCase()} ` : 'open '}records for this training</td></tr>}
                  {loading && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>Loading…</td></tr>}
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
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a4a' }}>{isRenew ? `Renew — ${selectedCourse.name}` : selectedCourse.name}</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6, marginBottom: 16 }}>{modal.employee_name} · {modal.national_id || modal.employee_number || '—'}</div>

            {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}

            {isRenew ? (
              <div style={{ background: '#F0F7FF', border: '1px solid var(--eg-navy)', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12, color: '#0f2a4a' }}>
                Previous certificate: completed <b>{fmtDate(modal.completed_at)}</b>,
                {modal.expiry_state === 'expired' ? ' expired ' : ' expires '}
                <b style={{ color: modal.expiry_state === 'expired' ? '#c0392b' : '#B26B00' }}>{fmtDate(modal.expiry_date)}</b>.
                <div style={{ marginTop: 4, color: '#6b7280' }}>This creates a <b>new</b> record. The previous certificate stays on file as history, keeping its Expired status.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                {OUTCOMES.map(o => (
                  <button key={o.key} className={`btn btn-sm ${outcome === o.key ? 'btn-primary' : ''}`} onClick={() => { setOutcome(o.key); setError(''); }}>{o.label}</button>
                ))}
              </div>
            )}

            {outcome === 'completed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {validity == null && (
                  <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
                    No validity period is set for this training, so an expiry can't be computed. Set one in Admin → Training Courses first.
                  </div>
                )}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{isRenew ? 'New Completion Date' : 'Completion Date'} <span style={{ color: '#e24b4a' }}>*</span></label>
                  <DateInput value={form.completed_at} onChange={v => setForm(f => ({ ...f, completed_at: v }))} style={{ height: 38 }} />
                  {renewDateInvalid &&
                    <div style={{ fontSize: 12, color: '#c0392b', marginTop: 6 }}>The renewal must be dated after the previous completion ({fmtDate(modal.completed_at)}).</div>}
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
                <DateInput value={form.scheduled_date} onChange={v => setForm(f => ({ ...f, scheduled_date: v }))} style={{ height: 38 }} />
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
              {/* The base .btn-primary gives no disabled affordance, so state it here. */}
              <button className="btn btn-primary" onClick={submit} disabled={saving || !canSave()}
                style={(saving || !canSave()) ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}>
                {saving ? 'Saving...' : isRenew ? 'Save Renewal' : 'Save Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
