import React, { useEffect, useState, useRef } from 'react';
import api from '../utils/api';

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [ppeItems, setPpeItems] = useState([]);
  const [editingPpe, setEditingPpe] = useState(null);
  const [ppeSearch, setPpeSearch] = useState('');
  const [ppeCategoryFilter, setPpeCategoryFilter] = useState(''); // {id, name, category, has_size, size_type, sort_order, is_active} or 'new'
  const [ppeForm, setPpeForm] = useState({});
  const [ppeSaving, setPpeSaving] = useState(false);

  // Collapsible sections
  const [openSections, setOpenSections] = useState({ users: true, ppe: false, locations: false });
  const toggleSection = (key) => setOpenSections(p => ({ ...p, [key]: !p[key] }));

  // Locations
  const [locations, setLocations] = useState([]);
  const [locSearch, setLocSearch] = useState('');
  const [editingLoc, setEditingLoc] = useState(null); // id or 'new'
  const [locForm, setLocForm] = useState({ name: '' });
  const [locSaving, setLocSaving] = useState(false);
  const [locError, setLocError] = useState('');

  const CATEGORIES = [
    'Head Protection','Eye & Face Protection','Hearing Protection',
    'Respiratory Protection','Hand Protection','Body Protection',
    'Foot Protection','Fall Protection','WAH Equipment'
  ];

  const openEdit = (p) => { setEditingPpe(p.id); setPpeForm({ ...p }); };
  const openNew = () => { setEditingPpe('new'); setPpeForm({ name:'', category:'Head Protection', has_size:false, size_type:'clothing', sort_order:99, is_active:true }); };
  const cancelEdit = () => { setEditingPpe(null); setPpeForm({}); };
  const deletePpe = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete('/ppe/' + id);
      setPpeItems(prev => prev.filter(p => p.id !== id));
    } catch(e) { alert('Delete failed'); }
  };

  const savePpe = async () => {
    setPpeSaving(true);
    try {
      if (editingPpe === 'new') {
        const r = await api.post('/ppe', ppeForm);
        setPpeItems(prev => [...prev, r.data]);
      } else {
        const r = await api.put('/ppe/' + editingPpe, ppeForm);
        setPpeItems(prev => prev.map(p => p.id === editingPpe ? r.data : p));
      }
      cancelEdit();
    } catch(e) { alert('Save failed'); }
    setPpeSaving(false);
  };
  const [showAddUser, setShowAddUser] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'ehs_officer', is_active: true, profile_picture: null });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef();

  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data)).catch(console.error);
    api.get('/ppe').then(r => setPpeItems(r.data)).catch(console.error);
    api.get('/locations').then(r => setLocations(r.data)).catch(console.error);
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setForm(p => ({ ...p, profile_picture: reader.result }));
      setPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    setError(''); setSuccess('');
    try {
      if (editUser) {
        const res = await api.put(`/users/${editUser.id}`, form);
        setUsers(prev => prev.map(u => u.id === editUser.id ? res.data : u));
        setSuccess('User updated!');
      } else {
        const res = await api.post('/users', form);
        setUsers(prev => [res.data, ...prev]);
        setSuccess('User created!');
      }
      setShowAddUser(false);
      setEditUser(null);
      setForm({ full_name: '', email: '', password: '', role: 'ehs_officer', is_active: true, profile_picture: null });
      setPreview(null);
    } catch(e) {
      setError(e.response?.data?.error || 'Failed');
    }
  };

  const toggleActive = async (user) => {
    const res = await api.put(`/users/${user.id}`, { ...user, password: '' });
    setUsers(prev => prev.map(u => u.id === user.id ? {...u, is_active: res.data.is_active} : u));
  };

  const startEdit = (user) => {
    setEditUser(user);
    setForm({ full_name: user.full_name, email: user.email, password: '', role: user.role, is_active: user.is_active, profile_picture: user.profile_picture });
    setPreview(user.profile_picture || null);
    setShowAddUser(true);
  };

  const ROLE_TAG = {
    admin: <span className="tag tag-amber">Admin</span>,
    ehs_officer: <span className="tag tag-teal">EHS Officer</span>,
    supervisor: <span className="tag tag-navy">Supervisor</span>,
  };

  const Avatar = ({ user, size = 32 }) => {
    const initials = user.full_name?.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase() || '?';
    if (user.profile_picture) {
      return <img src={user.profile_picture} alt={user.full_name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
    }
    return <div className="avatar av-teal" style={{ width: size, height: size, fontSize: size * 0.35 }}>{initials}</div>;
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Admin Panel</span>
        </div>
      </div>
      <div className="content">

        {/* User Management */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header" style={{ cursor:'pointer' }} onClick={() => toggleSection('users')}>
            <span className="card-title">User Management</span>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {openSections.users && <button className="btn btn-primary" onClick={e => { e.stopPropagation(); setShowAddUser(true); setEditUser(null); setForm({ full_name: '', email: '', password: '', role: 'ehs_officer', is_active: true, profile_picture: null }); setPreview(null); setError(''); }}>+ Add User</button>}
              <span style={{ fontSize:18, color:'#6b7280' }}>{openSections.users ? '▲' : '▼'}</span>
            </div>
          </div>
          {openSections.users && <><div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <input className="form-input" style={{ height:32, padding:'4px 10px', fontSize:13, width:220 }} placeholder="Search name..." value={userSearch} onChange={e=>setUserSearch(e.target.value)} />
            <select className="form-input" style={{ height:32, padding:'4px 10px', fontSize:13, width:180 }} value={userRoleFilter} onChange={e=>setUserRoleFilter(e.target.value)}>
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="ehs_manager">EHS Manager</option>
              <option value="ehs_officer">EHS Officer</option>
              <option value="supervisor">Supervisor</option>
              <option value="scm_officer">SCM Officer</option>
            </select>
            {(userSearch||userRoleFilter) && <button className="btn btn-secondary" style={{ fontSize:12, height:32 }} onClick={()=>{setUserSearch('');setUserRoleFilter('');}}>✕ Clear</button>}
          </div>

          {showAddUser && (
            <div style={{ padding: 18, borderBottom: '0.5px solid #e5e7eb', background: '#f9fafb' }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>{editUser ? 'Edit User' : 'New User'}</div>
              {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}
              {success && <div style={{ background: '#EAF3DE', color: '#3B6D11', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{success}</div>}

              {/* Profile Picture Upload */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div onClick={() => fileRef.current.click()} style={{ cursor: 'pointer', position: 'relative' }}>
                  {preview
                    ? <img src={preview} alt="preview" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid #1D9E75' }} />
                    : <div className="avatar av-teal" style={{ width: 64, height: 64, fontSize: 22 }}>📷</div>
                  }
                  <div style={{ position: 'absolute', bottom: 0, right: 0, background: '#1D9E75', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'white' }}>+</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Profile Picture</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Click to upload (JPG, PNG)</div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input className="form-input" value={form.full_name} onChange={e => setForm(p => ({...p, full_name: e.target.value}))} placeholder="Full name" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} placeholder="email@egypro.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">{editUser ? 'New Password (leave blank to keep)' : 'Password'}</label>
                  <input className="form-input" type="password" value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} placeholder="••••••••" />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-select" value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))}>
                    <option value="ehs_officer">EHS Officer</option>
                    <option value="ehs_manager">EHS Manager</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="scm_officer">SCM Officer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={handleSubmit}>{editUser ? 'Save Changes' : 'Create User'}</button>
                <button className="btn" onClick={() => { setShowAddUser(false); setEditUser(null); setError(''); setPreview(null); }}>Cancel</button>
              </div>
            </div>
          )}

          <table>
            <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {users.filter(u => (!userSearch || u.full_name?.toLowerCase().includes(userSearch.toLowerCase())) && (!userRoleFilter || u.role === userRoleFilter)).map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="emp-cell">
                      <Avatar user={u} size={32} />
                      <span style={{ fontWeight: 500 }}>{u.full_name}</span>
                    </div>
                  </td>
                  <td style={{ color: '#6b7280', fontSize: 12 }}>{u.email}</td>
                  <td>{ROLE_TAG[u.role]}</td>
                  <td><span className={`tag ${u.is_active ? 'tag-green' : 'tag-red'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => startEdit(u)}>Edit</button>
                      <button className="btn btn-sm" onClick={() => toggleActive(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>}
        </div>

        {/* PPE Config */}
        <div className="card">
          <div className="card-header" style={{ cursor:'pointer' }} onClick={() => toggleSection('ppe')}>
            <span className="card-title">PPE Checklist Configuration</span>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {openSections.ppe && <button className="btn btn-primary" style={{ fontSize:13, padding:'6px 14px' }} onClick={e => { e.stopPropagation(); openNew(); }}>+ Add Item</button>}
              <span style={{ fontSize:18, color:'#6b7280' }}>{openSections.ppe ? '▲' : '▼'}</span>
            </div>
          </div>

          {openSections.ppe && <>
          {editingPpe && (
            <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:16, margin:'0 0 16px 0' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:'#64748b', display:'block', marginBottom:4 }}>Item Name</label>
                  <input className="form-input" value={ppeForm.name || ''} onChange={e => setPpeForm(f=>({...f, name:e.target.value}))} placeholder="e.g. Safety Helmet (Yellow)" />
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:'#64748b', display:'block', marginBottom:4 }}>Category</label>
                  <select className="form-input" value={ppeForm.category || ''} onChange={e => setPpeForm(f=>({...f, category:e.target.value}))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:'#64748b', display:'block', marginBottom:4 }}>Sort Order</label>
                  <input className="form-input" type="number" value={ppeForm.sort_order || 99} onChange={e => setPpeForm(f=>({...f, sort_order:parseInt(e.target.value)}))} />
                </div>
                <div style={{ display:'flex', gap:24, alignItems:'center', paddingTop:20 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                    <input type="checkbox" checked={!!ppeForm.has_size} onChange={e => setPpeForm(f=>({...f, has_size:e.target.checked}))} style={{ accentColor:'#1D9E75' }} />
                    Has Size
                  </label>
                  {ppeForm.has_size && (
                    <select className="form-input" style={{ width:'auto' }} value={ppeForm.size_type || 'clothing'} onChange={e => setPpeForm(f=>({...f, size_type:e.target.value}))}>
                      <option value="clothing">S–XXL</option>
                      <option value="shoe">38–47</option>
                      <option value="harness">S–XL</option>
                    </select>
                  )}
                  <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                    <input type="checkbox" checked={!!ppeForm.is_active} onChange={e => setPpeForm(f=>({...f, is_active:e.target.checked}))} style={{ accentColor:'#1D9E75' }} />
                    Active
                  </label>
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary" style={{ fontSize:13 }} onClick={savePpe} disabled={ppeSaving}>{ppeSaving ? 'Saving...' : 'Save'}</button>
                <button className="btn btn-secondary" style={{ fontSize:13 }} onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <input className="form-input" style={{ height:32, padding:'4px 10px', fontSize:13, width:220 }} placeholder="Search PPE item..." value={ppeSearch} onChange={e=>setPpeSearch(e.target.value)} />
            <select className="form-input" style={{ height:32, padding:'4px 10px', fontSize:13, width:200 }} value={ppeCategoryFilter} onChange={e=>setPpeCategoryFilter(e.target.value)}>
              <option value="">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {(ppeSearch||ppeCategoryFilter) && <button className="btn btn-secondary" style={{ fontSize:12, height:32 }} onClick={()=>{setPpeSearch('');setPpeCategoryFilter('');}}>✕ Clear</button>}
          </div>
          <table>
            <thead><tr><th>PPE item</th><th>Category</th><th>Size</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {ppeItems.filter(p => (!ppeSearch || p.name.toLowerCase().includes(ppeSearch.toLowerCase())) && (!ppeCategoryFilter || p.category === ppeCategoryFilter)).map(p => (
                <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.45 }}>
                  <td>{p.name}</td>
                  <td><span className="tag tag-gray" style={{ fontSize:10 }}>{p.category?.replace(/_/g,' ')}</span></td>
                  <td>{p.has_size ? <span className="tag tag-teal" style={{ fontSize:10 }}>{p.size_type === 'shoe' ? '38–47' : p.size_type === 'harness' ? 'S–XL' : 'S–XXL'}</span> : '—'}</td>
                  <td>{p.is_active ? <span className="tag tag-green" style={{ fontSize:10 }}>Active</span> : <span className="tag tag-gray" style={{ fontSize:10 }}>Inactive</span>}</td>
                  <td style={{display:'flex',gap:6}}><button className="btn btn-secondary" style={{ fontSize:12, padding:'4px 10px' }} onClick={() => openEdit(p)}>Edit</button><button className="btn btn-secondary" style={{ fontSize:12, padding:'4px 10px', color:'#e53e3e' }} onClick={() => deletePpe(p.id, p.name)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          </>}
        </div>

        {/* Locations */}
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header" style={{ cursor:'pointer' }} onClick={() => toggleSection('locations')}>
            <span className="card-title">Locations</span>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {openSections.locations && <button className="btn btn-primary" style={{ fontSize:13, padding:'6px 14px' }} onClick={e => { e.stopPropagation(); setEditingLoc('new'); setLocForm({ name:'' }); setLocError(''); }}>+ Add Location</button>}
              <span style={{ fontSize:18, color:'#6b7280' }}>{openSections.locations ? '▲' : '▼'}</span>
            </div>
          </div>

          {openSections.locations && <>
          {editingLoc && (
            <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:16, margin:'0 0 16px 0' }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>{editingLoc === 'new' ? 'New Location' : 'Edit Location'}</div>
              {locError && <div style={{ background:'#FCEBEB', color:'#A32D2D', padding:'8px 12px', borderRadius:6, marginBottom:10, fontSize:13 }}>{locError}</div>}
              <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
                <div className="form-group" style={{ margin:0, flex:1 }}>
                  <label className="form-label">Location Name</label>
                  <input className="form-input" value={locForm.name} onChange={e => setLocForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Nairobi" />
                </div>
                <button className="btn btn-primary" style={{ fontSize:13 }} disabled={locSaving} onClick={async () => {
                  if (!locForm.name.trim()) { setLocError('Name is required'); return; }
                  setLocSaving(true); setLocError('');
                  try {
                    if (editingLoc === 'new') {
                      const r = await api.post('/locations', locForm);
                      setLocations(prev => [...prev, r.data].sort((a,b) => a.name.localeCompare(b.name)));
                    } else {
                      const r = await api.put('/locations/' + editingLoc, locForm);
                      setLocations(prev => prev.map(l => l.id === editingLoc ? r.data : l));
                    }
                    setEditingLoc(null); setLocForm({ name: '' });
                  } catch(e) { setLocError(e.response?.data?.error || 'Save failed'); }
                  setLocSaving(false);
                }}>{locSaving ? 'Saving...' : 'Save'}</button>
                <button className="btn btn-secondary" style={{ fontSize:13 }} onClick={() => { setEditingLoc(null); setLocForm({ name:'' }); setLocError(''); }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ marginBottom:12 }}>
            <input className="form-input" style={{ height:32, padding:'4px 10px', fontSize:13, width:220 }}
              placeholder="Search locations..." value={locSearch} onChange={e => setLocSearch(e.target.value)} />
          </div>

          <table>
            <thead><tr><th>Location Name</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {locations.filter(l => !locSearch || l.name.toLowerCase().includes(locSearch.toLowerCase())).map(l => (
                <tr key={l.id}>
                  <td style={{ fontWeight:500 }}>{l.name}</td>
                  <td><span className={`tag ${l.active ? 'tag-green' : 'tag-gray'}`} style={{ fontSize:10 }}>{l.active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <div style={{ display:'flex', gap:6 }}>
                      <button className="btn btn-secondary" style={{ fontSize:12, padding:'4px 10px' }}
                        onClick={() => { setEditingLoc(l.id); setLocForm({ name: l.name }); setLocError(''); }}>Edit</button>
                      <button className="btn btn-secondary" style={{ fontSize:12, padding:'4px 10px' }}
                        onClick={async () => {
                          const newActive = !l.active;
                          try {
                            const r = await api.put('/locations/' + l.id, { active: newActive });
                            setLocations(prev => prev.map(x => x.id === l.id ? r.data : x));
                          } catch(e) { alert('Failed to update'); }
                        }}>{l.active ? 'Deactivate' : 'Activate'}</button>
                      <button className="btn btn-secondary" style={{ fontSize:12, padding:'4px 10px', color:'#e53e3e' }}
                        onClick={async () => {
                          if (!window.confirm(`Delete "${l.name}"?`)) return;
                          try {
                            await api.delete('/locations/' + l.id);
                            setLocations(prev => prev.filter(x => x.id !== l.id));
                          } catch(e) { alert(e.response?.data?.error || 'Delete failed'); }
                        }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>}
        </div>


      </div>
    </>
  );
}
