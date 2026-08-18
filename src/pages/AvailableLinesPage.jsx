import React, { useEffect, useState, useCallback } from 'react';
import api, { logError } from '../utils/api';

// HR's working screen: the lines that can be handed to someone. Supervisors and
// project directors never reach this page — the route is role-guarded and the
// endpoint refuses them too.
//
// A line arrives here either because HR released it or because its holder left
// the company, and it keeps the package, credit limit, CUG and roaming it had.
// That is deliberate: the next person inherits a working configuration. It also
// means the line is still billing, which is why the wait is shown.
const fmtMoney = (v) => v == null || v === '' ? '—' : Number(v).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const title = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
const daysSince = (d) => d ? Math.max(0, Math.floor((Date.now() - new Date(d)) / 86400000)) : null;

export default function AvailableLinesPage() {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [operator, setOperator] = useState('');
  const [assigning, setAssigning] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (search) p.append('search', search);
    if (operator) p.append('operator', operator);
    api.get('/mobile-lines/available/list?' + p)
      .then(r => setLines(r.data)).catch(logError).finally(() => setLoading(false));
  }, [search, operator]);

  useEffect(() => { load(); }, [load]);

  const idleCost = lines.reduce((s, l) => s + Number(l.monthly_price_snapshot || 0), 0);

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Available Lines</span>
        </div>
      </div>

      <div className="content graphs-content">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Available Lines</span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              {lines.length} available{idleCost > 0 ? ` · KES ${fmtMoney(idleCost)}/month still billing` : ''}
            </span>
          </div>

          <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="form-input" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 200 }}
                   placeholder="Search a number…" value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 150 }}
                    value={operator} onChange={e => setOperator(e.target.value)}>
              <option value="">All operators</option>
              <option value="safaricom">Safaricom</option>
              <option value="airtel">Airtel</option>
            </select>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table-hover-soft">
              <thead>
                <tr>
                  <th>Mobile Number</th><th>Operator</th><th>Package</th><th>Credit Limit</th>
                  <th>CUG</th><th>Roaming</th><th>Previous Holder</th><th>Available</th><th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} style={{ padding: 24, color: '#9ca3af', fontSize: 13 }}>Loading…</td></tr>
                ) : lines.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: 24, color: '#9ca3af', fontSize: 13 }}>
                    No lines are free right now. A line appears here when it is released, or automatically when its holder leaves.
                  </td></tr>
                ) : lines.map(l => {
                  const waiting = daysSince(l.available_since);
                  return (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 600 }}>{l.mobile_number}</td>
                      <td>{title(l.operator)}</td>
                      <td>
                        {l.package_name || <span style={{ color: '#c0392b' }}>Not set</span>}
                        {l.monthly_price_snapshot != null && (
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>KES {fmtMoney(l.monthly_price_snapshot)}/mo</div>
                        )}
                      </td>
                      <td>{l.credit_limit != null ? fmtMoney(l.credit_limit) : <span style={{ color: '#c0392b' }}>Not set</span>}</td>
                      <td>{l.cug_enabled ? 'Yes' : 'No'}</td>
                      <td>{l.roaming_enabled ? 'Yes' : 'No'}</td>
                      <td>
                        {l.previous_employee || <span style={{ color: '#9ca3af' }}>—</span>}
                        {l.previous_release_reason && (
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                            {l.previous_release_reason === 'employee_exit' ? 'Released on exit' : title(l.previous_release_reason)}
                          </div>
                        )}
                      </td>
                      <td style={{ color: waiting > 30 ? '#A32D2D' : undefined, fontWeight: waiting > 30 ? 600 : undefined }}>
                        {waiting == null ? '—' : waiting === 0 ? 'Today' : `${waiting} day${waiting > 1 ? 's' : ''}`}
                      </td>
                      <td><button className="btn btn-primary btn-sm" onClick={() => setAssigning(l)}>Assign</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {assigning && (
        <AssignModal line={assigning} onClose={() => setAssigning(null)}
                     onAssigned={() => { setAssigning(null); load(); }} />
      )}
    </>
  );
}

// Pick the person. Anyone who already holds a company line is shown as such and
// cannot be picked — the server refuses it anyway, but being told after clicking
// is a worse way to learn it.
function AssignModal({ line, onClose, onAssigned }) {
  const [search, setSearch] = useState('');
  const [employees, setEmployees] = useState([]);
  const [held, setHeld] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (search.trim().length < 2) { setEmployees([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      api.get(`/employees?search=${encodeURIComponent(search)}&status=active&pageSize=10`)
        .then(async r => {
          const rows = r.data.rows || r.data;
          setEmployees(rows);
          // Which of these already hold a line? One call, then a lookup by id.
          const taken = {};
          const reg = await api.get('/mobile-lines?status=assigned&pageSize=200').catch(() => null);
          (reg?.data?.rows || []).forEach(l => { if (l.employee_id) taken[l.employee_id] = l.mobile_number; });
          setHeld(taken);
        })
        .catch(logError).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const assign = async (emp) => {
    setSaving(true); setError('');
    try {
      await api.post(`/mobile-lines/${line.id}/assign`, { employee_id: emp.id });
      onAssigned();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not assign this line');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 560, maxWidth: '92vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
           onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a4a' }}>Assign {line.mobile_number}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6, marginBottom: 16 }}>
          {title(line.operator)} · {line.package_name || 'No package'}
          {line.credit_limit != null ? ` · Limit ${fmtMoney(line.credit_limit)}` : ''}
          {` · CUG ${line.cug_enabled ? 'Yes' : 'No'} · Roaming ${line.roaming_enabled ? 'Yes' : 'No'}`}
        </div>

        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}

        <input className="form-input" autoFocus placeholder="Search an employee by name or number…"
               value={search} onChange={e => setSearch(e.target.value)} />

        <div style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 16, fontSize: 13, color: '#9ca3af' }}>Searching…</div>
          ) : search.trim().length < 2 ? (
            <div style={{ padding: 16, fontSize: 13, color: '#9ca3af' }}>Type at least two characters.</div>
          ) : employees.length === 0 ? (
            <div style={{ padding: 16, fontSize: 13, color: '#9ca3af' }}>No active employees match that.</div>
          ) : employees.map(e => {
            const has = held[e.id];
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0f2a4a' }}>{e.full_name}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                    {[e.employee_number || e.national_id, e.project, e.client].filter(Boolean).join(' · ') || '—'}
                  </div>
                  {has && <div style={{ fontSize: 11, color: '#A32D2D', marginTop: 2 }}>Already holds {has}</div>}
                </div>
                <button className="btn btn-sm" disabled={saving || !!has} onClick={() => assign(e)}>
                  {has ? 'Unavailable' : 'Assign'}
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
