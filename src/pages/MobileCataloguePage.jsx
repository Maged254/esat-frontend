import React, { useEffect, useState, useCallback } from 'react';
import api, { logError } from '../utils/api';
import MobileLinesTabs from '../components/MobileLinesTabs';

// Telecom product catalogue, admin only. Safaricom and Airtel keep separate
// lists — a Safaricom line must never be offered an Airtel package.
//
// Retiring an item keeps it out of new requests while every record that already
// references it goes on reading correctly. Deleting is only offered while
// nothing references the item at all, which makes it "undo adding it" — for a
// typo or a duplicate — rather than a way to erase history.
const OPERATORS = [{ value: 'safaricom', label: 'Safaricom' }, { value: 'airtel', label: 'Airtel' }];
const title = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
const fmtMoney = (v) => v == null || v === '' ? '—' : Number(v).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function MobileCataloguePage() {
  const [operator, setOperator] = useState('safaricom');
  const [packages, setPackages] = useState([]);
  const [limits, setLimits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pkgForm, setPkgForm] = useState({ package_name: '', description: '', monthly_price: '' });
  const [limitForm, setLimitForm] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [holders, setHolders] = useState([]);
  const [holderForm, setHolderForm] = useState({ name: '', project: '', client: '' });
  const [editingHolder, setEditingHolder] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get(`/mobile-lines/products/packages?operator=${operator}&include_inactive=1`),
      api.get(`/mobile-lines/products/credit-limits?operator=${operator}&include_inactive=1`),
    ]).then(([p, c]) => { setPackages(p.data); setLimits(c.data); })
      .catch(logError).finally(() => setLoading(false));
  }, [operator]);

  useEffect(() => { load(); }, [load]);
  // Holders are not operator-specific, so they load once rather than per tab.
  const loadHolders = useCallback(() => {
    api.get('/mobile-lines/holders').then(r => setHolders(r.data)).catch(logError);
  }, []);
  useEffect(() => { loadHolders(); }, [loadHolders]);

  const addHolder = async () => {
    if (!holderForm.name.trim()) { setError('A holder name is required.'); return; }
    setError('');
    try {
      await api.post('/mobile-lines/holders', holderForm);
      setHolderForm({ name: '', project: '', client: '' });
      loadHolders();
    } catch (e) { setError(e.response?.data?.error || 'Could not add that holder'); }
  };

  const toggleHolder = async (h) => {
    setError('');
    try { await api.patch(`/mobile-lines/holders/${h.id}`, { project: h.project, client: h.client, is_active: !h.is_active }); loadHolders(); }
    catch (e) { setError(e.response?.data?.error || 'Could not update that holder'); }
  };

  const addPackage = async () => {
    if (!pkgForm.package_name.trim()) { setError('A package name is required.'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/mobile-lines/products/packages', { ...pkgForm, operator });
      setPkgForm({ package_name: '', description: '', monthly_price: '' });
      load();
    } catch (e) { setError(e.response?.data?.error || 'Could not add that package'); }
    finally { setSaving(false); }
  };

  const addLimit = async () => {
    if (limitForm === '') { setError('Enter a credit limit.'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/mobile-lines/products/credit-limits', { operator, credit_limit: limitForm });
      setLimitForm('');
      load();
    } catch (e) { setError(e.response?.data?.error || 'Could not add that credit limit'); }
    finally { setSaving(false); }
  };

  // Deleting is refused by the server the moment anything references the item,
  // and it says what — more useful than a guess made here.
  const removeLimit = async (row) => {
    setError('');
    if (!window.confirm(`Delete the credit limit ${fmtMoney(row.credit_limit)} permanently?`)) return;
    try {
      await api.delete(`/mobile-lines/products/credit-limits/${row.id}`);
      load();
    } catch (e) { setError(e.response?.data?.error || 'Could not delete that credit limit'); }
  };

  const toggle = async (kind, row) => {
    setError('');
    try {
      await api.patch(`/mobile-lines/products/${kind}/${row.id}`, { is_active: !row.is_active });
      load();
    } catch (e) { setError(e.response?.data?.error || 'Could not update that item'); }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Product Catalogue</span>
        </div>
      </div>

      <div className="content graphs-content">
        <MobileLinesTabs />
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {OPERATORS.map(o => (
            <button key={o.value}
                    className={`btn ${operator === o.value ? 'btn-primary' : ''}`}
                    onClick={() => setOperator(o.value)}>{o.label}</button>
          ))}
        </div>

        {error && (
          <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>
        )}

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)' }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Packages</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{packages.filter(p => p.is_active).length} active</span>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
              <input className="form-input" style={{ height: 32, fontSize: 12, width: 200 }} placeholder="Package name"
                     value={pkgForm.package_name} onChange={e => setPkgForm(f => ({ ...f, package_name: e.target.value }))} />
              <input className="form-input" style={{ height: 32, fontSize: 12, width: 220 }} placeholder="Description (optional)"
                     value={pkgForm.description} onChange={e => setPkgForm(f => ({ ...f, description: e.target.value }))} />
              <input className="form-input" style={{ height: 32, fontSize: 12, width: 140 }} placeholder="Monthly price"
                     value={pkgForm.monthly_price} onChange={e => setPkgForm(f => ({ ...f, monthly_price: e.target.value }))} />
              <button className="btn btn-primary btn-sm" disabled={saving} onClick={addPackage}>+ Add</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table-hover-soft">
                <thead><tr><th>Package</th><th>Description</th><th>Monthly Price</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} style={{ padding: 20, color: '#9ca3af', fontSize: 13 }}>Loading…</td></tr>
                  ) : packages.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: 20, color: '#9ca3af', fontSize: 13 }}>No packages yet for this operator.</td></tr>
                  ) : packages.map(p => (
                    <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.55 }}>
                      <td style={{ fontWeight: 600 }}>{p.package_name}</td>
                      <td style={{ color: '#6b7280' }}>{p.description || '—'}</td>
                      <td>{p.monthly_price != null ? `KES ${fmtMoney(p.monthly_price)}` : '—'}</td>
                      <td><span className={`tag ${p.is_active ? 'tag-green' : 'tag-gray'}`}>{p.is_active ? 'Active' : 'Retired'}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => setEditing(p)}>Edit</button>
                        <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => toggle('packages', p)}>
                          {p.is_active ? 'Retire' : 'Restore'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Credit Limits</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{limits.filter(c => c.is_active).length} active</span>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
              <input className="form-input" style={{ height: 32, fontSize: 12, width: 160 }} placeholder="e.g. 5000"
                     value={limitForm} onChange={e => setLimitForm(e.target.value)} />
              <button className="btn btn-primary btn-sm" disabled={saving} onClick={addLimit}>+ Add</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table-hover-soft">
                <thead><tr><th>Credit Limit</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={3} style={{ padding: 20, color: '#9ca3af', fontSize: 13 }}>Loading…</td></tr>
                  ) : limits.length === 0 ? (
                    <tr><td colSpan={3} style={{ padding: 20, color: '#9ca3af', fontSize: 13 }}>No credit limits yet for this operator.</td></tr>
                  ) : limits.map(c => (
                    <tr key={c.id} style={{ opacity: c.is_active ? 1 : 0.55 }}>
                      <td style={{ fontWeight: 600 }}>KES {fmtMoney(c.credit_limit)}</td>
                      <td><span className={`tag ${c.is_active ? 'tag-green' : 'tag-gray'}`}>{c.is_active ? 'Active' : 'Retired'}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => toggle('credit-limits', c)}>
                          {c.is_active ? 'Retire' : 'Restore'}
                        </button>
                        <button className="btn btn-sm" style={{ marginLeft: 6, color: '#c0392b', borderColor: '#f0c9c6' }}
                                onClick={() => removeLimit(c)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {editingHolder && (
          <EditHolderModal holder={editingHolder} onClose={() => setEditingHolder(null)}
                           onSaved={() => { setEditingHolder(null); loadHolders(); }} />
        )}

        {editing && (
          <EditPackageModal pkg={editing} onClose={() => setEditing(null)}
                            onSaved={() => { setEditing(null); load(); }} />
        )}

        {/* Non-employee holders: BTS NOC, Fibre NOC and the like. Not operator
            specific, so they sit outside the Safaricom/Airtel tabs. */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <span className="card-title">Line Holders</span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>{holders.filter(h => h.is_active).length} active · for lines that belong to a function, not a person</span>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
            <input className="form-input" style={{ height: 32, fontSize: 12, width: 200 }} placeholder="e.g. BTS NOC"
                   value={holderForm.name} onChange={e => setHolderForm(f => ({ ...f, name: e.target.value }))} />
            <input className="form-input" style={{ height: 32, fontSize: 12, width: 170 }} placeholder="Project (optional)"
                   value={holderForm.project} onChange={e => setHolderForm(f => ({ ...f, project: e.target.value }))} />
            <input className="form-input" style={{ height: 32, fontSize: 12, width: 150 }} placeholder="Client (optional)"
                   value={holderForm.client} onChange={e => setHolderForm(f => ({ ...f, client: e.target.value }))} />
            <button className="btn btn-primary btn-sm" onClick={addHolder}>+ Add</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table-hover-soft">
              <thead><tr><th>Holder</th><th>Project</th><th>Client</th><th>Current Line</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {holders.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 20, color: '#9ca3af', fontSize: 13 }}>
                    No holders yet. Add one to assign a line to a NOC, a team or another function.
                  </td></tr>
                ) : holders.map(h => (
                  <tr key={h.id} style={{ opacity: h.is_active ? 1 : 0.55 }}>
                    <td style={{ fontWeight: 600 }}>{h.name}</td>
                    <td>{h.project || '—'}</td>
                    <td>{h.client || '—'}</td>
                    <td>{h.current_line ? `${h.current_line} (${title(h.current_operator)})` : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                    <td><span className={`tag ${h.is_active ? 'tag-green' : 'tag-gray'}`}>{h.is_active ? 'Active' : 'Retired'}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-sm" onClick={() => setEditingHolder(h)}>Edit</button>
                      <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => toggleHolder(h)}>
                        {h.is_active ? 'Retire' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ marginTop: 16, fontSize: 12, color: '#6b7280', maxWidth: 720 }}>
          Retiring a package or credit limit keeps it out of new requests while every record that already
          references it goes on reading correctly. Nothing here is ever deleted.
        </div>
      </div>
    </>
  );
}

