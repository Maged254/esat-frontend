import React, { useEffect, useState, useCallback } from 'react';
import api, { logError } from '../utils/api';
import MobileLinesTabs from '../components/MobileLinesTabs';

// Change Requests: the queue, and the place a request is raised.
//
// The distinction the whole module rests on shows up here in the UI as well as
// the data — a request never displays as if it were live configuration. Current
// stays on the left of every arrow until an operator has actually done it.
const STATUS_META = {
  pending_approval:      { label: 'Pending Approval',      cls: 'tag-amber' },
  approved:              { label: 'Approved',              cls: 'tag-navy' },
  email_prepared:        { label: 'Email Prepared',        cls: 'tag-navy' },
  sent_to_operator:      { label: 'Sent to Operator',      cls: 'tag-navy' },
  partially_implemented: { label: 'Partially Implemented', cls: 'tag-amber' },
  implemented:           { label: 'Implemented',           cls: 'tag-green' },
  rejected:              { label: 'Rejected',              cls: 'tag-red' },
  cancelled:             { label: 'Cancelled',             cls: 'tag-gray' },
};
const FIELD_LABEL = { package: 'Package', credit_limit: 'Credit Limit', cug: 'CUG', roaming: 'Roaming' };
const title = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

export default function MobileChangeRequestsPage() {
  const user = JSON.parse(localStorage.getItem('esat_user') || '{}');
  const isAdmin = user.role === 'admin';
  const canRequest = ['admin', 'supervisor', 'project_director'].includes(user.role);

  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({});
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [raising, setRaising] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (status) p.append('status', status);
    if (search) p.append('search', search);
    Promise.all([
      api.get('/mobile-line-change-requests?' + p),
      api.get('/mobile-line-change-requests/stats'),
    ]).then(([list, s]) => { setRows(list.data.rows); setStats(s.data); })
      .catch(logError).finally(() => setLoading(false));
  }, [status, search]);

  useEffect(() => { load(); }, [load]);

  const chip = (label, value, key) => (
    <button className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12, background: status === key ? 'var(--eg-navy)' : '', color: status === key ? '#fff' : '' }}
            onClick={() => setStatus(status === key ? '' : key)}>
      {label}{value != null ? ` · ${value}` : ''}
    </button>
  );

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Change Requests</span>
        </div>
        <div className="topbar-right">
          {canRequest && <button className="btn btn-primary" onClick={() => setRaising(true)}>+ Request a Change</button>}
        </div>
      </div>

      <div className="content graphs-content">
        <MobileLinesTabs />
        <div className="card">
          <div className="card-header">
            <span className="card-title">Change Requests</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {chip('Pending Approval', stats.pending_approval, 'pending_approval')}
              {chip('Awaiting Email', stats.awaiting_email, 'approved')}
              {chip('Awaiting Operator', stats.awaiting_operator, 'sent_to_operator')}
            </div>
          </div>

          <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="form-input" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 240 }}
                   placeholder="Employee or mobile number…" value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 190 }}
                    value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {(status || search) && (
              <button className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12 }}
                      onClick={() => { setStatus(''); setSearch(''); }}>✕ Clear</button>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table-hover-soft">
              <thead>
                <tr>
                  <th>Employee</th><th>Mobile Number</th><th>Operator</th><th>Project</th>
                  <th>Changes</th><th>Status</th><th>Requested</th><th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ padding: 24, color: '#9ca3af', fontSize: 13 }}>Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: 24, color: '#9ca3af', fontSize: 13 }}>
                    No change requests{status ? ' with that status' : ''}.
                  </td></tr>
                ) : rows.map(r => {
                  const meta = STATUS_META[r.status] || { label: title(r.status), cls: 'tag-gray' };
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.employee_name_snapshot}</td>
                      <td>{r.mobile_number}</td>
                      <td>{title(r.operator)}</td>
                      <td>{r.project_snapshot || '—'}</td>
                      <td>
                        {(r.items || []).map(i => (
                          <div key={i.id} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                            <span style={{ color: '#6b7280' }}>{FIELD_LABEL[i.field_name]}</span>{' '}
                            {i.current_value_snapshot ?? 'Not set'} <span style={{ color: '#9ca3af' }}>→</span>{' '}
                            <b>{i.approved_value ?? i.original_requested_value}</b>
                            {i.approved_value !== i.original_requested_value && (
                              <span style={{ color: '#d97706', fontSize: 11 }}> (asked {i.original_requested_value})</span>
                            )}
                          </div>
                        ))}
                      </td>
                      <td>
                        <span className={`tag ${meta.cls}`}>{meta.label}</span>
                        {r.status === 'rejected' && r.rejection_reason && (
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, maxWidth: 200 }}>{r.rejection_reason}</div>
                        )}
                      </td>
                      <td>
                        {fmtDate(r.requested_at)}
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.requested_by_name || '—'}</div>
                      </td>
                      <td><button className="btn btn-sm" onClick={() => setDetail(r)}>Open</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {raising && <RaiseModal onClose={() => setRaising(false)} onDone={() => { setRaising(false); load(); }} />}
      {detail && (
        <DetailModal request={detail} isAdmin={isAdmin} currentUserId={user.id}
                     onClose={() => setDetail(null)} onChanged={() => { setDetail(null); load(); }} />
      )}
    </>
  );
}

