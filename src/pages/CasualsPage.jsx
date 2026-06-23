import React, { useEffect, useState } from 'react';
import api from '../utils/api';

const CASUAL_EDIT_ROLES = ['admin', 'supervisor'];

export default function CasualsPage() {
  const [casuals, setCasuals] = useState([]);
  const [employeeProjects, setEmployeeProjects] = useState([]);
  const [employeeClients, setEmployeeClients] = useState([]);
  const [filters, setFilters] = useState({ search: '', project: '', client: '', status: 'active' });
  const [userRole, setUserRole] = useState('');

  const [batchModal, setBatchModal] = useState(false);
  const [batchForm, setBatchForm] = useState({ project: '', client: '', organization: 'Egypro', rows: [{ full_name: '', national_id: '' }] });
  const [batchSaving, setBatchSaving] = useState(false);

  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  const [ppeModal, setPpeModal] = useState(null);
  const [allPpeItems, setAllPpeItems] = useState([]);
  const [checklist, setChecklist] = useState({});
  const [ppeSaving, setPpeSaving] = useState(false);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('esat_user'));
      if (user) setUserRole(user.role);
    } catch {}
  }, []);

  const load = () => {
    api.get('/casuals').then(r => setCasuals(r.data)).catch(console.error);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    api.get('/employees').then(r => {
      setEmployeeProjects([...new Set(r.data.map(e => e.project).filter(Boolean))].sort());
      setEmployeeClients([...new Set(r.data.map(e => e.client).filter(Boolean))].sort());
    }).catch(console.error);
  }, []);

  const filtered = casuals.filter(c => {
    if (filters.status && c.employment_status !== filters.status) return false;
    if (filters.search && !c.full_name?.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.project && c.project !== filters.project) return false;
    if (filters.client && c.client !== filters.client) return false;
    return true;
  });

  const canEdit = CASUAL_EDIT_ROLES.includes(userRole);

  // ── Batch Add ──────────────────────────────────────────────
  const addBatchRow = () => setBatchForm(p => ({ ...p, rows: [...p.rows, { full_name: '', national_id: '' }] }));
  const removeBatchRow = (i) => setBatchForm(p => ({ ...p, rows: p.rows.filter((_, idx) => idx !== i) }));
  const updateBatchRow = (i, field, value) => setBatchForm(p => ({
    ...p,
    rows: p.rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r)
  }));

  const submitBatch = async () => {
    if (!batchForm.project) { alert('Project is required'); return; }
    const validRows = batchForm.rows.filter(r => r.full_name.trim());
    if (validRows.length === 0) { alert('At least one casual with a name is required'); return; }
    setBatchSaving(true);
    try {
      await api.post('/casuals/batch', {
        project: batchForm.project,
        client: batchForm.client,
        organization: batchForm.organization,
        casuals: validRows
      });
      setBatchModal(false);
      setBatchForm({ project: '', client: '', organization: 'Egypro', rows: [{ full_name: '', national_id: '' }] });
      load();
    } catch (e) {
      alert('Error: ' + (e.response?.data?.error || e.message));
    }
    setBatchSaving(false);
  };

  // ── Edit ──────────────────────────────────────────────
  const openEdit = (c) => { setEditModal(c); setEditForm({ ...c }); };
  const saveEdit = async () => {
    setEditSaving(true);
    try {
      await api.put('/casuals/' + editModal.id, editForm);
      setEditModal(null);
      load();
    } catch (e) {
      alert('Error: ' + (e.response?.data?.error || e.message));
    }
    setEditSaving(false);
  };

  const exitCasual = async (c) => {
    if (!window.confirm(`Exit ${c.full_name}? This will cancel any open PPE requests for them.`)) return;
    await api.put('/casuals/' + c.id + '/status', { employment_status: 'exit', exit_date: new Date().toISOString().slice(0, 10) });
    load();
  };

  // ── PPE Checklist ──────────────────────────────────────────────
  const openPpeModal = async (c) => {
    const { data } = await api.get('/ppe');
    setAllPpeItems(data);
    setChecklist({});
    setPpeModal(c);
  };

  const toggleChecklistItem = (item) => {
    setChecklist(prev => {
      const next = { ...prev };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = { ppe_item_id: item.id, size_value: '', quantity: 1 };
      return next;
    });
  };

  const updateChecklistField = (itemId, field, value) => {
    setChecklist(prev => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  };

  const submitChecklist = async () => {
    const items = Object.values(checklist);
    if (items.length === 0) { alert('Select at least one item'); return; }
    setPpeSaving(true);
    try {
      await api.post('/casual-ppe-requests', { casual_id: ppeModal.id, items });
      setPpeModal(null);
      alert(`PPE request created for ${items.length} item(s).`);
    } catch (e) {
      alert('Error: ' + (e.response?.data?.error || e.message));
    }
    setPpeSaving(false);
  };

  const CATEGORY_LABELS = {
    body_protection: 'Body Protection',
    documentation_safety_signage: 'Documentation & Safety Signage',
    fall_protection: 'Fall Protection & Rescue Equipment',
    general_safety: 'General Safety',
    maintenance_tools: 'Maintenance Tools & Equipment',
    testing_measuring: 'Testing & Measuring Instruments',
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span><span className="topbar-sep">›</span>
          <span className="topbar-title">Casuals</span>
        </div>
        <div className="topbar-right">
          {canEdit && <button className="btn btn-primary" onClick={() => setBatchModal(true)}>+ Add Casuals</button>}
        </div>
      </div>
      <div className="content">
        <div className="stat-grid">
          <div className="stat-card"><div className="stat-label">Total Active</div><div className="stat-value green">{casuals.filter(c => c.employment_status === 'active').length}</div></div>
          <div className="stat-card"><div className="stat-label">Exits</div><div className="stat-value">{casuals.filter(c => c.employment_status === 'exit').length}</div></div>
        </div>
        <div className="card">
          <div className="card-header" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span className="card-title">Casuals List</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <input className="form-input" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 150 }} placeholder="Search name..." value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} />
              <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 120 }} value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}>
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="exit">Exit</option>
              </select>
              <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 130 }} value={filters.project} onChange={e => setFilters(p => ({ ...p, project: e.target.value }))}>
                <option value="">All Projects</option>
                {[...new Set(casuals.map(c => c.project).filter(Boolean))].sort().map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className="form-select" style={{ height: 30, padding: '4px 8px', fontSize: 12, width: 120 }} value={filters.client} onChange={e => setFilters(p => ({ ...p, client: e.target.value }))}>
                <option value="">All Clients</option>
                {[...new Set(casuals.map(c => c.client).filter(Boolean))].sort().map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12 }} onClick={() => setFilters({ search: '', project: '', client: '', status: 'active' })}>✕ Clear</button>
            </div>
          </div>
          <table>
            <thead><tr><th>Name</th><th>National ID</th><th>Job Title</th><th>Project</th><th>Client</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>{c.full_name}</td>
                  <td>{c.national_id || '—'}</td>
                  <td>{c.job_title}</td>
                  <td>{c.project || '—'}</td>
                  <td>{c.client || '—'}</td>
                  <td><span className={`tag ${c.employment_status === 'active' ? 'tag-green' : 'tag-red'}`}>{c.employment_status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {c.employment_status === 'active' && <button className="btn btn-sm" onClick={() => openPpeModal(c)} title="Order PPE">🛡 PPE</button>}
                      {canEdit && <button className="btn btn-sm" onClick={() => openEdit(c)}>Edit</button>}
                      {canEdit && c.employment_status === 'active' && <button className="btn btn-sm" onClick={() => exitCasual(c)} style={{ color: '#e53e3e' }}>Exit</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#6b7280', padding: 32 }}>No casuals found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {batchModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Add Casuals</div>
              <button onClick={() => setBatchModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Project</label>
                <select className="form-input" value={batchForm.project} onChange={e => setBatchForm(p => ({ ...p, project: e.target.value }))}>
                  <option value="">Select project...</option>
                  {employeeProjects.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Client</label>
                <select className="form-input" value={batchForm.client} onChange={e => setBatchForm(p => ({ ...p, client: e.target.value }))}>
                  <option value="">Select client...</option>
                  {employeeClients.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Casuals</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {batchForm.rows.map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="form-input" style={{ flex: 1 }} placeholder="Full name" value={row.full_name} onChange={e => updateBatchRow(i, 'full_name', e.target.value)} />
                  <input className="form-input" style={{ flex: 1 }} placeholder="National ID" value={row.national_id} onChange={e => updateBatchRow(i, 'national_id', e.target.value)} />
                  {batchForm.rows.length > 1 && (
                    <button onClick={() => removeBatchRow(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', fontSize: 16 }}>✕</button>
                  )}
                </div>
              ))}
            </div>
            <button className="btn" style={{ alignSelf: 'flex-start', fontSize: 13 }} onClick={addBatchRow}>+ Add Row</button>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
              <button className="btn" onClick={() => setBatchModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitBatch} disabled={batchSaving}>{batchSaving ? 'Saving...' : 'Save Casuals'}</button>
            </div>
          </div>
        </div>
      )}

      {editModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: 480, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Edit Casual</div>
              <button onClick={() => setEditModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Full Name</label>
              <input className="form-input" value={editForm.full_name || ''} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>National ID</label>
              <input className="form-input" value={editForm.national_id || ''} onChange={e => setEditForm(f => ({ ...f, national_id: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Project</label>
              <select className="form-input" value={editForm.project || ''} onChange={e => setEditForm(f => ({ ...f, project: e.target.value }))}>
                <option value="">Select project...</option>
                {employeeProjects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Client</label>
              <select className="form-input" value={editForm.client || ''} onChange={e => setEditForm(f => ({ ...f, client: e.target.value }))}>
                <option value="">Select client...</option>
                {employeeClients.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setEditModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={editSaving}>{editSaving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {ppeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: 720, maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Order PPE/Tool Items</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{ppeModal.full_name} — {ppeModal.national_id || 'No ID'}</div>
              </div>
              <button onClick={() => setPpeModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '55vh', minHeight: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(CATEGORY_LABELS).map(([catKey, catLabel]) => {
                const items = allPpeItems.filter(p => p.category === catKey && p.is_active);
                if (!items.length) return null;
                return (
                  <div key={catKey}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, marginTop: 8 }}>{catLabel}</div>
                    {items.map(p => {
                      const selected = checklist[p.id];
                      return (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6, background: selected ? '#f0fdf4' : '#f9fafb', marginBottom: 2 }}>
                          <input type="checkbox" checked={!!selected} onChange={() => toggleChecklistItem(p)} style={{ width: 16, height: 16, accentColor: '#1D9E75' }} />
                          <span style={{ fontSize: 14, flex: 1 }}>{p.name}</span>
                          {selected && p.has_size && (
                            <select className="form-input" style={{ width: 90, height: 28, fontSize: 12 }} value={selected.size_value} onChange={e => updateChecklistField(p.id, 'size_value', e.target.value)}>
                              <option value="">Size</option>
                              {(p.size_type === 'shoe' ? ['38','39','40','41','42','43','44','45','46','47'] :
                                p.size_type === 'harness' ? ['S','M','L','XL'] :
                                ['XS','S','M','L','XL','XXL','XXXL']).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          )}
                          {selected && (
                            <input type="number" min="1" className="form-input" style={{ width: 60, height: 28, fontSize: 12 }} value={selected.quantity} onChange={e => updateChecklistField(p.id, 'quantity', parseInt(e.target.value) || 1)} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{Object.keys(checklist).length} item(s) selected</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => setPpeModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={submitChecklist} disabled={ppeSaving}>{ppeSaving ? 'Submitting...' : 'Submit Request'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
