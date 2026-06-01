// ── EmployeesPage ────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

export function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [filters, setFilters] = useState({ status: 'active', department: '', resource_type: '', search: '', national_id: '', project: '', client: '', san: 'yes', job_title: '', audit_age: '' });
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
    Object.entries(filters).forEach(([k, v]) => { if (v && k !== 'audit_age') params.append(k, v); });
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
    const rows = auditAgeFiltered.map(e => headers.map(h => {
      const val = e[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'boolean') return val ? 'Yes' : 'No';
      if (h === 'last_audit_date' && val) return new Date(val).toLocaleDateString('en-GB');
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

  const auditAgeFiltered = employees.filter(e => {
    if (!filters.audit_age) return true;
    const days = e.days_since_audit !== null && e.days_since_audit !== undefined ? parseInt(e.days_since_audit) : 99999;
    if (filters.audit_age === '1month' && days > 30) return false;
    if (filters.audit_age === '2months' && (days <= 30 || days > 60)) return false;
    if (filters.audit_age === 'over2months' && days <= 60) return false;
    return true;
  });

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
          <div className="stat-card"><div className="stat-label">Total active</div><div className="stat-value green">{auditAgeFiltered.filter(e=>e.employment_status==='active').length}</div></div>
          <div className="stat-card"><div className="stat-label">Inhouse</div><div className="stat-value navy">{auditAgeFiltered.filter(e=>e.resource_type==='inhouse').length}</div></div>
          <div className="stat-card"><div className="stat-label">Outsource</div><div className="stat-value">{auditAgeFiltered.filter(e=>e.resource_type==='outsource').length}</div></div>
          <div className="stat-card"><div className="stat-label">Exits</div><div className="stat-value">{auditAgeFiltered.filter(e=>e.employment_status==='exit').length}</div></div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Employee list</span>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
              <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:150}} placeholder="Search name..." value={filters.search} onChange={e=>setFilters(p=>({...p,search:e.target.value}))} />
              <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:140}} placeholder="Search national ID..." value={filters.national_id} onChange={e=>setFilters(p=>({...p,national_id:e.target.value}))} />
              <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:140}} placeholder="Search job title..." value={filters.job_title} onChange={e=>setFilters(p=>({...p,job_title:e.target.value}))} />
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:120}} value={filters.status} onChange={e=>setFilters(p=>({...p,status:e.target.value}))}>
                <option value="">All Status</option><option value="active">Active</option><option value="exit">Exit</option>
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:120}} value={filters.resource_type} onChange={e=>setFilters(p=>({...p,resource_type:e.target.value}))}>
                <option value="">All Resources</option><option value="inhouse">Inhouse</option><option value="outsource">Outsource</option>
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} value={filters.department} onChange={e=>setFilters(p=>({...p,department:e.target.value}))}>
                <option value="">All Departments</option>
                {[...new Set(employees.map(e=>e.department).filter(Boolean))].sort().map(d=><option key={d} value={d}>{d}</option>)}
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} value={filters.project} onChange={e=>setFilters(p=>({...p,project:e.target.value}))}>
                <option value="">All Projects</option>
                {[...new Set(employees.map(e=>e.project).filter(Boolean))].sort().map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:120}} value={filters.client} onChange={e=>setFilters(p=>({...p,client:e.target.value}))}>
                <option value="">All Clients</option>
                {[...new Set(employees.map(e=>e.client).filter(Boolean))].sort().map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:155}} value={filters.san} onChange={e=>setFilters(p=>({...p,san:e.target.value}))}>
                <option value="">All</option>
                <option value="yes">Safety Audit Needed</option>
                <option value="no">No Audit Needed</option>
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:155}} value={filters.audit_age||''} onChange={e=>setFilters(p=>({...p,audit_age:e.target.value}))}>
                <option value="">All Last Audit</option>
                <option value="1month">Within 1 Month</option>
                <option value="2months">1 - 2 Months</option>
                <option value="over2months">More than 2 Months</option>
              </select>
              <button className="btn" style={{height:30,padding:'4px 12px',fontSize:12}} onClick={()=>setFilters({status:'active',department:'',resource_type:'',search:'',national_id:'',project:'',client:'',san:'yes',job_title:'',audit_age:''})}>✕ Clear</button>
            </div>
          </div>
          <table>
            <thead><tr><th>Employee</th><th>National ID</th><th>Job Title</th><th>Department</th><th>Project</th><th>Client</th><th>Resource</th><th>SAN</th><th>Last Audit</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {employees.filter(e => {
                if (filters.audit_age) {
                  const days = e.days_since_audit !== null && e.days_since_audit !== undefined ? parseInt(e.days_since_audit) : 99999;
                  if (filters.audit_age === '1month' && days > 30) return false;
                  if (filters.audit_age === '2months' && (days <= 30 || days > 60)) return false;
                  if (filters.audit_age === 'over2months' && days <= 60) return false;
                }
                return true;
              }).map((e, i) => (
                <tr key={e.id}>
                  <td><div className="emp-cell"><div className={`avatar ${avatarClass(i)}`}>{initials(e.full_name)}</div><div><div className="emp-name">{e.full_name}</div><div className="emp-id">{e.national_id||e.employee_number}</div></div></div></td>
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
  const [users, setUsers] = useState([]);
  const [userRole, setUserRole] = useState('');
  const [filters, setFilters] = useState({ search: '', national_id: '', resource_type: '', project: '', client: '', status: '', audited_by: '' });
  const navigate = useNavigate();

  useEffect(() => {
    try { const user = JSON.parse(localStorage.getItem('esat_user')); if (user) setUserRole(user.role); } catch {}
  }, []);

  const deleteAudit = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this audit? All linked NCR items and PPE requests will also be deleted.')) return;
    await api.delete('/audits/' + id);
    setAudits(prev => prev.filter(a => a.id !== id));
  };

  const load = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
    api.get('/audits?' + params).then(r=>setAudits(r.data)).catch(console.error);
  };

  useEffect(() => { load(); }, [filters]);

  useEffect(() => { api.get('/users').then(r=>setUsers(r.data)).catch(console.error); }, []);
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
        <div className="stat-grid" style={{marginBottom:16,gridTemplateColumns:"repeat(5,1fr)"}}>
          <div className="stat-card"><div className="stat-label">Total Audits</div><div className="stat-value navy">{audits.length}</div></div>
          <div className="stat-card"><div className="stat-label">Compliant</div><div className="stat-value green">{audits.filter(a=>a.overall_status==='compliant').length}</div></div>
          <div className="stat-card"><div className="stat-label">Partial</div><div className="stat-value warning">{audits.filter(a=>a.overall_status==='partial').length}</div></div>
          <div className="stat-card"><div className="stat-label">Non-Compliant</div><div className="stat-value danger">{audits.filter(a=>a.overall_status==='non_compliant').length}</div></div>
          <div className="stat-card">
            <div className="stat-label">This Month</div>
            {(() => { const now = new Date(); const thisMonth = audits.filter(a=>{ const d=new Date(a.audit_date); return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); }).length; const lastMonth = audits.filter(a=>{ const d=new Date(a.audit_date); const lm=new Date(now.getFullYear(),now.getMonth()-1); return d.getMonth()===lm.getMonth()&&d.getFullYear()===lm.getFullYear(); }).length; return <><div className="stat-value" style={{color:thisMonth>=lastMonth?'var(--eg-green)':'var(--danger)'}}>{thisMonth}</div><div style={{fontSize:11,color:'#6b7280',marginTop:4}}>vs {lastMonth} last month</div></>; })()}
          </div>
        </div>
        <div className="card">
          <div className="card-header" style={{flexWrap:'wrap',gap:8}}>
            <span className="card-title">All Audits</span>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
              <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:140}} placeholder="Search name..." value={filters.search} onChange={e=>setFilters(p=>({...p,search:e.target.value}))} />
              <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} placeholder="National ID..." value={filters.national_id} onChange={e=>setFilters(p=>({...p,national_id:e.target.value}))} />
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:110}} value={filters.status} onChange={e=>setFilters(p=>({...p,status:e.target.value}))}>
                <option value="">All Status</option><option value="active">Active</option><option value="exit">Exit</option>
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:120}} value={filters.resource_type} onChange={e=>setFilters(p=>({...p,resource_type:e.target.value}))}>
                <option value="">All Resources</option><option value="inhouse">Inhouse</option><option value="outsource">Outsource</option>
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:120}} value={filters.project} onChange={e=>setFilters(p=>({...p,project:e.target.value}))}>
                <option value="">All Projects</option>
                {[...new Set(audits.map(a=>a.project).filter(Boolean))].sort().map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:110}} value={filters.client} onChange={e=>setFilters(p=>({...p,client:e.target.value}))}>
                <option value="">All Clients</option>
                {[...new Set(audits.map(a=>a.client).filter(Boolean))].sort().map(cl=><option key={cl} value={cl}>{cl}</option>)}
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} value={filters.audited_by} onChange={e=>setFilters(p=>({...p,audited_by:e.target.value}))}>
                <option value="">All Auditors</option>
                {users.map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
              <button className="btn" style={{height:30,padding:'4px 12px',fontSize:12}} onClick={()=>setFilters({ search: '', national_id: '', resource_type: '', project: '', client: '', status: '', audited_by: '' })}>✕ Clear</button>
            </div>
          </div>
          <table>
            <thead><tr><th>Employee</th><th>National ID</th><th>Department</th><th>Project</th><th>Organization</th><th>Audited by</th><th>Date</th><th>Items</th><th>Issues</th><th>Result</th></tr></thead>
            <tbody>
              {audits.map((a,i)=>(
                <tr key={a.id} style={{cursor:'pointer'}} onClick={()=>navigate('/audits/' + a.id)}>
                  <td><div className="emp-cell"><div className={'avatar ' + ['av-teal','av-navy','av-coral','av-purple'][i%4]}>{initials(a.employee_name)}</div><div><div className="emp-name">{a.employee_name}</div><div className="emp-id">{a.national_id||a.employee_number}</div></div></div></td>
                  <td>{a.national_id||'—'}</td><td>{a.department||'—'}</td><td>{a.project||'—'}</td><td>{a.organization||'—'}</td><td>{a.audited_by_name}</td>
                  <td>{new Date(a.audit_date).toLocaleDateString('en-GB')}</td>
                  <td>{a.total_items}</td>
                  <td><span className={'tag ' + (a.issues_count>0?'tag-red':'tag-green')}>{a.issues_count} {a.issues_count===1?'issue':'issues'}</span></td>
                  <td>{STATUS[a.overall_status]}</td>
                  {userRole==='admin' && <td><button onClick={e=>deleteAudit(a.id,e)} style={{background:'none',border:'none',cursor:'pointer',color:'#e24b4a',fontSize:16}} title="Delete">🗑</button></td>}
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
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [userRole, setUserRole] = useState('');
  const [filters, setFilters] = useState({ search: '', period: '', ppe: '', status: '' });
  const navigate = useNavigate();

  useEffect(() => {
    try { const user = JSON.parse(localStorage.getItem('esat_user')); if (user) setUserRole(user.role); } catch {}
  }, []);

  useEffect(() => {
    api.get('/ncr').then(r=>setItems(r.data)).catch(console.error);
    api.get('/ncr/stats').then(r=>setStats(r.data)).catch(console.error);
  }, []);

  const filteredItems = items.filter(n => {
    const now = new Date();
    const created = new Date(n.created_at);
    if (filters.period === 'current' && (created.getMonth() !== now.getMonth() || created.getFullYear() !== now.getFullYear())) return false;
    if (filters.period === 'previous') {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1);
      if (created.getMonth() !== prev.getMonth() || created.getFullYear() !== prev.getFullYear()) return false;
    }
    if (filters.search && !n.employee_name?.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.ppe && n.ppe_name !== filters.ppe) return false;
    if (filters.status && n.status !== filters.status) return false;
    return true;
  });

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  const deleteNCR = async (id) => {
    if (!window.confirm('Delete this NCR item? The linked PPE request will also be deleted.')) return;
    await api.delete('/ncr/' + id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const approvePurchaseRequest = async () => {
    if (selected.length === 0) return;
    if (!window.confirm(`Are you sure you want to approve a purchase request for ${selected.length} NCR item(s)?`)) return;
    await Promise.all(selected.map(id => api.put(`/ncr/${id}/status`, { status: 'ehs_purchase_requested' })));
    setItems(prev => prev.map(i => selected.includes(i.id) ? {...i, status: 'ehs_purchase_requested'} : i));
    setSelected([]);
    setSelecting(false);
    alert(`${selected.length} item(s) approved for purchase request successfully.`);
  };
  return (
    <>
      <div className="topbar">
        <div className="topbar-left"><span className="topbar-breadcrumb">ESAT</span><span className="topbar-sep">›</span><span className="topbar-title">NCR List</span></div>
        <div className="topbar-right">
          <button className="btn">↓ Export</button>
          {(userRole === 'ehs_manager' || userRole === 'admin') && !selecting && (
            <button className="btn btn-navy" onClick={()=>setSelecting(true)}>✅ Approve Purchase Request</button>
          )}
          {selecting && (
            <>
              <span style={{fontSize:12,color:'#6b7280'}}>{selected.length} selected</span>
              <button className="btn btn-primary" onClick={approvePurchaseRequest} disabled={selected.length===0}>✓ Approve ({selected.length})</button>
              <button className="btn" onClick={()=>{setSelecting(false);setSelected([]);}}>✕ Cancel</button>
            </>
          )}
        </div>
      </div>
      <div className="content">
        <div className="stat-grid">
          <div className="stat-card"><div className="stat-label">Total Open</div><div className="stat-value danger">{filteredItems.length}</div></div>
          <div className="stat-card"><div className="stat-label">Pending</div><div className="stat-value warning">{filteredItems.filter(n=>n.status==='pending').length}</div></div>
          <div className="stat-card"><div className="stat-label">Purchase Requested</div><div className="stat-value navy">{filteredItems.filter(n=>n.status==='purchase_requested').length}</div></div>
          <div className="stat-card"><div className="stat-label">Resolved (month)</div><div className="stat-value green">{stats.resolved_this_month||0}</div></div>
        </div>
        <div className="card">
          <div className="card-header" style={{flexWrap:'wrap',gap:8}}>
            <span className="card-title">Open NCR items</span>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
              <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:150}} placeholder="Search employee..." value={filters.search} onChange={e=>setFilters(p=>({...p,search:e.target.value}))} />
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:150}} value={filters.period} onChange={e=>setFilters(p=>({...p,period:e.target.value}))}>
                <option value="">All Records</option>
                <option value="current">Current Month</option>
                <option value="previous">Previous Month</option>
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:160}} value={filters.ppe} onChange={e=>setFilters(p=>({...p,ppe:e.target.value}))}>
                <option value="">All PPE Items</option>
                {[...new Set(items.map(n=>n.ppe_name).filter(Boolean))].sort().map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:160}} value={filters.status} onChange={e=>setFilters(p=>({...p,status:e.target.value}))}>
                <option value="pending">Pending</option>
                <option value="purchase_requested">Purchase Requested</option>
                <option value="">All Status</option>
              </select>
              <button className="btn" style={{height:30,padding:'4px 12px',fontSize:12}} onClick={()=>setFilters({search:'',period:'',ppe:'',status:''})}>✕ Clear</button>
            </div>
          </div>
          <table>
            <thead><tr><th></th><th>Employee</th><th>PPE item</th><th>Condition</th><th>Size</th><th>Comment</th><th>Flagged</th><th>Status</th>{selecting && <th>Select</th>}{userRole === 'admin' && !selecting && <th></th>}</tr></thead>
            <tbody>
              {filteredItems.map(n=>(
                <tr key={n.id}>
                  <td style={{padding:'0 0 0 8px'}}><div style={{width:3,height:40,background:n.condition==='not_good'?'var(--danger)':'var(--warning)',borderRadius:2}}></div></td>
                  <td><div className="emp-cell"><div className="avatar av-coral" style={{width:26,height:26,fontSize:10}}>{n.employee_name?.split(' ').map(w=>w[0]).join('')}</div><span className="emp-name">{n.employee_name}</span></div></td>
                  <td>{n.ppe_name}</td>
                  <td><span className={`tag ${n.condition==='not_good'?'tag-red':'tag-amber'}`}>{n.condition==='not_good'?'Not Good':'Missing'}</span></td>
                  <td>{n.size_value||'—'}</td>
                  <td style={{color:'#6b7280',fontSize:12}}>{n.comment||'—'}</td>
                  <td style={{fontSize:12}}>
                    <div>{new Date(n.created_at).toLocaleDateString('en-GB')}</div>
                    <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{n.audited_by_name||'—'}</div>
                  </td>
                  <td><span className={`tag ${n.status==='pending'?'tag-amber':n.status==='ehs_purchase_requested'?'tag-navy':n.status==='scm_ordered'?'tag-navy':n.status==='warehouse_available'?'tag-teal':n.status==='distributed'||n.status==='resolved'?'tag-green':'tag-red'}`}>{
                    n.status==='pending'?'Pending':
                    n.status==='ehs_purchase_requested'?'EHS Purchase Requested':
                    n.status==='scm_ordered'?'SCM Ordered':
                    n.status==='warehouse_available'?'Warehouse Available':
                    n.status==='distributed'?'Distributed':
                    n.status==='resolved'?'Resolved':'Canceled'
                  }</span></td>
                  {selecting && <td style={{textAlign:'center'}}>{n.status==='pending' && <input type="checkbox" checked={selected.includes(n.id)} onChange={()=>toggleSelect(n.id)} style={{width:16,height:16,cursor:'pointer',accentColor:'var(--eg-green)'}} />}</td>}
                  {userRole === 'admin' && !selecting && <td><button onClick={()=>deleteNCR(n.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#e24b4a',fontSize:16}} title="Delete">🗑</button></td>}
                </tr>
              ))}
              {!filteredItems.length && <tr><td colSpan={8} style={{textAlign:'center',color:'#6b7280',padding:32}}>No NCRs found</td></tr>}
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
