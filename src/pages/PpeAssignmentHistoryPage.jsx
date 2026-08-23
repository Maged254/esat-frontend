import React, { useEffect, useState, useCallback } from 'react';
import api, { logError } from '../utils/api';

// What PPE each person was allocated, and when it changed.
//
// Allocation is saved by replacing the whole set, so the interesting fact is
// never "the set is now X" — it is which item was added or taken away, by whom.
// That is what this lists, one row per item.
const ACTION = {
  added:   { label: 'Added',   cls: 'tag-green' },
  removed: { label: 'Removed', cls: 'tag-red' },
};
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const today = () => new Date().toISOString().slice(0, 10);

export default function PpeAssignmentHistoryPage() {
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
    api.get('/ppe-assignment-log?' + p)
      .then(r => { setRows(r.data.rows); setTotal(r.data.total); })
      .catch(logError).finally(() => setLoading(false));
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filters]);

  const exportCSV = async () => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) p.append(k, v); });
    p.append('page', 1); p.append('pageSize', 200);
    const { data } = await api.get('/ppe-assignment-log?' + p);
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['When', 'Person', 'National ID', 'Organization', 'Project', 'Client', 'PPE/Tool Item', 'Action', 'Changed By'].map(esc).join(',')];
    data.rows.forEach(r => lines.push([
      fmtDateTime(r.changed_at), r.person_name, r.national_id, r.organization,
      r.project, r.client, r.ppe_item_name, ACTION[r.action]?.label || r.action, r.changed_by_name,
    ].map(esc).join(',')));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `OneHub-PPE-Assignment-History-${today()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">PPE Assignment History</span>
        </div>
        <div className="topbar-right">
          <button className="btn" onClick={exportCSV}>↓ Export CSV</button>
        </div>
      </div>

      <div className="content graphs-content">
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input className="form-input" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 260 }}
                   placeholder="Person, national ID, item or organization…"
                   value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} />
            <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 140 }}
                    value={filters.action} onChange={e => setFilters(p => ({ ...p, action: e.target.value }))}>
              <option value="">Added &amp; removed</option>
              <option value="added">Added only</option>
              <option value="removed">Removed only</option>
            </select>
            <input type="date" className="form-input" style={{ height: 30, padding: '4px 8px', fontSize: 12 }}
                   value={filters.from} onChange={e => setFilters(p => ({ ...p, from: e.target.value }))} />
            <span style={{ fontSize: 12, color: '#9ca3af' }}>to</span>
            <input type="date" className="form-input" style={{ height: 30, padding: '4px 8px', fontSize: 12 }}
                   value={filters.to} onChange={e => setFilters(p => ({ ...p, to: e.target.value }))} />
            <button className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12 }}
                    onClick={() => setFilters({ search: '', action: '', from: '', to: '' })}>✕ Clear</button>
            <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 'auto' }}>{total} change{total === 1 ? '' : 's'}</span>
          </div>
        </div>

        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table className="table-hover-soft">
              <thead>
                <tr><th>When</th><th>Person</th><th>Project / Client</th><th>PPE / Tool Item</th><th>Change</th><th>By</th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ padding: 24, color: '#9ca3af', fontSize: 13 }}>Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
                    No allocation changes recorded{Object.values(filters).some(Boolean) ? ' for these filters' : ' yet'}.
                  </td></tr>
                ) : rows.map(r => {
                  const meta = ACTION[r.action] || { label: r.action, cls: 'tag-gray' };
                  return (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateTime(r.changed_at)}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {r.person_name || '—'}
                          {r.is_casual && <span className="tag tag-gray" style={{ marginLeft: 6, fontSize: 10 }}>Casual</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.national_id || '—'}</div>
                        {r.organization && <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.organization}</div>}
                      </td>
                      <td>
                        {r.project || '—'}
                        {r.client && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.client}</div>}
                      </td>
                      <td style={{ maxWidth: 300 }}>{r.ppe_item_name || '—'}</td>
                      <td><span className={`tag ${meta.cls}`}>{meta.label}</span></td>
                      <td style={{ fontSize: 12, color: '#6b7280' }}>{r.changed_by_name || '—'}</td>
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

        <div style={{ marginTop: 12, fontSize: 11, color: '#9ca3af', maxWidth: 720 }}>
          Recording starts from today — allocations made before this existed have no history to show.
        </div>
      </div>
    </>
  );
}
