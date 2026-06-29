import React, { useEffect, useState } from 'react';
import api from '../utils/api';

const STATUS_LABELS = {
  pending: 'Flagged',
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
  const [filters, setFilters] = useState({ status: 'ehs_purchase_requested', search: '', ppe: '', period: '', project: '', client: '', location: '' });
  const [locations, setLocations] = useState([]);
  const [locSearch, setLocSearch] = useState('');
  const [ppeSearch, setPpeSearch] = useState('');
  const [showPpeDrop, setShowPpeDrop] = useState(false);
  const [showLocDrop, setShowLocDrop] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [bulkTarget, setBulkTarget] = useState(null);
  const [selected, setSelected] = useState([]);
  const [showMenu, setShowMenu] = useState(false);
  const [distributionMethod, setDistributionMethod] = useState('');
  const [courierTracking, setCourierTracking] = useState('');
  const [trackingModal, setTrackingModal] = useState(null);
  const [groupMode, setGroupMode] = useState('none'); // 'none' | 'po' | 'employee'

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('esat_user'));
      if (user) setUserRole(user.role);
    } catch {}
  }, []);

  useEffect(() => {
    api.get('/ppe-requests').then(r => setRequests(r.data)).catch(console.error);
    api.get('/locations').then(r => setLocations(r.data)).catch(console.error);
  }, []);

  const reload = () => api.get('/ppe-requests').then(r => setRequests(r.data)).catch(console.error);

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  const startBulk = (target) => { setBulkTarget(target); setSelected([]); setShowMenu(false); };
  const cancelBulk = () => { setBulkTarget(null); setSelected([]); setDistributionMethod(''); setCourierTracking(''); };

  const applyBulk = async () => {
    if (selected.length === 0) return;
    if (!window.confirm('Change ' + selected.length + ' item(s) to "' + STATUS_LABELS[bulkTarget] + '"?')) return;
    await Promise.all(selected.map(id => api.put('/ppe-requests/' + id + '/status', {
      status: bulkTarget,
      distribution_method: bulkTarget === 'distributed' ? distributionMethod : undefined,
      courier_tracking_number: bulkTarget === 'distributed' && distributionMethod === 'courier' ? courierTracking : undefined,
    })));
    reload();
    cancelBulk();
  };

  const isEligible = (r) => bulkTarget && ELIGIBLE_STATUSES[bulkTarget]?.includes(r.status);

  const filtered = requests.filter(r => {
    if (filters.status === 'pda_pending') { if (r.status !== 'ehs_purchase_requested' || !r.needs_pda) return false; }
    else if (filters.status === 'ehs_purchase_requested') { if (r.status !== 'ehs_purchase_requested' || (r.needs_pda && !r.pda_approved_date)) return false; }
    else if (filters.status && r.status !== filters.status) return false;
    if (filters.search && !r.employee_name?.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.project && r.project !== filters.project) return false;
    if (filters.client && r.client !== filters.client) return false;
    if (filters.location && r.location_name !== filters.location) return false;
    if (filters.ppe && r.ppe_name !== filters.ppe) return false;
    if (filters.period) {
      const now = new Date();
      const flagged = new Date(r.date_flagged);
      if (filters.period === 'current' && (flagged.getMonth() !== now.getMonth() || flagged.getFullYear() !== now.getFullYear())) return false;
      if (filters.period === 'previous') {
        const prev = new Date(now.getFullYear(), now.getMonth() - 1);
        if (flagged.getMonth() !== prev.getMonth() || flagged.getFullYear() !== prev.getFullYear()) return false;
      }
    }
    return true;
  });

  const canEdit = userRole === 'scm_officer' || userRole === 'admin';

  const exportCSV = () => {
    const headers = ['employee_name','employee_number','employee_national_id','ppe_name','size_value','status','date_flagged','flagged_by_name','date_purchase_requested','purchase_requested_by_name','date_ordered','ordered_by_name','date_available','available_by_name','date_distributed','distributed_by_name'];
    const labels = ['Employee','Employee No','National ID','PPE/Tool Item','Size','Status','Date Flagged','Flagged By','Date Purchase Request','Purchase Requested By','Date Ordered','Ordered By','Date Availed','Availed By','Date Distributed','Distributed By'];
    const fmt = d => d ? new Date(d).toLocaleDateString('en-GB') : '';
    const rows = filtered.map(r => [
      r.employee_name, r.employee_number, r.employee_national_id, r.ppe_name, r.size_value||'',
      STATUS_LABELS[r.status]||r.status,
      fmt(r.date_flagged), r.flagged_by_name||'',
      fmt(r.date_purchase_requested), r.purchase_requested_by_name||'',
      fmt(r.date_ordered), r.ordered_by_name||'',
      fmt(r.date_available), r.available_by_name||'',
      fmt(r.date_distributed), r.distributed_by_name||'',
    ].map(v => String(v).includes(',') ? '"'+v+'"' : v).join(','));
    const csv = [labels.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ESAT_PPE_Tracker_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">PPE Request Tracker</span>
        </div>
        <div className="topbar-right">
          <button className="btn" onClick={exportCSV}>↓ Export CSV</button>
          {filters.status && (
            <button className="btn" title={groupMode==='po' ? 'Ungroup' : 'Group per Project'} onClick={()=>setGroupMode(m=>m==='po'?'none':'po')} style={{background:groupMode==='po'?'#0f2a4a':'',color:groupMode==='po'?'white':'',display:'inline-flex',alignItems:'center',gap:6,fontSize:13,padding:'0 12px'}}><i className="ti ti-stack-2" style={{fontSize:16}}></i>Group per Project</button>
          )}
          {filters.status && (
            <button className="btn" title={groupMode==='employee' ? 'Ungroup' : 'Group by Employee'} onClick={()=>setGroupMode(m=>m==='employee'?'none':'employee')} style={{background:groupMode==='employee'?'#0f2a4a':'',color:groupMode==='employee'?'white':'',display:'inline-flex',alignItems:'center',gap:6,fontSize:13,padding:'0 12px'}}><i className="ti ti-users" style={{fontSize:16}}></i>Group by Employee</button>
          )}
          {canEdit && !bulkTarget && (
            <div style={{position:'relative',display:'inline-block'}}>
              <button className="btn btn-navy" onClick={()=>setShowMenu(p=>!p)}>⚡ Change Status ▾</button>
              {showMenu && (
                <div style={{position:'absolute',right:0,top:'110%',background:'white',border:'1px solid #e5e7eb',borderRadius:8,boxShadow:'0 4px 12px rgba(0,0,0,0.1)',zIndex:100,minWidth:200}}>
                  {['scm_ordered','warehouse_available'].map(s=>(
                    <button key={s} onClick={()=>startBulk(s)} style={{display:'block',width:'100%',padding:'10px 16px',textAlign:'left',background:'none',border:'none',cursor:'pointer',fontSize:13,borderBottom:'1px solid #f3f4f6'}}>
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                  <div style={{borderTop:'2px solid #e5e7eb',marginTop:2}}>
                    <div style={{padding:'8px 16px 4px',fontSize:12,fontWeight:600,color:'#0f2a4a'}}>Distributed</div>
                    <button onClick={()=>{ startBulk('distributed'); setDistributionMethod('technician'); }} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'8px 16px 8px 24px',textAlign:'left',background:'none',border:'none',cursor:'pointer',fontSize:12,borderBottom:'1px solid #f3f4f6',color:'#374151'}}>
                      <span style={{width:6,height:6,borderRadius:'50%',background:'#1d9e75',flexShrink:0,display:'inline-block'}}></span> Collected by Technician
                    </button>
                    <button onClick={()=>{ startBulk('distributed'); setDistributionMethod('courier'); }} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'8px 16px 8px 24px',textAlign:'left',background:'none',border:'none',cursor:'pointer',fontSize:12,color:'#374151'}}>
                      <span style={{width:6,height:6,borderRadius:'50%',background:'#e65100',flexShrink:0,display:'inline-block'}}></span> Collected by Courier
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {bulkTarget && (
            <>
              <span style={{fontSize:12,color:'#6b7280'}}>{selected.length} selected → {bulkTarget === 'distributed' ? (distributionMethod === 'courier' ? 'Collected by Courier' : 'Collected by Technician') : STATUS_LABELS[bulkTarget]}</span>
              {bulkTarget === 'distributed' && distributionMethod === 'courier' && (
                <input className="form-input" style={{height:30,padding:'4px 10px',fontSize:12,width:200}} placeholder="Courier tracking number..." value={courierTracking} onChange={e=>setCourierTracking(e.target.value)} />
              )}
              <button className="btn btn-primary" onClick={applyBulk} disabled={selected.length===0 || (bulkTarget==='distributed' && !distributionMethod) || (bulkTarget==='distributed' && distributionMethod==='courier' && !courierTracking.trim())}>✓ Apply ({selected.length})</button>
              <button className="btn" onClick={cancelBulk}>✕ Cancel</button>
            </>
          )}
        </div>
      </div>
      <div className="content">
        <div className="stat-grid" style={{marginBottom:16,gridTemplateColumns:'repeat(6,1fr)'}}>
          <div className="stat-card" style={{cursor:'pointer',outline:!filters.status?'2px solid var(--eg-green)':''}} onClick={()=>{setFilters(p=>({...p,status:''})); setGroupMode('none');}}><div className="stat-label">Total Requested</div><div className="stat-value navy">{filtered.length}</div></div>
          <div className="stat-card" style={{cursor:'pointer',outline:filters.status==='pending'?'2px solid var(--eg-green)':''}} onClick={()=>{setFilters(p=>({...p,status:p.status==='pending'?'':'pending'})); setGroupMode('none');}}><div className="stat-label">Pending EHS</div><div className="stat-value warning">{requests.filter(r=>r.status==='pending').length}</div></div>
          <div className="stat-card" style={{cursor:'pointer',outline:filters.status==='pda_pending'?'2px solid var(--eg-green)':''}} onClick={()=>{setFilters(p=>({...p,status:p.status==='pda_pending'?'':'pda_pending'})); setGroupMode('none');}}><div className="stat-label">Pending PM</div><div className="stat-value navy">{requests.filter(r=>r.status==='ehs_purchase_requested' && r.needs_pda).length}</div></div>
          <div className="stat-card" style={{cursor:'pointer',outline:filters.status==='ehs_purchase_requested'?'2px solid var(--eg-green)':''}} onClick={()=>{setFilters(p=>({...p,status:p.status==='ehs_purchase_requested'?'':'ehs_purchase_requested'})); setGroupMode('none');}}><div className="stat-label">Pending SCM</div><div className="stat-value navy">{requests.filter(r=>r.status==='ehs_purchase_requested' && !(r.needs_pda && !r.pda_approved_date)).length}</div></div>
          <div className="stat-card" style={{cursor:'pointer',outline:filters.status==='scm_ordered'?'2px solid var(--eg-green)':''}} onClick={()=>{setFilters(p=>({...p,status:p.status==='scm_ordered'?'':'scm_ordered'})); setGroupMode('none');}}><div className="stat-label">Pending Suppliers</div><div className="stat-value navy">{requests.filter(r=>r.status==='scm_ordered').length}</div></div>
          <div className="stat-card" style={{cursor:'pointer',outline:filters.status==='warehouse_available'?'2px solid var(--eg-green)':''}} onClick={()=>{setFilters(p=>({...p,status:p.status==='warehouse_available'?'':'warehouse_available'})); setGroupMode('none');}}><div className="stat-label">Pending Projects</div><div className="stat-value warning">{requests.filter(r=>r.status==='warehouse_available').length}</div></div>
        </div>
        <div className="card">
          <div className="card-header" style={{flexWrap:'wrap',gap:8}}>
            <span className="card-title">PPE Request Tracker</span>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
              <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:150}} placeholder="Search employee..." value={filters.search} onChange={e=>setFilters(p=>({...p,search:e.target.value}))} />
              <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} placeholder="National ID..." value={filters.national_id||''} onChange={e=>setFilters(p=>({...p,national_id:e.target.value}))} />
              <div style={{position:'relative'}}>
                <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:140}} placeholder="All Locations"
                  value={filters.location ? filters.location : locSearch}
                  onChange={e=>{ setLocSearch(e.target.value); setFilters(p=>({...p,location:''})); setShowLocDrop(true); }}
                  onFocus={()=>setShowLocDrop(true)}
                  onBlur={()=>setTimeout(()=>setShowLocDrop(false),150)}
                  autoComplete="off"
                />
                {showLocDrop && (
                  <div style={{position:'absolute',top:'100%',left:0,background:'white',border:'1px solid #e5e7eb',borderRadius:8,maxHeight:180,overflowY:'auto',zIndex:200,boxShadow:'0 4px 12px rgba(0,0,0,0.1)',minWidth:160}}>
                    <div style={{padding:'6px 10px',fontSize:12,cursor:'pointer',color:'#6b7280'}} onMouseDown={()=>{ setFilters(p=>({...p,location:''})); setLocSearch(''); setShowLocDrop(false); }}>All Locations</div>
                    {locations.filter(l=>!locSearch||l.name.toLowerCase().includes(locSearch.toLowerCase())).map(l=>(
                      <div key={l.id} style={{padding:'6px 10px',fontSize:12,cursor:'pointer'}}
                        onMouseDown={()=>{ setFilters(p=>({...p,location:l.name})); setLocSearch(''); setShowLocDrop(false); }}
                        onMouseEnter={e=>e.currentTarget.style.background='#f3f4f6'}
                        onMouseLeave={e=>e.currentTarget.style.background='white'}
                      >{l.name}</div>
                    ))}
                    {locations.filter(l=>!locSearch||l.name.toLowerCase().includes(locSearch.toLowerCase())).length===0 && (
                      <div style={{padding:'6px 10px',fontSize:12,color:'#9ca3af'}}>No locations found</div>
                    )}
                  </div>
                )}
              </div>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:160}} value={filters.status} onChange={e=>setFilters(p=>({...p,status:e.target.value}))}>
                <option value="">All Status</option>
                <option value="pending">Flagged</option>
                <option value="pda_pending">Pending PM</option>
                <option value="ehs_purchase_requested">EHS Purchase Requested</option>
                <option value="scm_ordered">SCM Ordered</option>
                <option value="warehouse_available">Warehouse Available</option>
                <option value="distributed">Distributed</option>
                <option value="canceled">Canceled</option>
              </select>
              <div style={{position:'relative'}}>
                <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:180}} placeholder="All PPE/Tool Items"
                  value={filters.ppe ? filters.ppe : ppeSearch}
                  onChange={e=>{ setPpeSearch(e.target.value); setFilters(p=>({...p,ppe:''})); setShowPpeDrop(true); }}
                  onFocus={()=>setShowPpeDrop(true)}
                  onBlur={()=>setTimeout(()=>setShowPpeDrop(false),150)}
                  autoComplete="off"
                />
                {showPpeDrop && (
                  <div style={{position:'absolute',top:'100%',left:0,background:'white',border:'1px solid #e5e7eb',borderRadius:8,maxHeight:200,overflowY:'auto',zIndex:200,boxShadow:'0 4px 12px rgba(0,0,0,0.1)',minWidth:220}}>
                    <div style={{padding:'6px 10px',fontSize:12,cursor:'pointer',color:'#6b7280'}} onMouseDown={()=>{ setFilters(p=>({...p,ppe:''})); setPpeSearch(''); setShowPpeDrop(false); }}>All PPE/Tool Items</div>
                    {[...new Set(requests.map(r=>r.ppe_name).filter(Boolean))].sort()
                      .filter(p=>!ppeSearch||p.toLowerCase().includes(ppeSearch.toLowerCase()))
                      .map(p=>(
                        <div key={p} style={{padding:'6px 10px',fontSize:12,cursor:'pointer'}}
                          onMouseDown={()=>{ setFilters(f=>({...f,ppe:p})); setPpeSearch(''); setShowPpeDrop(false); }}
                          onMouseEnter={e=>e.currentTarget.style.background='#f3f4f6'}
                          onMouseLeave={e=>e.currentTarget.style.background='white'}
                        >{p}</div>
                      ))}
                  </div>
                )}
              </div>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:150}} value={filters.period} onChange={e=>setFilters(p=>({...p,period:e.target.value}))}>
                <option value="">All Records</option>
                <option value="current">Current Month</option>
                <option value="previous">Previous Month</option>
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:150}} value={filters.project} onChange={e=>setFilters(p=>({...p,project:e.target.value}))}>
                <option value="">All Projects</option>
                {[...new Set(requests.map(r=>r.project).filter(Boolean))].sort().map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} value={filters.client} onChange={e=>setFilters(p=>({...p,client:e.target.value}))}>
                <option value="">All Clients</option>
                {[...new Set(requests.map(r=>r.client).filter(Boolean))].sort().map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <button className="btn" style={{height:30,padding:'4px 12px',fontSize:12}} onClick={()=>{ setFilters({status:'',search:'',national_id:'',ppe:'',period:'',project:'',client:'',location:''}); setLocSearch(''); setPpeSearch(''); }}>✕ Clear</button>
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table>
              <thead>
                <tr>
                  <th rowSpan={2}>Employee</th>
                  <th rowSpan={2}>PPE/Tool Item</th>
                  <th rowSpan={2}>Size</th>
                  <th rowSpan={2}>Qty</th>
                  <th rowSpan={2}>Location</th>
                  <th rowSpan={2}>Project / Client</th>
                  <th colSpan={2} style={{textAlign:'center',background:'#e6f1fb',color:'#0c447c',fontWeight:700,fontSize:11,letterSpacing:1,borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb'}}>EHS</th>
                  <th colSpan={1} style={{textAlign:'center',background:'#f3e8ff',color:'#6d28d9',fontWeight:700,fontSize:11,letterSpacing:1,borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb'}}>PM</th>
                  <th colSpan={2} style={{textAlign:'center',background:'#e8f5e9',color:'#1d9e75',fontWeight:700,fontSize:11,letterSpacing:1,borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb'}}>SCM</th>
                  <th colSpan={1} style={{textAlign:'center',background:'#fff3e0',color:'#e65100',fontWeight:700,fontSize:11,letterSpacing:1,borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb'}}>Projects</th>
                  <th rowSpan={2}>Status</th>
                  {bulkTarget && <th rowSpan={2}></th>}
                </tr>
                <tr>
                  <th style={{width:100,minWidth:100,background:'#f0f7ff',borderLeft:'1px solid #e5e7eb'}}>Flagged</th>
                  <th style={{width:100,minWidth:100,background:'#f0f7ff',borderRight:'1px solid #e5e7eb'}}>Purchase Request</th>
                  <th style={{width:100,minWidth:100,background:'#f3e8ff',borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb'}}>Approved</th>
                  <th style={{width:100,minWidth:100,background:'#f0fff4',borderLeft:'1px solid #e5e7eb'}}>Ordered</th>
                  <th style={{width:100,minWidth:100,background:'#f0fff4',borderRight:'1px solid #e5e7eb'}}>Availed</th>
                  <th style={{width:100,minWidth:100,background:'#fff8f0',borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb'}}>Distributed</th>
                </tr>
              </thead>
              <tbody>
                {groupMode==='po' && filters.status ? (() => {
                  const clients = [...new Set(filtered.map(r => r.client || '—'))].sort();
                  const rows = [];
                  clients.forEach(client => {
                    const clientRows = filtered.filter(r => (r.client || '—') === client);
                    rows.push(<tr key={'client-'+client}><td colSpan={bulkTarget?13:12} style={{background:'#1a3a5c',color:'white',fontWeight:700,fontSize:13,padding:'10px 16px',letterSpacing:'0.04em'}}>{client} <span style={{fontWeight:400,opacity:0.7,fontSize:11}}>({clientRows.length} items)</span></td></tr>);
                    const projects = [...new Set(clientRows.map(r => r.project || '—'))].sort();
                    projects.forEach(proj => {
                    const projRows = clientRows.filter(r => (r.project || '—') === proj);
                    const itemGroups = {};
                    const itemOrder = [];
                    projRows.forEach(r => {
                      const key = r.ppe_name + '||' + (r.size_value || '—');
                      if (!itemGroups[key]) { itemGroups[key] = { ppe_name: r.ppe_name, size_value: r.size_value, qty: 0, rows: [] }; itemOrder.push(key); }
                      itemGroups[key].qty += (r.quantity || 1);
                      itemGroups[key].rows.push(r);
                    });
                    rows.push(<tr key={'proj-'+client+proj}><td colSpan={bulkTarget?13:12} style={{background:'#0f2a4a',color:'white',fontWeight:600,fontSize:12,padding:'7px 24px',letterSpacing:'0.03em'}}>{proj} <span style={{fontWeight:400,opacity:0.7,fontSize:11}}>({projRows.length} items)</span></td></tr>);
                    itemOrder.forEach(key => {
                      const g = itemGroups[key];
                      rows.push(<tr key={'grp-'+client+proj+key} style={{background:'#e6f1fb'}}><td colSpan={2} style={{padding:'7px 16px',fontSize:12,fontWeight:600,color:'#0c447c',borderTop:'1px solid #b5d4f4',borderBottom:'1px solid #b5d4f4'}}>{g.ppe_name}</td><td style={{padding:'7px 12px',fontSize:12,fontWeight:500,color:'#185fa5',textAlign:'center',borderTop:'1px solid #b5d4f4',borderBottom:'1px solid #b5d4f4'}}>{g.size_value||'—'}</td><td style={{padding:'7px 12px',fontSize:13,fontWeight:700,color:'#0c447c',textAlign:'center',borderTop:'1px solid #b5d4f4',borderBottom:'1px solid #b5d4f4'}}>{g.qty}</td><td colSpan={bulkTarget?9:8} style={{borderTop:'1px solid #b5d4f4',borderBottom:'1px solid #b5d4f4'}}></td></tr>);
                      g.rows.forEach(r => rows.push(<tr key={r.id} style={{background:bulkTarget&&isEligible(r)?'rgba(29,158,117,0.05)':''}}><td><div className="emp-name">{r.employee_name}</div><div className="emp-id">{r.employee_national_id||r.employee_number}</div></td><td>{r.ppe_name}</td><td>{r.size_value||'—'}</td><td style={{fontSize:12,color:(r.quantity||1)>1?'#e53e3e':'inherit',fontWeight:(r.quantity||1)>1?700:400}}>{r.quantity||1}</td><td style={{fontSize:12}}>{r.location_name||'—'}</td><td style={{fontSize:12}}><div>{r.project||'—'}</div>{r.client && <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.client}</div>}</td><td style={{fontSize:12,borderLeft:'1px solid #e5e7eb'}}>{r.date_flagged?<div><div>{new Date(r.date_flagged).toLocaleDateString('en-GB')}</div>{r.flagged_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.flagged_by_name}</div>}</div>:'—'}</td><td style={{fontSize:12,borderRight:'1px solid #e5e7eb'}}>{r.date_purchase_requested?<div><div>{new Date(r.date_purchase_requested).toLocaleDateString('en-GB')}</div>{r.purchase_requested_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.purchase_requested_by_name}</div>}</div>:'—'}</td><td style={{fontSize:12,borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb'}}>{r.pda_approved_date?<div><div>{new Date(r.pda_approved_date).toLocaleDateString('en-GB')}</div>{r.pda_approved_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.pda_approved_by_name}</div>}</div>:(r.needs_pda?'—':'N/A')}</td><td style={{fontSize:12,borderLeft:'1px solid #e5e7eb'}}>{r.date_ordered?<div><div>{new Date(r.date_ordered).toLocaleDateString('en-GB')}</div>{r.ordered_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.ordered_by_name}</div>}</div>:'—'}</td><td style={{fontSize:12,borderRight:'1px solid #e5e7eb'}}>{r.date_available?<div><div>{new Date(r.date_available).toLocaleDateString('en-GB')}</div>{r.available_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.available_by_name}</div>}</div>:'—'}</td><td style={{fontSize:12,borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb'}}>{r.date_distributed?<div><div>{new Date(r.date_distributed).toLocaleDateString('en-GB')}</div>{r.distributed_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.distributed_by_name}</div>}{r.distribution_method==='courier'&&<span onClick={()=>setTrackingModal(r.courier_tracking_number||'No tracking number entered')} style={{display:'inline-block',marginTop:4,fontSize:10,fontWeight:700,background:'#fff3e0',color:'#e65100',border:'1px solid #ffcc80',borderRadius:4,padding:'1px 6px',cursor:'pointer'}}>Courier ›</span>}</div>:'—'}</td><td><span className={'tag '+((r.status==='ehs_purchase_requested'&&r.needs_pda)?'tag-purple':(STATUS_COLORS[r.status]||'tag-gray'))}>{(r.status==='ehs_purchase_requested'&&r.needs_pda)?'Pending PM':(STATUS_LABELS[r.status]||r.status)}</span></td>{bulkTarget&&<td style={{textAlign:'center'}}>{isEligible(r)&&<input type="checkbox" checked={selected.includes(r.id)} onChange={()=>toggleSelect(r.id)} style={{width:16,height:16,cursor:'pointer',accentColor:'var(--eg-green)'}} />}</td>}</tr>));
                    });
                    });
                  });
                  return rows;
                })() : groupMode==='employee' && filters.status ? (() => {
                  const clients = [...new Set(filtered.map(r => r.client || '—'))].sort();
                  const rows = [];
                  clients.forEach(client => {
                    const clientRows = filtered.filter(r => (r.client || '—') === client);
                    rows.push(<tr key={'ec-'+client}><td colSpan={bulkTarget?13:12} style={{background:'#1a3a5c',color:'white',fontWeight:700,fontSize:13,padding:'10px 16px',letterSpacing:'0.04em'}}>{client} <span style={{fontWeight:400,opacity:0.7,fontSize:11}}>({clientRows.length} items)</span></td></tr>);
                    const projects = [...new Set(clientRows.map(r => r.project || '—'))].sort();
                    projects.forEach(proj => {
                      const projRows = clientRows.filter(r => (r.project || '—') === proj);
                      rows.push(<tr key={'ep-'+client+proj}><td colSpan={bulkTarget?13:12} style={{background:'#0f2a4a',color:'white',fontWeight:600,fontSize:12,padding:'7px 24px',letterSpacing:'0.03em'}}>{proj} <span style={{fontWeight:400,opacity:0.7,fontSize:11}}>({projRows.length} items)</span></td></tr>);
                      const employees = [...new Set(projRows.map(r => r.employee_name || '—'))].sort();
                      employees.forEach(emp => {
                        const empRows = projRows.filter(r => (r.employee_name || '—') === emp);
                        rows.push(<tr key={'ee-'+client+proj+emp}><td colSpan={bulkTarget?13:12} style={{background:'#e6f1fb',color:'#0c447c',fontWeight:600,fontSize:12,padding:'7px 32px',borderTop:'1px solid #b5d4f4',borderBottom:'1px solid #b5d4f4'}}>{emp} <span style={{fontWeight:400,opacity:0.7,fontSize:11}}>({empRows.length} items)</span></td></tr>);
                        empRows.forEach(r => rows.push(<tr key={r.id} style={{background:bulkTarget&&isEligible(r)?'rgba(29,158,117,0.05)':''}}><td><div className="emp-name">{r.employee_name}</div><div className="emp-id">{r.employee_national_id||r.employee_number}</div></td><td>{r.ppe_name}</td><td>{r.size_value||'—'}</td><td style={{fontSize:12,color:(r.quantity||1)>1?'#e53e3e':'inherit',fontWeight:(r.quantity||1)>1?700:400}}>{r.quantity||1}</td><td style={{fontSize:12}}>{r.location_name||'—'}</td><td style={{fontSize:12}}><div>{r.project||'—'}</div>{r.client && <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.client}</div>}</td><td style={{fontSize:12,borderLeft:'1px solid #e5e7eb'}}>{r.date_flagged?<div><div>{new Date(r.date_flagged).toLocaleDateString('en-GB')}</div>{r.flagged_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.flagged_by_name}</div>}</div>:'—'}</td><td style={{fontSize:12,borderRight:'1px solid #e5e7eb'}}>{r.date_purchase_requested?<div><div>{new Date(r.date_purchase_requested).toLocaleDateString('en-GB')}</div>{r.purchase_requested_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.purchase_requested_by_name}</div>}</div>:'—'}</td><td style={{fontSize:12,borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb'}}>{r.pda_approved_date?<div><div>{new Date(r.pda_approved_date).toLocaleDateString('en-GB')}</div>{r.pda_approved_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.pda_approved_by_name}</div>}</div>:(r.needs_pda?'—':'N/A')}</td><td style={{fontSize:12,borderLeft:'1px solid #e5e7eb'}}>{r.date_ordered?<div><div>{new Date(r.date_ordered).toLocaleDateString('en-GB')}</div>{r.ordered_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.ordered_by_name}</div>}</div>:'—'}</td><td style={{fontSize:12,borderRight:'1px solid #e5e7eb'}}>{r.date_available?<div><div>{new Date(r.date_available).toLocaleDateString('en-GB')}</div>{r.available_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.available_by_name}</div>}</div>:'—'}</td><td style={{fontSize:12,borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb'}}>{r.date_distributed?<div><div>{new Date(r.date_distributed).toLocaleDateString('en-GB')}</div>{r.distributed_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.distributed_by_name}</div>}{r.distribution_method==='courier'&&<span onClick={()=>setTrackingModal(r.courier_tracking_number||'No tracking number entered')} style={{display:'inline-block',marginTop:4,fontSize:10,fontWeight:700,background:'#fff3e0',color:'#e65100',border:'1px solid #ffcc80',borderRadius:4,padding:'1px 6px',cursor:'pointer'}}>Courier ›</span>}</div>:'—'}</td><td><span className={'tag '+((r.status==='ehs_purchase_requested'&&r.needs_pda)?'tag-purple':(STATUS_COLORS[r.status]||'tag-gray'))}>{(r.status==='ehs_purchase_requested'&&r.needs_pda)?'Pending PM':(STATUS_LABELS[r.status]||r.status)}</span></td>{bulkTarget&&<td style={{textAlign:'center'}}>{isEligible(r)&&<input type="checkbox" checked={selected.includes(r.id)} onChange={()=>toggleSelect(r.id)} style={{width:16,height:16,cursor:'pointer',accentColor:'var(--eg-green)'}} />}</td>}</tr>));
                      });
                    });
                  });
                  return rows;
                })() : filtered.map(r => (
                  <tr key={r.id} style={{background: bulkTarget && isEligible(r) ? 'rgba(29,158,117,0.05)' : ''}}>
                    <td>
                      <div className="emp-name">{r.employee_name}</div>
                      <div className="emp-id">{r.employee_national_id||r.employee_number}</div>
                    </td>
                    <td>{r.ppe_name}</td>
                    <td>{r.size_value || '—'}</td>
                    <td style={{fontSize:12,color:(r.quantity||1)>1?'#e53e3e':'inherit',fontWeight:(r.quantity||1)>1?700:400}}>{r.quantity||1}</td>
                    <td style={{fontSize:12}}>{r.location_name || '—'}</td>
                    <td style={{fontSize:12}}><div>{r.project || '—'}</div>{r.client && <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.client}</div>}</td>
                    <td style={{fontSize:12,borderLeft:'1px solid #e5e7eb'}}>{r.date_flagged?<div><div>{new Date(r.date_flagged).toLocaleDateString('en-GB')}</div>{r.flagged_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.flagged_by_name}</div>}</div>:'—'}</td>
                    <td style={{fontSize:12,borderRight:'1px solid #e5e7eb'}}>{r.date_purchase_requested?<div><div>{new Date(r.date_purchase_requested).toLocaleDateString('en-GB')}</div>{r.purchase_requested_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.purchase_requested_by_name}</div>}</div>:'—'}</td>
                    <td style={{fontSize:12,borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb'}}>{r.pda_approved_date?<div><div>{new Date(r.pda_approved_date).toLocaleDateString('en-GB')}</div>{r.pda_approved_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.pda_approved_by_name}</div>}</div>:(r.needs_pda?'—':'N/A')}</td>
                    <td style={{fontSize:12,borderLeft:'1px solid #e5e7eb'}}>{r.date_ordered?<div><div>{new Date(r.date_ordered).toLocaleDateString('en-GB')}</div>{r.ordered_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.ordered_by_name}</div>}</div>:'—'}</td>
                    <td style={{fontSize:12,borderRight:'1px solid #e5e7eb'}}>{r.date_available?<div><div>{new Date(r.date_available).toLocaleDateString('en-GB')}</div>{r.available_by_name&&<div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.available_by_name}</div>}</div>:'—'}</td>
                    <td style={{fontSize:12,borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb'}}>
                      {r.date_distributed ? (
                        <div>
                          <div>{new Date(r.date_distributed).toLocaleDateString('en-GB')}</div>
                          {r.distributed_by_name && <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{r.distributed_by_name}</div>}
                          {r.distribution_method === 'courier' && (
                            <span
                              onClick={() => setTrackingModal(r.courier_tracking_number || 'No tracking number entered')}
                              style={{display:'inline-block',marginTop:4,fontSize:10,fontWeight:700,background:'#fff3e0',color:'#e65100',border:'1px solid #ffcc80',borderRadius:4,padding:'1px 6px',cursor:'pointer'}}
                            >Courier ›</span>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td><span className={'tag ' + ((r.status==='ehs_purchase_requested'&&r.needs_pda)?'tag-purple':(STATUS_COLORS[r.status]||'tag-gray'))}>{(r.status==='ehs_purchase_requested'&&r.needs_pda)?'Pending PM':(STATUS_LABELS[r.status]||r.status)}</span></td>
                    {bulkTarget && (
                      <td style={{textAlign:'center'}}>
                        {isEligible(r) && (
                          <input type="checkbox" checked={selected.includes(r.id)} onChange={()=>toggleSelect(r.id)}
                            style={{width:16,height:16,cursor:'pointer',accentColor:'var(--eg-green)'}} />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={bulkTarget?11:10} style={{textAlign:'center',color:'#6b7280',padding:32}}>No PPE requests found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {trackingModal && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.4)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setTrackingModal(null)}>
          <div style={{background:'white',borderRadius:12,padding:24,minWidth:300,boxShadow:'0 8px 32px rgba(0,0,0,0.2)'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:13,fontWeight:700,color:'#e65100',marginBottom:8}}>Courier Tracking Number</div>
            <div style={{fontSize:15,fontWeight:600,color:'#0f2a4a',wordBreak:'break-all'}}>{trackingModal}</div>
            <button className="btn btn-secondary" style={{marginTop:16,width:'100%'}} onClick={()=>setTrackingModal(null)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
