import React, { useEffect, useState } from 'react';
import ExcelJS from 'exceljs';
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

// --- Current Status rendering, copied from UpdateTrainingRecordsPage so the two
// pages read a completed record's expiry state identically. ---
const STATUS_TAG = {
  requested: 'tag-navy', scheduled: 'tag-navy', pending: 'tag-amber',
  completed: 'tag-green', cancelled: 'tag-red', cancel: 'tag-red', not_eligible: 'tag-gray', exit: 'tag-gray',
};
const isPastExpiry = (r) => r.expiry_date && new Date(r.expiry_date).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
const rowTag = (r) => {
  if (r.status !== 'completed') return STATUS_TAG[r.status] || 'tag-gray';
  if (r.expiry_state === 'superseded') return 'tag-gray';
  if (r.expiry_state === 'expired') return 'tag-red';
  if (r.expiry_state === 'expiring') return 'tag-amber';
  return 'tag-green';
};
const rowLabel = (r) => {
  if (r.status !== 'completed') return titleCase(r.status);
  if (r.expiry_state === 'superseded') return isPastExpiry(r) ? 'Expired' : 'Previous';
  if (r.expiry_state === 'expired') return 'Expired';
  if (r.expiry_state === 'expiring') return 'Expiring Soon';
  return 'Completed';
};
const rowExpiryNote = (r) => {
  if (r.status !== 'completed') return null;
  if (!r.expiry_date) return { text: 'No expiry', color: '#9ca3af' };
  if (r.expiry_state === 'superseded') return isPastExpiry(r)
    ? { text: `Expired on ${fmtDate(r.expiry_date)}`, color: '#9ca3af' }
    : { text: `Superseded · was valid to ${fmtDate(r.expiry_date)}`, color: '#9ca3af' };
  if (r.expiry_state === 'expired') return { text: `Expired ${fmtDate(r.expiry_date)}`, color: '#c0392b' };
  if (r.expiry_state === 'expiring') return { text: `Expires ${fmtDate(r.expiry_date)}`, color: '#B26B00' };
  return { text: `Valid until ${fmtDate(r.expiry_date)}`, color: '#9ca3af' };
};
const isImageCert = (name) => /\.(jpe?g|png|heic|heif|gif|webp)$/i.test(name || '');

// Hover tooltip anchored with position:fixed so the table's overflow:auto
// container never clips it. Used to surface Requested + Last Update (HR).
function HoverTip({ children, tip }) {
  const [pos, setPos] = useState(null);
  return (
    <span
      style={{ position: 'relative', cursor: 'default' }}
      onMouseEnter={e => { const b = e.currentTarget.getBoundingClientRect(); setPos({ left: b.left, top: b.bottom + 6 }); }}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && (
        <div style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 200, background: '#1f2937', color: '#fff', padding: '8px 11px', borderRadius: 6, fontSize: 11, lineHeight: 1.55, boxShadow: '0 6px 20px rgba(0,0,0,.22)', minWidth: 190, maxWidth: 300, pointerEvents: 'none' }}>
          {tip}
        </div>
      )}
    </span>
  );
}

// filters.group mirrors the Update page: a group key ('valid'|'outstanding'|
// 'expiring'|'archived'|'all') or "group:substate" to narrow within a group.
const EMPTY_FILTERS = { group: 'all', pending_reason: '', search: '', national_id: '', job_title: '', course_id: '', resource_type: '', department: '', project: '', client: '', organization: '' };

