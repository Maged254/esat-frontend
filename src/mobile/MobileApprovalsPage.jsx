import React, { useCallback, useEffect, useRef, useState } from 'react';
import api, { logError } from '../utils/api';

// The two gates are the same screen with a different queue and a different
// "approved" status, so they share one component rather than two near-copies.
const GATES = {
  ehs: {
    query: 'pending',                     // Flagged
    approveTo: 'ehs_purchase_requested',
    empty: 'Nothing flagged for Safety.',
    approveLabel: 'Approve',
  },
  pm: {
    query: 'pda_pending',                 // needs PDA and sitting at EHS Purchase Requested
    approveTo: 'pda_approved',
    empty: 'Nothing waiting for PM approval.',
    approveLabel: 'Approve',
  },
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '';

export default function MobileApprovalsPage({ gate }) {
  const cfg = GATES[gate];
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);        // id being acted on
  const [reject, setReject] = useState(null);    // { row, reason }
  // Approving is one tap and cannot be undone, and a thumb finds the wrong card
  // far more easily than a mouse does -- so it asks first, as the desktop page
  // does. Rejecting has its own gate: the reason is mandatory.
  const [confirm, setConfirm] = useState(null);  // row awaiting approval
  const [offline, setOffline] = useState(!navigator.onLine);
  const [loadFailed, setLoadFailed] = useState(false);
  // A decision that never reached the server must not silently disappear, and a
  // second tap on a dropped request must not fire a second time -- a ref rather
  // than state because it has to be correct within one tap, not next render.
  const inFlight = useRef(new Set());

  useEffect(() => {
    const on = () => setOffline(false), off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // The endpoint caps a request at 100 rows, so the queue has to page through:
  // a single request would silently drop everything past row 100 while the
  // count underneath read a confident "100 waiting".
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const out = [];
      setLoadFailed(false);
      for (let page = 1; page <= 50; page++) {
        const { data } = await api.get(`/ncr?status=${cfg.query}&page=${page}&pageSize=100`);
        out.push(...(data.rows || []));
        if (out.length >= (data.total || 0) || !(data.rows || []).length) break;
      }
      setRows(out);
    } catch (e) {
      logError(e); setLoadFailed(true);
    } finally { setLoading(false); }
  }, [cfg.query]);

  useEffect(() => { load(); }, [load]);

  // Drop the row on success rather than reloading the list: the queue is the
  // point of the screen, and a row that has been decided is no longer in it.
  const act = async (row, body) => {
    if (inFlight.current.has(row.id)) return;   // a second tap while the first is out
    inFlight.current.add(row.id);
    setBusy(row.id); setError('');
    try {
      await api.put(`/ncr/${row.id}/status`, body);
      setRows(rs => rs.filter(r => r.id !== row.id));
      setReject(null); setConfirm(null);
    } catch (e) {
      // A refusal carries a response and is final -- the item moved on, or this
      // user may not act at that stage. A request that never got a response is
      // the network, so the decision was NOT recorded: say so plainly, and leave
      // the row in the queue so it can be tapped again.
      setError(e.response?.data?.error
        || (e.response ? 'That did not go through.'
                       : 'Not sent — you appear to be offline. Nothing was recorded; try again when you have signal.'));
    } finally {
      inFlight.current.delete(row.id);
      setBusy(null);
    }
  };

  if (loading) return <div className="m-empty">Loading…</div>;

  return (
    <>
      {offline && (
        <div className="m-error" style={{ background: '#FEF3C7', color: '#92400E' }}>
          You are offline. Approvals will not send until you have signal again.
        </div>
      )}
      {error && <div className="m-error">{error}</div>}

      {!rows.length ? (
        <div className="m-empty">
          <div>{loadFailed ? 'Could not load the queue.' : cfg.empty}</div>
          {loadFailed && (
            <button className="m-btn" style={{ flex: 'none', marginTop: 14 }} onClick={load}>Try again</button>
          )}
        </div>
      ) : (
        <>
          <div className="m-count">{rows.length} waiting</div>
          {rows.map(n => (
            <div className="m-card" key={n.id}>
              <div className="m-card-title">{n.employee_name}</div>
              <div className="m-card-sub">
                {[n.employee_national_id, n.job_title].filter(Boolean).join(' · ')}
                <br />
                {[n.project, n.client].filter(Boolean).join(' · ')}
              </div>
              <div className="m-card-sub" style={{ marginTop: 8, color: '#0f2a4a', fontWeight: 600 }}>
                {n.ppe_name}{n.quantity > 1 ? ` × ${n.quantity}` : ''}
              </div>
              <div className="m-card-sub">
                Raised {fmtDate(n.created_at)}{n.audited_by_name ? ` by ${n.audited_by_name}` : ''}
                {n.last_distributed ? ` · last issued ${fmtDate(n.last_distributed)}` : ''}
              </div>
              <div className="m-card-actions">
                <button className="m-btn m-btn-reject" disabled={busy === n.id}
                        onClick={() => setReject({ row: n, reason: '' })}>Reject</button>
                <button className="m-btn m-btn-approve" disabled={busy === n.id}
                        onClick={() => setConfirm(n)}>
                  {busy === n.id ? '…' : cfg.approveLabel}
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {confirm && (
        <Sheet>
          <div className="m-card-title">{cfg.approveLabel} {confirm.ppe_name}?</div>
          <div className="m-card-sub" style={{ marginBottom: 4 }}>
            for {confirm.employee_name}{confirm.quantity > 1 ? ` · ${confirm.quantity} items` : ''}
          </div>
          <div className="m-card-actions">
            <button className="m-btn" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="m-btn m-btn-approve" disabled={busy === confirm.id}
                    onClick={() => act(confirm, { status: cfg.approveTo })}>
              {busy === confirm.id ? '…' : cfg.approveLabel}
            </button>
          </div>
        </Sheet>
      )}

      {/* A rejection closes the NCR out, so the reason is mandatory here just as
          it is on the desktop page. */}
      {reject && (
        <Sheet>
            <div className="m-card-title">Reject {reject.row.ppe_name}</div>
            <div className="m-card-sub" style={{ marginBottom: 12 }}>for {reject.row.employee_name}</div>
            <textarea className="m-input" placeholder="Why is this being rejected?" autoFocus
                      value={reject.reason}
                      onChange={e => setReject(r => ({ ...r, reason: e.target.value }))} />
            <div className="m-card-actions">
              <button className="m-btn" onClick={() => setReject(null)}>Cancel</button>
              <button className="m-btn m-btn-reject" disabled={!reject.reason.trim() || busy === reject.row.id}
                      onClick={() => act(reject.row, { status: 'rejected', reason: reject.reason.trim() })}>
                {busy === reject.row.id ? '…' : 'Reject'}
              </button>
            </div>
        </Sheet>
      )}
    </>
  );
}

// Bottom sheet: a decision lands within thumb reach rather than at the top of
// the screen, and the backdrop makes it clear the list behind is not tappable.
function Sheet({ children }) {
  return (
    <div className="m-sheet" style={{ background: 'rgba(8,12,18,.6)', justifyContent: 'flex-end' }}>
      <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: 16,
                    paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
        {children}
      </div>
    </div>
  );
}
