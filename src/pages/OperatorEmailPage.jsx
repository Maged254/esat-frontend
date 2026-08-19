import React, { useEffect, useState, useCallback } from 'react';
import api, { logError } from '../utils/api';
import MobileLinesTabs from '../components/MobileLinesTabs';

// Operator email: the queue of approved changes, the batch you read before it
// goes out, and the switch that decides whether it goes to Safaricom at all.
//
// This is the only place in OneHub that writes to an outside company, so the
// screen is built to make that obvious — an operator stays visibly INACTIVE, and
// sending is refused by the server until someone deliberately turns it on.
const OPERATORS = [{ value: 'safaricom', label: 'Safaricom' }, { value: 'airtel', label: 'Airtel' }];
const title = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB') : '—';

export default function OperatorEmailPage() {
  const [settings, setSettings] = useState([]);
  const [queue, setQueue] = useState([]);
  const [batches, setBatches] = useState([]);
  const [picked, setPicked] = useState({});
  const [preview, setPreview] = useState(null);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/mobile-line-email-batches/settings'),
      api.get('/mobile-line-change-requests?status=approved'),
      api.get('/mobile-line-email-batches'),
    ]).then(([s, q, b]) => { setSettings(s.data); setQueue(q.data.rows); setBatches(b.data); })
      .catch(logError).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const prepare = async (operator) => {
    const ids = queue.filter(r => r.operator === operator && picked[r.id]).map(r => r.id);
    if (!ids.length) { setError(`Select at least one approved ${title(operator)} request.`); return; }
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/mobile-line-email-batches/prepare', { operator, request_ids: ids });
      setPicked({});
      setPreview(data.id);
      load();
    } catch (e) { setError(e.response?.data?.error || 'Could not prepare that email'); }
    finally { setBusy(false); }
  };

  const byOperator = (op) => queue.filter(r => r.operator === op);

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Operator Email</span>
        </div>
      </div>

      <div className="content graphs-content">
        <MobileLinesTabs />
        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

        {/* Go-live state, first thing on the page */}
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))', marginBottom: 16 }}>
          {settings.map(s => (
            <div key={s.id} className="card" style={{ padding: '14px 16px', borderLeft: `3px solid ${s.is_active ? 'var(--eg-green)' : '#d97706'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f2a4a' }}>{title(s.operator)}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
                    {s.is_active ? <>Sending to <b>{s.to_recipients}</b></> : <>Not live — nothing will be sent</>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={`tag ${s.is_active ? 'tag-green' : 'tag-amber'}`}>{s.is_active ? 'Live' : 'Inactive'}</span>
                  <button className="btn btn-sm" onClick={() => setEditing(s)}>Settings</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* The queue, split by operator — they can never share an email */}
        {OPERATORS.map(op => {
          const rows = byOperator(op.value);
          const selected = rows.filter(r => picked[r.id]).length;
          return (
            <div className="card" key={op.value} style={{ marginBottom: 16 }}>
              <div className="card-header">
                <span className="card-title">{op.label} — Approved, awaiting email</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{rows.length} request{rows.length === 1 ? '' : 's'}</span>
                  <button className="btn btn-primary btn-sm" disabled={busy || !selected} onClick={() => prepare(op.value)}>
                    Prepare {op.label} email{selected ? ` (${selected})` : ''}
                  </button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table-hover-soft">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>
                        <input type="checkbox"
                               checked={rows.length > 0 && rows.every(r => picked[r.id])}
                               onChange={e => {
                                 const next = { ...picked };
                                 rows.forEach(r => { if (e.target.checked) next[r.id] = true; else delete next[r.id]; });
                                 setPicked(next);
                               }} />
                      </th>
                      <th>Employee</th><th>Mobile Number</th><th>Project</th><th>Changes</th><th>Approved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} style={{ padding: 20, color: '#9ca3af', fontSize: 13 }}>Loading…</td></tr>
                    ) : rows.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: 20, color: '#9ca3af', fontSize: 13 }}>Nothing approved and waiting for {op.label}.</td></tr>
                    ) : rows.map(r => (
                      <tr key={r.id}>
                        <td>
                          <input type="checkbox" checked={!!picked[r.id]}
                                 onChange={e => setPicked(p => { const n = { ...p }; if (e.target.checked) n[r.id] = true; else delete n[r.id]; return n; })} />
                        </td>
                        <td style={{ fontWeight: 600 }}>{r.employee_name_snapshot}</td>
                        <td>{r.mobile_number}</td>
                        <td>{r.project_snapshot || '—'}</td>
                        <td>
                          {(r.items || []).map(i => (
                            <div key={i.id} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#6b7280' }}>{title(i.field_name)}</span>{' '}
                              {i.current_value_snapshot ?? 'Not set'} <span style={{ color: '#9ca3af' }}>→</span> <b>{i.approved_value}</b>
                            </div>
                          ))}
                        </td>
                        <td style={{ fontSize: 12, color: '#6b7280' }}>
                          {r.approved_by_name}<div style={{ fontSize: 11, color: '#9ca3af' }}>{fmtDateTime(r.approved_at)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        <div className="card">
          <div className="card-header"><span className="card-title">Email Batches</span></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table-hover-soft">
              <thead><tr><th>Operator</th><th>Subject</th><th>Requests</th><th>Status</th><th>Prepared</th><th>Sent</th><th></th></tr></thead>
              <tbody>
                {batches.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 20, color: '#9ca3af', fontSize: 13 }}>No batches yet.</td></tr>
                ) : batches.map(b => (
                  <tr key={b.id}>
                    <td>{title(b.operator)}</td>
                    <td style={{ maxWidth: 320 }}>{b.subject_snapshot}</td>
                    <td>{b.request_count}</td>
                    <td><span className={`tag ${b.status === 'sent' ? 'tag-green' : b.status === 'discarded' ? 'tag-gray' : 'tag-amber'}`}>{title(b.status)}</span></td>
                    <td style={{ fontSize: 12 }}>{b.prepared_by_name}<div style={{ fontSize: 11, color: '#9ca3af' }}>{fmtDateTime(b.prepared_at)}</div></td>
                    <td style={{ fontSize: 12 }}>{b.sent_by_name || '—'}<div style={{ fontSize: 11, color: '#9ca3af' }}>{b.sent_at ? fmtDateTime(b.sent_at) : ''}</div></td>
                    <td><button className="btn btn-sm" onClick={() => setPreview(b.id)}>{b.status === 'prepared' ? 'Review' : 'View'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {preview && <BatchPreview id={preview} onClose={() => setPreview(null)} onChanged={() => { setPreview(null); load(); }} />}
      {editing && <SettingsModal settings={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

// Read it before it leaves. The snapshot shown here is exactly what will be
// sent — and, once sent, exactly what was.
function BatchPreview({ id, onClose, onChanged }) {
  const [batch, setBatch] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmSend, setConfirmSend] = useState(false);

  useEffect(() => { api.get(`/mobile-line-email-batches/${id}`).then(r => setBatch(r.data)).catch(logError); }, [id]);

  const act = async (path) => {
    setBusy(true); setError('');
    try { await api.post(`/mobile-line-email-batches/${id}/${path}`); onChanged(); }
    catch (e) { setError(e.response?.data?.error || 'That did not work'); setConfirmSend(false); }
    finally { setBusy(false); }
  };

  if (!batch) return null;
  const prepared = batch.status === 'prepared';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 780, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}
           onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a4a' }}>{title(batch.operator)} email</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              Prepared by {batch.prepared_by_name} · {fmtDateTime(batch.prepared_at)}
              {batch.sent_at && ` · sent by ${batch.sent_by_name} on ${fmtDateTime(batch.sent_at)}`}
            </div>
          </div>
          <span className={`tag ${batch.status === 'sent' ? 'tag-green' : batch.status === 'discarded' ? 'tag-gray' : 'tag-amber'}`}>{title(batch.status)}</span>
        </div>

        {prepared && !batch.is_active && (
          <div style={{ background: '#FFF8E6', border: '1px solid #F2DFA8', borderRadius: 6, padding: '10px 12px', marginTop: 14, fontSize: 13, color: '#7a5b12' }}>
            <b>{title(batch.operator)} email is not live.</b> Sending is blocked until you turn it on in Settings.
            Until then this is a rehearsal — nothing reaches the operator.
          </div>
        )}
        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginTop: 14, fontSize: 13 }}>{error}</div>}

        <div style={{ marginTop: 16, fontSize: 13, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px' }}>
          <span style={{ color: '#9ca3af' }}>To</span><span>{batch.recipient_to_snapshot || <i style={{ color: '#c0392b' }}>none set</i>}</span>
          {batch.recipient_cc_snapshot && (<><span style={{ color: '#9ca3af' }}>CC</span><span>{batch.recipient_cc_snapshot}</span></>)}
          <span style={{ color: '#9ca3af' }}>Subject</span><span style={{ fontWeight: 600 }}>{batch.subject_snapshot}</span>
        </div>

        <div style={{ marginTop: 14, border: '1px solid #e9eef4', borderRadius: 8, padding: 16, background: '#fbfcfe', overflowX: 'auto' }}
             dangerouslySetInnerHTML={{ __html: batch.body_snapshot }} />

        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 10 }}>
          {batch.requests?.length} request{batch.requests?.length === 1 ? '' : 's'} in this batch.
          Sending does not change any line — that happens only when you confirm what the operator actually did.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button className="btn" onClick={onClose}>Close</button>
          {prepared && !confirmSend && (
            <>
              <button className="btn" style={{ color: '#c0392b', borderColor: '#f0c9c6' }} disabled={busy} onClick={() => act('discard')}>
                Discard
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={() => setConfirmSend(true)}>Send to {title(batch.operator)}</button>
            </>
          )}
          {prepared && confirmSend && (
            <>
              <span style={{ fontSize: 12, color: '#A32D2D', alignSelf: 'center' }}>
                Send to {batch.recipient_to_snapshot}?
              </span>
              <button className="btn" onClick={() => setConfirmSend(false)}>Back</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => act('send')}>{busy ? 'Sending…' : 'Yes, send it'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ settings, onClose, onSaved }) {
  const [form, setForm] = useState({
    to_recipients: settings.to_recipients || '',
    cc_recipients: settings.cc_recipients || '',
    subject_template: settings.subject_template || '',
    body_template: settings.body_template || '',
    is_active: settings.is_active,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const goingLive = form.is_active && !settings.is_active;

  const save = async () => {
    setBusy(true); setError('');
    try {
      await api.put(`/mobile-line-email-batches/settings/${settings.operator}`, form);
      onSaved();
    } catch (e) { setError(e.response?.data?.error || 'Could not save these settings'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 620, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
           onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a4a' }}>{title(settings.operator)} email settings</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6, marginBottom: 16 }}>
          Who receives the consolidated change email, and whether it is sent at all.
        </div>

        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>To (comma separated)
            <input className="form-input" value={form.to_recipients}
                   onChange={e => setForm(f => ({ ...f, to_recipients: e.target.value }))} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600 }}>CC (optional)
            <input className="form-input" value={form.cc_recipients}
                   onChange={e => setForm(f => ({ ...f, cc_recipients: e.target.value }))} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Subject
            <input className="form-input" value={form.subject_template}
                   onChange={e => setForm(f => ({ ...f, subject_template: e.target.value }))} />
            <span style={{ fontSize: 11, color: '#9ca3af' }}>The number of changes is appended automatically.</span>
          </label>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Opening message
            <textarea className="form-input" rows={4} value={form.body_template}
                      onChange={e => setForm(f => ({ ...f, body_template: e.target.value }))} />
            <span style={{ fontSize: 11, color: '#9ca3af' }}>The change table is added below this.</span>
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <input type="checkbox" checked={form.is_active}
                   onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            Send live to {title(settings.operator)}
          </label>

          {goingLive && (
            <div style={{ background: '#FCEBEB', border: '1px solid #f0c9c6', borderRadius: 6, padding: '10px 12px', fontSize: 13, color: '#A32D2D' }}>
              This turns on real email to <b>{form.to_recipients || '(no recipient set)'}</b>. From then on, sending a
              batch reaches {title(settings.operator)} directly. Make sure the recipients are right first.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save settings'}</button>
        </div>
      </div>
    </div>
  );
}
