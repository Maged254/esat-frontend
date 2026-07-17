// ── EmployeesPage ────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { logError } from '../utils/api';

export function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [ppeAssignModal, setPpeAssignModal] = useState(null); // employee object
  const [allPpeItems, setAllPpeItems] = useState([]);
  const [assignedPpe, setAssignedPpe] = useState([]); // array of ppe_item ids
  const [ppeAssignSaving, setPpeAssignSaving] = useState(false);
  const [filters, setFilters] = useState({ status: 'active', department: '', resource_type: '', search: '', national_id: '', project: '', client: '', san: '', job_title: '', audit_age: '' });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 25;
  const [stats, setStats] = useState({ total_active: 0, inhouse: 0, outsource: 0, exits: 0 });
  const [filterOptions, setFilterOptions] = useState({ departments: [], projects: [], clients: [] });
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

  const deleteEmployee = async (emp) => {
    if (!window.confirm(`Delete ${emp.full_name}? This will permanently delete the employee and all their audits, NCR items, and PPE requests.`)) return;
    await api.delete('/employees/' + emp.id);
    setEmployees(prev => prev.filter(e => e.id !== emp.id));
  };

  const filterParams = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
    return params;
  };

  const load = () => {
    const params = filterParams();
    params.append('page', page);
    params.append('pageSize', pageSize);
    api.get(`/employees?${params}`).then(r => { setEmployees(r.data.rows); setTotal(r.data.total); }).catch(logError);
  };

  const loadStats = () => {
    api.get(`/employees/stats?${filterParams()}`).then(r => setStats(r.data)).catch(logError);
  };

  const reload = () => { load(); loadStats(); };

  async function openPpeAssign(emp) {
    const [ppeRes, assignRes] = await Promise.all([
      api.get('/ppe'),
      api.get(`/employees/${emp.id}/ppe-assignments`)
    ]);
    setAllPpeItems(ppeRes.data);
    setAssignedPpe(assignRes.data.map(p => p.id));
    setPpeAssignModal(emp);
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
    reload();
    let msg = `Import complete: ${success} added`;
    if (failed > 0) msg += `, ${failed} failed:\n` + errors.slice(0,5).join('\n');
    alert(msg);
  };

  useEffect(() => { load(); }, [filters, page]);
  useEffect(() => { loadStats(); }, [filters]);
  useEffect(() => { setPage(1); }, [filters]);
  useEffect(() => { api.get('/employees/filter-options').then(r=>setFilterOptions(r.data)).catch(logError); }, []);

  async function savePpeAssign() {
    setPpeAssignSaving(true);
    try {
      await api.put(`/employees/${ppeAssignModal.id}/ppe-assignments`, { ppe_item_ids: assignedPpe });
      setPpeAssignModal(null);
    } catch(e) {
      alert('Error saving: ' + (e.response?.data?.error || e.message));
    }
    setPpeAssignSaving(false);
  }

  function togglePpeItem(id) {
    setAssignedPpe(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  // Live-refresh: the backend pushes a message whenever an employee record
  // changes (Power Automate sync, or another user's edit) instead of us
  // polling the full list on a timer.
  useEffect(() => {
    const token = localStorage.getItem('esat_token');
    if (!token) return;
    const source = new EventSource(`${api.defaults.baseURL}/events?token=${encodeURIComponent(token)}`);
    source.onmessage = () => reload();
    return () => source.close();
  }, [filters, page]);

  // Full filtered set (no page/pageSize), not just the currently visible page.
  const exportCSV = () => {
    api.get(`/employees?${filterParams()}`).then(r => {
      const headers = ['employee_number','full_name','national_id','job_title','department','project','client','organization','resource_type','employment_status','san','last_audit_date'];
      const rows = r.data.map(e => headers.map(h => {
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
    }).catch(logError);
  };

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

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
          {userRole === 'admin' && (
            <label className="btn" style={{cursor:'pointer'}}>
              {importing ? 'Importing...' : '↑ Import CSV'}
              <input type="file" accept=".csv" style={{display:'none'}} onChange={handleCSVImport} disabled={importing} />
            </label>
          )}
          
        </div>
      </div>
      <div className="content">
        <div className="stat-grid">
          <div className="stat-card"><div className="stat-label">Total active</div><div className="stat-value green">{stats.total_active}</div></div>
          <div className="stat-card"><div className="stat-label">Inhouse</div><div className="stat-value navy">{stats.inhouse}</div></div>
          <div className="stat-card"><div className="stat-label">Outsource</div><div className="stat-value">{stats.outsource}</div></div>
          <div className="stat-card"><div className="stat-label">Exits</div><div className="stat-value">{stats.exits}</div></div>
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
                {filterOptions.departments.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} value={filters.project} onChange={e=>setFilters(p=>({...p,project:e.target.value}))}>
                <option value="">All Projects</option>
                {filterOptions.projects.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:120}} value={filters.client} onChange={e=>setFilters(p=>({...p,client:e.target.value}))}>
                <option value="">All Clients</option>
                {filterOptions.clients.map(c=><option key={c} value={c}>{c}</option>)}
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
              <button className="btn" style={{height:30,padding:'4px 12px',fontSize:12}} onClick={()=>setFilters({status:'active',department:'',resource_type:'',search:'',national_id:'',project:'',client:'',san:'',job_title:'',audit_age:''})}>✕ Clear</button>
            </div>
          </div>
          <table>
            <thead><tr><th>Employee</th><th>Organization</th><th>Job Title</th><th>Department</th><th>Project</th><th>Client</th><th>Resource</th><th>SAN</th><th>Last Audit</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {employees.map((e, i) => (
                <tr key={e.id}>
                  <td><div className="emp-cell"><div className={`avatar ${avatarClass(i)}`}>{initials(e.full_name)}</div><div><div className="emp-name">{e.full_name}</div><div className="emp-id">{e.national_id||e.employee_number}</div></div></div></td>
                  <td>{e.organization||'—'}</td><td>{e.job_title||'—'}</td><td>{e.department||'—'}</td><td>{e.project||'—'}</td><td>{e.client||'—'}</td>
                  <td><span className={`tag ${e.resource_type==='inhouse'?'tag-navy':'tag-gray'}`}>{e.resource_type ? e.resource_type.charAt(0).toUpperCase() + e.resource_type.slice(1) : '—'}</span></td>
                  <td>{userRole === 'admin' ? <button onClick={()=>toggleSAN(e)} className={`tag ${e.san!==false?'tag-green':'tag-red'}`} style={{border:'none',cursor:'pointer'}}>{e.san!==false?'Yes':'No'}</button> : <span className={`tag ${e.san!==false?'tag-green':'tag-red'}`}>{e.san!==false?'Yes':'No'}</span>}</td>
                  <td>{e.last_audit_date ? <><span className={`dot ${e.days_since_audit>30?'dot-red':'dot-green'}`}></span>{e.days_since_audit}d ago</> : <span style={{color:'#9ca3af'}}>Never</span>}</td>
                  <td><span className={`tag ${e.employment_status==='active'?'tag-green':'tag-red'}`}>{e.employment_status}</span></td>
                  <td>
                    <div style={{display:'flex',gap:6}}>
                      {['admin','ehs_manager'].includes(userRole) && <button className="btn btn-sm" onClick={()=>openPpeAssign(e)} title="Assign PPE" style={{background:e.ppe_assigned?'#d1fae5':undefined,borderColor:e.ppe_assigned?'#1D9E75':undefined,color:e.ppe_assigned?'#1D9E75':undefined}}>🛡 PPE</button>}
                      {userRole==='admin' && <button onClick={()=>deleteEmployee(e)} style={{background:'none',border:'none',cursor:'pointer',color:'#e24b4a',fontSize:16}} title="Delete Employee">🗑</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!employees.length && <tr><td colSpan={11} style={{textAlign:'center',color:'#6b7280',padding:32}}>No employees found</td></tr>}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 18px',borderTop:'1px solid #e5e7eb'}}>
            <span style={{fontSize:12,color:'#6b7280'}}>{total} employee{total===1?'':'s'} total</span>
            <div style={{display:'flex',gap:4,alignItems:'center'}}>
              <button className="btn btn-sm" onClick={()=>setPage(p=>Math.max(p-1,1))} disabled={page===1}>‹ Prev</button>
              {Array.from({length: totalPages}, (_, i) => i+1)
                .filter(p => p===1 || p===totalPages || Math.abs(p-page)<=2)
                .reduce((acc, p, i, arr) => { if (i>0 && p-arr[i-1]>1) acc.push('…'); acc.push(p); return acc; }, [])
                .map((p, i) => p==='…'
                  ? <span key={'gap'+i} style={{padding:'0 4px',color:'#9ca3af',fontSize:12}}>…</span>
                  : <button key={p} className="btn btn-sm" onClick={()=>setPage(p)} style={{background:p===page?'var(--eg-navy)':'',color:p===page?'white':'',fontWeight:p===page?700:400}}>{p}</button>
                )}
              <button className="btn btn-sm" onClick={()=>setPage(p=>Math.min(p+1,totalPages))} disabled={page===totalPages}>Next ›</button>
            </div>
          </div>
        )}
      </div>
      {ppeAssignModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:12,padding:32,width:720,maxHeight:'80vh',display:'flex',flexDirection:'column',gap:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div style={{fontWeight:700,fontSize:16}}>PPE Assignment</div>
                <div style={{fontSize:13,color:'#6b7280'}}>{ppeAssignModal.full_name} — {ppeAssignModal.national_id || ppeAssignModal.employee_number}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                {ppeAssignModal.ppe_last_edited_by_name && (
                  <div style={{fontSize:11,color:'#9ca3af',textAlign:'right'}}>
                    <div>Last Edited</div>
                    <div>{ppeAssignModal.ppe_last_edited_by_name} · {new Date(ppeAssignModal.ppe_last_edited_at).toLocaleDateString('en-GB')}</div>
                  </div>
                )}
                <button onClick={()=>setPpeAssignModal(null)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#6b7280'}}>✕</button>
              </div>
            </div>
            <div style={{fontSize:12,color:'#6b7280'}}>Tick the PPE/Tool Items required for this employee. Only ticked items will appear in audits. ({allPpeItems.length} items loaded)</div>
            <div style={{overflowY:'auto',maxHeight:'50vh',minHeight:200,display:'flex',flexDirection:'column',gap:8}}>
              {[
                ['body_protection','Body Protection'],
                ['documentation_safety_signage','Documentation & Safety Signage'],
                ['fall_protection','Fall Protection & Rescue Equipment'],
                ['general_safety','General Safety'],
                ['maintenance_tools','Maintenance Tools & Equipment'],
                ['testing_measuring','Testing & Measuring Instruments'],
              ].map(([catKey, catLabel]) => {
                const items = allPpeItems.filter(p => p.category === catKey);
                if (!items.length) return null;
                return (
                  <div key={catKey}>
                    <div style={{fontSize:11,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4,marginTop:8}}>{catLabel}</div>
                    {items.map(p => (
                      <label key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'6px 8px',borderRadius:6,cursor:'pointer',background:assignedPpe.includes(p.id)?'#f0fdf4':'#f9fafb',marginBottom:2}}>
                        <input type="checkbox" checked={assignedPpe.includes(p.id)} onChange={()=>togglePpeItem(p.id)} style={{width:16,height:16,accentColor:'#1D9E75'}} />
                        <span style={{fontSize:14}}>{p.name}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderTop:'1px solid #e5e7eb',paddingTop:12}}>
              <span style={{fontSize:12,color:'#6b7280'}}>{assignedPpe.length} item{assignedPpe.length!==1?'s':''} selected</span>
              <div style={{display:'flex',gap:8}}>
                <button className="btn" onClick={()=>setPpeAssignModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={savePpeAssign} disabled={ppeAssignSaving}>{ppeAssignSaving?'Saving...':'Save Assignment'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── AuditHistoryPage ─────────────────────────────────────────
export function AuditHistoryPage() {
  const [audits, setAudits] = useState([]);
  const [users, setUsers] = useState([]);
  const [userRole, setUserRole] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');
  const [filters, setFilters] = useState({ search: '', national_id: '', resource_type: '', project: '', client: '', status: 'active', audited_by: '' });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 25;
  const [stats, setStats] = useState({ total:0, compliant:0, partial:0, non_compliant:0, this_month:0, last_month:0 });
  const [filterOptions, setFilterOptions] = useState({ projects: [], clients: [] });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('esat_user'));
      if (user) { setUserRole(user.role); setCurrentUserName(user.full_name || user.name || ''); }
    } catch {}
  }, []);

  const promptDelete = (id, e) => {
    e.stopPropagation();
    setDeleteTarget(id); setDeleteReason(''); setDeleteError('');
  };

  const confirmDelete = async () => {
    if (!deleteReason.trim()) return setDeleteError('A reason is required.');
    setDeleting(true); setDeleteError('');
    try {
      await api.delete('/audits/' + deleteTarget, { data: { delete_reason: deleteReason.trim() } });
      setAudits(prev => prev.map(a => a.id === deleteTarget
        ? { ...a, is_deleted: true, deleted_by_name: currentUserName, delete_reason: deleteReason.trim() }
        : a));
      setDeleteTarget(null);
    } catch(e) {
      setDeleteError(e.response?.data?.error || 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  const filterParams = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
    return params;
  };

  const load = () => {
    const params = filterParams();
    params.append('page', page);
    params.append('pageSize', pageSize);
    api.get('/audits?' + params).then(r => { setAudits(r.data.rows); setTotal(r.data.total); }).catch(logError);
  };

  const loadStats = () => {
    api.get('/audits/stats?' + filterParams()).then(r => setStats(r.data)).catch(logError);
  };

  useEffect(() => { load(); }, [filters, page]);
  useEffect(() => { loadStats(); }, [filters]);
  useEffect(() => { setPage(1); }, [filters]);

  useEffect(() => { api.get('/audits/filter-options').then(r=>setFilterOptions(r.data)).catch(logError); }, []);
  useEffect(() => { api.get('/users').then(r=>setUsers(r.data.filter(u=>!['sync@egypro.com','admin@egypro.com','eats-sync@egypro.app'].includes(u.email)))).catch(logError); }, []);
  const initials = n => n?.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?';

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  const exportCSV = () => {
    const params = filterParams();
    params.append('export', 'true');
    api.get('/audits?' + params).then(r => {
      const headers = ['employee_name','employee_number','national_id','department','project','organization','audited_by_name','audit_date','total_items','issues_count','overall_status'];
      const rows = r.data.rows.map(a => headers.map(h => {
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
    }).catch(logError);
  };

  const STATUS = {
    compliant: <span className="tag tag-green">Compliant</span>,
    partial: <span className="tag tag-amber">Partial</span>,
    non_compliant: <span className="tag tag-red">Non-compliant</span>
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left"><span className="topbar-breadcrumb">ESAT</span><span className="topbar-sep">›</span><span className="topbar-title">Audit/Request History</span></div>
        <div className="topbar-right"><button className="btn" onClick={exportCSV}>↓ Export CSV</button></div>
      </div>
      <div className="content">
        <div className="stat-grid" style={{marginBottom:16,gridTemplateColumns:"repeat(5,1fr)"}}>
          <div className="stat-card"><div className="stat-label">Total Audits</div><div className="stat-value navy">{stats.total}</div></div>
          <div className="stat-card"><div className="stat-label">Compliant</div><div className="stat-value green">{stats.compliant}</div></div>
          <div className="stat-card"><div className="stat-label">Partial</div><div className="stat-value warning">{stats.partial}</div></div>
          <div className="stat-card"><div className="stat-label">Non-Compliant</div><div className="stat-value danger">{stats.non_compliant}</div></div>
          <div className="stat-card">
            <div className="stat-label">This Month</div>
            <div className="stat-value" style={{color:stats.this_month>=stats.last_month?'var(--eg-green)':'var(--danger)'}}>{stats.this_month}</div>
            <div style={{fontSize:11,color:'#6b7280',marginTop:4}}>vs {stats.last_month} last month</div>
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
                <option value="">All Resources</option><option value="inhouse">Inhouse</option><option value="outsource">Outsource</option><option value="casual">Casual</option>
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:120}} value={filters.project} onChange={e=>setFilters(p=>({...p,project:e.target.value}))}>
                <option value="">All Projects</option>
                {filterOptions.projects.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:110}} value={filters.client} onChange={e=>setFilters(p=>({...p,client:e.target.value}))}>
                <option value="">All Clients</option>
                {filterOptions.clients.map(cl=><option key={cl} value={cl}>{cl}</option>)}
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} value={filters.audited_by} onChange={e=>setFilters(p=>({...p,audited_by:e.target.value}))}>
                <option value="">All Auditors</option>
                {users.map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
              <button className="btn" style={{height:30,padding:'4px 12px',fontSize:12}} onClick={()=>setFilters({ search: '', national_id: '', resource_type: '', project: '', client: '', status: '', audited_by: '' })}>✕ Clear</button>
            </div>
          </div>
          <table>
            <thead><tr><th>Employee</th><th>Department</th><th>Project / Client</th><th>Organization</th><th>Audited by</th><th>Date</th><th>Items</th><th>Issues</th><th>Result</th></tr></thead>
            <tbody>
              {audits.map((a,i)=>(
                <tr key={a.id} style={{cursor:'pointer',opacity:a.is_deleted?0.5:1,background:a.is_deleted?'#f9fafb':'',textDecoration:a.is_deleted?'line-through':''}} onClick={()=>navigate('/audits/' + a.id)}>
                  <td><div className="emp-cell"><div style={{width:4,minWidth:4,borderRadius:2,alignSelf:'stretch',background:a.is_deleted?'#9ca3af':a.overall_status==='compliant'?'#1D9E75':a.overall_status==='partial'?'#F59E0B':'#e24b4a',marginRight:8}}></div><div><div className="emp-name">{a.employee_name}</div><div className="emp-id">{a.national_id||a.employee_number}</div>{a.job_title && <div style={{fontSize:10,color:'#6b7280',marginTop:1}}>{a.job_title}</div>}</div></div></td>
                  <td>{a.is_casual ? 'Projects' : (a.department||'—')}</td>
                  <td style={{fontSize:12}}>
                    <div>{a.project||'—'}</div>
                    {a.client && <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{a.client}</div>}
                  </td>
                  <td>{a.is_casual ? 'Casual' : (a.organization||'—')}</td><td>{a.audited_by_name}</td>
                  <td>{new Date(a.audit_date).toLocaleDateString('en-GB')}</td>
                  <td>{a.total_items}</td>
                  <td>{a.is_deleted ? '—' : <span className={'tag ' + (a.issues_count>0?'tag-red':'tag-green')}>{a.issues_count} {a.issues_count===1?'issue':'issues'}</span>}</td>
                  <td style={{textDecoration:'none'}}>{a.is_deleted ? <span className="tag" title={a.delete_reason ? `Reason: ${a.delete_reason}` : ''} style={{background:'#fee2e2',color:'#991b1b',border:'1px solid #fecaca',whiteSpace:'nowrap'}}>🗑 Deleted by {a.deleted_by_name||'Unknown'}</span> : a.employee_present === false ? <span className="tag" style={{background:'#f1f5f9',color:'#64748b',border:'1px solid #e2e8f0'}}>Not Present</span> : STATUS[a.overall_status]}</td>
                  {userRole==='admin' && <td>{!a.is_deleted && <button onClick={e=>promptDelete(a.id,e)} style={{background:'none',border:'none',cursor:'pointer',color:'#e24b4a',fontSize:16}} title="Delete">🗑</button>}</td>}
                </tr>
              ))}
              {!audits.length && <tr><td colSpan={9} style={{textAlign:'center',color:'#6b7280',padding:32}}>No audits found</td></tr>}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 18px',borderTop:'1px solid #e5e7eb'}}>
            <span style={{fontSize:12,color:'#6b7280'}}>{total} audit{total===1?'':'s'} total</span>
            <div style={{display:'flex',gap:4,alignItems:'center'}}>
              <button className="btn btn-sm" onClick={()=>setPage(p=>Math.max(p-1,1))} disabled={page===1}>‹ Prev</button>
              {Array.from({length: totalPages}, (_, i) => i+1)
                .filter(p => p===1 || p===totalPages || Math.abs(p-page)<=2)
                .reduce((acc, p, i, arr) => { if (i>0 && p-arr[i-1]>1) acc.push('…'); acc.push(p); return acc; }, [])
                .map((p, i) => p==='…'
                  ? <span key={'gap'+i} style={{padding:'0 4px',color:'#9ca3af',fontSize:12}}>…</span>
                  : <button key={p} className="btn btn-sm" onClick={()=>setPage(p)} style={{background:p===page?'var(--eg-navy)':'',color:p===page?'white':'',fontWeight:p===page?700:400}}>{p}</button>
                )}
              <button className="btn btn-sm" onClick={()=>setPage(p=>Math.min(p+1,totalPages))} disabled={page===totalPages}>Next ›</button>
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div onClick={() => !deleting && setDeleteTarget(null)} style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.7)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div onClick={e => e.stopPropagation()} style={{background:'white',borderRadius:16,padding:24,width:420,maxWidth:'90vw',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{fontWeight:700,fontSize:16,color:'#1a2e4a',marginBottom:6}}>Delete this audit?</div>
            <div style={{fontSize:13,color:'#6b7280',marginBottom:14}}>It will remain visible in history but be removed from NCR and PPE tracker. A reason is required.</div>
            {deleteError && <div style={{color:'#c0392b',fontSize:13,marginBottom:10}}>{deleteError}</div>}
            <textarea
              className="form-input" rows={3} autoFocus
              placeholder="Reason for deleting this audit..."
              value={deleteReason}
              onChange={e => setDeleteReason(e.target.value)}
              style={{width:'100%',resize:'vertical'}}
            />
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
              <button className="btn" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</button>
              <button className="btn" onClick={confirmDelete} disabled={deleting} style={{borderColor:'#e24b4a',color:'#e24b4a'}}>{deleting ? 'Deleting...' : '🗑 Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── NCRPage ──────────────────────────────────────────────────
export function NCRPage() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ total_open: 0, pending: 0, pending_pm: 0, resolved_this_month: 0 });
  const [filterOptions, setFilterOptions] = useState({ ppe_names: [], projects: [] });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 25;
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [selectingPda, setSelectingPda] = useState(false);
  const [selectedPda, setSelectedPda] = useState([]);
  const [userRole, setUserRole] = useState('');
  const [filters, setFilters] = useState({ search: '', period: '', ppe: '', status: '', project: '', activeStat: 'pending' });
  const navigate = useNavigate();

  useEffect(() => {
    try { const user = JSON.parse(localStorage.getItem('esat_user')); if (user) setUserRole(user.role); } catch {}
  }, []);

  // Stat-card clicks (activeStat) and the status dropdown are mutually
  // exclusive in the UI and collapse to a single canonical status value
  // for the backend, matching the pda_pending/ehs_purchase_requested
  // sentinel pattern already used by /api/ppe-requests.
  const effectiveStatus = () => {
    if (filters.activeStat === 'pending') return 'pending';
    if (filters.activeStat === 'pma') return 'pda_pending';
    if (filters.activeStat === 'distributed') return 'distributed_this_month';
    return filters.status;
  };

  const filterParams = () => {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.period) params.append('period', filters.period);
    if (filters.ppe) params.append('ppe', filters.ppe);
    if (filters.project) params.append('project', filters.project);
    const status = effectiveStatus();
    if (status) params.append('status', status);
    return params;
  };

  const load = () => {
    const params = filterParams();
    params.append('page', page);
    params.append('pageSize', pageSize);
    api.get('/ncr?' + params).then(r => { setItems(r.data.rows); setTotal(r.data.total); }).catch(logError);
  };

  // Global (unfiltered) counts -- doesn't depend on `filters`, see /api/ncr/stats.
  const loadStats = () => api.get('/ncr/stats').then(r=>setStats(r.data)).catch(logError);

  const reload = () => { load(); loadStats(); };

  useEffect(() => { load(); }, [filters, page]);
  useEffect(() => { loadStats(); }, []);
  useEffect(() => { setPage(1); }, [filters]);
  useEffect(() => { api.get('/ncr/filter-options').then(r=>setFilterOptions(r.data)).catch(logError); }, []);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  // Same "recently distributed" window (4 months) and color as the Pending PM tag.
  const isRecentDistribution = (date) => !!date && new Date(date) >= new Date(new Date().setMonth(new Date().getMonth() - 4));

  const statusLabel = (n) =>
    n.status==='pending'?'Flagged':
    n.status==='ehs_purchase_requested'?(n.needs_pda?'Pending PM':'EHS Purchase Requested'):
    n.status==='pda_approved'?'Approved (PM)':
    n.status==='scm_ordered'?'SCM Ordered':
    n.status==='warehouse_available'?'Warehouse Available':
    n.status==='distributed'?'Distributed':
    n.status==='resolved'?'Resolved':'Canceled';

  const deleteNCR = async (id) => {
    if (!window.confirm('Delete this NCR item? The linked PPE request will also be deleted.')) return;
    await api.delete('/ncr/' + id);
    reload();
  };

  const approvePurchaseRequest = async () => {
    if (selected.length === 0) return;
    if (!window.confirm(`Are you sure you want to approve (Safety) for ${selected.length} item(s)?`)) return;
    await Promise.all(selected.map(id => api.put(`/ncr/${id}/status`, { status: 'ehs_purchase_requested' })));
    reload();
    setSelected([]);
    setSelecting(false);
    alert(`${selected.length} item(s) approved (Safety) successfully.`);
  };

  const togglePdaSelect = (id) => setSelectedPda(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  const approvePda = async () => {
    if (selectedPda.length === 0) return;
    if (!window.confirm(`Are you sure you want to approve (PM) for ${selectedPda.length} item(s)?`)) return;
    await Promise.all(selectedPda.map(id => api.put(`/ncr/${id}/status`, { status: 'pda_approved' })));
    reload();
    setSelectedPda([]);
    setSelectingPda(false);
    alert(`${selectedPda.length} item(s) approved (PM) successfully.`);
  };

  const exportCSV = () => {
    const params = filterParams();
    params.append('export', 'true');
    api.get('/ncr?' + params).then(r => {
      const labels = ['Employee','National ID','PPE/Tool Item','Condition','Qty','Project','Client','Organization','Flagged Date','Status'];
      const rows = r.data.rows.map(n => [
        n.employee_name, n.employee_national_id||'', n.ppe_name, n.condition==='not_good'?'Not Good':'Missing',
        n.quantity||1, n.project||'', n.client||'', n.organization||'',
        new Date(n.created_at).toLocaleDateString('en-GB'), statusLabel(n),
      ].map(v => String(v).includes(',') ? '"'+v+'"' : v).join(','));
      const csv = [labels.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ESAT_NCR_' + new Date().toISOString().slice(0,10) + '.csv';
      a.click();
      URL.revokeObjectURL(url);
    }).catch(logError);
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left"><span className="topbar-breadcrumb">ESAT</span><span className="topbar-sep">›</span><span className="topbar-title">NCR List</span></div>
        <div className="topbar-right">
          <button className="btn" onClick={exportCSV}>↓ Export CSV</button>
          {(userRole === 'ehs_manager' || userRole === 'admin') && !selecting && !selectingPda && (
            <button className="btn btn-navy" onClick={()=>setSelecting(true)}>✅ Approve (Safety)</button>
          )}
          {(userRole === 'project_director' || userRole === 'admin') && !selecting && !selectingPda && (
            <button className="btn btn-navy" onClick={()=>setSelectingPda(true)}>✅ Approve (PM)</button>
          )}
          {selecting && (
            <>
              <span style={{fontSize:12,color:'#6b7280'}}>{selected.length} selected</span>
              <button className="btn btn-primary" onClick={approvePurchaseRequest} disabled={selected.length===0}>✓ Approve (Safety)({selected.length})</button>
              <button className="btn" onClick={()=>{setSelecting(false);setSelected([]);}}>✕ Cancel</button>
            </>
          )}
          {selectingPda && (
            <>
              <span style={{fontSize:12,color:'#6b7280'}}>{selectedPda.length} selected</span>
              <button className="btn btn-primary" onClick={approvePda} disabled={selectedPda.length===0}>✓ Approve (PM) ({selectedPda.length})</button>
              <button className="btn" onClick={()=>{setSelectingPda(false);setSelectedPda([]);}}>✕ Cancel</button>
            </>
          )}
        </div>
      </div>
      <div className="content">
        <div className="stat-grid">
          <div className="stat-card" style={{cursor:'pointer',outline:filters.activeStat===''?'2px solid var(--eg-green)':''}} onClick={()=>setFilters(p=>({...p,activeStat:'',status:''}))}><div className="stat-label">Total Open</div><div className="stat-value danger">{stats.total_open}</div></div>
          <div className="stat-card" style={{cursor:'pointer',outline:filters.activeStat==='pending'?'2px solid var(--eg-green)':''}} onClick={()=>setFilters(p=>({...p,activeStat:p.activeStat==='pending'?'':'pending',status:''}))}><div className="stat-label">Pending EHS</div><div className="stat-value warning">{stats.pending}</div></div>
          <div className="stat-card" style={{cursor:'pointer',outline:filters.activeStat==='pma'?'2px solid var(--eg-green)':''}} onClick={()=>setFilters(p=>({...p,activeStat:p.activeStat==='pma'?'':'pma',status:''}))}><div className="stat-label">Pending PM</div><div className="stat-value navy">{stats.pending_pm}</div></div>
          <div className="stat-card" style={{cursor:'pointer',outline:filters.activeStat==='distributed'?'2px solid var(--eg-green)':''}} onClick={()=>setFilters(p=>({...p,activeStat:p.activeStat==='distributed'?'':'distributed',status:''}))}><div className="stat-label">Distributed</div><div className="stat-value green">{stats.resolved_this_month}</div></div>
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
                <option value="">All PPE/Tool Items</option>
                {filterOptions.ppe_names.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:160}} value={filters.status} onChange={e=>setFilters(p=>({...p,status:e.target.value,activeStat:''}))}>
                <option value="">All Status</option>
                <option value="pending">Flagged</option>
                <option value="pda_pending">Pending PM</option>
                <option value="ehs_purchase_requested">EHS Purchase Requested</option>
                <option value="scm_ordered">SCM Ordered</option>
                <option value="warehouse_available">Warehouse Available</option>
                <option value="distributed">Distributed</option>
                <option value="canceled">Canceled</option>
              </select>
              <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} value={filters.project} onChange={e=>setFilters(p=>({...p,project:e.target.value}))}>
                <option value="">All Projects</option>
                {filterOptions.projects.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <button className="btn" style={{height:30,padding:'4px 12px',fontSize:12}} onClick={()=>setFilters({search:'',period:'',ppe:'',status:'',project:'',activeStat:''})}>✕ Clear</button>
            </div>
          </div>
          <table>
            <thead><tr><th></th><th>Employee</th><th>PPE/Tool Item</th><th>Condition</th><th>Qty</th><th>Project / Client</th><th>Organization</th><th>Flagged</th><th>Status</th>{selecting && <th>Select</th>}{selectingPda && <th>Select PDA</th>}{userRole === 'admin' && !selecting && !selectingPda && <th></th>}</tr></thead>
            <tbody>
              {items.map(n=>(
                <tr key={n.id}>
                  <td style={{padding:'0 0 0 8px'}}><div style={{width:3,height:40,background:n.condition==='not_good'?'var(--danger)':'var(--warning)',borderRadius:2}}></div></td>
                  <td>
                    <div className="emp-name">{n.employee_name}</div>
                    <div className="emp-id">{n.employee_national_id||'—'}</div>
                    {n.job_title && <div style={{fontSize:10,color:'#6b7280',marginTop:1}}>{n.job_title}</div>}
                  </td>
                  <td>
                    <div>{n.ppe_name}</div>
                    {n.last_distributed ? (
                      <span className="tag" style={{marginTop:2,fontWeight:400,fontSize:10,
                        background: isRecentDistribution(n.last_distributed) ? 'var(--wf-pm-light)' : 'transparent',
                        color: isRecentDistribution(n.last_distributed) ? 'var(--wf-pm)' : '#9ca3af',
                        padding: isRecentDistribution(n.last_distributed) ? '2px 8px' : 0}}>
                        Last distributed: {new Date(n.last_distributed).toLocaleDateString('en-GB')}
                      </span>
                    ) : (
                      <div style={{fontSize:10,color:'#9ca3af',marginTop:2}}>Never distributed</div>
                    )}
                    {n.comment && <div><span className="tag ppe-item-comment">{n.comment}</span></div>}
                  </td>
                  <td><span className={`tag ${n.condition==='not_good'?'tag-red':'tag-amber'}`}>{n.condition==='not_good'?'Not Good':'Missing'}</span></td>
                  <td style={{color:(n.quantity||1)>1?'#e53e3e':'inherit',fontWeight:(n.quantity||1)>1?700:400}}>
                    {n.quantity||1}
                    <div style={{fontSize:11,color:'#6b7280',fontWeight:400,marginTop:2}}>{n.size_value||'—'}</div>
                  </td>
                  <td style={{fontSize:12}}>
                    <div>{n.project||'—'}</div>
                    {n.client && <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{n.client}</div>}
                  </td>
                  <td style={{fontSize:12}}>{n.organization||'—'}</td>
                  <td style={{fontSize:12}}>
                    <div>{new Date(n.created_at).toLocaleDateString('en-GB')}</div>
                    <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{n.audited_by_name||'—'}</div>
                  </td>
                  <td><span className={`tag ${n.status==='pending'?'tag-amber':n.status==='ehs_purchase_requested'?'tag-navy':n.status==='scm_ordered'?'tag-navy':n.status==='warehouse_available'?'tag-teal':n.status==='distributed'||n.status==='resolved'?'tag-green':'tag-red'}`}>{statusLabel(n)}</span></td>
                  {selecting && <td style={{textAlign:'center'}}>{n.status==='pending' && <input type="checkbox" checked={selected.includes(n.id)} onChange={()=>toggleSelect(n.id)} style={{width:16,height:16,cursor:'pointer',accentColor:'var(--eg-green)'}} />}</td>}
                  {selectingPda && <td style={{textAlign:'center'}}>{n.needs_pda && n.status==='ehs_purchase_requested' && <input type="checkbox" checked={selectedPda.includes(n.id)} onChange={()=>togglePdaSelect(n.id)} style={{width:16,height:16,cursor:'pointer',accentColor:'var(--eg-green)'}} />}</td>}
                  {userRole === 'admin' && !selecting && !selectingPda && <td><button onClick={()=>deleteNCR(n.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#e24b4a',fontSize:16}} title="Delete">🗑</button></td>}
                </tr>
              ))}
              {!items.length && <tr><td colSpan={8} style={{textAlign:'center',color:'#6b7280',padding:32}}>No NCRs found</td></tr>}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 18px',borderTop:'1px solid #e5e7eb'}}>
            <span style={{fontSize:12,color:'#6b7280'}}>{total} item{total===1?'':'s'} total</span>
            <div style={{display:'flex',gap:4,alignItems:'center'}}>
              <button className="btn btn-sm" onClick={()=>setPage(p=>Math.max(p-1,1))} disabled={page===1}>‹ Prev</button>
              {Array.from({length: totalPages}, (_, i) => i+1)
                .filter(p => p===1 || p===totalPages || Math.abs(p-page)<=2)
                .reduce((acc, p, i, arr) => { if (i>0 && p-arr[i-1]>1) acc.push('…'); acc.push(p); return acc; }, [])
                .map((p, i) => p==='…'
                  ? <span key={'gap'+i} style={{padding:'0 4px',color:'#9ca3af',fontSize:12}}>…</span>
                  : <button key={p} className="btn btn-sm" onClick={()=>setPage(p)} style={{background:p===page?'var(--eg-navy)':'',color:p===page?'white':'',fontWeight:p===page?700:400}}>{p}</button>
                )}
              <button className="btn btn-sm" onClick={()=>setPage(p=>Math.min(p+1,totalPages))} disabled={page===totalPages}>Next ›</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── PurchaseRequestsPage ─────────────────────────────────────
export function PurchaseRequestsPage() {
  const [prs, setPrs] = useState([]);
  useEffect(() => { api.get('/ncr/purchase-requests').then(r=>setPrs(r.data)).catch(logError); }, []);
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
    api.get('/ppe').then(r=>setPpeItems(r.data)).catch(logError);
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
              <thead><tr><th>PPE/Tool Item</th><th>Category</th><th>Size</th><th>Active</th></tr></thead>
              <tbody>
                {ppeItems.map(p=>(
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td><span className="tag tag-gray" style={{fontSize:10}}>{p.category?.replace(/_/g,' ')}</span></td>
                    <td>{p.has_size ? <span className="tag tag-teal" style={{fontSize:10}}>{p.size_type==='shoe'?'38–46':p.size_type==='harness'?'S–XL':'S–XXXL'}</span> : '—'}</td>
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
