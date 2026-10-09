import React, { useEffect, useState } from 'react';
import api, { logError } from '../utils/api';
import { useAuth } from '../utils/AuthContext';

// Who may take the plan away as a file. Reading coverage on screen is wider
// than this; a downloadable roster of everyone and when they were last seen is
// not.
const CAN_EXPORT = ['admin', 'ehs_manager'];

const BUCKETS = [
  { key: 'bucket_0_30', label: '0–30 days', color: '#1D9E75' },
  { key: 'bucket_31_60', label: '31–60 days', color: '#D97706' },
  { key: 'bucket_61_90', label: '61–90 days', color: '#A32D2D' },
  { key: 'bucket_90_plus', label: '90+ days', color: '#042C53' },
  { key: 'never_audited', label: 'Never audited', color: '#6b7280' },
];

const FilterChip = ({ label, active, highlighted, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap',
      border: '1.2px ' + (active ? 'solid #2563EB' : highlighted ? 'dashed #93b4e8' : 'solid transparent'),
      background: active ? '#E6F1FB' : highlighted ? '#F3F7FD' : '#F1F2F4',
      color: active ? '#2563EB' : highlighted ? '#3B5B92' : '#374151',
      fontSize: 10, fontWeight: active ? 600 : 500,
      cursor: disabled ? 'default' : 'pointer', transition: 'all 0.15s ease',
      opacity: disabled ? 0.6 : 1,
    }}
  >
    {active && <span style={{ fontSize: 9 }}>✓</span>}
    {label}
  </button>
);

