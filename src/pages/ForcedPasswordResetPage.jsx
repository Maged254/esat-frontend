import React, { useState } from 'react';
import { useAuth } from '../utils/AuthContext';
import api from '../utils/api';
import PasswordInput from '../components/PasswordInput';

export default function ForcedPasswordResetPage() {
  const { logout, refreshUser } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validatePassword = (pw) => {
    if (pw.length < 12) return 'Password must be at least 12 characters';
    if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter';
    if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter';
    if (!/[0-9]/.test(pw)) return 'Password must include a number';
    if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must include a special character';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirmPassword) return setError('New passwords do not match');
    const pwError = validatePassword(form.newPassword);
    if (pwError) return setError(pwError);
    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword
      });
      await refreshUser();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo" style={{flexDirection:'column',alignItems:'center',gap:8,marginBottom:8}}>
          <img src="/esat-login-logo.jpg" alt="ESAT" style={{ width: '100%', objectFit:'contain' }}
               onError={e => { e.target.style.display='none'; }} />
        </div>

        <p style={{ fontSize: 13, color: '#374151', textAlign: 'center', marginBottom: 16 }}>
          For security, you need to set a new password before continuing.
        </p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group mb-4">
            <label className="form-label">Current Password</label>
            <PasswordInput
              value={form.currentPassword}
              onChange={e => setForm(p => ({...p, currentPassword: e.target.value}))}
              placeholder="••••••••"
              required
              autoFocus
            />
          </div>
          <div className="form-group mb-4">
            <label className="form-label">New Password</label>
            <PasswordInput
              value={form.newPassword}
              onChange={e => setForm(p => ({...p, newPassword: e.target.value}))}
              placeholder="••••••••"
              required
            />
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>At least 12 characters, with uppercase, lowercase, a number, and a special character.</div>
          </div>
          <div className="form-group mb-4">
            <label className="form-label">Confirm New Password</label>
            <PasswordInput
              value={form.confirmPassword}
              onChange={e => setForm(p => ({...p, confirmPassword: e.target.value}))}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '10px' }}
          >
            {loading ? 'Saving...' : 'Set New Password'}
          </button>
        </form>

        <button
          className="btn"
          onClick={logout}
          style={{ width: '100%', justifyContent: 'center', marginTop: 12, background: 'transparent' }}
        >
          Log out instead
        </button>
      </div>
    </div>
  );
}
