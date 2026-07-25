import React, { useEffect, useState } from 'react';
import api, { logError } from '../utils/api';

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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [filters, setFilters] = useState({ projects: [], clients: [] });

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

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span><span className="topbar-sep">›</span>
          <span className="topbar-title">Audit Coverage</span>
        </div>
        <div className="topbar-right">
          {(filters.projects.length > 0 || filters.clients.length > 0) && (
            <button className="btn btn-sm" onClick={() => setFilters({ projects: [], clients: [] })} disabled={loading}>Clear filters</button>
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
            <div className="stat-label">Total active employees</div>
            <div className="stat-value navy">{loading ? '—' : data?.total_active}</div>
          </div>
          <div className="card" style={{ padding: '16px 18px' }}>
            <div className="stat-label">SAN employees</div>
            <div className="stat-value navy">{loading ? '—' : data?.san_count}</div>
          </div>
          <div className="card" style={{ padding: '16px 18px' }}>
            <div className="stat-label">Non-SAN employees</div>
            <div className="stat-value" style={{ color: '#6b7280' }}>{loading ? '—' : data?.non_san_count}</div>
          </div>
          <div className="card" style={{ padding: '16px 18px' }}>
            <div className="stat-label">SAN due for visit (&gt;30 days)</div>
            <div className="stat-value" style={{ color: '#A32D2D' }}>{loading ? '—' : data?.overdue_total}</div>
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
          <table>
            <thead><tr><th>Project</th><th>SAN Total</th><th>Overdue (&gt;30d)</th><th></th></tr></thead>
            <tbody>
              {!loading && data?.by_project?.map(row => {
                const pct = row.san_total > 0 ? Math.round((row.overdue / row.san_total) * 100) : 0;
                return (
                  <tr key={row.project}>
                    <td>{row.project || '—'}</td>
                    <td>{row.san_total}</td>
                    <td style={{ color: row.overdue > 0 ? '#A32D2D' : '#111827', fontWeight: row.overdue > 0 ? 700 : 400 }}>{row.overdue}</td>
                    <td style={{ width: 160 }}>
                      <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: pct + '%', background: pct > 50 ? '#A32D2D' : pct > 0 ? '#D97706' : '#1D9E75' }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && (!data?.by_project || data.by_project.length === 0) && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>No data for the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
