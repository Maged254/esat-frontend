import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { logError } from '../utils/api';
import TrainingIcon from '../components/TrainingIcon';
import DateInput from '../components/DateInput';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—';
const STATUS_TAG = {
  requested: 'tag-navy', scheduled: 'tag-navy', pending: 'tag-amber',
  completed: 'tag-green', cancelled: 'tag-red', cancel: 'tag-red', not_eligible: 'tag-gray', exit: 'tag-gray',
};

// The four certificate-lifecycle groups (see backend GROUP_SQL), plus the raw
// "All records" dump. These are the only filter values now.
const VIEW_TITLE = {
  all: 'All records',
  valid: 'Valid certificates', outstanding: 'Pending certificates',
  expiring: 'Certificates expiring soon', archived: 'Archived certificates',
};

// A record is Archived (a reference line, no action) when it belongs to an exited
// employee, was cancelled, or is a completed cert that has expired or been
// replaced. Mirrors GRP_ARCHIVED_SQL on the backend.
const isArchivedRow = (r) =>
  r.employment_status === 'exit' || r.status === 'cancelled' ||
  (r.status === 'completed' && (r.expiry_state === 'expired' || r.expiry_state === 'superseded'));

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

// Land on the actionable bucket; employment status is baked into the groups now.
const EMPTY_FILTERS = { search: '', national_id: '', job_title: '', resource_type: '', department: '', project: '', client: '', group: 'outstanding' };

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

  // People/scope filters shared by the list and the stat chips.
  const appendPeopleFilters = (p) => {
    if (filters.search) p.append('search', filters.search);
    if (filters.national_id) p.append('national_id', filters.national_id);
    if (filters.job_title) p.append('job_title', filters.job_title);
    if (filters.resource_type) p.append('resource_type', filters.resource_type);
    if (filters.department) p.append('department', filters.department);
    if (filters.project) p.append('projects', filters.project);
    if (filters.client) p.append('clients', filters.client);
    return p;
  };

  const rowParams = (courseId) => {
    // filters.group is either a group key ('valid'|'outstanding'|'expiring'|
    // 'archived'|'all') or "group:substate" to narrow within a group.
    const [grp, sub] = (filters.group || '').split(':');
    const base = { course_id: courseId, page: '1', pageSize: '100' };
    if (grp && grp !== 'all') base.group = grp;
    // Sub-state = an extra AND on top of the group, via the existing params.
    if (sub) {
      if (grp === 'outstanding') base.status = sub;                 // requested / scheduled / pending / not_eligible
      else if (grp === 'archived') {
        if (sub === 'expired' || sub === 'superseded') base.expiry = sub;
        else if (sub === 'cancelled') base.status = 'cancelled';
        else if (sub === 'exited') base.employment_status = 'exit';
      }
    }
    return appendPeopleFilters(new URLSearchParams(base));
  };

  // Chips always show the group totals for the current people-filters, so the
  // stat query ignores the group/sub-state selection entirely.
  const statParams = (courseId) => appendPeopleFilters(new URLSearchParams({ course_id: courseId }));

  const loadRows = (courseId) => {
    setLoading(true);
    api.get('/training-records/tracker?' + rowParams(courseId))
      .then(r => setRows(r.data.rows))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
    api.get('/training-records/stats?' + statParams(courseId)).then(r => setStats(r.data)).catch(() => setStats(null));
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
  // The chosen group without any ":substate" suffix (drives chip highlight + title).
  const baseGroup = (filters.group || 'all').split(':')[0];
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
                      {/* Snapshot: how many valid certificates, and how many still pending. */}
                      <span style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                        {summary[c.id]?.valid > 0 && <span className="tag tag-green">{summary[c.id].valid} valid</span>}
                        {summary[c.id]?.outstanding > 0 && <span className="tag tag-red">{summary[c.id].outstanding} pending</span>}
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
              {/* The four certificate groups. Each chip is a filter. */}
              {stats && (
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {[
                    { key: 'valid', label: 'Valid', value: stats.grp_valid || 0, tag: 'tag-green' },
                    { key: 'outstanding', label: 'Pending', value: stats.grp_outstanding || 0, tag: 'tag-red' },
                    { key: 'expiring', label: 'Expiring ≤60d', value: stats.grp_expiring || 0, tag: 'tag-amber' },
                  ].map(chip => (
                    <button key={chip.key} onClick={() => setFilters(p => ({ ...p, group: chip.key }))}
                      title={`Show ${chip.label.toLowerCase()}`}
                      style={{
                        cursor: 'pointer', textAlign: 'center', minWidth: 92, padding: '8px 12px', borderRadius: 10,
                        background: 'white', border: `1.5px solid ${baseGroup === chip.key ? 'var(--eg-navy)' : '#e5e7eb'}`,
                        boxShadow: baseGroup === chip.key ? 'var(--wf-shadow-hover)' : 'none',
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
                    <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 200 }} value={filters.group} onChange={e => setFilters(p => ({ ...p, group: e.target.value }))} title="Certificate group">
                      <option value="all">All Records</option>
                      <optgroup label="Valid Certificates">
                        <option value="valid">All Valid</option>
                      </optgroup>
                      <optgroup label="Pending Certificates">
                        <option value="outstanding">All Pending</option>
                        <option value="outstanding:requested">Requested</option>
                        <option value="outstanding:scheduled">Scheduled</option>
                        <option value="outstanding:pending">Pending</option>
                        <option value="outstanding:not_eligible">Not eligible</option>
                      </optgroup>
                      <optgroup label="Certificates Expiring Soon">
                        <option value="expiring">All Expiring soon</option>
                      </optgroup>
                      <optgroup label="Archived Certificates">
                        <option value="archived">All Archived</option>
                        <option value="archived:expired">Expired</option>
                        <option value="archived:superseded">Renewed over</option>
                        <option value="archived:cancelled">Cancelled</option>
                        <option value="archived:exited">Exited employee</option>
                      </optgroup>
                    </select>
                    <button className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12 }} onClick={() => setFilters(EMPTY_FILTERS)}>✕ Clear</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">{VIEW_TITLE[baseGroup] || 'All records'}</span>
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
                        {r.status === 'cancelled' && r.cancel_reason ? <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.cancel_reason}</div> : ''}
                        {r.employment_status === 'exit' ? <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Employee exited</div> : ''}
                      </td>
                      <td>
                        {r.recorded_at
                          ? <>{fmtDate(r.recorded_at)}{r.recorded_by_name ? <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.recorded_by_name}</div> : ''}</>
                          : <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {isArchivedRow(r)
                          // Archived = reference only (expired / replaced / cancelled / exited).
                          // The renewal, if any, is its own Outstanding request.
                          ? <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>
                          : r.expiry_state === 'expiring'
                            // Not expired yet: allow a proactive early renewal.
                            ? <>
                                <button className="btn btn-primary btn-sm" onClick={() => openModal(r, 'renew')}>Renew →</button>
                                <button className="btn btn-sm" style={{ marginLeft: 6 }} title="Correct this certificate without replacing it" onClick={() => openModal(r)}>Update</button>
                              </>
                            : <button className="btn btn-primary btn-sm" onClick={() => openModal(r)}>Update →</button>}
                      </td>
                    </tr>
                  ))}
                  {!loading && !rows.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#6b7280', padding: 32 }}>No {(VIEW_TITLE[baseGroup] || 'records').toLowerCase()} for this training</td></tr>}
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