// Employee first, then the line, then Current → Requested. A supervisor never
// picks a number: OneHub finds the one their person holds.
function RaiseModal({ onClose, onDone }) {
  const [search, setSearch] = useState('');
  const [employees, setEmployees] = useState([]);
  const [ctx, setCtx] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (search.trim().length < 2) { setEmployees([]); return; }
    const t = setTimeout(() => {
      api.get(`/employees?search=${encodeURIComponent(search)}&status=active&pageSize=10`)
        .then(r => setEmployees(r.data.rows || r.data)).catch(logError);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const pick = async (emp) => {
    setError(''); setBusy(true);
    try {
      const { data } = await api.get(`/mobile-line-change-requests/context/${emp.id}`);
      setCtx(data);
      if (data.line) {
        setForm({
          package_id: data.line.package_id || '',
          credit_limit_id: data.line.credit_limit_id || '',
          cug: data.line.cug_enabled,
          roaming: data.line.roaming_enabled,
        });
      }
    } catch (e) { setError(e.response?.data?.error || 'Could not load that employee'); }
    finally { setBusy(false); }
  };

  const line = ctx?.line;
  const changes = !line ? [] : [
    form.package_id !== (line.package_id || '') && { label: 'Package', from: line.package_name ?? 'Not set', to: ctx.packages.find(p => p.id === form.package_id)?.package_name ?? 'Not set' },
    form.credit_limit_id !== (line.credit_limit_id || '') && { label: 'Credit Limit', from: line.credit_limit ?? 'Not set', to: ctx.credit_limits.find(c => c.id === form.credit_limit_id)?.credit_limit ?? 'Not set' },
    form.cug !== line.cug_enabled && { label: 'CUG', from: line.cug_enabled ? 'Yes' : 'No', to: form.cug ? 'Yes' : 'No' },
    form.roaming !== line.roaming_enabled && { label: 'Roaming', from: line.roaming_enabled ? 'Yes' : 'No', to: form.roaming ? 'Yes' : 'No' },
  ].filter(Boolean);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await api.post('/mobile-line-change-requests', {
        employee_id: ctx.employee.id,
        package_id: form.package_id || null,
        credit_limit_id: form.credit_limit_id || null,
        cug: form.cug, roaming: form.roaming,
      });
      onDone();
    } catch (e) { setError(e.response?.data?.error || 'Could not submit this request'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 600, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
           onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a4a' }}>Request a Mobile Line Change</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6, marginBottom: 16 }}>
          {ctx ? `${ctx.employee.full_name} · ${ctx.employee.project || '—'}` : 'Start by choosing the employee.'}
        </div>

        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}

        {!ctx ? (
          <>
            <input className="form-input" autoFocus placeholder="Search an employee…"
                   value={search} onChange={e => setSearch(e.target.value)} />
            <div style={{ marginTop: 12, maxHeight: 280, overflowY: 'auto' }}>
              {employees.map(e => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#0f2a4a' }}>{e.full_name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                      {[e.employee_number || e.national_id, e.project].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button className="btn btn-sm" disabled={busy} onClick={() => pick(e)}>Select</button>
                </div>
              ))}
            </div>
          </>
        ) : !line ? (
          <div style={{ background: '#FFF8E6', border: '1px solid #F2DFA8', borderRadius: 6, padding: '10px 12px', fontSize: 13, color: '#6b7280' }}>
            {ctx.reason} Ask HR to assign one first.
          </div>
        ) : ctx.open_request ? (
          <div style={{ background: '#FFF8E6', border: '1px solid #F2DFA8', borderRadius: 6, padding: '10px 12px', fontSize: 13, color: '#6b7280' }}>
            {line.mobile_number} already has a change in progress ({title(ctx.open_request.status)}). Resolve that one first.
          </div>
        ) : (
          <>
            <div style={{ background: '#F0F7FF', border: '1px solid #cfe0f2', borderRadius: 6, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#0f2a4a' }}>
              <b>{line.mobile_number}</b> · {title(line.operator)} — the line keeps its current setup until {title(line.operator)} confirms the change.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Package
                <select className="form-select" value={form.package_id}
                        onChange={e => setForm(f => ({ ...f, package_id: e.target.value }))}>
                  <option value="">Not set</option>
                  {ctx.packages.map(p => <option key={p.id} value={p.id}>{p.package_name}</option>)}
                </select>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>Currently {line.package_name ?? 'Not set'}</span>
              </label>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Credit Limit
                <select className="form-select" value={form.credit_limit_id}
                        onChange={e => setForm(f => ({ ...f, credit_limit_id: e.target.value }))}>
                  <option value="">Not set</option>
                  {ctx.credit_limits.map(c => <option key={c.id} value={c.id}>{c.credit_limit}</option>)}
                </select>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>Currently {line.credit_limit ?? 'Not set'}</span>
              </label>
              <div style={{ display: 'flex', gap: 24 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={!!form.cug} onChange={e => setForm(f => ({ ...f, cug: e.target.checked }))} />
                  CUG <span style={{ color: '#9ca3af', fontWeight: 400 }}>(now {line.cug_enabled ? 'Yes' : 'No'})</span>
                </label>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={!!form.roaming} onChange={e => setForm(f => ({ ...f, roaming: e.target.checked }))} />
                  Roaming <span style={{ color: '#9ca3af', fontWeight: 400 }}>(now {line.roaming_enabled ? 'Yes' : 'No'})</span>
                </label>
              </div>
            </div>

            <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9ca3af', marginBottom: 6 }}>
                What will be asked of {title(line.operator)}
              </div>
              {changes.length === 0 ? (
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Nothing yet — change a value above.</div>
              ) : changes.map(c => (
                <div key={c.label} style={{ fontSize: 13, marginBottom: 3 }}>
                  <span style={{ color: '#6b7280' }}>{c.label}</span>{' '}
                  {String(c.from)} <span style={{ color: '#9ca3af' }}>→</span> <b>{String(c.to)}</b>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 18 }}>
          {ctx ? <button className="btn" onClick={() => { setCtx(null); setSearch(''); }}>← Another employee</button> : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            {line && !ctx.open_request && (
              <button className="btn btn-primary" disabled={busy || changes.length === 0} onClick={submit}>
                {busy ? 'Submitting…' : `Submit ${changes.length || ''} change${changes.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Approve, modify-and-approve, reject, or withdraw. The approved value starts as
// what was asked for; an admin can cut it down, and both numbers survive.
function DetailModal({ request, isAdmin, currentUserId, onClose, onChanged }) {
  const [items, setItems] = useState(() => Object.fromEntries((request.items || []).map(i => [i.field_name, i.approved_value])));
  const [ctx, setCtx] = useState(null);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = request.status === 'pending_approval';
  // Confirming is only possible once the operator has actually been asked.
  const confirmable = isAdmin && ['sent_to_operator', 'partially_implemented'].includes(request.status);
  const [outcome, setOutcome] = useState({});   // itemId -> 'implemented' | 'not_implemented'
  const [reasons, setReasons] = useState({});   // itemId -> why it was not implemented
  const awaiting = (request.items || []).filter(i => i.implementation_status === 'awaiting');
  const decided = awaiting.filter(i => outcome[i.id]);
  const missingReason = decided.some(i => outcome[i.id] === 'not_implemented' && !(reasons[i.id] || '').trim());

  const confirm = () => act('confirm', {
    items: decided.map(i => ({ id: i.id, status: outcome[i.id], reason: reasons[i.id] })),
  });

  useEffect(() => {
    if (isAdmin && pending) {
      api.get(`/mobile-line-change-requests/context/${request.employee_id}`).then(r => setCtx(r.data)).catch(() => {});
    }
  }, [isAdmin, pending, request.employee_id]);

  const act = async (path, body) => {
    setBusy(true); setError('');
    try { await api.post(`/mobile-line-change-requests/${request.id}/${path}`, body); onChanged(); }
    catch (e) { setError(e.response?.data?.error || 'That did not work'); }
    finally { setBusy(false); }
  };

  const approve = () => {
    // Send only what the admin actually altered; anything untouched keeps the
    // requested value the server already stored.
    const overrides = {};
    (request.items || []).forEach(i => {
      if (items[i.field_name] !== i.approved_value) {
        if (i.field_name === 'package') overrides.package = items[i.field_name];
        else if (i.field_name === 'credit_limit') overrides.credit_limit = items[i.field_name];
        else overrides[i.field_name] = items[i.field_name] === 'Yes';
      }
    });
    act('approve', { items: overrides });
  };

  const meta = STATUS_META[request.status] || { label: title(request.status), cls: 'tag-gray' };
  const canWithdraw = pending && (isAdmin || request.requested_by === currentUserId);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 620, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
           onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a4a' }}>{request.employee_name_snapshot}</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
              {request.mobile_number} · {title(request.operator)} · {request.project_snapshot || '—'}
            </div>
          </div>
          <span className={`tag ${meta.cls}`}>{meta.label}</span>
        </div>

        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
          Raised by {request.requested_by_name || '—'} on {fmtDate(request.requested_at)}
          {request.approved_by_name && ` · approved by ${request.approved_by_name} on ${fmtDate(request.approved_at)}`}
          {request.rejected_by_name && ` · rejected by ${request.rejected_by_name} on ${fmtDate(request.rejected_at)}`}
          {request.cancelled_by_name && ` · cancelled by ${request.cancelled_by_name} on ${fmtDate(request.cancelled_at)}`}
        </div>

        {request.rejection_reason && (
          <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginTop: 12, fontSize: 13 }}>
            <b>Rejected:</b> {request.rejection_reason}
          </div>
        )}
        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginTop: 12, fontSize: 13 }}>{error}</div>}

        <div style={{ marginTop: 16, border: '1px solid #eef2f6', borderRadius: 8, overflow: 'hidden' }}>
          <table className="table-hover-soft" style={{ margin: 0 }}>
            <thead><tr><th>Item</th><th>Current</th><th>Requested</th>
              {isAdmin && pending && <th>Approve as</th>}
              {(confirmable || request.status === 'implemented') && <th>Operator did</th>}
            </tr></thead>
            <tbody>
              {(request.items || []).map(i => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 600 }}>{FIELD_LABEL[i.field_name]}</td>
                  <td>{i.current_value_snapshot ?? 'Not set'}</td>
                  <td>{i.original_requested_value}</td>
                  {isAdmin && pending && (
                    <td>
                      {i.field_name === 'package' && ctx ? (
                        <select className="form-select" style={{ height: 30, fontSize: 12 }}
                                value={ctx.packages.find(p => p.package_name === items.package)?.id || ''}
                                onChange={e => setItems(s => ({ ...s, package: ctx.packages.find(p => p.id === e.target.value)?.package_name }))}>
                          {ctx.packages.map(p => <option key={p.id} value={p.id}>{p.package_name}</option>)}
                        </select>
                      ) : i.field_name === 'credit_limit' && ctx ? (
                        <select className="form-select" style={{ height: 30, fontSize: 12 }}
                                value={ctx.credit_limits.find(c => String(c.credit_limit) === String(items.credit_limit))?.id || ''}
                                onChange={e => setItems(s => ({ ...s, credit_limit: String(ctx.credit_limits.find(c => c.id === e.target.value)?.credit_limit) }))}>
                          {ctx.credit_limits.map(c => <option key={c.id} value={c.id}>{c.credit_limit}</option>)}
                        </select>
                      ) : (
                        <select className="form-select" style={{ height: 30, fontSize: 12 }}
                                value={items[i.field_name]}
                                onChange={e => setItems(s => ({ ...s, [i.field_name]: e.target.value }))}>
                          <option value="Yes">Yes</option><option value="No">No</option>
                        </select>
                      )}
                    </td>
                  )}
                  {(confirmable || request.status === 'implemented') && (
                    <td style={{ minWidth: 210 }}>
                      {i.implementation_status === 'implemented' ? (
                        <span className="tag tag-green">Implemented</span>
                      ) : i.implementation_status === 'not_implemented' ? (
                        <>
                          <span className="tag tag-gray">Not implemented</span>
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{i.not_implemented_reason}</div>
                        </>
                      ) : confirmable ? (
                        <>
                          <select className="form-select" style={{ height: 30, fontSize: 12 }}
                                  value={outcome[i.id] || ''}
                                  onChange={e => setOutcome(o => ({ ...o, [i.id]: e.target.value }))}>
                            <option value="">Not confirmed yet</option>
                            <option value="implemented">Implemented</option>
                            <option value="not_implemented">Not implemented</option>
                          </select>
                          {outcome[i.id] === 'not_implemented' && (
                            <input className="form-input" style={{ height: 30, fontSize: 12, marginTop: 4 }}
                                   placeholder="Why not? (required)"
                                   value={reasons[i.id] || ''}
                                   onChange={e => setReasons(rs => ({ ...rs, [i.id]: e.target.value }))} />
                          )}
                        </>
                      ) : <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isAdmin && pending && (
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
            Approving authorises us to ask {title(request.operator)}. It does not change the line — that only happens
            once you confirm what the operator actually did.
          </div>
        )}

        {confirmable && (
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8, background: '#F0F7FF', border: '1px solid #cfe0f2', borderRadius: 6, padding: '8px 10px' }}>
            Record what {title(request.operator)} actually did. Only the items you mark <b>Implemented</b> change the
            line; anything marked Not implemented keeps its current value and closes with your reason. Leave an item
            unconfirmed and the request stays Partially Implemented until it is settled.
          </div>
        )}

        {rejecting && (
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Why is this being rejected? *
              <input className="form-input" autoFocus value={reason} onChange={e => setReason(e.target.value)}
                     placeholder="The requester will be emailed this" />
            </label>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <button className="btn" onClick={onClose}>Close</button>
          {canWithdraw && !rejecting && (
            <button className="btn" style={{ color: '#c0392b', borderColor: '#f0c9c6' }}
                    disabled={busy} onClick={() => act('cancel')}>Withdraw</button>
          )}
          {isAdmin && pending && !rejecting && (
            <>
              <button className="btn" style={{ color: '#c0392b', borderColor: '#f0c9c6' }} onClick={() => setRejecting(true)}>Reject</button>
              <button className="btn btn-primary" disabled={busy} onClick={approve}>{busy ? 'Working…' : 'Approve'}</button>
            </>
          )}
          {confirmable && (
            <button className="btn btn-primary" disabled={busy || !decided.length || missingReason} onClick={confirm}>
              {busy ? 'Saving…' : `Confirm ${decided.length || ''} item${decided.length === 1 ? '' : 's'}`}
            </button>
          )}
          {rejecting && (
            <>
              <button className="btn" onClick={() => { setRejecting(false); setReason(''); }}>Back</button>
              <button className="btn btn-primary" disabled={busy || !reason.trim()}
                      onClick={() => act('reject', { rejection_reason: reason.trim() })}>
                {busy ? 'Rejecting…' : 'Confirm rejection'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