// Editing a package changes what it IS, from now on. It does not rewrite the
// past: a line snapshots the monthly price when its configuration is set, and
// change history stores the values as text — so correcting a price here fixes
// future cost reporting without altering what previous months actually cost.
function EditPackageModal({ pkg, onClose, onSaved }) {
  const [form, setForm] = useState({
    package_name: pkg.package_name || '',
    description: pkg.description || '',
    monthly_price: pkg.monthly_price ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const priceChanged = String(form.monthly_price ?? '') !== String(pkg.monthly_price ?? '');

  const save = async () => {
    if (!form.package_name.trim()) { setError('A package name is required.'); return; }
    setSaving(true); setError('');
    try {
      await api.patch(`/mobile-lines/products/packages/${pkg.id}`, {
        package_name: form.package_name.trim(),
        description: form.description.trim(),
        monthly_price: form.monthly_price === '' ? null : form.monthly_price,
      });
      onSaved();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not save this package');
    } finally { setSaving(false); }
  };

  // Deleting is only possible while nothing references the package. The server
  // decides that and says what is using it, which is more useful than a warning
  // here that might be out of date.
  const remove = async () => {
    setSaving(true); setError('');
    try {
      await api.delete(`/mobile-lines/products/packages/${pkg.id}`);
      onSaved();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not delete this package');
      setConfirmDelete(false);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 460, maxWidth: '92vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
           onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a4a' }}>Edit package</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6, marginBottom: 16 }}>
          {title(pkg.operator)} · {pkg.is_active ? 'Active' : 'Retired'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Package name *
            <input className="form-input" value={form.package_name}
                   onChange={e => setForm(f => ({ ...f, package_name: e.target.value }))} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Description
            <input className="form-input" value={form.description}
                   onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Monthly price
            <input className="form-input" value={form.monthly_price}
                   onChange={e => setForm(f => ({ ...f, monthly_price: e.target.value }))} />
          </label>
          {priceChanged && (
            <div style={{ fontSize: 12, color: '#6b7280', background: '#F0F7FF', border: '1px solid #cfe0f2', borderRadius: 6, padding: '8px 10px' }}>
              The new price applies from now on. Lines already carrying this package keep the cost recorded
              against them until their configuration next changes, so past reporting is not rewritten.
            </div>
          )}
          {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, fontSize: 13 }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 18 }}>
          {confirmDelete ? (
            <span style={{ fontSize: 12, color: '#A32D2D' }}>Delete “{pkg.package_name}” permanently?</span>
          ) : (
            <button className="btn btn-sm" style={{ color: '#c0392b', borderColor: '#f0c9c6' }}
                    onClick={() => { setError(''); setConfirmDelete(true); }}>Delete</button>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {confirmDelete ? (
              <>
                <button className="btn" onClick={() => setConfirmDelete(false)}>Keep it</button>
                <button className="btn" style={{ color: '#c0392b', borderColor: '#f0c9c6' }}
                        disabled={saving} onClick={remove}>{saving ? 'Deleting…' : 'Yes, delete'}</button>
              </>
            ) : (
              <>
                <button className="btn" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save package'}</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// A holder is a long-lived record — a NOC outlives the people who answer it —
// so its name, project and client need correcting without starting again.
// Renaming is safe: assignment history keeps a name snapshot from the moment of
// each assignment, so past records still read as they did then.
function EditHolderModal({ holder, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: holder.name || '',
    project: holder.project || '',
    client: holder.client || '',
    notes: holder.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    if (!form.name.trim()) { setError('A holder name is required.'); return; }
    setSaving(true); setError('');
    try {
      await api.patch(`/mobile-lines/holders/${holder.id}`, { ...form, is_active: holder.is_active });
      onSaved();
    } catch (e) { setError(e.response?.data?.error || 'Could not save this holder'); }
    finally { setSaving(false); }
  };

  // Refused by the server once the holder has ever held a line — retiring is the
  // answer then, so the history it appears in keeps reading correctly.
  const remove = async () => {
    setSaving(true); setError('');
    try {
      await api.delete(`/mobile-lines/holders/${holder.id}`);
      onSaved();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not delete this holder');
      setConfirmDelete(false);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 460, maxWidth: '92vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
           onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a4a' }}>Edit holder</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6, marginBottom: 16 }}>
          {holder.current_line ? `Currently holds ${holder.current_line}` : 'Holds no line at the moment'}
          {holder.is_active ? '' : ' · retired'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Name *
            <input className="form-input" value={form.name}
                   onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Project
            <input className="form-input" value={form.project}
                   onChange={e => setForm(f => ({ ...f, project: e.target.value }))} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Client
            <input className="form-input" value={form.client}
                   onChange={e => setForm(f => ({ ...f, client: e.target.value }))} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Notes
            <input className="form-input" value={form.notes}
                   onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </label>
          {form.name.trim() !== holder.name && (
            <div style={{ fontSize: 12, color: '#6b7280', background: '#F0F7FF', border: '1px solid #cfe0f2', borderRadius: 6, padding: '8px 10px' }}>
              Renaming affects the register and future assignments. Past assignment history keeps
              the name recorded at the time, so it still reads correctly.
            </div>
          )}
          {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, fontSize: 13 }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 18 }}>
          {confirmDelete ? (
            <span style={{ fontSize: 12, color: '#A32D2D' }}>Delete “{holder.name}” permanently?</span>
          ) : (
            <button className="btn btn-sm" style={{ color: '#c0392b', borderColor: '#f0c9c6' }}
                    onClick={() => { setError(''); setConfirmDelete(true); }}>Delete</button>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {confirmDelete ? (
              <>
                <button className="btn" onClick={() => setConfirmDelete(false)}>Keep it</button>
                <button className="btn" style={{ color: '#c0392b', borderColor: '#f0c9c6' }}
                        disabled={saving} onClick={remove}>{saving ? 'Deleting…' : 'Yes, delete'}</button>
              </>
            ) : (
              <>
                <button className="btn" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save holder'}</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
