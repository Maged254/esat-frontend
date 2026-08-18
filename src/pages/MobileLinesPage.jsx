import React, { useEffect, useState, useCallback } from 'react';
import ExcelJS from 'exceljs';
import api, { logError } from '../utils/api';
import MultiSelect from '../components/MultiSelect';

// Company mobile lines. The register is the module's home screen: every line,
// who holds it, and what the OPERATOR is currently providing on it. Nothing on
// this page changes a telecom product except the admin correction dialog, which
// exists for import mistakes and says so.
const OPERATORS = [
  { value: 'safaricom', label: 'Safaricom' },
  { value: 'airtel', label: 'Airtel' },
];
const STATUS_TAG = { assigned: 'tag-green', available: 'tag-navy', terminated: 'tag-gray' };
const title = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—';
const fmtMoney = (v) => v == null || v === '' ? '—' : Number(v).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const EMPTY_FILTERS = {
  search: '', operator: [], status: [], project: [], client: [],
  package_id: '', credit_limit_id: '', cug: '', roaming: '', unconfigured: '',
};

export default function MobileLinesPage() {
  const user = JSON.parse(localStorage.getItem('esat_user') || '{}');
  const isAdmin = user.role === 'admin';
  const isCustodian = isAdmin || user.role === 'hr';

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({});
  const [options, setOptions] = useState({ projects: [], clients: [], packages: [], credit_limits: [] });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [correcting, setCorrecting] = useState(null);
  const [releasing, setReleasing] = useState(null);
  const pageSize = 25;

  const query = useCallback((extra = {}) => {
    const p = new URLSearchParams();
    if (filters.search) p.append('search', filters.search);
    ['operator', 'status', 'project', 'client'].forEach(k => {
      if (filters[k].length) p.append(k, filters[k].join(','));
    });
    ['package_id', 'credit_limit_id', 'cug', 'roaming', 'unconfigured'].forEach(k => {
      if (filters[k]) p.append(k, filters[k]);
    });
    Object.entries(extra).forEach(([k, v]) => p.append(k, v));
    return p;
  }, [filters]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/mobile-lines?' + query({ page, pageSize })),
      api.get('/mobile-lines/stats?' + query()),
    ]).then(([list, s]) => {
      setRows(list.data.rows);
      setTotal(list.data.total);
      setStats(s.data);
    }).catch(logError).finally(() => setLoading(false));
  }, [query, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filters]);
  useEffect(() => { api.get('/mobile-lines/filter-options').then(r => setOptions(r.data)).catch(logError); }, []);

  const exportExcel = async () => {
    const { data } = await api.get('/mobile-lines?' + query({ page: 1, pageSize: 200 }));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Mobile Lines');
    ws.columns = [
      { header: 'Mobile Number', key: 'mobile_number', width: 16 },
      { header: 'Operator', key: 'operator', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Employee', key: 'employee_name', width: 28 },
      { header: 'Employee Number', key: 'employee_number', width: 16 },
      { header: 'Project', key: 'project', width: 18 },
      { header: 'Client', key: 'client', width: 16 },
      { header: 'Package', key: 'package_name', width: 24 },
      { header: 'Monthly Cost', key: 'monthly_price_snapshot', width: 14 },
      { header: 'Credit Limit', key: 'credit_limit', width: 14 },
      { header: 'CUG', key: 'cug', width: 8 },
      { header: 'Roaming', key: 'roaming', width: 10 },
      { header: 'Assigned On', key: 'assigned_on', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    data.rows.forEach(r => ws.addRow({
      ...r,
      operator: title(r.operator), status: title(r.status),
      cug: r.cug_enabled ? 'Yes' : 'No', roaming: r.roaming_enabled ? 'Yes' : 'No',
      assigned_on: r.current_assignment_date ? new Date(r.current_assignment_date).toLocaleDateString('en-GB') : '',
    }));
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf]));
    const a = document.createElement('a');
    a.href = url; a.download = `OneHub-Mobile-Lines-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  };

  const statCard = (label, value, color, sub) => (
    <div className="stat-card wf-stat-card" style={{ borderTopColor: color }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value ?? 0}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Mobile Lines</span>
        </div>
      </div>

      <div className="content graphs-content">
        <div className="stat-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(5,1fr)' }}>
          {statCard('Total Lines', stats.total, 'var(--eg-navy)')}
          {statCard('Assigned', stats.assigned, 'var(--eg-green)')}
          {statCard('Available', stats.available, '#d97706')}
          {statCard('Monthly Cost — Assigned', `KES ${fmtMoney(stats.monthly_assigned)}`, 'var(--eg-navy)')}
          {statCard('Monthly Cost — Idle', `KES ${fmtMoney(stats.monthly_idle)}`, '#A32D2D', 'Available lines still billing')}
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Lines Register</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {stats.unconfigured > 0 && (
                <button className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12 }}
                        onClick={() => setFilters(f => ({ ...f, unconfigured: f.unconfigured ? '' : '1' }))}>
                  {filters.unconfigured ? '✓ ' : ''}{stats.unconfigured} without package or limit
                </button>
              )}
              <button className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12 }} onClick={exportExcel}>⭳ Export</button>
            </div>
          </div>

          <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input className="form-input" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 240 }}
                   placeholder="Number, name, employee or national ID…"
                   value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} />
            <MultiSelect label="Operator" options={OPERATORS.map(o => o.label)}
                         selected={filters.operator.map(v => title(v))}
                         onChange={vals => setFilters(p => ({ ...p, operator: vals.map(v => v.toLowerCase()) }))} />
            <MultiSelect label="Status" options={['Assigned', 'Available', 'Terminated']}
                         selected={filters.status.map(v => title(v))}
                         onChange={vals => setFilters(p => ({ ...p, status: vals.map(v => v.toLowerCase()) }))} />
            <MultiSelect label="Project" options={options.projects}
                         selected={filters.project} onChange={vals => setFilters(p => ({ ...p, project: vals }))} />
            <MultiSelect label="Client" options={options.clients}
                         selected={filters.client} onChange={vals => setFilters(p => ({ ...p, client: vals }))} />
            <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 180 }}
                    value={filters.package_id} onChange={e => setFilters(p => ({ ...p, package_id: e.target.value }))}>
              <option value="">All packages</option>
              {options.packages.map(p => <option key={p.id} value={p.id}>{title(p.operator)} · {p.package_name}</option>)}
            </select>
            <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 160 }}
                    value={filters.credit_limit_id} onChange={e => setFilters(p => ({ ...p, credit_limit_id: e.target.value }))}>
              <option value="">All credit limits</option>
              {options.credit_limits.map(c => <option key={c.id} value={c.id}>{title(c.operator)} · {fmtMoney(c.credit_limit)}</option>)}
            </select>
            <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 110 }}
                    value={filters.cug} onChange={e => setFilters(p => ({ ...p, cug: e.target.value }))}>
              <option value="">CUG: any</option><option value="yes">CUG: Yes</option><option value="no">CUG: No</option>
            </select>
            <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 130 }}
                    value={filters.roaming} onChange={e => setFilters(p => ({ ...p, roaming: e.target.value }))}>
              <option value="">Roaming: any</option><option value="yes">Roaming: Yes</option><option value="no">Roaming: No</option>
            </select>
            <button className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12 }}
                    onClick={() => setFilters(EMPTY_FILTERS)}>✕ Clear</button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table-hover-soft">
              <thead>
                <tr>
                  <th>Mobile Number</th><th>Operator</th><th>Status</th><th>Employee</th>
                  <th>Project / Client</th><th>Package</th><th>Credit Limit</th>
                  <th>CUG</th><th>Roaming</th><th>Assigned</th>
                  {isCustodian && <th></th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={isCustodian ? 11 : 10} style={{ padding: 24, color: '#9ca3af', fontSize: 13 }}>Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={isCustodian ? 11 : 10} style={{ padding: 24, color: '#9ca3af', fontSize: 13 }}>
                    {isCustodian ? 'No mobile lines yet. Import the existing register, or add a line.' : 'No mobile lines for your projects.'}
                  </td></tr>
                ) : rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>
                      {r.mobile_number}
                      {r.pending_changes > 0 && (
                        <div style={{ fontSize: 11, color: '#d97706', marginTop: 2 }}>Change in progress</div>
                      )}
                    </td>
                    <td>{title(r.operator)}</td>
                    <td><span className={`tag ${STATUS_TAG[r.status] || 'tag-gray'}`}>{title(r.status)}</span></td>
                    <td>
                      {r.employee_name || <span style={{ color: '#9ca3af' }}>—</span>}
                      {r.employee_number && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.employee_number}</div>}
                    </td>
                    <td>
                      {r.project || '—'}
                      {r.client && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.client}</div>}
                    </td>
                    <td>
                      {r.package_name || <span style={{ color: '#c0392b' }}>Not set</span>}
                      {r.monthly_price_snapshot != null && (
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>KES {fmtMoney(r.monthly_price_snapshot)}/mo</div>
                      )}
                    </td>
                    <td>{r.credit_limit != null ? fmtMoney(r.credit_limit) : <span style={{ color: '#c0392b' }}>Not set</span>}</td>
                    <td>{r.cug_enabled ? 'Yes' : 'No'}</td>
                    <td>{r.roaming_enabled ? 'Yes' : 'No'}</td>
                    <td>{fmtDate(r.current_assignment_date)}</td>
                    {isCustodian && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {r.status === 'assigned' && (
                          <button className="btn btn-sm" onClick={() => setReleasing(r)}>Release</button>
                        )}
                        {isAdmin && (
                          <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => setCorrecting(r)}>Correct</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', padding: '10px 16px', fontSize: 12 }}>
              <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span style={{ color: '#6b7280' }}>Page {page} of {pages} · {total} lines</span>
              <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </div>
      </div>

      {releasing && (
        <ReleaseModal line={releasing} onClose={() => setReleasing(null)}
                      onReleased={() => { setReleasing(null); load(); }} />
      )}
      {correcting && (
        <CorrectionModal line={correcting} options={options}
                         onClose={() => setCorrecting(null)}
                         onSaved={() => { setCorrecting(null); load(); }} />
      )}
    </>
  );
}

// Editing the current configuration by hand is an ADMINISTRATIVE CORRECTION --
// it says the operator was already providing this and OneHub had it wrong. It is
// not how a telecom change is made, so the dialog says so and the reason is
// mandatory and audited.
function CorrectionModal({ line, options, onClose, onSaved }) {
  const [form, setForm] = useState({
    package_id: line.package_id || '',
    credit_limit_id: line.credit_limit_id || '',
    cug_enabled: line.cug_enabled,
    roaming_enabled: line.roaming_enabled,
    correction_reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const packages = options.packages.filter(p => p.operator === line.operator);
  const limits = options.credit_limits.filter(c => c.operator === line.operator);

  const save = async () => {
    if (!form.correction_reason.trim()) { setError('A reason is required.'); return; }
    setSaving(true); setError('');
    try {
      await api.patch(`/mobile-lines/${line.id}`, {
        package_id: form.package_id || null,
        credit_limit_id: form.credit_limit_id || null,
        cug_enabled: form.cug_enabled,
        roaming_enabled: form.roaming_enabled,
        correction_reason: form.correction_reason.trim(),
      });
      onSaved();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save the correction');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 480, maxWidth: '92vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
           onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a4a' }}>Correct {line.mobile_number}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6, marginBottom: 16 }}>
          {title(line.operator)} · {line.employee_name || 'Unassigned'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: '#6b7280', background: '#FFF8E6', border: '1px solid #F2DFA8', borderRadius: 6, padding: '8px 10px' }}>
            This records what {title(line.operator)} is <b>already</b> providing — use it to fix an import or a
            data error. To ask the operator to change something, raise a change request instead.
          </div>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Package
            <select className="form-select" value={form.package_id}
                    onChange={e => setForm(f => ({ ...f, package_id: e.target.value }))}>
              <option value="">Not set</option>
              {packages.map(p => <option key={p.id} value={p.id}>{p.package_name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Credit Limit
            <select className="form-select" value={form.credit_limit_id}
                    onChange={e => setForm(f => ({ ...f, credit_limit_id: e.target.value }))}>
              <option value="">Not set</option>
              {limits.map(c => <option key={c.id} value={c.id}>{fmtMoney(c.credit_limit)}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={form.cug_enabled}
                     onChange={e => setForm(f => ({ ...f, cug_enabled: e.target.checked }))} /> CUG
            </label>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={form.roaming_enabled}
                     onChange={e => setForm(f => ({ ...f, roaming_enabled: e.target.checked }))} /> Roaming
            </label>
          </div>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Reason for the correction *
            <input className="form-input" value={form.correction_reason}
                   placeholder="e.g. Wrong package recorded during import"
                   onChange={e => setForm(f => ({ ...f, correction_reason: e.target.value }))} />
          </label>
          {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, fontSize: 13 }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save correction'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Releasing hands the number back to the pool. The configuration stays with the
// line so the next holder inherits a working setup — which also means it keeps
// billing, so the reason matters for anyone reading the history later.
function ReleaseModal({ line, onClose, onReleased }) {
  const [reason, setReason] = useState('reassignment');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const release = async () => {
    setSaving(true); setError('');
    try {
      await api.post(`/mobile-lines/${line.id}/release`, { release_reason: reason });
      onReleased();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not release this line');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 460, maxWidth: '92vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
           onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a4a' }}>Release {line.mobile_number}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6, marginBottom: 16 }}>
          Currently held by {line.employee_name || 'unknown'}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', background: '#F0F7FF', border: '1px solid #cfe0f2', borderRadius: 6, padding: '8px 10px', marginBottom: 14 }}>
          The line keeps its package, credit limit, CUG and roaming, so it can be handed straight
          to the next person. It also keeps billing while it sits unassigned.
        </div>
        <label style={{ fontSize: 12, fontWeight: 600 }}>Why is it being released?
          <select className="form-select" value={reason} onChange={e => setReason(e.target.value)}>
            <option value="reassignment">Reassignment — going to someone else</option>
            <option value="administrative_correction">Administrative correction — it was recorded against the wrong person</option>
          </select>
        </label>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
          A line freed because its holder left the company is released automatically — you do not need to do it here.
        </div>
        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginTop: 12, fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={release}>
            {saving ? 'Releasing…' : 'Release line'}
          </button>
        </div>
      </div>
    </div>
  );
}
