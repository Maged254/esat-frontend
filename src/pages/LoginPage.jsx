import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo" style={{flexDirection:'column',alignItems:'center',gap:8,marginBottom:8}}>
          <img src="/logo.png" alt="Egypro" style={{ width: 72, height: 72, borderRadius: 12 }}
               onError={e => { e.target.style.display='none'; }} />
          <div style={{textAlign:'center'}}>
            <div className="login-title" style={{fontSize:52,letterSpacing:4,fontWeight:800}}>ESAT</div>
            <div className="login-sub" style={{fontSize:16,marginTop:4,letterSpacing:1}}>Egypro Safety Audit Tracker</div>
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group mb-4">
            <label className="form-label">Email address</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@egypro.com"
              required
              autoFocus
            />
          </div>
          <div className="form-group mb-4">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
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
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p style={{ marginTop: 24, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
          ESAT v1.0 · Egypro Group
        </p>
      </div>
    </div>
  );
}
