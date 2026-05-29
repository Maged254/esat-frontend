import React, { useState } from 'react';
import { useAuth } from '../utils/AuthContext';
import api from '../utils/api';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(''); setSuccess('');
    if (form.newPassword !== form.confirmPassword)
      return setError('New passwords do not match');
    if (form.newPassword.length < 8)
      return setError('Password must be at least 8 characters');
    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword
      });
      setSuccess('Password changed successfully!');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch(e) {
      setError(e.response?.data?.error || 'Failed to change password');
    } finally { setLoading(false); }
  };

  const ROLE_LABELS = { admin: 'Admin', ehs_officer: 'EHS Officer', supervisor: 'Supervisor' };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">My Profile</span>
        </div>
      </div>
      <div className="content" style={{ maxWidth: 600 }}>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><span className="card-title">Account Details</span></div>
          <div className="card-body" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <div className="avatar av-green" style={{ width: 56, height: 56, fontSize: 20 }}>
                {user?.name?.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 500 }}>{user?.name}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{user?.email}</div>
                <span className={`tag ${user?.role === 'admin' ? 'tag-amber' : user?.role === 'ehs_officer' ? 'tag-teal' : 'tag-navy'}`} style={{ marginTop: 4 }}>
                  {ROLE_LABELS[user?.role]}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Change Password</span></div>
          <div style={{ padding: 18 }}>
            {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}
            {success && <div style={{ background: '#EAF3DE', color: '#3B6D11', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{success}</div>}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Current Password</label>
              <input className="form-input" type="password" value={form.currentPassword} onChange={e => setForm(p => ({...p, currentPassword: e.target.value}))} placeholder="••••••••" />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">New Password</label>
              <input className="form-input" type="password" value={form.newPassword} onChange={e => setForm(p => ({...p, newPassword: e.target.value}))} placeholder="••••••••" />
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Confirm New Password</label>
              <input className="form-input" type="password" value={form.confirmPassword} onChange={e => setForm(p => ({...p, confirmPassword: e.target.value}))} placeholder="••••••••" />
            </div>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Saving...' : 'Change Password'}
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
