import React, { useEffect, useState } from 'react';
import api from '../utils/api';

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [ppeItems, setPpeItems] = useState([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'ehs_officer' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data)).catch(console.error);
    api.get('/ppe').then(r => setPpeItems(r.data)).catch(console.error);
  }, []);

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
      setForm({ full_name: '', email: '', password: '', role: 'ehs_officer' });
    } catch(e) {
      setError(e.response?.data?.error || 'Failed');
    }
  };

  const toggleActive = async (user) => {
    const res = await api.put(`/users/${user.id}`, { ...user, is_active: !user.is_active });
    setUsers(prev => prev.map(u => u.id === user.id ? res.data : u));
  };

  const startEdit = (user) => {
    setEditUser(user);
    setForm({ full_name: user.full_name, email: user.email, password: '', role: user.role, is_active: user.is_active });
    setShowAddUser(true);
  };

  const ROLE_TAG = {
    admin: <span className="tag tag-amber">Admin</span>,
    ehs_officer: <span className="tag tag-teal">EHS Officer</span>,
    supervisor: <span className="tag tag-navy">Supervisor</span>,
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
        <div className="card mb-4" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">User Management</span>
            <button className="btn btn-primary" onClick={() => { setShowAddUser(true); setEditUser(null); setForm({ full_name: '', email: '', password: '', role: 'ehs_officer' }); }}>
              + Add User
            </button>
          </div>

          {showAddUser && (
            <div style={{ padding: 18, borderBottom: '0.5px solid #e5e7eb', background: '#f9fafb' }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>{editUser ? 'Edit User' : 'New User'}</div>
              {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}
              {success && <div style={{ background: '#EAF3DE', color: '#3B6D11', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{success}</div>}
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
                <button className="btn" onClick={() => { setShowAddUser(false); setEditUser(null); setError(''); }}>Cancel</button>
              </div>
            </div>
          )}

          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500 }}>{u.full_name}</td>
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
                  <td><input type="checkbox" defaultChecked={p.is_active} style={{ accentColor: 'var(--eg-green, #1D9E75)' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </>
  );
}
