import React, { useEffect, useState, useCallback } from 'react';
import api, { logError } from '../utils/api';

// Telecom product catalogue, admin only. Safaricom and Airtel keep separate
// lists — a Safaricom line must never be offered an Airtel package — and nothing
// here is ever deleted: retiring a package means new requests can't pick it,
// while every historical record that references it still reads correctly.
const OPERATORS = [{ value: 'safaricom', label: 'Safaricom' }, { value: 'airtel', label: 'Airtel' }];
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

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get(`/mobile-lines/products/packages?operator=${operator}&include_inactive=1`),
      api.get(`/mobile-lines/products/credit-limits?operator=${operator}&include_inactive=1`),
    ]).then(([p, c]) => { setPackages(p.data); setLimits(c.data); })
      .catch(logError).finally(() => setLoading(false));
  }, [operator]);

  useEffect(() => { load(); }, [load]);

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
                      <td>
                        <button className="btn btn-sm" onClick={() => toggle('packages', p)}>
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
                      <td>
                        <button className="btn btn-sm" onClick={() => toggle('credit-limits', c)}>
                          {c.is_active ? 'Retire' : 'Restore'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
