import React, { useEffect, useState } from 'react';
import api from '../utils/api';

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

const ELIGIBLE_STATUSES = {
  scm_ordered: ['ehs_purchase_requested'],
  warehouse_available: ['ehs_purchase_requested', 'scm_ordered'],
  distributed: ['ehs_purchase_requested', 'scm_ordered', 'warehouse_available'],
};

const dateCell = (date, name) => (
  <td style={{fontSize:12}}>
    {date ? (
      <div>
        <div>{new Date(date).toLocaleDateString('en-GB')}</div>
        {name && <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{name}</div>}
      </div>
    ) : '—'}
  </td>
);

export default function PPERequestTrackerPage() {
  const [requests, setRequests] = useState([]);
  const [filters, setFilters] = useState({ status: 'ehs_purchase_requested', search: '' });
  const [userRole, setUserRole] = useState('');
  const [bulkTarget, setBulkTarget] = useState(null);
  const [selected, setSelected] = useState([]);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('esat_user'));
      if (user) setUserRole(user.role);
    } catch {}
  }, []);

  useEffect(() => {
    api.get('/ppe-requests').then(r => setRequests(r.data)).catch(console.error);
  }, []);

  const reload = () => api.get('/ppe-requests').then(r => setRequests(r.data)).catch(console.error);

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  const startBulk = (target) => { setBulkTarget(target); setSelected([]); setShowMenu(false); };
  const cancelBulk = () => { setBulkTarget(null); setSelected([]); };

  const applyBulk = async () => {
    if (selected.length === 0) return;
    if (!window.confirm('Change ' + selected.length + ' item(s) to "' + STATUS_LABELS[bulkTarget] + '"?')) return;
    await Promise.all(selected.map(id => api.put('/ppe-requests/' + id + '/status', { status: bulkTarget })));
    reload();
    cancelBulk();
  };

  const isEligible = (r) => bulkTarget && ELIGIBLE_STATUSES[bulkTarget]?.includes(r.status);

  const filtered = requests.filter(r => {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.search && !r.employee_name?.toLowerCase().includes(filters.search.toLowerCase())) return false;
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
        <div className="topbar-right">
          {canEdit && !bulkTarget && (
            <div style={{position:'relative',display:'inline-block'}}>
              <button className="btn btn-navy" onClick={()=>setShowMenu(p=>!p)}>⚡ Change Status ▾</button>
              {showMenu && (
                <div style={{position:'absolute',right:0,top:'110%',background:'white',border:'1px solid #e5e7eb',borderRadius:8,boxShadow:'0 4px 12px rgba(0,0,0,0.1)',zIndex:100,minWidth:200}}>
                  {['scm_ordered','warehouse_available','distributed'].map(s=>(
                    <button key={s} onClick={()=>startBulk(s)} style={{display:'block',width:'100%',padding:'10px 16px',textAlign:'left',background:'none',border:'none',cursor:'pointer',fontSize:13,borderBottom:'1px solid #f3f4f6'}}>
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {bulkTarget && (
            <>
              <span style={{fontSize:12,color:'#6b7280'}}>{selected.length} selected → {STATUS_LABELS[bulkTarget]}</span>
              <button className="btn btn-primary" onClick={applyBulk} disabled={selected.length===0}>✓ Apply ({selected.length})</button>
              <button className="btn" onClick={cancelBulk}>✕ Cancel</button>
            </>
          )}
        </div>
      </div>
      <div className="content">
        <div className="stat-grid" style={{marginBottom:16,gridTemplateColumns:'repeat(5,1fr)'}}>
          <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value navy">{requests.length}</div></div>
          <div className="stat-card"><div className="stat-label">Pending</div><div className="stat-value warning">{requests.filter(r=>r.status==='pending').length}</div></div>
          <div className="stat-card"><div className="stat-label">EHS Requested</div><div className="stat-value navy">{requests.filter(r=>r.status==='ehs_purchase_requested').length}</div></div>
          <div className="stat-card"><div className="stat-label">In Progress</div><div className="stat-value navy">{requests.filter(r=>r.status==='scm_ordered'||r.status==='warehouse_available').length}</div></div>
          <div className="stat-card"><div className="stat-label">Distributed</div><div className="stat-value green">{requests.filter(r=>r.status==='distributed').length}</div></div>
        </div>
        <div className="card">
          <div className="card-header" style={{flexWrap:'wrap',gap:8}}>
            <span className="card-title">PPE Request Tracker</span>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
              <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:160}} placeholder="Search employee..." value={filters.search} onChange={e=>setFilters(p=>({...p,search:e.target.value}))} />
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:180}} value={filters.status} onChange={e=>setFilters(p=>({...p,status:e.target.value}))}>
                <option value="">All Status</option>
                {Object.keys(STATUS_LABELS).map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
              <button className="btn" style={{height:30,padding:'4px 12px',fontSize:12}} onClick={()=>setFilters({status:'',search:''})}>✕ Clear</button>
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table>
              <thead>
                <tr>
                  {bulkTarget && <th rowSpan={2}></th>}
                  <th rowSpan={2}>Employee</th>
                  <th rowSpan={2}>PPE Item</th>
                  <th rowSpan={2}>Size</th>
                  <th colSpan={2} style={{textAlign:'center',background:'#e6f1fb',color:'#0c447c',fontWeight:700,fontSize:11,letterSpacing:1,borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb'}}>EHS</th>
                  <th colSpan={2} style={{textAlign:'center',background:'#e8f5e9',color:'#1d9e75',fontWeight:700,fontSize:11,letterSpacing:1,borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb'}}>SCM</th>
                  <th colSpan={1} style={{textAlign:'center',background:'#fff3e0',color:'#e65100',fontWeight:700,fontSize:11,letterSpacing:1,borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb'}}>Projects</th>
                  <th rowSpan={2}>Status</th>
                </tr>
                <tr>
                  <th style={{width:100,minWidth:100,background:'#f0f7ff',borderLeft:'1px solid #e5e7eb'}}>Flagged</th>
                  <th style={{width:100,minWidth:100,background:'#f0f7ff',borderRight:'1px solid #e5e7eb'}}>Purchase Request</th>
                  <th style={{width:100,minWidth:100,background:'#f0fff4',borderLeft:'1px solid #e5e7eb'}}>Ordered</th>
                  <th style={{width:100,minWidth:100,background:'#f0fff4',borderRight:'1px solid #e5e7eb'}}>Availed</th>
                  <th style={{width:100,minWidth:100,background:'#fff8f0',borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb'}}>Distributed</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} style={{background: bulkTarget && isEligible(r) ? 'rgba(29,158,117,0.05)' : ''}}>
                    {bulkTarget && (
                      <td style={{textAlign:'center'}}>
                        {isEligible(r) && (
                          <input type="checkbox" checked={selected.includes(r.id)} onChange={()=>toggleSelect(r.id)}
                            style={{width:16,height:16,cursor:'pointer',accentColor:'var(--eg-green)'}} />
                        )}
                      </td>
                    )}
                    <td>
                      <div className="emp-name">{r.employee_name}</div>
                      <div className="emp-id">{r.employee_number}</div>
                    </td>
                    <td>{r.ppe_name}</td>
                    <td>{r.size_value || '—'}</td>
                    <td style={{fontSize:12,borderLeft:'1px solid #e5e7eb'}}>{r.date_flagged?<div><div>{new Date(r.date_flagged).toLocaleDateString('en-GB')}</div>{r.flagged_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.flagged_by_name}</div>}</div>:'—'}</td>
                    <td style={{fontSize:12,borderRight:'1px solid #e5e7eb'}}>{r.date_purchase_requested?<div><div>{new Date(r.date_purchase_requested).toLocaleDateString('en-GB')}</div>{r.purchase_requested_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.purchase_requested_by_name}</div>}</div>:'—'}</td>
                    <td style={{fontSize:12,borderLeft:'1px solid #e5e7eb'}}>{r.date_ordered?<div><div>{new Date(r.date_ordered).toLocaleDateString('en-GB')}</div>{r.ordered_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.ordered_by_name}</div>}</div>:'—'}</td>
                    <td style={{fontSize:12,borderRight:'1px solid #e5e7eb'}}>{r.date_available?<div><div>{new Date(r.date_available).toLocaleDateString('en-GB')}</div>{r.available_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.available_by_name}</div>}</div>:'—'}</td>
                    <td style={{fontSize:12,borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb'}}>{r.date_distributed?<div><div>{new Date(r.date_distributed).toLocaleDateString('en-GB')}</div>{r.distributed_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.distributed_by_name}</div>}</div>:'—'}</td>
                    <td><span className={'tag ' + (STATUS_COLORS[r.status]||'tag-gray')}>{STATUS_LABELS[r.status]||r.status}</span></td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={bulkTarget?10:9} style={{textAlign:'center',color:'#6b7280',padding:32}}>No PPE requests found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