export default function AuditCoveragePage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [filters, setFilters] = useState({ projects: [], clients: [] });
  const [projectSort, setProjectSort] = useState({ key: 'overdue', dir: 'desc' });
  const [exporting, setExporting] = useState(false);

  const toggleProjectSort = (key) => setProjectSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  const sortArrow = (key) => projectSort.key === key ? (projectSort.dir === 'asc' ? ' ▲' : ' ▼') : '';

  const toggleFilter = (key, value) => setFilters(current => ({
    ...current,
    [key]: current[key].includes(value) ? current[key].filter(v => v !== value) : [...current[key], value],
  }));

  useEffect(() => {
    api.get('/employees').then(r => setEmployees(r.data)).catch(logError);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.projects.length) params.append('project', filters.projects.join(','));
    if (filters.clients.length) params.append('client', filters.clients.join(','));
    api.get('/audit-coverage?' + params).then(r => setData(r.data)).catch(logError).finally(() => setLoading(false));
  }, [filters]);

  const projects = [...new Set(employees.map(e => e.project).filter(Boolean))].sort();
  const clients = [...new Set(employees.map(e => e.client).filter(Boolean))].sort();

  // Ticking a client doesn't select anything for you -- it just brings that
  // client's projects to the front of the row with a dashed accent, so
  // they're easy to spot and click yourself.
  const clientProjectsMap = employees.reduce((map, e) => {
    if (e.client && e.project) {
      if (!map[e.client]) map[e.client] = new Set();
      map[e.client].add(e.project);
    }
    return map;
  }, {});
  const highlightedProjects = new Set(filters.clients.flatMap(c => [...(clientProjectsMap[c] || [])]));
  const sortedProjects = highlightedProjects.size === 0 ? projects : [
    ...projects.filter(p => highlightedProjects.has(p)),
    ...projects.filter(p => !highlightedProjects.has(p)),
  ];

  const total = data ? BUCKETS.reduce((sum, b) => sum + (data[b.key] || 0), 0) : 0;

  // The plan: who needs a safety audit, and how long since their last one.
  // Built from the same rows the page already holds and narrowed exactly the
  // way /api/audit-coverage narrows them -- active, san, and the chips above --
  // so the sheet's row count is the SAN figure on screen, not a near miss.
  const canExport = CAN_EXPORT.includes(user?.role);
  const planRows = employees
    .filter(e => e.employment_status === 'active' && e.san === true)
    .filter(e => !filters.projects.length || filters.projects.includes(e.project))
    .filter(e => !filters.clients.length || filters.clients.includes(e.client))
    // Never audited first, then longest-waiting -- read top-down, that is the
    // order to book them in.
    .sort((a, b) => {
      const da = a.days_since_audit == null ? Infinity : Number(a.days_since_audit);
      const db = b.days_since_audit == null ? Infinity : Number(b.days_since_audit);
      return db - da || (a.full_name || '').localeCompare(b.full_name || '');
    });

  const bucketOf = (days) => days == null ? 'Never audited'
    : days <= 30 ? '0–30 days' : days <= 60 ? '31–60 days' : days <= 90 ? '61–90 days' : '90+ days';

  const exportPlan = async () => {
    setExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Audit Plan');
      ws.columns = [
        { header: 'Employee', key: 'full_name', width: 28 },
        { header: 'National ID', key: 'national_id', width: 14 },
        { header: 'Employee No.', key: 'employee_number', width: 14 },
        { header: 'Job Title', key: 'job_title', width: 24 },
        { header: 'Department', key: 'department', width: 16 },
        { header: 'Project', key: 'project', width: 18 },
        { header: 'Client', key: 'client', width: 14 },
        { header: 'Organization', key: 'organization', width: 20 },
        { header: 'Last Audit', key: 'last_audit', width: 13 },
        { header: 'Days Since', key: 'days_since', width: 11 },
        { header: 'Status', key: 'status', width: 15 },
      ];
      planRows.forEach(e => {
        const days = e.days_since_audit == null ? null : Number(e.days_since_audit);
        ws.addRow({
          ...e,
          last_audit: e.last_audit_date ? new Date(e.last_audit_date).toLocaleDateString('en-GB') : 'Never',
          days_since: days == null ? '' : days,
          status: bucketOf(days),
        });
      });
      const head = ws.getRow(1);
      head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A4A' } };
      head.height = 20;
      // Overdue is the whole point of the sheet, so it has to be visible at a
      // glance rather than read off the Days column.
      ws.getColumn('status').eachCell((cell, row) => {
        if (row === 1) return;
        const fg = cell.value === 'Never audited' ? 'FFE5E7EB'
          : cell.value === '0–30 days' ? 'FFDCFCE7'
          : cell.value === '31–60 days' ? 'FFFEF3C7' : 'FFFDE8E8';
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fg } };
      });
      ws.getColumn('days_since').alignment = { horizontal: 'center' };
      ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
      ws.autoFilter = { from: 'A1', to: { row: 1, column: ws.columns.length } };

      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `OneHub-Audit-Plan-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      logError(e);
      alert('Could not build the audit plan file.');
    } finally { setExporting(false); }
  };

  const byProjectRows = [...(data?.by_project || [])].sort((a, b) => {
    const derived = (row, key) => key === 'project' ? (row.project || '')
      : key === 'pct' ? (row.san_total > 0 ? row.overdue / row.san_total : 0)
      : key === 'audited' ? (row.san_total - row.overdue)
      : row[key];
    const valA = derived(a, projectSort.key);
    const valB = derived(b, projectSort.key);
    if (valA < valB) return projectSort.dir === 'asc' ? -1 : 1;
    if (valA > valB) return projectSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub</span><span className="topbar-sep">›</span>
          <span className="topbar-title">Audit Coverage</span>
        </div>
        <div className="topbar-right">
          {(filters.projects.length > 0 || filters.clients.length > 0) && (
            <button className="btn btn-sm" onClick={() => setFilters({ projects: [], clients: [] })} disabled={loading}>Clear filters</button>
          )}
          {canExport && (
            <button className="btn btn-primary btn-sm" onClick={exportPlan}
                    disabled={exporting || loading || !planRows.length}
                    title="Everyone needing a safety audit, with their last audit date">
              {exporting ? 'Preparing…' : `⬇ Export audit plan (${planRows.length})`}
            </button>
          )}
        </div>
      </div>
      <div className="content graphs-content">
        <div className="card" style={{ marginBottom: 16, position: 'sticky', top: 'var(--header-h)', zIndex: 40 }}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', flexShrink: 0, paddingTop: 6 }}>Client</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <FilterChip label="All clients" active={filters.clients.length === 0} disabled={loading} onClick={() => setFilters(current => ({ ...current, clients: [] }))} />
                {clients.map(client => (
                  <FilterChip key={client} label={client} active={filters.clients.includes(client)} disabled={loading} onClick={() => toggleFilter('clients', client)} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', flexShrink: 0, paddingTop: 6 }}>Project</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <FilterChip label="All projects" active={filters.projects.length === 0} disabled={loading} onClick={() => setFilters(current => ({ ...current, projects: [] }))} />
                {sortedProjects.map(project => (
                  <FilterChip
                    key={project}
                    label={project}
                    active={filters.projects.includes(project)}
                    highlighted={highlightedProjects.has(project)}
                    disabled={loading}
                    onClick={() => toggleFilter('projects', project)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Top stat row */}
        <div className="stat-grid">
          <div className="card" style={{ padding: '16px 18px' }}>
            <div className="stat-label">Total Active Resources</div>
            <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1, color: 'var(--eg-navy)' }}>{loading ? '—' : data?.total_active}</div>
          </div>
          <div className="card" style={{ padding: '16px 18px' }}>
            <div className="stat-label">SAN Resources</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1, color: 'var(--eg-navy)' }}>{loading ? '—' : data?.san_count}</div>
              {!loading && (
                <div style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af', lineHeight: 1.5, paddingBottom: 4 }}>
                  <div>{data?.san_inhouse ?? 0} InHouse</div>
                  <div>{data?.san_outsource ?? 0} OutSourced</div>
                </div>
              )}
            </div>
          </div>
          <div className="card" style={{ padding: '16px 18px' }}>
            <div className="stat-label">Non-SAN Resources</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1, color: '#6b7280' }}>{loading ? '—' : data?.non_san_count}</div>
              {!loading && (
                <div style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af', lineHeight: 1.5, paddingBottom: 4 }}>
                  <div>{data?.non_san_inhouse ?? 0} InHouse</div>
                  <div>{data?.non_san_outsource ?? 0} OutSourced</div>
                </div>
              )}
            </div>
          </div>
          <div className="card" style={{ padding: '16px 18px' }}>
            <div className="stat-label">SAN due for visit (&gt;30 days)</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1, color: '#A32D2D' }}>{loading ? '—' : data?.overdue_total}</div>
              {!loading && data?.san_count > 0 && (
                <div style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af', lineHeight: 1.5, paddingBottom: 4 }}>
                  {Math.round((data.overdue_total / data.san_count) * 100)}% of SAN
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Headline row */}
        <div className="card" style={{ marginTop: 16, padding: 20 }}>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Audit Rate</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--eg-navy)', lineHeight: 1.1 }}>
                {loading ? '—' : (data?.audit_rate !== null ? data.audit_rate + '%' : 'N/A')}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>SAN employees audited within 30 days</div>
            </div>
            <div style={{ width: 1, height: 48, background: '#e5e7eb' }} />
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Avg days since audit</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--eg-navy)' }}>
                {loading ? '—' : (data?.avg_days_since_audit ?? '—')}
              </div>
            </div>
            <div style={{ width: 1, height: 48, background: '#e5e7eb' }} />
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>This month vs last month</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--eg-navy)' }}>
                {loading ? '—' : `${data?.this_month_audited ?? 0} / ${data?.last_month_audited ?? 0}`}
              </div>
            </div>
          </div>
        </div>

        {/* Signature: Aging Timeline */}
        <div className="card" style={{ marginTop: 16, padding: 20 }}>
          <div className="card-title" style={{ marginBottom: 14 }}>Audit aging — SAN employees</div>
          {!loading && total > 0 && (
            <div style={{ display: 'flex', height: 36, borderRadius: 8, overflow: 'hidden', boxShadow: 'inset 0 0 0 1px #e5e7eb' }}>
              {BUCKETS.map(b => {
                const count = data[b.key] || 0;
                const pct = total > 0 ? (count / total) * 100 : 0;
                if (pct === 0) return null;
                return (
                  <div key={b.key} title={`${b.label}: ${count}`} style={{
                    width: pct + '%', background: b.color, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 700,
                    minWidth: count > 0 ? 28 : 0, transition: 'width 0.3s'
                  }}>
                    {pct > 6 ? count : ''}
                  </div>
                );
              })}
            </div>
          )}
          {!loading && total === 0 && <div style={{ color: '#9ca3af', fontSize: 13 }}>No SAN employees match the current filters.</div>}
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14 }}>
            {BUCKETS.map(b => (
              <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color, display: 'inline-block' }} />
                {b.label} <strong style={{ color: '#111827' }}>{loading ? '—' : (data?.[b.key] || 0)}</strong>
              </div>
            ))}
          </div>
        </div>

        {/* By project */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <span className="card-title">By project</span>
          </div>
          <table className="table-hover-soft">
            <thead>
              <tr>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleProjectSort('project')}>Project{sortArrow('project')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleProjectSort('san_total')}>SAN Total{sortArrow('san_total')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleProjectSort('audited')}>Audited (&le;30d){sortArrow('audited')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleProjectSort('overdue')}>Overdue (&gt;30d){sortArrow('overdue')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleProjectSort('pct')}>% Overdue{sortArrow('pct')}</th>
              </tr>
            </thead>
            <tbody>
              {!loading && byProjectRows.map(row => {
                const pct = row.san_total > 0 ? Math.round((row.overdue / row.san_total) * 100) : 0;
                const audited = row.san_total - row.overdue;
                const auditedPct = row.san_total > 0 ? Math.round((audited / row.san_total) * 100) : 0;
                return (
                  <tr key={row.project + '::' + row.client}>
                    <td>
                      <div>{row.project || '—'}</div>
                      {row.client && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{row.client}</div>}
                    </td>
                    <td>{row.san_total}</td>
                    <td style={{ color: audited > 0 ? '#1D9E75' : '#111827', fontWeight: audited > 0 ? 700 : 400 }}>
                      {audited} <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af' }}>({auditedPct}%)</span>
                    </td>
                    <td style={{ color: row.overdue > 0 ? '#A32D2D' : '#111827', fontWeight: row.overdue > 0 ? 700 : 400 }}>
                      {row.overdue} <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af' }}>({pct}%)</span>
                    </td>
                    <td style={{ width: 160 }}>
                      <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: pct + '%', background: pct > 50 ? '#A32D2D' : pct > 0 ? '#D97706' : '#1D9E75' }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && byProjectRows.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>No data for the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
