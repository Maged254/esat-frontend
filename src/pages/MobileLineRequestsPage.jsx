import React, { useEffect, useState, useCallback } from 'react';
import ExcelJS from 'exceljs';
import api, { logError } from '../utils/api';
import MobileLinesTabs from '../components/MobileLinesTabs';

// Someone needs a company line. HR or an admin raises it against the employee;
// it is closed by handing over a free number.
//
// A request is a note that somebody is waiting, not a workflow with approval —
// so it has exactly two ends: fulfilled, or cancelled.
const STATUS = {
  pending:   { label: 'Pending',   cls: 'tag-amber' },
  fulfilled: { label: 'Fulfilled', cls: 'tag-green' },
  cancelled: { label: 'Cancelled', cls: 'tag-gray' },
};
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—';
const title = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());

export default function MobileLineRequestsPage() {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({});
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [raising, setRaising] = useState(false);
  const [fulfilling, setFulfilling] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (status) p.append('status', status);
    if (search) p.append('search', search);
    api.get('/mobile-line-requests?' + p)
      .then(r => { setRows(r.data.rows); setStats(r.data.stats || {}); })
      .catch(logError).finally(() => setLoading(false));
  }, [status, search]);

  useEffect(() => { load(); }, [load]);

  // Exports exactly what the current filter shows, so the file and the table
  // can never disagree -- the rows are already loaded, no second request.
  const exportExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Line Requests');
    ws.columns = [
      { header: 'Employee', key: 'employee_name_snapshot', width: 28 },
      { header: 'Employee No', key: 'employee_number', width: 13 },
      { header: 'National ID', key: 'national_id', width: 14 },
      { header: 'Job Title', key: 'job_title', width: 24 },
      { header: 'Project', key: 'project_snapshot', width: 16 },
      { header: 'Client', key: 'client_snapshot', width: 14 },
      { header: 'Operator', key: 'operator_txt', width: 12 },
      { header: 'Package', key: 'requested_package', width: 18 },
      { header: 'Monthly Cost', key: 'requested_price', width: 13 },
      { header: 'CUG', key: 'cug_txt', width: 7 },
      { header: 'Reason', key: 'reason', width: 44 },
      { header: 'Status', key: 'status_txt', width: 12 },
      { header: 'Requested By', key: 'requested_by_name', width: 20 },
      { header: 'Requested On', key: 'requested_on', width: 14 },
      { header: 'Line Issued', key: 'mobile_number', width: 14 },
      { header: 'Fulfilled On', key: 'fulfilled_on', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    rows.forEach(r => ws.addRow({
      ...r,
      operator_txt: title(r.requested_operator || r.operator || ''),
      cug_txt: r.requested_cug ? 'Yes' : 'No',
      status_txt: (STATUS[r.status] || {}).label || r.status,
      requested_price: r.requested_price == null ? null : Number(r.requested_price),
      requested_on: fmtDate(r.requested_at).replace('—', ''),
      fulfilled_on: fmtDate(r.fulfilled_at).replace('—', ''),
      mobile_number: r.mobile_number || '',
    }));
    ws.autoFilter = { from: 'A1', to: { row: Math.max(1, rows.length + 1), column: ws.columns.length } };
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf]));
    const a = document.createElement('a');
    a.href = url; a.download = `OneHub-Line-Requests-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  };

  const cancel = async (r) => {
    const reason = window.prompt(`Cancel the line request for ${r.employee_name_snapshot}?\n\nReason (optional):`);
    if (reason === null) return;
    setError('');
    try { await api.post(`/mobile-line-requests/${r.id}/cancel`, { reason }); load(); }
    catch (e) { setError(e.response?.data?.error || 'Could not cancel that request'); }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Request a New Line</span>
        </div>
        <div className="topbar-right">
          <button className="btn btn-primary" onClick={() => setRaising(true)}>+ Request a Line</button>
        </div>
      </div>

      <div className="content graphs-content">
        <MobileLinesTabs />
        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

        <div className="card">
          <div className="card-header">
            <span className="card-title">Line Requests</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {['pending', 'fulfilled', 'cancelled', ''].map(s => (
                <button key={s || 'all'} className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12,
                          background: status === s ? 'var(--eg-navy)' : '', color: status === s ? '#fff' : '' }}
                        onClick={() => setStatus(s)}>
                  {s ? STATUS[s].label : 'All'}{s === 'pending' && stats.pending ? ` · ${stats.pending}` : ''}
                </button>
              ))}
              <button className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12 }}
                      onClick={exportExcel} disabled={loading || rows.length === 0}>⭳ Export</button>
            </div>
          </div>

          <div style={{ padding: '12px 16px' }}>
            <input className="form-input" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 240 }}
                   placeholder="Employee name…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table-hover-soft">
              <thead>
                <tr><th>Employee</th><th>Project / Client</th><th>Asking For</th><th>Reason</th><th>Requested</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ padding: 24, color: '#9ca3af', fontSize: 13 }}>Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 24, color: '#9ca3af', fontSize: 13 }}>
                    {status === 'pending' ? 'Nobody is waiting for a line.' : 'No requests here.'}
                  </td></tr>
                ) : rows.map(r => {
                  const meta = STATUS[r.status] || { label: r.status, cls: 'tag-gray' };
                  return (
                    <tr key={r.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.employee_name_snapshot}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                          {[r.national_id, r.job_title].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </td>
                      <td>
                        {r.project_snapshot || '—'}
                        {r.client_snapshot && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.client_snapshot}</div>}
                      </td>
                      <td style={{ maxWidth: 200 }}>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>
                          {r.requested_package || '—'}{r.requested_cug ? ' + CUG' : ''}
                        </div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                          {r.requested_operator === 'safaricom' ? 'Safaricom' : r.requested_operator === 'airtel' ? 'Airtel' : '—'}
                        </div>
                      </td>
                      <td style={{ maxWidth: 220, color: '#6b7280' }}>{r.reason || '—'}</td>
                      <td>
                        {fmtDate(r.requested_at)}
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.requested_by_name || '—'}</div>
                      </td>
                      <td>
                        <span className={`tag ${meta.cls}`}>{meta.label}</span>
                        {r.status === 'fulfilled' && (
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                            {r.mobile_number} · {r.fulfilled_by_name} · {fmtDate(r.fulfilled_at)}
                          </div>
                        )}
                        {r.status === 'cancelled' && (
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                            {r.cancel_reason || 'no reason given'} · {r.cancelled_by_name}
                          </div>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {r.status === 'pending' && (
                          <>
                            <button className="btn btn-primary btn-sm" onClick={() => setFulfilling(r)}>Hand over a line</button>
                            <button className="btn btn-sm" style={{ marginLeft: 6, color: '#c0392b', borderColor: '#f0c9c6' }}
                                    onClick={() => cancel(r)}>Cancel</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {raising && <RaiseModal onClose={() => setRaising(false)} onDone={() => { setRaising(false); load(); }} />}
      {fulfilling && (
        <FulfilModal request={fulfilling} onClose={() => setFulfilling(null)}
                     onDone={() => { setFulfilling(null); load(); }} />
      )}
    </>
  );
}

function RaiseModal({ onClose, onDone }) {
  const [search, setSearch] = useState('');
  const [employees, setEmployees] = useState([]);
  const [picked, setPicked] = useState(null);
  const [reason, setReason] = useState('');
  const [operator, setOperator] = useState('');
  const [packageId, setPackageId] = useState('');
  const [cug, setCug] = useState(false);
  const [packages, setPackages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Packages belong to one operator, so the list only loads once a network is
  // chosen -- and resets if it changes, so a mismatched pair cannot be sent.
  useEffect(() => {
    setPackageId('');
    if (!operator) { setPackages([]); return; }
    api.get(`/mobile-lines/products/packages?operator=${operator}`)
      .then(r => setPackages(r.data)).catch(logError);
  }, [operator]);

  const [held, setHeld] = useState({});     // employee id -> the number they hold
  const [asked, setAsked] = useState({});    // employee id -> already requested

  // A line can only be requested for someone who has none, so the picker says
  // which people are ineligible and why, instead of letting the click fail.
  useEffect(() => {
    api.get('/mobile-lines?status=assigned&pageSize=300')
      .then(r => { const m = {}; (r.data.rows || []).forEach(l => { if (l.employee_id) m[l.employee_id] = l.mobile_number; }); setHeld(m); })
      .catch(logError);
    api.get('/mobile-line-requests?status=pending')
      .then(r => { const m = {}; (r.data.rows || []).forEach(x => { m[x.employee_id] = true; }); setAsked(m); })
      .catch(logError);
  }, []);

  useEffect(() => {
    if (search.trim().length < 2) { setEmployees([]); return; }
    const t = setTimeout(() => {
      api.get(`/employees?search=${encodeURIComponent(search)}&status=active&pageSize=10`)
        .then(r => setEmployees(r.data.rows || r.data)).catch(logError);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const submit = async () => {
    setBusy(true); setError('');
    try { await api.post('/mobile-line-requests', { employee_id: picked.id, reason, operator, package_id: packageId, cug }); onDone(); }
    catch (e) { setError(e.response?.data?.error || 'Could not raise this request'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 520, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
           onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a4a' }}>Request a new line</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6, marginBottom: 16 }}>
          {picked ? `${picked.full_name} · ${picked.project || '—'}` : 'Who needs a company line?'}
        </div>

        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}

        {!picked ? (
          <>
            <input className="form-input" autoFocus placeholder="Search an employee…"
                   value={search} onChange={e => setSearch(e.target.value)} />
            <div style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
              {employees.map(e => {
                const blocked = held[e.id] ? `Already holds ${held[e.id]}` : asked[e.id] ? 'Already has an open request' : null;
                return (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#0f2a4a' }}>{e.full_name}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                        {[e.national_id, e.job_title, e.project].filter(Boolean).join(' · ')}
                      </div>
                      {blocked && <div style={{ fontSize: 11, color: '#A32D2D', marginTop: 2 }}>{blocked}</div>}
                    </div>
                    <button className="btn btn-sm" disabled={!!blocked} onClick={() => setPicked(e)}>
                      {blocked ? 'Not eligible' : 'Select'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, width: 150 }}>Operator *
                <select className="form-select" value={operator} onChange={e => setOperator(e.target.value)}>
                  <option value="">Choose…</option>
                  <option value="safaricom">Safaricom</option>
                  <option value="airtel">Airtel</option>
                </select>
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>Package *
                <select className="form-select" value={packageId} disabled={!operator}
                        onChange={e => setPackageId(e.target.value)}>
                  <option value="">{operator ? 'Choose…' : 'Pick an operator first'}</option>
                  {packages.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.package_name}{p.monthly_price != null ? ` — KES ${Number(p.monthly_price).toLocaleString()}/mo` : ''}
                    </option>
                  ))}
                </select>
                {operator && packages.length === 0 && (
                  <span style={{ fontSize: 11, color: '#c0392b' }}>No active packages for this operator yet.</span>
                )}
              </label>
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={cug} onChange={e => setCug(e.target.checked)} />
              They need CUG
            </label>

            <label style={{ fontSize: 12, fontWeight: 600 }}>Why do they need one? *
              <input className="form-input" value={reason} placeholder="e.g. new joiner, replacing a faulty handset"
                     onChange={e => setReason(e.target.value)}
                     onKeyDown={e => { if (e.key === 'Enter' && reason.trim() && packageId) submit(); }} />
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                Whoever hands over a line reads this to decide — free numbers are few.
              </span>
            </label>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
          {picked ? <button className="btn" onClick={() => setPicked(null)}>← Someone else</button> : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            {picked && (
              <button className="btn btn-primary" disabled={busy || !reason.trim() || !operator || !packageId} onClick={submit}>
                {busy ? 'Saving…' : 'Raise request'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Closing a request means handing over a real number, so this picks from the
// same free pool Available Lines shows — never from thin air.
function FulfilModal({ request, onClose, onDone }) {
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Only numbers on the network that was asked for: a Safaricom package cannot
  // be put on an Airtel line, and the server refuses the pair anyway.
  useEffect(() => {
    const q = request.requested_operator ? `?operator=${request.requested_operator}` : '';
    api.get('/mobile-lines/available/list' + q).then(r => setLines(r.data)).catch(logError);
  }, [request.requested_operator]);

  const give = async (line) => {
    setBusy(true); setError('');
    try { await api.post(`/mobile-line-requests/${request.id}/fulfil`, { mobile_line_id: line.id }); onDone(); }
    catch (e) { setError(e.response?.data?.error || 'Could not hand over that line'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 560, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
           onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a4a' }}>Hand a line to {request.employee_name_snapshot}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6, marginBottom: 8 }}>
          {request.project_snapshot || '—'}{request.reason ? ` · ${request.reason}` : ''}
        </div>
        {/* Handing over applies what was asked for, so say so before the click. */}
        <div style={{ fontSize: 12, color: '#0f2a4a', background: '#F0F7FF', border: '1px solid #cfe0f2',
                      borderRadius: 6, padding: '8px 10px', marginBottom: 14 }}>
          Asked for <b>{request.requested_package || 'no package'}</b>
          {request.requested_cug ? ' with CUG' : ' without CUG'} on{' '}
          <b>{request.requested_operator === 'safaricom' ? 'Safaricom' : request.requested_operator === 'airtel' ? 'Airtel' : '—'}</b>.
          The number you pick will be set to this.
        </div>

        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}

        {lines.length === 0 ? (
          <div style={{ background: '#FFF8E6', border: '1px solid #F2DFA8', borderRadius: 6, padding: '10px 12px', fontSize: 13, color: '#7a5b12' }}>
            No {request.requested_operator === 'airtel' ? 'Airtel' : 'Safaricom'} lines are free. Release one, or add a
            new number in the Lines Register first.
          </div>
        ) : lines.map(l => (
          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#0f2a4a' }}>{l.mobile_number}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                {l.operator === 'safaricom' ? 'Safaricom' : 'Airtel'} · {l.package_name || 'no package'}
                {l.cug_enabled ? ' · CUG' : ''}{l.roaming_enabled ? ' · Roaming' : ''}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => give(l)}>Hand over</button>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
