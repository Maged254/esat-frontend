import React, { useEffect, useState } from 'react';
import api from '../utils/api';

const STATUS_COLORS = {
  pending: 'tag-amber',
  purchase_requested: 'tag-navy',
  ordered: 'tag-navy',
  available: 'tag-teal',
  distributed: 'tag-green',
  canceled: 'tag-red',
  resolved: 'tag-green',
};

const STATUS_LABELS = {
  pending: 'Pending',
  purchase_requested: 'Purchase Requested',
  ordered: 'Ordered',
  available: 'Available',
  distributed: 'Distributed',
  canceled: 'Canceled',
  resolved: 'Resolved',
};

const SCM_STATUSES = ['pending', 'purchase_requested', 'ordered', 'available', 'distributed', 'canceled'];

export default function PPERequestTrackerPage() {
  const [requests, setRequests] = useState([]);
  const [filters, setFilters] = useState({ status: '', search: '' });
  const [userRole, setUserRole] = useState('');

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('esat_user'));
      if (user) setUserRole(user.role);
    } catch {}
  }, []);

  useEffect(() => {
    api.get('/ppe-requests').then(r => setRequests(r.data)).catch(console.error);
  }, []);

  const updateStatus = async (id, status) => {
    await api.put(`/ppe-requests/${id}/status`, { status });
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const filtered = requests.filter(r => {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.search && !r.employee_name.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });

  const canEdit = userRole === 'scm_officer' || userRole === 'admin';

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">PPE Request Tracker</span>
        </div>
      </div>
      <div className="content">
        <div className="stat-grid" style={{marginBottom:16}}>
          <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value navy">{requests.length}</div></div>
          <div className="stat-card"><div className="stat-label">Pending</div><div className="stat-value warning">{requests.filter(r=>r.status==='pending').length}</div></div>
          <div className="stat-card"><div className="stat-label">Ordered</div><div className="stat-value navy">{requests.filter(r=>r.status==='ordered'||r.status==='purchase_requested').length}</div></div>
          <div className="stat-card"><div className="stat-label">Available</div><div className="stat-value green">{requests.filter(r=>r.status==='available').length}</div></div>
          <div className="stat-card"><div className="stat-label">Distributed</div><div className="stat-value green">{requests.filter(r=>r.status==='distributed').length}</div></div>
        </div>
        <div className="card">
          <div className="card-header" style={{flexWrap:'wrap',gap:8}}>
            <span className="card-title">PPE Request Tracker</span>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:160}} placeholder="Search employee..." value={filters.search} onChange={e=>setFilters(p=>({...p,search:e.target.value}))} />
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:160}} value={filters.status} onChange={e=>setFilters(p=>({...p,status:e.target.value}))}>
                <option value="">All Status</option>
                {SCM_STATUSES.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
              <button className="btn" style={{height:30,padding:'4px 12px',fontSize:12}} onClick={()=>setFilters({status:'',search:''})}>✕ Clear</button>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>PPE Item</th>
                <th>Size</th>
                <th>Date Flagged</th>
                <th>Date Ordered</th>
                <th>Date Available</th>
                <th>Date Distributed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td>
                    <div className="emp-name">{r.employee_name}</div>
                    <div className="emp-id">{r.employee_number}</div>
                  </td>
                  <td>{r.ppe_name}</td>
                  <td>{r.size_value || '—'}</td>
                  <td style={{fontSize:12}}>{new Date(r.date_flagged).toLocaleDateString('en-GB')}</td>
                  <td style={{fontSize:12}}>{r.date_ordered ? new Date(r.date_ordered).toLocaleDateString('en-GB') : '—'}</td>
                  <td style={{fontSize:12}}>{r.date_available ? new Date(r.date_available).toLocaleDateString('en-GB') : '—'}</td>
                  <td style={{fontSize:12}}>{r.date_distributed ? new Date(r.date_distributed).toLocaleDateString('en-GB') : '—'}</td>
                  <td>
                    {canEdit && r.status !== 'canceled' && r.status !== 'distributed' ? (
                      <select className="form-select" style={{fontSize:11,padding:'3px 6px',height:26}} value={r.status} onChange={e=>updateStatus(r.id,e.target.value)}>
                        {SCM_STATUSES.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                      </select>
                    ) : (
                      <span className={'tag ' + (STATUS_COLORS[r.status]||'tag-gray')}>{STATUS_LABELS[r.status]||r.status}</span>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={8} style={{textAlign:'center',color:'#6b7280',padding:32}}>No PPE requests found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
