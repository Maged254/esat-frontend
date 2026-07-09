import React, { useEffect, useState } from 'react';
import api, { logError } from '../utils/api';

const BUCKETS = [
  { key: 'bucket_0_30', label: '0–30 days', color: '#1D9E75' },
  { key: 'bucket_31_60', label: '31–60 days', color: '#D97706' },
  { key: 'bucket_61_90', label: '61–90 days', color: '#A32D2D' },
  { key: 'bucket_90_plus', label: '90+ days', color: '#042C53' },
  { key: 'never_audited', label: 'Never audited', color: '#6b7280' },
];

export default function AuditCoveragePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [filters, setFilters] = useState({ project: '', client: '' });

  useEffect(() => {
    api.get('/employees').then(r => setEmployees(r.data)).catch(logError);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.project) params.append('project', filters.project);
    if (filters.client) params.append('client', filters.client);
    api.get('/audit-coverage?' + params).then(r => setData(r.data)).catch(logError).finally(() => setLoading(false));
  }, [filters]);

  const projects = [...new Set(employees.map(e => e.project).filter(Boolean))].sort();
  const clients = [...new Set(employees.map(e => e.client).filter(Boolean))].sort();

  const total = data ? BUCKETS.reduce((sum, b) => sum + (data[b.key] || 0), 0) : 0;

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span><span className="topbar-sep">›</span>
          <span className="topbar-title">Audit Coverage</span>
        </div>
      </div>
      <div className="page-content">
        {/* Top stat row */}
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Total active employees</div>
            <div className="stat-value navy">{loading ? '—' : data?.total_active}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">SAN employees</div>
            <div className="stat-value navy">{loading ? '—' : data?.san_count}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Non-SAN employees</div>
            <div className="stat-value" style={{ color: '#6b7280' }}>{loading ? '—' : data?.non_san_count}</div>
          </div>
          <div className="stat-card">
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

        {/* Filters */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="card-title">By project</span>
            <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 160 }} value={filters.project} onChange={e => setFilters(p => ({ ...p, project: e.target.value }))}>
              <option value="">All Projects</option>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 140 }} value={filters.client} onChange={e => setFilters(p => ({ ...p, client: e.target.value }))}>
              <option value="">All Clients</option>
              {clients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {(filters.project || filters.client) && (
              <button className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12 }} onClick={() => setFilters({ project: '', client: '' })}>✕ Clear</button>
            )}
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
