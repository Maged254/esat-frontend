import React, { useEffect, useState } from 'react';
import api, { logError } from '../utils/api';

const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '';
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

const ACTION_META = {
  update:     { label: 'Update',     cls: 'tag-navy' },
  exit:       { label: 'Exit',       cls: 'tag-red' },
  reactivate: { label: 'Reactivate', cls: 'tag-green' },
};

const EMPTY = { from: daysAgo(30), to: today(), action: '', search: '' };

export default function ChangeHistoryPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [filters, setFilters] = useState(EMPTY);
  const [exporting, setExporting] = useState(false);

  const buildParams = () => {
    const p = new URLSearchParams();
    if (filters.from) p.append('from', filters.from);
    if (filters.to) p.append('to', filters.to);
    if (filters.action) p.append('action', filters.action);
    if (filters.search) p.append('search', filters.search);
    return p;
  };

  const load = () => {
    const p = buildParams();
    p.append('page', page); p.append('pageSize', pageSize);
    api.get('/employee-change-log?' + p).then(r => { setRows(r.data.rows); setTotal(r.data.total); }).catch(logError);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters, page]);
  useEffect(() => { setPage(1); /* eslint-disable-next-line */ }, [filters]);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  const renderAction = (a) => {
    const m = ACTION_META[a] || { label: a, cls: 'tag-gray' };
    return <span className={`tag ${m.cls}`}>{m.label}</span>;
  };

  const renderChanges = (changes) => {
    if (!Array.isArray(changes) || !changes.length) return <span style={{ color: '#9ca3af' }}>—</span>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {changes.map((c, i) => (
          <div key={i} style={{ fontSize: 12 }}>
            <b>{c.field}:</b>{' '}
            <span style={{ color: '#9ca3af', textDecoration: 'line-through' }}>{c.before ?? '—'}</span>
            {' → '}
            <span style={{ color: '#0f2a4a', fontWeight: 600 }}>{c.after ?? '—'}</span>
          </div>
        ))}
      </div>
    );
  };

  const exportCSV = async () => {
    setExporting(true);
    try {
      const labels = ['When', 'Employee', 'National ID', 'Employee No', 'Action', 'Field', 'Before', 'After', 'Reason', 'Changed By'];
      const all = [];
      let pg = 1;
      for (;;) {
        const p = buildParams();
        p.append('page', pg); p.append('pageSize', 200);
        const res = await api.get('/employee-change-log?' + p);
        all.push(...res.data.rows);
        if (all.length >= res.data.total || res.data.rows.length === 0) break;
        pg += 1; if (pg > 200) break;
      }
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      // One CSV line per changed field so the before/after is spreadsheet-friendly.
      const csvRows = [];
      all.forEach(r => {
        const base = [fmtDateTime(r.changed_at), r.employee_name, r.national_id, r.employee_number, ACTION_META[r.action]?.label || r.action];
        const changes = Array.isArray(r.changes) && r.changes.length ? r.changes : [{ field: '', before: '', after: '' }];
        changes.forEach(c => csvRows.push([...base, c.field, c.before, c.after, r.reason, r.changed_by_name].map(esc).join(',')));
      });
      const csv = [labels.join(','), ...csvRows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ESAT_Employee_Change_History_' + today() + '.csv';
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
          <span className="topbar-title">Employee Change History</span>
        </div>
        <div className="topbar-right">
          <button className="btn" onClick={exportCSV} disabled={exporting}>↓ {exporting ? 'Exporting...' : 'Export CSV'}</button>
        </div>
      </div>

      <div className="content graphs-content">
        <div className="card" style={{ marginBottom: 16, position: 'sticky', top: 'var(--header-h)', zIndex: 40 }}>
          <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>From</span>
            <input type="date" className="form-input" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 150 }} value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>To</span>
            <input type="date" className="form-input" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 150 }} value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
            <button className="btn btn-sm" style={{ height: 30 }} onClick={() => setFilters(f => ({ ...f, from: daysAgo(1), to: daysAgo(1) }))}>Yesterday</button>
            <button className="btn btn-sm" style={{ height: 30 }} onClick={() => setFilters(f => ({ ...f, from: today(), to: today() }))}>Today</button>
            <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 140 }} value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}>
              <option value="">All Actions</option>
              <option value="update">Update</option>
              <option value="exit">Exit</option>
              <option value="reactivate">Reactivate</option>
            </select>
            <input className="form-input" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 200 }} placeholder="Search employee / ID..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
            <button className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12 }} onClick={() => setFilters(EMPTY)}>✕ Reset</button>
          </div>
        </div>

        <div className="card">
          <div className="card-header" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div className="card-title" style={{ fontSize: 15, marginBottom: 4 }}>Change History</div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>Who changed what, and when — for the selected date range</div>
            </div>
            <span className="tag tag-navy" style={{ whiteSpace: 'nowrap' }}>{total} change{total === 1 ? '' : 's'}</span>
          </div>
          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
            <table className="table-hover-soft">
              <thead>
                <tr style={{ position: 'sticky', top: 0, zIndex: 4 }}>
                  <th style={{ whiteSpace: 'nowrap' }}>When</th>
                  <th>Employee</th>
                  <th>Action</th>
                  <th>What changed</th>
                  <th>Reason</th>
                  <th>Changed by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateTime(r.changed_at)}</td>
                    <td>
                      <div className="emp-name">{r.employee_name || '—'}</div>
                      <div className="emp-id">{r.national_id || r.employee_number || '—'}</div>
                    </td>
                    <td>{renderAction(r.action)}</td>
                    <td>{renderChanges(r.changes)}</td>
                    <td style={{ fontSize: 12, color: '#6b7280', fontStyle: r.reason ? 'italic' : 'normal' }}>{r.reason || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.changed_by_name || '—'}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#6b7280', padding: 32 }}>No changes in this range</td></tr>}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid #e5e7eb' }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{total} change{total === 1 ? '' : 's'} total</span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button className="btn btn-sm" onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page === 1}>‹ Prev</button>
                <span style={{ fontSize: 12, color: '#6b7280', padding: '0 8px' }}>Page {page} / {totalPages}</span>
                <button className="btn btn-sm" onClick={() => setPage(p => Math.min(p + 1, totalPages))} disabled={page === totalPages}>Next ›</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
