import React, { useEffect, useState, useRef } from 'react';
import api from '../utils/api';

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [ppeItems, setPpeItems] = useState([]);
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
          <div className="card-header">
            <span className="card-title">User Management</span>
            <button className="btn btn-primary" onClick={() => { setShowAddUser(true); setEditUser(null); setForm({ full_name: '', email: '', password: '', role: 'ehs_officer', is_active: true, profile_picture: null }); setPreview(null); setError(''); }}>
              + Add User
            </button>
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
                    <option value="supervisor">Supervisor</option>
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
              {users.map(u => (
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
        </div>

        {/* PPE Config */}
        <div className="card">
          <div className="card-header"><span className="card-title">PPE checklist configuration</span></div>
          <table>
            <thead><tr><th>PPE item</th><th>Category</th><th>Size</th><th>Active</th></tr></thead>
            <tbody>
              {ppeItems.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td><span className="tag tag-gray" style={{ fontSize: 10 }}>{p.category?.replace(/_/g,' ')}</span></td>
                  <td>{p.has_size ? <span className="tag tag-teal" style={{ fontSize: 10 }}>{p.size_type === 'shoe' ? '38–47' : 'S–XXL'}</span> : '—'}</td>
                  <td><input type="checkbox" defaultChecked={p.is_active} style={{ accentColor: '#1D9E75' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </>
  );
}
