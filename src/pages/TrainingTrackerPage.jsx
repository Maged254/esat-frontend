import React, { useEffect, useState } from 'react';
import api, { logError } from '../utils/api';

// Known status values (the lifecycle is still being finalised, so anything
// unrecognised falls back to a neutral title-cased tag).
const STATUS_META = {
  requested:    { label: 'Requested',    cls: 'tag-navy' },
  scheduled:    { label: 'Scheduled',    cls: 'tag-navy' },
  pending:      { label: 'Pending',      cls: 'tag-amber' },
  completed:    { label: 'Completed',    cls: 'tag-green' },
  cancelled:    { label: 'Cancelled',    cls: 'tag-red' },
  cancel:       { label: 'Cancelled',    cls: 'tag-red' },
  not_eligible: { label: 'Not Eligible', cls: 'tag-gray' },
  exit:         { label: 'Exit',         cls: 'tag-gray' },
};
const titleCase = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

const EMPTY_FILTERS = { status: '', expiry: '', search: '', national_id: '', job_title: '', course_id: '', resource_type: '', department: '', project: '', client: '', organization: '' };

export default function TrainingTrackerPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [stats, setStats] = useState({ total: 0, requested: 0, scheduled: 0, pending: 0, completed: 0, expiring: 0, expired: 0 });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [courses, setCourses] = useState([]);
  const [filterOptions, setFilterOptions] = useState({ projects: [], departments: [], clients: [], organizations: [] });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get('/training-courses').then(r => setCourses(r.data)).catch(logError);
    api.get('/employees/filter-options').then(r => setFilterOptions(r.data)).catch(logError);
  }, []);

  const buildParams = () => {
    const p = new URLSearchParams();
    if (filters.status) p.append('status', filters.status);
    if (filters.expiry) p.append('expiry', filters.expiry);
    if (filters.search) p.append('search', filters.search);
    if (filters.national_id) p.append('national_id', filters.national_id);
    if (filters.job_title) p.append('job_title', filters.job_title);
    if (filters.course_id) p.append('course_id', filters.course_id);
    if (filters.resource_type) p.append('resource_type', filters.resource_type);
    if (filters.department) p.append('department', filters.department);
    if (filters.project) p.append('projects', filters.project);
    if (filters.client) p.append('clients', filters.client);
    if (filters.organization) p.append('organization', filters.organization);
    return p;
  };

  const load = () => {
    const p = buildParams();
    p.append('page', page); p.append('pageSize', pageSize);
    api.get('/training-records/tracker?' + p).then(r => { setRows(r.data.rows); setTotal(r.data.total); }).catch(logError);
  };
  const loadStats = () => api.get('/training-records/stats?' + buildParams()).then(r => setStats(r.data)).catch(logError);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters, page]);
  useEffect(() => { setPage(1); loadStats(); /* eslint-disable-next-line */ }, [filters]);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  // Stat cards drive the status/expiry filters. Clicking an active card clears it.
  const setStatus = (s) => setFilters(f => ({ ...f, status: f.status === s ? '' : s, expiry: '' }));
  const setExpiry = (e) => setFilters(f => ({ ...f, expiry: f.expiry === e ? '' : e, status: '' }));

  const statCard = (label, value, opts) => {
    const { active, onClick, color } = opts;
    return (
      <div className="stat-card wf-stat-card"
        style={{ cursor: 'pointer', borderTopColor: color, background: active ? '#F0F7FF' : '', outline: active ? `2px solid ${color}` : '', boxShadow: active ? 'var(--wf-shadow-hover)' : '' }}
        onClick={onClick}>
        <div className="stat-label">{label}</div>
        <div className="stat-value" style={{ color }}>{value}</div>
      </div>
    );
  };

  const renderStatus = (s) => {
    const m = STATUS_META[s] || { label: titleCase(s), cls: 'tag-gray' };
    return <span className={`tag ${m.cls}`}>{m.label}</span>;
  };

  // Employee employment status (Active / Exit) shown under the Organization column.
  const renderEmpStatus = (s) => {
    if (!s) return null;
    const active = s === 'active';
    return <span className={`tag ${active ? 'tag-green' : 'tag-gray'}`} style={{ fontSize: 10, marginTop: 3, display: 'inline-block' }}>{active ? 'Active' : titleCase(s)}</span>;
  };

  const renderExpiry = (r) => {
    if (r.status !== 'completed' || !r.expiry_date) return <span style={{ color: '#9ca3af' }}>—</span>;
    const state = r.expiry_state; // 'valid' | 'expiring' | 'expired' | 'superseded'
    // A superseded record was renewed over: it is history, so it counts as
    // neither valid nor expired and carries no countdown -- but it keeps its own
    // label (an expired cert stays "Expired"), just muted.
    if (state === 'superseded') {
      const wasExpired = new Date(r.expiry_date).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ color: '#9ca3af' }}>{fmtDate(r.expiry_date)}</span>
          <span className="tag tag-gray" style={{ fontSize: 10, alignSelf: 'flex-start' }}>{wasExpired ? 'Expired · previous' : 'Previous'}</span>
        </div>
      );
    }
    const cls = state === 'expired' ? 'tag-red' : state === 'expiring' ? 'tag-amber' : 'tag-green';
    const days = r.days_to_expiry;
    const note = state === 'expired'
      ? `${Math.abs(days)}d ago`
      : days != null ? `in ${days}d` : '';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span>{fmtDate(r.expiry_date)}</span>
        <span className={`tag ${cls}`} style={{ fontSize: 10, alignSelf: 'flex-start' }}>{titleCase(state)}{note ? ` · ${note}` : ''}</span>
      </div>
    );
  };

  const exportCSV = async () => {
    setExporting(true);
    try {
      const labels = ['Employee', 'National ID', 'Employee No', 'Job Title', 'Organization', 'Employment Status', 'Training Type', 'Project', 'Client', 'Status', 'Requested', 'Requested By', 'Scheduled', 'Completed', 'Expiry', 'Expiry State'];
      const all = [];
      let pg = 1;
      // Pull every matching page (backend caps pageSize at 100).
      for (;;) {
        const p = buildParams();
        p.append('page', pg); p.append('pageSize', 100);
        const res = await api.get('/training-records/tracker?' + p);
        all.push(...res.data.rows);
        if (all.length >= res.data.total || res.data.rows.length === 0) break;
        pg += 1;
        if (pg > 100) break; // hard stop
      }
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csvRows = all.map(r => [
        r.employee_name, r.national_id, r.employee_number, r.job_title,
        r.organization, (r.employment_status ? titleCase(r.employment_status) : ''), r.course_name,
        r.project, r.client, (STATUS_META[r.status]?.label || titleCase(r.status)),
        fmtDate(r.requested_at), r.requested_by_name, fmtDate(r.scheduled_date),
        fmtDate(r.completed_at), fmtDate(r.expiry_date), r.expiry_state || '',
      ].map(esc).join(','));
      const csv = [labels.join(','), ...csvRows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ESAT_Trainings_Tracker_' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { logError(e); alert('Export failed'); }
    setExporting(false);
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Trainings Tracker</span>
        </div>
        <div className="topbar-right">
          <button className="btn" onClick={exportCSV} disabled={exporting}>↓ {exporting ? 'Exporting...' : 'Export CSV'}</button>
        </div>
      </div>

      <div className="content graphs-content">
        {/* Filters */}
        <div className="card" style={{ marginBottom: 16, position: 'sticky', top: 'var(--header-h)', zIndex: 40 }}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', flexShrink: 0, paddingTop: 6 }}>Search</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <input className="form-input" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 150 }} placeholder="Search name..." value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} />
                <input className="form-input" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 140 }} placeholder="Search national ID..." value={filters.national_id} onChange={e => setFilters(p => ({ ...p, national_id: e.target.value }))} />
                <input className="form-input" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 140 }} placeholder="Search job title..." value={filters.job_title} onChange={e => setFilters(p => ({ ...p, job_title: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', flexShrink: 0, paddingTop: 6 }}>Filter</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 180 }} value={filters.course_id} onChange={e => setFilters(p => ({ ...p, course_id: e.target.value }))}>
                  <option value="">All Training Types</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                  {filterOptions.clients.map(cl => <option key={cl} value={cl}>{cl}</option>)}
                </select>
                <input className="form-input" list="tracker-organizations" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 170 }} placeholder="All Organizations" value={filters.organization} onChange={e => setFilters(p => ({ ...p, organization: e.target.value }))} />
                <datalist id="tracker-organizations">
                  {filterOptions.organizations.map(o => <option key={o} value={o} />)}
                </datalist>
                <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 140 }} value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value, expiry: '' }))}>
                  <option value="">All Status</option>
                  <option value="requested">Requested</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12 }} onClick={() => setFilters(EMPTY_FILTERS)}>✕ Clear</button>
              </div>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="stat-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(6,1fr)' }}>
          {statCard('Total Records', stats.total, { active: !filters.status && !filters.expiry, onClick: () => setFilters(f => ({ ...f, status: '', expiry: '' })), color: 'var(--eg-navy)' })}
          {statCard('Requested', stats.requested, { active: filters.status === 'requested', onClick: () => setStatus('requested'), color: '#2563eb' })}
          {statCard('Scheduled', stats.scheduled, { active: filters.status === 'scheduled', onClick: () => setStatus('scheduled'), color: '#0f766e' })}
          {statCard('Pending', stats.pending, { active: filters.status === 'pending', onClick: () => setStatus('pending'), color: '#A32D2D' })}
          {statCard('Completed', stats.completed, { active: filters.status === 'completed', onClick: () => setStatus('completed'), color: 'var(--eg-green)' })}
          {statCard('Expiring ≤60d', stats.expiring, { active: filters.expiry === 'expiring', onClick: () => setExpiry('expiring'), color: '#d97706' })}
        </div>

        {/* Table */}
        <div className="card">
          <div className="card-header" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div className="card-title" style={{ fontSize: 15, marginBottom: 4 }}>Trainings Tracker</div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>All employee training records matching the current filters</div>
            </div>
            <span className="tag tag-navy" style={{ whiteSpace: 'nowrap' }}>{total} record{total === 1 ? '' : 's'}</span>
          </div>
          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
            <table className="table-hover-soft">
              <thead>
                <tr style={{ position: 'sticky', top: 0, zIndex: 4 }}>
                  <th>Employee</th>
                  <th>Training Type</th>
                  <th>Organization</th>
                  <th>Project / Client</th>
                  <th>Requested</th>
                  <th>Completed</th>
                  <th>Expiry</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div className="emp-cell"><div>
                        <div className="emp-name">{r.employee_name || '—'}</div>
                        <div className="emp-id">{r.national_id || r.employee_number || '—'}{r.job_title ? ` · ${r.job_title}` : ''}</div>
                      </div></div>
                    </td>
                    <td>{r.course_name}</td>
                    <td>
                      <div>{r.organization || '—'}</div>
                      {renderEmpStatus(r.employment_status)}
                    </td>
                    <td>{r.project || '—'}{r.client ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.client}</div> : ''}</td>
                    <td>{fmtDate(r.requested_at)}{r.requested_by_name ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.requested_by_name}</div> : ''}</td>
                    <td>{fmtDate(r.completed_at)}</td>
                    <td>{renderExpiry(r)}</td>
                    <td>{renderStatus(r.status)}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#6b7280', padding: 32 }}>No training records found</td></tr>}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid #e5e7eb' }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{total} record{total === 1 ? '' : 's'} total</span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button className="btn btn-sm" onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page === 1}>‹ Prev</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                  .reduce((acc, p, i, arr) => { if (i > 0 && p - arr[i - 1] > 1) acc.push('…'); acc.push(p); return acc; }, [])
                  .map((p, i) => p === '…'
                    ? <span key={'gap' + i} style={{ padding: '0 4px', color: '#9ca3af', fontSize: 12 }}>…</span>
                    : <button key={p} className="btn btn-sm" onClick={() => setPage(p)} style={{ background: p === page ? 'var(--eg-navy)' : '', color: p === page ? 'white' : '', fontWeight: p === page ? 700 : 400 }}>{p}</button>
                  )}
                <button className="btn btn-sm" onClick={() => setPage(p => Math.min(p + 1, totalPages))} disabled={page === totalPages}>Next ›</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