export default function TrainingTrackerPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [stats, setStats] = useState({});
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [courses, setCourses] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [filterOptions, setFilterOptions] = useState({ projects: [], departments: [], clients: [], organizations: [] });
  const [exporting, setExporting] = useState(false);

  // Certificate preview (view + download only — the Tracker is read-only, so no
  // upload/rotate/delete, which are the Update page's write actions).
  const [certPreview, setCertPreview] = useState(null);
  const [certBlob, setCertBlob] = useState(null);
  const [certLoading, setCertLoading] = useState(false);
  const [certViewError, setCertViewError] = useState('');

  useEffect(() => {
    api.get('/training-courses').then(r => setCourses(r.data)).catch(logError);
    api.get('/training-pending-reasons').then(r => setReasons(r.data)).catch(logError);
    api.get('/employees/filter-options').then(r => setFilterOptions(r.data)).catch(logError);
  }, []);

  const baseGroup = (filters.group || 'all').split(':')[0];

  // People-filters shared by the row query, the stats query and the CSV export.
  const appendPeople = (p) => {
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

  // Certificate-group selection → backend params (mirrors Update page rowParams).
  const applyGroup = (p) => {
    const [grp, sub] = (filters.group || 'all').split(':');
    if (grp && grp !== 'all') p.append('group', grp);
    if (sub) {
      if (grp === 'outstanding') p.append('status', sub);            // requested / scheduled / pending / not_eligible
      else if (grp === 'archived') {
        if (sub === 'expired' || sub === 'superseded') p.append('expiry', sub);
        else if (sub === 'cancelled') p.append('status', 'cancelled');
        else if (sub === 'exited') p.append('employment_status', 'exit');
      }
    }
    // Pending-reason only applies (and only shows) on All Records / All Pending.
    if (filters.pending_reason && (filters.group === 'all' || filters.group === 'outstanding')) p.append('pending_reason', filters.pending_reason);
    return p;
  };

  const rowParams = () => applyGroup(appendPeople(new URLSearchParams()));
  // Stat cards always show the group totals for the current people-filters, so
  // the stats query ignores the group/sub-state selection entirely.
  const statParams = () => appendPeople(new URLSearchParams());

  const load = () => {
    const p = rowParams();
    p.append('page', page); p.append('pageSize', pageSize);
    api.get('/training-records/tracker?' + p).then(r => { setRows(r.data.rows); setTotal(r.data.total); }).catch(logError);
  };
  const loadStats = () => api.get('/training-records/stats?' + statParams()).then(r => setStats(r.data)).catch(logError);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters, page]);
  useEffect(() => { setPage(1); loadStats(); /* eslint-disable-next-line */ }, [filters]);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

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

  // Employee employment status (Active / Exit) shown under the Organization column.
  const renderEmpStatus = (s) => {
    if (!s) return null;
    const active = s === 'active';
    return <span className={`tag ${active ? 'tag-green' : 'tag-gray'}`} style={{ fontSize: 10, marginTop: 3, display: 'inline-block' }}>{active ? 'Active' : titleCase(s)}</span>;
  };

  // --- Certificate viewer (copied from Update page, minus the write actions) ---
  const certFilename = (rec) => {
    const ext = (String(rec.original_filename || '').split('.').pop() || 'pdf').toLowerCase();
    const d = rec.completed_at ? new Date(rec.completed_at).toISOString().slice(0, 10) : '';
    return `${rec.employee_name}${d ? ` (${d})` : ''}.${ext}`;
  };
  // Fetch with the token in a header, wrap the bytes in a local blob: URL, and
  // render that — no URL/token is ever exposed in the browser.
  const openCert = async (rec) => {
    setCertPreview(rec); setCertBlob(null); setCertViewError(''); setCertLoading(true);
    try {
      const res = await fetch(`${api.defaults.baseURL}/training-records/${rec.id}/certificate/download?preview=1`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('esat_token')}` },
      });
      if (!res.ok) throw new Error();
      setCertBlob(URL.createObjectURL(await res.blob()));
    } catch {
      setCertViewError('Could not load the certificate.');
    } finally {
      setCertLoading(false);
    }
  };
  const closeCert = () => {
    if (certBlob) URL.revokeObjectURL(certBlob);
    setCertBlob(null); setCertPreview(null); setCertLoading(false); setCertViewError('');
  };
  const downloadCert = (rec) => {
    if (!certBlob) return;
    const a = document.createElement('a');
    a.href = certBlob; a.download = certFilename(rec);
    document.body.appendChild(a); a.click(); a.remove();
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const all = [];
      let pg = 1;
      // Pull every matching page (backend caps pageSize at 100).
      for (;;) {
        const p = rowParams();
        p.append('page', pg); p.append('pageSize', 100);
        const res = await api.get('/training-records/tracker?' + p);
        all.push(...res.data.rows);
        if (all.length >= res.data.total || res.data.rows.length === 0) break;
        pg += 1;
        if (pg > 100) break; // hard stop
      }
      // Blank (not "—") for empty date cells so Excel columns read cleanly.
      const xd = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '';

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Trainings Tracker');
      ws.columns = [
        { header: 'Employee', key: 'employee', width: 26 },
        { header: 'National ID', key: 'national_id', width: 14 },
        { header: 'Employee No', key: 'employee_no', width: 13 },
        { header: 'Job Title', key: 'job_title', width: 22 },
        { header: 'Organization', key: 'organization', width: 24 },
        { header: 'Employment Status', key: 'employment_status', width: 16 },
        { header: 'Training Type', key: 'training_type', width: 26 },
        { header: 'Project', key: 'project', width: 16 },
        { header: 'Client', key: 'client', width: 14 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Requested', key: 'requested', width: 12 },
        { header: 'Requested By', key: 'requested_by', width: 20 },
        { header: 'Scheduled', key: 'scheduled', width: 12 },
        { header: 'Completed', key: 'completed', width: 12 },
        { header: 'Expiry', key: 'expiry', width: 12 },
        { header: 'Expiry State', key: 'expiry_state', width: 13 },
      ];
      all.forEach(r => ws.addRow({
        employee: r.employee_name || '', national_id: r.national_id || '', employee_no: r.employee_number || '',
        job_title: r.job_title || '', organization: r.organization || '',
        employment_status: r.employment_status ? titleCase(r.employment_status) : '',
        training_type: r.course_name || '', project: r.project || '', client: r.client || '',
        status: STATUS_META[r.status]?.label || titleCase(r.status),
        requested: xd(r.requested_at), requested_by: r.requested_by_name || '',
        scheduled: xd(r.scheduled_date), completed: xd(r.completed_at),
        expiry: xd(r.expiry_date), expiry_state: r.expiry_state ? titleCase(r.expiry_state) : '',
      }));
      // Bold navy header, frozen + filterable.
      const header = ws.getRow(1);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A4A' } };
      header.alignment = { vertical: 'middle' };
      header.height = 20;
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.autoFilter = { from: 'A1', to: 'P1' };

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'OneHub_Trainings_Tracker_' + new Date().toISOString().slice(0, 10) + '.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { logError(e); alert('Export failed'); }
    setExporting(false);
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Trainings Tracker</span>
        </div>
        <div className="topbar-right">
          <button className="btn" onClick={exportExcel} disabled={exporting}>↓ {exporting ? 'Exporting...' : 'Export Excel'}</button>
        </div>
      </div>

      <div className="content graphs-content">
        {/* Filters — same search + filter fields as Update Training Records */}
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
                {(filters.group === 'all' || filters.group === 'outstanding') && (
                  <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 200 }} value={filters.pending_reason} onChange={e => setFilters(p => ({ ...p, pending_reason: e.target.value }))} title="Pending reason">
                    <option value="">All pending reasons</option>
                    {reasons.map(r => <option key={r.id} value={r.label}>{r.label}</option>)}
                  </select>
                )}
                <button className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12 }} onClick={() => setFilters(EMPTY_FILTERS)}>✕ Clear</button>
              </div>
            </div>
          </div>
        </div>

        {/* Stat cards — the four certificate groups; each is a Current Status filter */}
        <div className="stat-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(4,1fr)' }}>
          {statCard('Total Records', stats.total ?? 0, { active: baseGroup === 'all', onClick: () => setFilters(f => ({ ...f, group: 'all' })), color: 'var(--eg-navy)' })}
          {statCard('Valid', stats.grp_valid ?? 0, { active: baseGroup === 'valid', onClick: () => setFilters(f => ({ ...f, group: 'valid' })), color: 'var(--eg-green)' })}
          {statCard('Pending', stats.grp_outstanding ?? 0, { active: baseGroup === 'outstanding', onClick: () => setFilters(f => ({ ...f, group: 'outstanding' })), color: '#A32D2D' })}
          {statCard('Expiring Soon', stats.grp_expiring ?? 0, { active: baseGroup === 'expiring', onClick: () => setFilters(f => ({ ...f, group: 'expiring' })), color: '#d97706' })}
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
                  <th>Current Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    {/* Employee — copied from Update Training Records */}
                    <td>
                      <div className="emp-cell"><div>
                        <div className="emp-name">{r.employee_name}</div>
                        <div className="emp-id">{r.national_id || r.employee_number || '—'}</div>
                        {r.job_title ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.job_title}</div> : ''}
                      </div></div>
                    </td>
                    {/* Training Type — hover reveals Requested + Last Update (HR) */}
                    <td>
                      <HoverTip tip={
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', opacity: .6 }}>Requested</div>
                            <div>{fmtDate(r.requested_at)}{r.requested_by_name ? ` · ${r.requested_by_name}` : (r.prior_expiry_date ? ' · Auto · on expiry' : '')}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', opacity: .6 }}>Last Update (HR)</div>
                            <div>{r.recorded_at ? `${fmtDate(r.recorded_at)}${r.recorded_by_name ? ` · ${r.recorded_by_name}` : ''}` : '—'}</div>
                          </div>
                        </div>
                      }>
                        <span style={{ borderBottom: '1px dotted #cbd5e1' }}>{r.course_name}</span>
                      </HoverTip>
                    </td>
                    {/* Organization — kept */}
                    <td>
                      <div>{r.organization || '—'}</div>
                      {renderEmpStatus(r.employment_status)}
                    </td>
                    {/* Project / Client — copied from Update Training Records */}
                    <td>{r.project || '—'}{r.client ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.client}</div> : ''}</td>
                    {/* Current Status — copied from Update Training Records (cert = view/download only) */}
                    <td>
                      <span className={`tag ${rowTag(r)}`}>{rowLabel(r)}</span>
                      {r.status === 'pending' && r.pending_reason ? <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.pending_reason}</div> : ''}
                      {r.status === 'scheduled' && r.scheduled_date ? <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{fmtDate(r.scheduled_date)}</div> : ''}
                      {r.prior_expiry_date && r.status !== 'completed' ? <div style={{ fontSize: 11, color: '#c0392b', marginTop: 2 }}>Expired on {fmtDate(r.prior_expiry_date)}</div> : ''}
                      {rowExpiryNote(r) ? <div style={{ fontSize: 11, color: rowExpiryNote(r).color, marginTop: 2 }}>{rowExpiryNote(r).text}</div> : ''}
                      {r.status === 'completed' && (r.has_certificate
                        ? <button type="button" onClick={() => openCert(r)} style={{ display: 'inline-block', fontSize: 11, color: 'var(--eg-navy)', fontWeight: 600, marginTop: 2, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>📎 Certificate</button>
                        : (r.needs_certificate ? <div style={{ fontSize: 11, color: '#B26B00', marginTop: 2 }}>No certificate</div> : ''))}
                      {r.status === 'cancelled' && r.cancel_reason ? <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.cancel_reason}</div> : ''}
                      {r.employment_status === 'exit' ? <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Employee exited</div> : ''}
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#6b7280', padding: 32 }}>No training records found</td></tr>}
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

      {/* Certificate preview — rendered from a local blob: URL, so no link/token
          is ever shown. Images and PDFs both display in-place. View + download
          only (read-only monitor). */}
      {certPreview && (
        <div onClick={closeCert} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, padding: 20, maxWidth: '82vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0f2a4a' }}>{certPreview.course_name} — Certificate<div style={{ fontSize: 12, fontWeight: 400, color: '#6b7280', marginTop: 2 }}>{certPreview.employee_name}</div></div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button className="btn btn-sm" onClick={() => downloadCert(certPreview)} disabled={!certBlob}>↓ Download</button>
                <button className="btn btn-sm" onClick={closeCert}>✕ Close</button>
              </div>
            </div>
            {certLoading
              ? <div style={{ width: '78vw', maxWidth: 780, height: '74vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 14 }}>Loading certificate…</div>
              : certViewError
                ? <div style={{ padding: 40, color: '#c0392b', fontSize: 14 }}>{certViewError}</div>
                : certBlob && (isImageCert(certPreview.original_filename)
                    ? <img src={certBlob} alt="Certificate" style={{ maxWidth: '100%', maxHeight: '78vh', borderRadius: 8, display: 'block' }} />
                    : <iframe title="Certificate" src={certBlob} style={{ width: '78vw', maxWidth: 900, height: '78vh', border: 'none', borderRadius: 8 }} />)}
          </div>
        </div>
      )}
    </>
  );
}
