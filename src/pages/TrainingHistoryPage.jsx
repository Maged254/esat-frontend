import React, { useEffect, useState, useCallback } from 'react';
import api, { logError } from '../utils/api';

// Everything that has happened to a training record: who asked for it, what was
// recorded against it, what was renewed, cancelled or restored.
//
// A training record only ever holds its latest state — recording an outcome
// overwrites the previous one — so this is the only place the sequence survives.
const ACTION = {
  opened:                     { label: 'Requested',        cls: 'tag-navy' },
  pending:                    { label: 'Pending',          cls: 'tag-amber' },
  scheduled:                  { label: 'Scheduled',        cls: 'tag-navy' },
  completed:                  { label: 'Completed',        cls: 'tag-green' },
  not_eligible:               { label: 'Not Eligible',     cls: 'tag-gray' },
  renewed:                    { label: 'Renewed',          cls: 'tag-green' },
  superseded:                 { label: 'Replaced',         cls: 'tag-gray' },
  removed:                    { label: 'Removed',          cls: 'tag-red' },
  restored:                   { label: 'Restored',         cls: 'tag-navy' },
  deleted:                    { label: 'Deleted',          cls: 'tag-red' },
};
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function TrainingHistoryPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', action: '', from: '', to: '' });
  const pageSize = 50;

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) p.append(k, v); });
    p.append('page', page); p.append('pageSize', pageSize);
    api.get('/training-record-events?' + p)
      .then(r => { setRows(r.data.rows); setTotal(r.data.total); })
      .catch(logError).finally(() => setLoading(false));
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filters]);

  const exportCSV = async () => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) p.append(k, v); });
    p.append('page', 1); p.append('pageSize', 200);
    const { data } = await api.get('/training-record-events?' + p);
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['When', 'Employee', 'National ID', 'Organization', 'Project', 'Client', 'Training', 'Event', 'From', 'To', 'Detail', 'By'].map(esc).join(',')];
    data.rows.forEach(r => lines.push([
      fmtDateTime(r.changed_at), r.employee_name, r.national_id, r.organization, r.project, r.client,
      r.course_name, ACTION[r.action]?.label || r.action, r.from_status, r.to_status, r.detail, r.changed_by_name,
    ].map(esc).join(',')));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `OneHub-Training-History-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Training History</span>
        </div>
        <div className="topbar-right">
          <button className="btn" onClick={exportCSV}>↓ Export CSV</button>
        </div>
      </div>

      <div className="content graphs-content">
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input className="form-input" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 280 }}
                   placeholder="Employee, national ID, training or detail…"
                   value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} />
            <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 170 }}
                    value={filters.action} onChange={e => setFilters(p => ({ ...p, action: e.target.value }))}>
              <option value="">Every event</option>
              {Object.entries(ACTION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <input type="date" className="form-input" style={{ height: 30, padding: '4px 8px', fontSize: 12 }}
                   value={filters.from} onChange={e => setFilters(p => ({ ...p, from: e.target.value }))} />
            <span style={{ fontSize: 12, color: '#9ca3af' }}>to</span>
            <input type="date" className="form-input" style={{ height: 30, padding: '4px 8px', fontSize: 12 }}
                   value={filters.to} onChange={e => setFilters(p => ({ ...p, to: e.target.value }))} />
            <button className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12 }}
                    onClick={() => setFilters({ search: '', action: '', from: '', to: '' })}>✕ Clear</button>
            <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 'auto' }}>{total} event{total === 1 ? '' : 's'}</span>
          </div>
        </div>

        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table className="table-hover-soft">
              <thead>
                <tr><th>When</th><th>Employee</th><th>Training</th><th>Event</th><th>What Happened</th><th>By</th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ padding: 24, color: '#9ca3af', fontSize: 13 }}>Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
                    No training events{Object.values(filters).some(Boolean) ? ' for these filters' : ' recorded yet'}.
                  </td></tr>
                ) : rows.map(r => {
                  const meta = ACTION[r.action] || { label: r.action, cls: 'tag-gray' };
                  return (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateTime(r.changed_at)}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.employee_name || '—'}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.national_id || '—'}</div>
                        {r.organization && <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.organization}</div>}
                      </td>
                      <td style={{ maxWidth: 220 }}>
                        {r.course_name || '—'}
                        {r.project && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.project}</div>}
                      </td>
                      <td>
                        <span className={`tag ${meta.cls}`}>{meta.label}</span>
                        {r.from_status && r.to_status && r.from_status !== r.to_status && (
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                            {r.from_status.replace(/_/g, ' ')} → {r.to_status.replace(/_/g, ' ')}
                          </div>
                        )}
                      </td>
                      <td style={{ maxWidth: 340, fontSize: 12, color: '#6b7280' }}>{r.detail || '—'}</td>
                      <td style={{ fontSize: 12, color: '#6b7280' }}>{r.changed_by_name || 'System'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', padding: '10px 16px', fontSize: 12 }}>
              <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span style={{ color: '#6b7280' }}>Page {page} of {pages}</span>
              <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, fontSize: 11, color: '#9ca3af', maxWidth: 760 }}>
          Recording began on 19 August 2026 — anything done before that has no history, because none was kept.
          Events marked <b>System</b> were made by OneHub itself, such as a renewal opened when a certificate expired.
        </div>
      </div>
    </>
  );
}
