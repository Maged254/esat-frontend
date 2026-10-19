import React, { useEffect, useState } from 'react';
import api, { logError } from '../utils/api';

// Admin Panel card: the observation types an officer picks from when adding a
// pin on My Patrol. Grouped by category in the officer's dropdown. A type pins
// already use can be deactivated but not deleted; a pin keeps the label it was
// saved with, so renaming a type does not change past reports.
export default function ObservationTypesAdmin() {
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | id
  const [form, setForm] = useState({ label: '', category: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) api.get('/patrol/observation-types?all=1').then(r => setTypes(r.data)).catch(logError);
  }, [open]);

  const categories = [...new Set(types.map(t => t.category).filter(Boolean))];
  const startEdit = (t) => { setEditing(t ? t.id : 'new'); setForm({ label: t?.label || '', category: t?.category || '' }); setError(''); };
  const cancel = () => { setEditing(null); setError(''); };

  const save = async () => {
    setError(''); setSaving(true);
    try {
      const body = { label: form.label.trim(), category: form.category.trim() };
      if (editing === 'new') {
        const r = await api.post('/patrol/observation-types', body);
        setTypes(prev => [...prev, r.data]);
      } else {
        const cur = types.find(t => t.id === editing);
        const r = await api.put(`/patrol/observation-types/${editing}`, { ...body, is_active: cur.is_active });
        setTypes(prev => prev.map(t => t.id === editing ? r.data : t));
      }
      cancel();
    } catch (e) { setError(e.response?.data?.error || 'Could not save.'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (t) => {
    try {
      const r = await api.put(`/patrol/observation-types/${t.id}`, { label: t.label, category: t.category, is_active: !t.is_active });
      setTypes(prev => prev.map(x => x.id === t.id ? r.data : x));
    } catch (e) { alert(e.response?.data?.error || 'Could not update.'); }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete "${t.label}"?`)) return;
    try {
      await api.delete(`/patrol/observation-types/${t.id}`);
      setTypes(prev => prev.filter(x => x.id !== t.id));
    } catch (e) { alert(e.response?.data?.error || 'Could not delete.'); }
  };

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <span className="card-title">Route Patrol Observation Types</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {open && <button className="btn btn-primary" style={{ fontSize: 13, padding: '6px 14px' }} onClick={e => { e.stopPropagation(); startEdit(null); }}>+ Add Type</button>}
          <span style={{ fontSize: 18, color: '#6b7280' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && <>
        <div style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>
          What an officer can choose when adding a pin on <b>My Patrol</b>, grouped by category.
        </div>
        {editing && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, margin: '0 0 16px 0' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{editing === 'new' ? 'New Observation Type' : 'Edit Observation Type'}</div>
            {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginBottom: 10, fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0, flex: '2 1 220px' }}>
                <label className="form-label" htmlFor="obs-label">Observation</label>
                <input id="obs-label" className="form-input" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Road construction" />
              </div>
              <div className="form-group" style={{ margin: 0, flex: '1 1 180px' }}>
                <label className="form-label" htmlFor="obs-cat">Category</label>
                <input id="obs-cat" className="form-input" list="obs-cats" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Third-party works" />
                <datalist id="obs-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <button className="btn btn-primary" style={{ fontSize: 13 }} disabled={saving || !form.label.trim()} onClick={save}>{saving ? 'Saving...' : 'Save'}</button>
              <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={cancel}>Cancel</button>
            </div>
          </div>
        )}

        <table>
          <thead><tr><th>Observation</th><th>Category</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {types.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 500 }}>{t.label}</td>
                <td style={{ fontSize: 12, color: '#6b7280' }}>{t.category || '—'}</td>
                <td><span className={`tag ${t.is_active ? 'tag-green' : 'tag-gray'}`} style={{ fontSize: 10 }}>{t.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => startEdit(t)}>Edit</button>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => toggleActive(t)}>{t.is_active ? 'Deactivate' : 'Activate'}</button>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px', color: '#e53e3e' }} onClick={() => remove(t)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {types.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>No observation types yet</td></tr>}
          </tbody>
        </table>
      </>}
    </div>
  );
}
