import React, { useEffect, useState } from 'react';
import api, { logError } from '../utils/api';

// Admin Panel card: the Route Patrol areas a KMZ can be uploaded for
// (OneHub Operations → Routes). Renaming an area renames it on its uploads
// too; an area with uploads can be deactivated but not deleted.
export default function PatrolAreasAdmin() {
  const [open, setOpen] = useState(false);
  const [areas, setAreas] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | area id
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) api.get('/patrol/areas?all=1').then(r => setAreas(r.data)).catch(logError);
  }, [open]);

  const startEdit = (a) => { setEditing(a ? a.id : 'new'); setName(a ? a.name : ''); setError(''); };
  const cancel = () => { setEditing(null); setName(''); setError(''); };

  const save = async () => {
    setError(''); setSaving(true);
    try {
      if (editing === 'new') {
        const r = await api.post('/patrol/areas', { name: name.trim() });
        setAreas(prev => [...prev, r.data]);
      } else {
        const cur = areas.find(a => a.id === editing);
        const r = await api.put(`/patrol/areas/${editing}`, { name: name.trim(), is_active: cur.is_active });
        setAreas(prev => prev.map(a => a.id === editing ? r.data : a));
      }
      cancel();
    } catch (e) { setError(e.response?.data?.error || 'Could not save the area.'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (a) => {
    try {
      const r = await api.put(`/patrol/areas/${a.id}`, { name: a.name, is_active: !a.is_active });
      setAreas(prev => prev.map(x => x.id === a.id ? r.data : x));
    } catch (e) { alert(e.response?.data?.error || 'Could not update the area.'); }
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete "${a.name}"?`)) return;
    try {
      await api.delete(`/patrol/areas/${a.id}`);
      setAreas(prev => prev.filter(x => x.id !== a.id));
    } catch (e) { alert(e.response?.data?.error || 'Could not delete the area.'); }
  };

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <span className="card-title">Route Patrol Areas</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {open && <button className="btn btn-primary" style={{ fontSize: 13, padding: '6px 14px' }} onClick={e => { e.stopPropagation(); startEdit(null); }}>+ Add Area</button>}
          <span style={{ fontSize: 18, color: '#6b7280' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && <>
        <div style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>
          The areas a Planner can choose when uploading a KMZ on <b>OneHub Operations → Routes</b>.
        </div>
        {editing && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, margin: '0 0 16px 0' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{editing === 'new' ? 'New Area' : 'Edit Area'}</div>
            {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginBottom: 10, fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0, flex: '1 1 220px' }}>
                <label className="form-label" htmlFor="patrol-area-name">Area name</label>
                <input id="patrol-area-name" className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Nairobi West" />
              </div>
              <button className="btn btn-primary" style={{ fontSize: 13 }} disabled={saving || !name.trim()} onClick={save}>{saving ? 'Saving...' : 'Save'}</button>
              <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={cancel}>Cancel</button>
            </div>
            {editing !== 'new' && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>Renaming also renames the area on every cycle it was uploaded to.</div>}
          </div>
        )}

        <table>
          <thead><tr><th>Area</th><th>Uploads</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {areas.map(a => (
              <tr key={a.id}>
                <td style={{ fontWeight: 500 }}>{a.name}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{a.uploads}</td>
                <td><span className={`tag ${a.is_active ? 'tag-green' : 'tag-gray'}`} style={{ fontSize: 10 }}>{a.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => startEdit(a)}>Edit</button>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => toggleActive(a)}>{a.is_active ? 'Deactivate' : 'Activate'}</button>
                    {a.uploads === 0 && <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px', color: '#e53e3e' }} onClick={() => remove(a)}>Delete</button>}
                  </div>
                </td>
              </tr>
            ))}
            {areas.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>No areas yet</td></tr>}
          </tbody>
        </table>
      </>}
    </div>
  );
}
