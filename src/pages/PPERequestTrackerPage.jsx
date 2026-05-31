import React, { useEffect, useState } from 'react';
import api from '../utils/api';

const STATUS_FLOW = ['pending', 'ehs_purchase_requested', 'scm_ordered', 'warehouse_available', 'distributed', 'canceled'];

const STATUS_LABELS = {
  pending: 'Pending',
  ehs_purchase_requested: 'EHS Purchase Requested',
  scm_ordered: 'SCM Ordered',
  warehouse_available: 'Warehouse Available',
  distributed: 'Distributed',
  canceled: 'Canceled',
};

const STATUS_COLORS = {
  pending: 'tag-amber',
  ehs_purchase_requested: 'tag-navy',
  scm_ordered: 'tag-navy',
  warehouse_available: 'tag-teal',
  distributed: 'tag-green',
  canceled: 'tag-red',
};

const fmt = d => d ? new Date(d).toLocaleDateString('en-GB') : '—';

export default function PPERequestTrackerPage() {
  const [requests, setRequests] = useState([]);
  const [filters, setFilters] = useState({ status: 'ehs_purchase_requested', search: '' });
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
    await api.put('/ppe-requests/' + id + '/status', { status });
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status,
      date_purchase_requested: status === 'ehs_purchase_requested' ? new Date().toISOString() : r.date_purchase_requested,
      date_ordered: status === 'scm_ordered' ? new Date().toISOString() : r.date_ordered,
      date_available: status === 'warehouse_available' ? new Date().toISOString() : r.date_available,
      date_distributed: status === 'distributed' ? new Date().toISOString() : r.date_distributed,
    } : r));
  };

  const filtered = requests.filter(r => {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.search && !r.employee_name?.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });

  const canEdit = (r) => {
    if (r.status === 'canceled' || r.status === 'distributed') return false;
    if (userRole === 'admin') return true;
    if (userRole === 'scm_officer' && !['pending', 'ehs_purchase_requested'].includes(r.status)) return true;
    return false;
  };

  const getOptions = (r) => {
    if (userRole === 'scm_officer') return ['scm_ordered', 'warehouse_available', 'distributed', 'canceled'];
    return STATUS_FLOW.filter(s => s !== 'pending');
  };

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
        <div className="stat-grid" style={{marginBottom:16,gridTemplateColumns:'repeat(5,1fr)'}}>
          <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value navy">{filtered.length}</div></div>
          <div className="stat-card"><div className="stat-label">Pending</div><div className="stat-value warning">{filtered.filter(r=>r.status==='pending').length}</div></div>
          <div className="stat-card"><div className="stat-label">EHS Requested</div><div className="stat-value navy">{filtered.filter(r=>r.status==='ehs_purchase_requested').length}</div></div>
          <div className="stat-card"><div className="stat-label">In Progress</div><div className="stat-value navy">{filtered.filter(r=>r.status==='scm_ordered'||r.status==='warehouse_available').length}</div></div>
          <div className="stat-card"><div className="stat-label">Distributed</div><div className="stat-value green">{filtered.filter(r=>r.status==='distributed').length}</div></div>
        </div>
        <div className="card">
          <div className="card-header" style={{flexWrap:'wrap',gap:8}}>
            <span className="card-title">PPE Request Tracker</span>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
              <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:160}} placeholder="Search employee..." value={filters.search} onChange={e=>setFilters(p=>({...p,search:e.target.value}))} />
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:180}} value={filters.status} onChange={e=>setFilters(p=>({...p,status:e.target.value}))}>
                <option value="">All Status</option>
                {STATUS_FLOW.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
              <button className="btn" style={{height:30,padding:'4px 12px',fontSize:12}} onClick={()=>setFilters({status:'',search:''})}>✕ Clear</button>
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>PPE Item</th>
                  <th>Size</th>
                  <th>📅 Flagged</th>
                  <th>📅 Purchase Request</th>
                  <th>📅 Ordered</th>
                  <th>📅 Availed</th>
                  <th>📅 Distributed</th>
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
                    <td style={{fontSize:12}}>{fmt(r.date_flagged)}</td>
                    <td style={{fontSize:12}}>{fmt(r.date_purchase_requested)}</td>
                    <td style={{fontSize:12}}>{fmt(r.date_ordered)}</td>
                    <td style={{fontSize:12}}>{fmt(r.date_available)}</td>
                    <td style={{fontSize:12}}>{fmt(r.date_distributed)}</td>
                    <td>
                      {canEdit(r) ? (
                        <select className="form-select" style={{fontSize:11,padding:'3px 6px',height:26}} value={r.status} onChange={e=>updateStatus(r.id,e.target.value)}>
                          <option value={r.status}>{STATUS_LABELS[r.status]}</option>
                          {getOptions(r).filter(s=>s!==r.status).map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                        </select>
                      ) : (
                        <span className={'tag ' + (STATUS_COLORS[r.status]||'tag-gray')}>{STATUS_LABELS[r.status]||r.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={9} style={{textAlign:'center',color:'#6b7280',padding:32}}>No PPE requests found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
