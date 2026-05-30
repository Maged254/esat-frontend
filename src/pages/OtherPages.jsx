// ── EmployeesPage ────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

export function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [filters, setFilters] = useState({ status: 'active', department: '', resource_type: '', search: '', national_id: '', project: '', client: '', san: 'yes' });
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);
  const [userRole, setUserRole] = useState('');
  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('esat_user'));
      if (user) setUserRole(user.role);
    } catch {}
  }, []);

  const toggleSAN = async (emp) => {
    const newVal = !emp.san;
    await api.put(`/employees/${emp.id}/san`, { san: newVal });
    setEmployees(prev => prev.map(e => e.id === emp.id ? {...e, san: newVal} : e));
  };

  const load = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
    api.get(`/employees?${params}`).then(r => setEmployees(r.data)).catch(console.error);
  };

  const handleCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/);
    const headers = lines[0].split(',');
    const rows = lines.slice(1).map(line => {
      const vals = line.split(',');
      const obj = {};
      headers.forEach((h, i) => { obj[h.trim()] = (vals[i] || '').trim(); });
      return obj;
    });
    let success = 0, failed = 0, errors = [];
    for (const row of rows) {
      try {
        await api.post('/employees', row);
        success++;
      } catch(err) {
        failed++;
        errors.push(row.employee_number + ': ' + (err.response?.data?.error || 'Error'));
      }
    }
    setImporting(false);
    e.target.value = '';
    load();
    let msg = `Import complete: ${success} added`;
    if (failed > 0) msg += `, ${failed} failed:\n` + errors.slice(0,5).join('\n');
    alert(msg);
  };

  useEffect(() => { load(); }, [filters]);

  const exportCSV = () => {
    const headers = ['employee_number','full_name','national_id','job_title','department','project','client','organization','resource_type','employment_status','san','last_audit_date'];
    const rows = employees.map(e => headers.map(h => {
      const val = e[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'boolean') return val ? 'Yes' : 'No';
      return String(val).includes(',') ? `"${val}"` : val;
    }).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ESAT_Employees_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const initials = name => name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  const avatarClass = i => ['av-teal','av-navy','av-coral','av-purple'][i % 4];

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span><span className="topbar-sep">›</span>
          <span className="topbar-title">Employees</span>
        </div>
        <div className="topbar-right">
          {userRole === 'admin' && <button className="btn" onClick={exportCSV}>↓ Export CSV</button>}
          <label className="btn" style={{cursor:'pointer'}}>
            {importing ? 'Importing...' : '↑ Import CSV'}
            <input type="file" accept=".csv" style={{display:'none'}} onChange={handleCSVImport} disabled={importing} />
          </label>
          <button className="btn btn-primary">+ Add Employee</button>
        </div>
      </div>
      <div className="content">
        <div className="stat-grid">
          <div className="stat-card"><div className="stat-label">Total active</div><div className="stat-value green">{employees.filter(e=>e.employment_status==='active').length}</div></div>
          <div className="stat-card"><div className="stat-label">Inhouse</div><div className="stat-value navy">{employees.filter(e=>e.resource_type==='inhouse').length}</div></div>
          <div className="stat-card"><div className="stat-label">Outsource</div><div className="stat-value">{employees.filter(e=>e.resource_type==='outsource').length}</div></div>
          <div className="stat-card"><div className="stat-label">Exits</div><div className="stat-value">{employees.filter(e=>e.employment_status==='exit').length}</div></div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Employee list</span>
            <div className="flex gap-2">
              <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:160}} placeholder="Search name..." value={filters.search} onChange={e=>setFilters(p=>({...p,search:e.target.value}))} />
              <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:150}} placeholder="Search national ID..." value={filters.national_id} onChange={e=>setFilters(p=>({...p,national_id:e.target.value}))} />
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} value={filters.status} onChange={e=>setFilters(p=>({...p,status:e.target.value}))}>
                <option value="">All Status</option><option value="active">Active</option><option value="exit">Exit</option>
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} value={filters.resource_type} onChange={e=>setFilters(p=>({...p,resource_type:e.target.value}))}>
                <option value="">All Resources</option><option value="inhouse">Inhouse</option><option value="outsource">Outsource</option>
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} value={filters.project} onChange={e=>setFilters(p=>({...p,project:e.target.value}))}>
                <option value="">All Projects</option>
                {[...new Set(employees.map(e=>e.project).filter(Boolean))].sort().map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} value={filters.client} onChange={e=>setFilters(p=>({...p,client:e.target.value}))}>
                <option value="">All Clients</option>
                {[...new Set(employees.map(e=>e.client).filter(Boolean))].sort().map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:160}} value={filters.san} onChange={e=>setFilters(p=>({...p,san:e.target.value}))}>
                <option value="">All</option>
                <option value="yes">Safety Audit Needed</option>
                <option value="no">No Audit Needed</option>
              </select>
            </div>
          </div>
          <table>
            <thead><tr><th>Employee</th><th>National ID</th><th>Job Title</th><th>Department</th><th>Project</th><th>Client</th><th>Resource</th><th>SAN</th><th>Last Audit</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {employees.map((e, i) => (
                <tr key={e.id}>
                  <td><div className="emp-cell"><div className={`avatar ${avatarClass(i)}`}>{initials(e.full_name)}</div><div><div className="emp-name">{e.full_name}</div><div className="emp-id">{e.employee_number}</div></div></div></td>
                  <td>{e.national_id || e.NationalIDNumber || '—'}</td><td>{e.job_title||'—'}</td><td>{e.department||'—'}</td><td>{e.project||'—'}</td><td>{e.client||'—'}</td>
                  <td><span className={`tag ${e.resource_type==='inhouse'?'tag-navy':'tag-gray'}`}>{e.resource_type||'—'}</span></td>
                  <td>{userRole === 'admin' ? <button onClick={()=>toggleSAN(e)} className={`tag ${e.san!==false?'tag-green':'tag-red'}`} style={{border:'none',cursor:'pointer'}}>{e.san!==false?'Yes':'No'}</button> : <span className={`tag ${e.san!==false?'tag-green':'tag-red'}`}>{e.san!==false?'Yes':'No'}</span>}</td>
                  <td>{e.last_audit_date ? <><span className={`dot ${e.days_since_audit>30?'dot-red':'dot-green'}`}></span>{e.days_since_audit}d ago</> : <span style={{color:'#9ca3af'}}>Never</span>}</td>
                  <td><span className={`tag ${e.employment_status==='active'?'tag-green':'tag-red'}`}>{e.employment_status}</span></td>
                  <td>{e.employment_status==='active' && <button className="btn btn-primary btn-sm" onClick={()=>navigate(`/audit/new/${e.id}`)}>Audit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── AuditHistoryPage ─────────────────────────────────────────
export function AuditHistoryPage() {
  const [audits, setAudits] = useState([]);
  const [stats, setStats] = useState({});
  const [filters, setFilters] = useState({ search: '', national_id: '', resource_type: '', project: '', client: '', status: '' });
  const navigate = useNavigate();

  const load = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
    api.get('/audits?' + params).then(r=>setAudits(r.data)).catch(console.error);
  };

  useEffect(() => { load(); }, [filters]);
  useEffect(() => { api.get('/audits/stats').then(r=>setStats(r.data)).catch(console.error); }, []);
  const initials = n => n?.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?';

  const exportCSV = () => {
    const headers = ['employee_name','employee_number','national_id','department','project','organization','audited_by_name','audit_date','total_items','issues_count','overall_status'];
    const rows = audits.map(a => headers.map(h => {
      const val = a[h];
      if (val === null || val === undefined) return '';
      if (h === 'audit_date') return new Date(val).toLocaleDateString('en-GB');
      return String(val).includes(',') ? '"' + val + '"' : val;
    }).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ESAT_Audit_History_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const STATUS = {
    compliant: <span className="tag tag-green">Compliant</span>,
    partial: <span className="tag tag-amber">Partial</span>,
    non_compliant: <span className="tag tag-red">Non-compliant</span>
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left"><span className="topbar-breadcrumb">ESAT</span><span className="topbar-sep">›</span><span className="topbar-title">Audit History</span></div>
        <div className="topbar-right"><button className="btn" onClick={exportCSV}>↓ Export CSV</button></div>
      </div>
      <div className="content">
        <div className="stat-grid" style={{marginBottom:16}}>
          <div className="stat-card"><div className="stat-label">Total Audits</div><div className="stat-value navy">{parseInt(stats.total)||0}</div></div>
          <div className="stat-card"><div className="stat-label">Compliant</div><div className="stat-value green">{parseInt(stats.compliant)||0}</div></div>
          <div className="stat-card"><div className="stat-label">Partial</div><div className="stat-value warning">{parseInt(stats.partial)||0}</div></div>
          <div className="stat-card"><div className="stat-label">Non-Compliant</div><div className="stat-value danger">{parseInt(stats.non_compliant)||0}</div></div>
          <div className="stat-card">
            <div className="stat-label">This Month</div>
            <div className="stat-value" style={{color: parseInt(stats.this_month) >= parseInt(stats.last_month) ? 'var(--eg-green)' : 'var(--danger)'}}>{parseInt(stats.this_month)||0}</div>
            <div style={{fontSize:11,color:'#6b7280',marginTop:4}}>vs {parseInt(stats.last_month)||0} last month</div>
          </div>
        </div>
        <div className="card" style={{marginBottom:16}}>
          <div style={{padding:'12px 16px',display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
            <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:160}} placeholder="Search name..." value={filters.search} onChange={e=>setFilters(p=>({...p,search:e.target.value}))} />
            <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:150}} placeholder="Search national ID..." value={filters.national_id} onChange={e=>setFilters(p=>({...p,national_id:e.target.value}))} />
            <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} value={filters.status} onChange={e=>setFilters(p=>({...p,status:e.target.value}))}>
              <option value="">All Status</option><option value="active">Active</option><option value="exit">Exit</option>
            </select>
            <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} value={filters.resource_type} onChange={e=>setFilters(p=>({...p,resource_type:e.target.value}))}>
              <option value="">All Resources</option><option value="inhouse">Inhouse</option><option value="outsource">Outsource</option>
            </select>
            <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} value={filters.project} onChange={e=>setFilters(p=>({...p,project:e.target.value}))}>
              <option value="">All Projects</option>
              {[...new Set(audits.map(a=>a.project).filter(Boolean))].sort().map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} value={filters.client} onChange={e=>setFilters(p=>({...p,client:e.target.value}))}>
              <option value="">All Clients</option>
              {[...new Set(audits.map(a=>a.client).filter(Boolean))].sort().map(cl=><option key={cl} value={cl}>{cl}</option>)}
            </select>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">All Audits</span>
          </div>
          <table>
            <thead><tr><th>Employee</th><th>National ID</th><th>Department</th><th>Project</th><th>Organization</th><th>Audited by</th><th>Date</th><th>Items</th><th>Issues</th><th>Result</th></tr></thead>
            <tbody>
              {audits.map((a,i)=>(
                <tr key={a.id} style={{cursor:'pointer'}} onClick={()=>navigate('/audits/' + a.id)}>
                  <td><div className="emp-cell"><div className={'avatar ' + ['av-teal','av-navy','av-coral','av-purple'][i%4]}>{initials(a.employee_name)}</div><div><div className="emp-name">{a.employee_name}</div><div className="emp-id">{a.employee_number}</div></div></div></td>
                  <td>{a.national_id||'—'}</td><td>{a.department||'—'}</td><td>{a.project||'—'}</td><td>{a.organization||'—'}</td><td>{a.audited_by_name}</td>
                  <td>{new Date(a.audit_date).toLocaleDateString('en-GB')}</td>
                  <td>{a.total_items}</td>
                  <td><span className={'tag ' + (a.issues_count>0?'tag-red':'tag-green')}>{a.issues_count} {a.issues_count===1?'issue':'issues'}</span></td>
                  <td>{STATUS[a.overall_status]}</td>
                </tr>
              ))}
              {!audits.length && <tr><td colSpan={10} style={{textAlign:'center',color:'#6b7280',padding:32}}>No audits found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── NCRPage ──────────────────────────────────────────────────
export function NCRPage() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({});
  const navigate = useNavigate();
  useEffect(() => {
    api.get('/ncr').then(r=>setItems(r.data)).catch(console.error);
    api.get('/ncr/stats').then(r=>setStats(r.data)).catch(console.error);
  }, []);
  const updateStatus = async (id, status) => {
    await api.put(`/ncr/${id}/status`, { status });
    setItems(prev => prev.map(i => i.id===id ? {...i,status} : i));
  };
  return (
    <>
      <div className="topbar">
        <div className="topbar-left"><span className="topbar-breadcrumb">ESAT</span><span className="topbar-sep">›</span><span className="topbar-title">NCR List</span></div>
        <div className="topbar-right">
          <button className="btn">↓ Export</button>
          <button className="btn btn-navy" onClick={()=>navigate('/purchase-requests')}>🛒 Create Purchase Request</button>
        </div>
      </div>
      <div className="content">
        <div className="stat-grid">
          <div className="stat-card"><div className="stat-label">Total open</div><div className="stat-value danger">{stats.total_open||0}</div></div>
          <div className="stat-card"><div className="stat-label">Pending order</div><div className="stat-value warning">{stats.pending||0}</div></div>
          <div className="stat-card"><div className="stat-label">Ordered</div><div className="stat-value navy">{stats.ordered||0}</div></div>
          <div className="stat-card"><div className="stat-label">Resolved (month)</div><div className="stat-value green">{stats.resolved_this_month||0}</div></div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Open NCR items</span></div>
          <table>
            <thead><tr><th></th><th>Employee</th><th>PPE item</th><th>Category</th><th>Condition</th><th>Size</th><th>Comment</th><th>Date flagged</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.map(n=>(
                <tr key={n.id}>
                  <td style={{padding:'0 0 0 8px'}}><div style={{width:3,height:40,background:n.condition==='not_good'?'var(--danger)':'var(--warning)',borderRadius:2}}></div></td>
                  <td><div className="emp-cell"><div className="avatar av-coral" style={{width:26,height:26,fontSize:10}}>{n.employee_name?.split(' ').map(w=>w[0]).join('')}</div><span className="emp-name">{n.employee_name}</span></div></td>
                  <td>{n.ppe_name}</td>
                  <td><span className="tag tag-gray" style={{fontSize:10}}>{n.category?.replace('_',' ')}</span></td>
                  <td><span className={`tag ${n.condition==='not_good'?'tag-red':'tag-amber'}`}>{n.condition==='not_good'?'Not Good':'Missing'}</span></td>
                  <td>{n.size_value||'—'}</td>
                  <td style={{color:'#6b7280',fontSize:12}}>{n.comment||'—'}</td>
                  <td style={{fontSize:12,color:'#6b7280'}}>{new Date(n.created_at).toLocaleDateString('en-GB')}</td>
                  <td><span className={`tag ${n.status==='pending'?'tag-amber':n.status==='ordered'?'tag-navy':'tag-green'}`}>{n.status}</span></td>
                  <td>
                    <select className="form-select" style={{fontSize:11,padding:'3px 6px',height:26}} value={n.status} onChange={e=>updateStatus(n.id,e.target.value)}>
                      <option value="pending">Pending</option><option value="ordered">Ordered</option><option value="resolved">Resolved</option>
                    </select>
                  </td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={10} style={{textAlign:'center',color:'#6b7280',padding:32}}>No open NCRs</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── PurchaseRequestsPage ─────────────────────────────────────
export function PurchaseRequestsPage() {
  const [prs, setPrs] = useState([]);
  useEffect(() => { api.get('/ncr/purchase-requests').then(r=>setPrs(r.data)).catch(console.error); }, []);
  const sendPR = async (id) => {
    await api.put(`/ncr/purchase-requests/${id}/send`);
    setPrs(prev=>prev.map(p=>p.id===id?{...p,status:'sent'}:p));
  };
  return (
    <>
      <div className="topbar">
        <div className="topbar-left"><span className="topbar-breadcrumb">ESAT</span><span className="topbar-sep">›</span><span className="topbar-title">Purchase Requests</span></div>
        <div className="topbar-right"><button className="btn btn-primary">+ New Request</button></div>
      </div>
      <div className="content">
        {prs.length === 0 && (
          <div className="empty-state"><div className="empty-state-icon">🛒</div><p>No purchase requests yet.<br/>Create one from the NCR list.</p></div>
        )}
        {prs.map(pr=>(
          <div key={pr.id} className="card mb-4">
            <div className="card-header" style={{borderLeft:'3px solid var(--eg-navy)'}}>
              <div>
                <div style={{fontWeight:500}}>{pr.pr_number}</div>
                <div style={{fontSize:12,color:'#6b7280'}}>Generated {new Date(pr.created_at).toLocaleDateString('en-GB')} · {pr.created_by_name}</div>
              </div>
              <div className="flex gap-2 items-center">
                <span className={`tag ${pr.status==='draft'?'tag-amber':pr.status==='sent'?'tag-navy':'tag-green'}`}>{pr.status}</span>
                <button className="btn btn-sm">↓ Export PDF</button>
                {pr.status === 'draft' && <button className="btn btn-navy btn-sm" onClick={()=>sendPR(pr.id)}>✉ Send to Supply Chain</button>}
              </div>
            </div>
            <div style={{padding:'12px 16px',fontSize:12,color:'#6b7280',borderTop:'0.5px solid #e5e7eb'}}>
              {pr.items_count} line items
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── AdminPage ────────────────────────────────────────────────
export function AdminPage() {
  const [ppeItems, setPpeItems] = useState([]);
  const [syncLogs, setSyncLogs] = useState([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    api.get('/ppe').then(r=>setPpeItems(r.data)).catch(console.error);
    // Sync logs would come from a /admin/sync-logs endpoint
  }, []);

  const runSync = async () => {
    setSyncing(true);
    try {
      await api.post('/admin/sync');
      alert('Sync triggered successfully!');
    } catch { alert('Sync failed — check server logs'); }
    finally { setSyncing(false); }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left"><span className="topbar-breadcrumb">ESAT</span><span className="topbar-sep">›</span><span className="topbar-title">Admin Panel</span></div>
      </div>
      <div className="content">
        <div className="two-col">
          <div>
            <div className="card mb-4">
              <div className="card-header"><span className="card-title">SharePoint HR sync</span></div>
              <div className="card-body">
                <div style={{background:'#f3f4f6',borderRadius:8,padding:14,display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                  <div><div style={{fontWeight:500,fontSize:13}}>Nightly sync</div><div style={{fontSize:12,color:'#6b7280',marginTop:2}}>Runs daily at 06:00</div></div>
                  <span className="tag tag-green">✓ Active</span>
                </div>
                <div className="flex gap-2" style={{flexDirection:'column'}}>
                  <button className="btn" style={{justifyContent:'center'}} onClick={runSync} disabled={syncing}>{syncing?'Syncing...':'↺ Run sync now'}</button>
                  <button className="btn" style={{justifyContent:'center'}}>↑ Manual CSV import</button>
                </div>
                <div style={{marginTop:12,padding:10,background:'#f9fafb',borderRadius:8,fontSize:12,color:'#6b7280'}}>
                  <div style={{fontWeight:500,marginBottom:4,color:'#111827'}}>Sync log</div>
                  <div>Logs will appear here after first sync</div>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><span className="card-title">User roles</span><button className="btn btn-sm">+ Add</button></div>
              <table>
                <thead><tr><th>Name</th><th>Role</th><th>Access</th></tr></thead>
                <tbody>
                  <tr><td>Safety Officer</td><td><span className="tag tag-teal">EHS Officer</span></td><td>Full access</td></tr>
                  <tr><td>Supervisor</td><td><span className="tag tag-navy">Supervisor</span></td><td>Own team only</td></tr>
                  <tr><td>HR Admin</td><td><span className="tag tag-amber">Admin</span></td><td>Employees + reports</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">PPE checklist configuration</span><button className="btn btn-sm">+ Add item</button></div>
            <table>
              <thead><tr><th>PPE item</th><th>Category</th><th>Size</th><th>Active</th></tr></thead>
              <tbody>
                {ppeItems.map(p=>(
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td><span className="tag tag-gray" style={{fontSize:10}}>{p.category?.replace(/_/g,' ')}</span></td>
                    <td>{p.has_size ? <span className="tag tag-teal" style={{fontSize:10}}>{p.size_type==='shoe'?'38–47':'S–XXL'}</span> : '—'}</td>
                    <td><input type="checkbox" defaultChecked={p.is_active} style={{accentColor:'var(--eg-green)'}} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
