import React, { useEffect, useState, useRef } from 'react';
import api, { logError } from '../utils/api';
import PasswordInput from '../components/PasswordInput';


const ALL_PAGES = [
  { key: '/', label: 'Dashboard' },
  { key: '/employees', label: 'Employees' },
  { key: '/casuals', label: 'Casuals' },
  { key: '/audit/new', label: 'New Audit' },
  { key: '/request-ppe', label: 'Request a PPE' },
  { key: '/history', label: 'Audit History' },
  { key: '/audit-coverage', label: 'Audit Coverage' },
  { key: '/ncr', label: 'NCR List' },
  { key: '/ppe-tracker', label: 'PPE Request Tracker' },
  { key: '/graphs', label: 'Graphs' },
  { key: '/admin', label: 'Admin Panel' },
];

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [userSort, setUserSort] = useState({ key: null, dir: 'asc' });
  const [ppeItems, setPpeItems] = useState([]);
  const [editingPpe, setEditingPpe] = useState(null);
  const [ppeSearch, setPpeSearch] = useState('');
  const [ppeCategoryFilter, setPpeCategoryFilter] = useState(''); // {id, name, category, has_size, size_type, sort_order, is_active} or 'new'
  const [ppeForm, setPpeForm] = useState({});
  const [ppeSaving, setPpeSaving] = useState(false);

  // Collapsible sections
  const [openSections, setOpenSections] = useState({ users: false, ppe: false, locations: false, logs: false });
  const toggleSection = (key) => setOpenSections(p => ({ ...p, [key]: !p[key] }));

  // Locations
  const [locations, setLocations] = useState([]);
  const [locSearch, setLocSearch] = useState('');
  const [editingLoc, setEditingLoc] = useState(null); // id or 'new'
  const [locForm, setLocForm] = useState({ name: '' });
  const [locSaving, setLocSaving] = useState(false);
  const [locError, setLocError] = useState('');

  // System Logs (admin only)
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsErrorsOnly, setLogsErrorsOnly] = useState(false);
  const [logsSearch, setLogsSearch] = useState('');
  const [expandedLog, setExpandedLog] = useState(null);

  const loadLogs = () => {
    setLogsLoading(true);
    api.get('/admin/logs', { params: { errorsOnly: logsErrorsOnly, search: logsSearch || undefined } })
      .then(r => setLogs(r.data))
      .catch(logError)
      .finally(() => setLogsLoading(false));
  };

  useEffect(() => {
    if (openSections.logs) loadLogs();
  }, [openSections.logs, logsErrorsOnly]); // eslint-disable-line

  const CATEGORIES = [
    'body_protection','documentation_safety_signage','fall_protection',
    'general_safety','maintenance_tools','testing_measuring'
  ];
  const CATEGORY_LABELS = {
    body_protection: 'Body Protection',
    documentation_safety_signage: 'Documentation & Safety Signage',
    fall_protection: 'Fall Protection & Rescue Equipment',
    general_safety: 'General Safety',
    maintenance_tools: 'Maintenance Tools & Equipment',
    testing_measuring: 'Testing & Measuring Instruments',
  };

  const openEdit = (p) => { setEditingPpe(p.id); setPpeForm({ ...p }); };
  const openNew = () => { setEditingPpe('new'); setPpeForm({ name:'', category:'body_protection', has_size:false, size_type:'clothing', sort_order:99, is_active:true, needs_pda:false }); };
  const cancelEdit = () => { setEditingPpe(null); setPpeForm({}); };
  const deletePpe = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete('/ppe/' + id);
      setPpeItems(prev => prev.filter(p => p.id !== id));
    } catch(e) { alert('Delete failed'); }
  };

  const savePpe = async () => {
    setPpeSaving(true);
    try {
      if (editingPpe === 'new') {
        const r = await api.post('/ppe', ppeForm);
        setPpeItems(prev => [...prev, r.data]);
      } else {
        const r = await api.put('/ppe/' + editingPpe, ppeForm);
        setPpeItems(prev => prev.map(p => p.id === editingPpe ? r.data : p));
      }
      cancelEdit();
    } catch(e) { alert('Save failed'); }
    setPpeSaving(false);
  };
  const [showAddUser, setShowAddUser] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'ehs_officer', is_active: true, profile_picture: null, project_access: [], page_access: [], client_access: [], must_reset_password: false });
  const [preview, setPreview] = useState(null);
  const [allProjects, setAllProjects] = useState([]);
  const [allClients, setAllClients] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef();

  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data)).catch(logError);
    api.get('/employees?status=active').then(r => {
      const projects = [...new Set(r.data.map(e => e.project).filter(Boolean))].sort();
      setAllProjects(projects);
      const clients = [...new Set(r.data.map(e => e.client).filter(Boolean))].sort();
      setAllClients(clients);
    }).catch(logError);
    api.get('/ppe').then(r => setPpeItems(r.data)).catch(logError);
    api.get('/locations').then(r => setLocations(r.data)).catch(logError);
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setForm(p => ({ ...p, profile_picture: reader.result }));
      setPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    setError(''); setSuccess('');
    try {
      if (editUser) {
        const res = await api.put(`/users/${editUser.id}`, form);
        setUsers(prev => prev.map(u => u.id === editUser.id ? res.data : u));
        setSuccess('User updated!');
      } else {
        const res = await api.post('/users', form);
        setUsers(prev => [res.data, ...prev]);
        setSuccess('User created!');
      }
      setShowAddUser(false);
      setEditUser(null);
      setForm({ full_name: '', email: '', password: '', role: 'ehs_officer', is_active: true, profile_picture: null, project_access: [], page_access: [], client_access: [], must_reset_password: false });
      setPreview(null);
    } catch(e) {
      setError(e.response?.data?.error || 'Failed');
    }
  };

  const toggleActive = async (user) => {
    const res = await api.put(`/users/${user.id}`, { ...user, password: '' });
    setUsers(prev => prev.map(u => u.id === user.id ? {...u, is_active: res.data.is_active} : u));
  };

  const unlockUser = async (user) => {
    const res = await api.put(`/users/${user.id}/unlock`);
    setUsers(prev => prev.map(u => u.id === user.id ? {...u, failed_login_attempts: res.data.failed_login_attempts, locked_until: res.data.locked_until} : u));
  };

  const forcePasswordResetAll = async () => {
    if (!window.confirm('Require all other users to change their password the next time they log in?')) return;
    try {
      const res = await api.post('/admin/force-password-reset');
      alert(`${res.data.count} user(s) will be required to set a new password on next login.`);
      api.get('/users').then(r => setUsers(r.data)).catch(logError);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to force password reset');
    }
  };

  const startEdit = (user) => {
    setEditUser(user);
    setForm({ full_name: user.full_name, email: user.email, password: '', role: user.role, is_active: user.is_active, profile_picture: user.profile_picture, project_access: user.project_access || [], page_access: user.page_access || [], client_access: user.client_access || [], must_reset_password: user.must_reset_password || false });
    setPreview(user.profile_picture || null);
    setShowAddUser(true);
  };

  const ROLE_TAG = {
    admin: <span className="tag tag-amber">Admin</span>,
    ehs_manager: <span className="tag tag-teal">EHS Manager</span>,
    ehs_officer: <span className="tag tag-teal">EHS Officer</span>,
    supervisor: <span className="tag tag-navy">Supervisor</span>,
    scm_officer: <span className="tag tag-gray">SCM Officer</span>,
    project_director: <span className="tag tag-purple">Project Director</span>,
  };

  const Avatar = ({ user, size = 32 }) => {
    const initials = user.full_name?.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase() || '?';
    if (user.profile_picture) {
      return <img src={user.profile_picture} alt={user.full_name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
    }
    return <div className="avatar av-teal" style={{ width: size, height: size, fontSize: size * 0.35 }}>{initials}</div>;
  };

  const toggleUserSort = (key) => {
    setUserSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  const getUserSortValue = (u, key) => {
    switch (key) {
      case 'full_name': return (u.full_name || '').toLowerCase();
      case 'email': return (u.email || '').toLowerCase();
      case 'role': return (u.role || '').toLowerCase();
      case 'project_access': return u.project_access?.length || 0;
      case 'client_access': return u.client_access?.length || 0;
      case 'last_login': return u.last_login ? new Date(u.last_login).getTime() : -1;
      case 'status': return u.is_active ? 1 : 0;
      default: return 0;
    }
  };

  const compareUsers = (a, b) => {
    if (!userSort.key) return 0;
    const av = getUserSortValue(a, userSort.key);
    const bv = getUserSortValue(b, userSort.key);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return userSort.dir === 'asc' ? cmp : -cmp;
  };

  const SortTh = ({ label, sortKey, style }) => (
    <th style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }} onClick={() => toggleUserSort(sortKey)}>
      {label}
      <span style={{ marginLeft: 4, fontSize: 10, color: userSort.key === sortKey ? '#1D9E75' : '#c0c5cc' }}>
        {userSort.key === sortKey ? (userSort.dir === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    </th>
  );

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Admin Panel</span>
        </div>
      </div>
      <div className="content">

        {/* User Management */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header" style={{ cursor:'pointer' }} onClick={() => toggleSection('users')}>
            <span className="card-title">User Management</span>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {openSections.users && <button className="btn btn-secondary" style={{ fontSize:13 }} onClick={e => { e.stopPropagation(); forcePasswordResetAll(); }}>Force Password Reset (All)</button>}
              {openSections.users && <button className="btn btn-primary" onClick={e => { e.stopPropagation(); setShowAddUser(true); setEditUser(null); setForm({ full_name: '', email: '', password: '', role: 'ehs_officer', is_active: true, profile_picture: null, project_access: [], page_access: [], client_access: [], must_reset_password: false }); setPreview(null); setError(''); }}>+ Add User</button>}
              <span style={{ fontSize:18, color:'#6b7280' }}>{openSections.users ? '▲' : '▼'}</span>
            </div>
          </div>
          {openSections.users && <><div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <input className="form-input" style={{ height:32, padding:'4px 10px', fontSize:13, width:220 }} placeholder="Search name..." value={userSearch} onChange={e=>setUserSearch(e.target.value)} />
            <select className="form-input" style={{ height:32, padding:'4px 10px', fontSize:13, width:180 }} value={userRoleFilter} onChange={e=>setUserRoleFilter(e.target.value)}>
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="ehs_manager">EHS Manager</option>
              <option value="ehs_officer">EHS Officer</option>
              <option value="supervisor">Supervisor</option>
              <option value="scm_officer">SCM Officer</option>
              <option value="project_director">Project Director</option>
            </select>
            {(userSearch||userRoleFilter) && <button className="btn btn-secondary" style={{ fontSize:12, height:32 }} onClick={()=>{setUserSearch('');setUserRoleFilter('');}}>✕ Clear</button>}
          </div>

          {showAddUser && (
            <div style={{ padding: 18, borderBottom: '0.5px solid #e5e7eb', background: '#f9fafb' }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>{editUser ? 'Edit User' : 'New User'}</div>
              {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}
              {success && <div style={{ background: '#EAF3DE', color: '#3B6D11', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{success}</div>}

              {/* Profile Picture Upload */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div onClick={() => fileRef.current.click()} style={{ cursor: 'pointer', position: 'relative' }}>
                  {preview
                    ? <img src={preview} alt="preview" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid #1D9E75' }} />
                    : <div className="avatar av-teal" style={{ width: 64, height: 64, fontSize: 22 }}>📷</div>
                  }
                  <div style={{ position: 'absolute', bottom: 0, right: 0, background: '#1D9E75', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'white' }}>+</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Profile Picture</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Click to upload (JPG, PNG)</div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input className="form-input" value={form.full_name} onChange={e => setForm(p => ({...p, full_name: e.target.value}))} placeholder="Full name" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} placeholder="email@egypro.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">{editUser ? 'New Password (leave blank to keep)' : 'Password'}</label>
                  <PasswordInput value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} placeholder="••••••••" />
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>At least 12 characters, with uppercase, lowercase, a number, and a special character.</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-select" value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))}>
                    <option value="ehs_officer">EHS Officer</option>
                    <option value="ehs_manager">EHS Manager</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="scm_officer">SCM Officer</option>
                    <option value="project_director">Project Director</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              {['ehs_officer','supervisor','scm_officer','project_director','ehs_manager'].includes(form.role) && (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Project Access <span style={{fontSize:11,color:'#6b7280'}}>(leave empty = no access)</span></label>
                  <div style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:'8px 10px', maxHeight:180, overflowY:'auto', background:'white' }}>
                    <label style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0 8px', fontSize:13, cursor:'pointer', borderBottom:'1px solid #e5e7eb', marginBottom:4 }}>
                      <input type="checkbox" style={{ accentColor:'#1D9E75' }}
                        checked={(form.project_access||[]).length === allProjects.length && allProjects.length > 0}
                        onChange={e => setForm(prev => ({ ...prev, project_access: e.target.checked ? [...allProjects] : [] }))}
                      />
                      <span style={{fontWeight:600,color:'#0f2a4a'}}>All Projects</span>
                    </label>
                    {allProjects.map(p => (
                      <label key={p} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', fontSize:13, cursor:'pointer' }}>
                        <input type="checkbox" style={{ accentColor:'#1D9E75' }}
                          checked={(form.project_access||[]).includes(p)}
                          onChange={e => setForm(prev => ({
                            ...prev,
                            project_access: e.target.checked
                              ? [...(prev.project_access||[]), p]
                              : (prev.project_access||[]).filter(x => x !== p)
                          }))}
                        />
                        {p}
                      </label>
                    ))}
                    {allProjects.length === 0 && <div style={{fontSize:12,color:'#9ca3af'}}>No projects found</div>}
                  </div>
                  {(form.project_access||[]).length > 0 && (
                    <div style={{fontSize:11,color:'#1D9E75',marginTop:4}}>{(form.project_access||[]).length} project(s) selected</div>
                  )}
                </div>
              )}
                {['ehs_officer','supervisor','scm_officer','project_director','ehs_manager'].includes(form.role) && (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Client Access <span style={{fontSize:11,color:'#6b7280'}}>(leave empty = no access)</span></label>
                  <div style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:'8px 10px', maxHeight:180, overflowY:'auto', background:'white' }}>
                    <label style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0 8px', fontSize:13, cursor:'pointer', borderBottom:'1px solid #e5e7eb', marginBottom:4 }}>
                      <input type="checkbox" style={{ accentColor:'#1D9E75' }}
                        checked={(form.client_access||[]).length === allClients.length && allClients.length > 0}
                        onChange={e => setForm(prev => ({ ...prev, client_access: e.target.checked ? [...allClients] : [] }))}
                      />
                      <span style={{fontWeight:600,color:'#0f2a4a'}}>All Clients</span>
                    </label>
                    {allClients.map(c => (
                      <label key={c} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', fontSize:13, cursor:'pointer' }}>
                        <input type="checkbox" style={{ accentColor:'#1D9E75' }}
                          checked={(form.client_access||[]).includes(c)}
                          onChange={e => setForm(prev => ({
                            ...prev,
                            client_access: e.target.checked
                              ? [...(prev.client_access||[]), c]
                              : (prev.client_access||[]).filter(x => x !== c)
                          }))}
                        />
                        {c}
                      </label>
                    ))}
                    {allClients.length === 0 && <div style={{fontSize:12,color:'#9ca3af'}}>No clients found</div>}
                  </div>
                  {(form.client_access||[]).length > 0 && (
                    <div style={{fontSize:11,color:'#1D9E75',marginTop:4}}>{(form.client_access||[]).length} client(s) selected</div>
                  )}
                </div>
              )}
              {form.role !== 'admin' && (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Page Access <span style={{fontSize:11,color:'#6b7280'}}>(leave empty = no access)</span></label>
                  <div style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:'8px 10px', maxHeight:180, overflowY:'auto', background:'white' }}>
                    <label style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0 8px', fontSize:13, cursor:'pointer', borderBottom:'1px solid #e5e7eb', marginBottom:4 }}>
                      <input type="checkbox" style={{ accentColor:'#1D9E75' }}
                        checked={(form.page_access||[]).length === ALL_PAGES.length}
                        onChange={e => setForm(prev => ({ ...prev, page_access: e.target.checked ? ALL_PAGES.map(p=>p.key) : [] }))}
                      />
                      <span style={{fontWeight:600,color:'#0f2a4a'}}>All Pages</span>
                    </label>
                    {ALL_PAGES.map(p => (
                      <label key={p.key} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', fontSize:13, cursor:'pointer' }}>
                        <input type="checkbox" style={{ accentColor:'#1D9E75' }}
                          checked={(form.page_access||[]).includes(p.key)}
                          onChange={e => setForm(prev => ({
                            ...prev,
                            page_access: e.target.checked
                              ? [...(prev.page_access||[]), p.key]
                              : (prev.page_access||[]).filter(x => x !== p.key)
                          }))}
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                  {(form.page_access||[]).length > 0 && (
                    <div style={{fontSize:11,color:'#1D9E75',marginTop:4}}>{(form.page_access||[]).length} page(s) selected</div>
                  )}
                </div>
              )}
              {editUser && (
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer', marginBottom:16 }}>
                  <input type="checkbox" style={{ accentColor:'#1D9E75' }}
                    checked={!!form.must_reset_password}
                    onChange={e => setForm(prev => ({ ...prev, must_reset_password: e.target.checked }))}
                  />
                  Require password reset on next login
                </label>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={handleSubmit}>{editUser ? 'Save Changes' : 'Create User'}</button>
                <button className="btn" onClick={() => { setShowAddUser(false); setEditUser(null); setError(''); setPreview(null); }}>Cancel</button>
              </div>
            </div>
          )}

          <table>
            <thead><tr>
              <SortTh label="User" sortKey="full_name" />
              <SortTh label="Email" sortKey="email" />
              <SortTh label="Role" sortKey="role" />
              <SortTh label="Project Access" sortKey="project_access" />
              <SortTh label="Client Access" sortKey="client_access" />
              <SortTh label="Last Login" sortKey="last_login" />
              <SortTh label="Status" sortKey="status" />
              <th>Actions</th>
            </tr></thead>
            <tbody>
              {users.filter(u => (!userSearch || u.full_name?.toLowerCase().includes(userSearch.toLowerCase())) && (!userRoleFilter || u.role === userRoleFilter)).sort(compareUsers).map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="emp-cell">
                      <Avatar user={u} size={64} />
                      <span style={{ fontWeight: 500 }}>{u.full_name}</span>
                    </div>
                  </td>
                  <td style={{ color: '#6b7280', fontSize: 12 }}>{u.email}</td>
                  <td>{ROLE_TAG[u.role] || <span className="tag tag-gray">{u.role}</span>}</td>
                  <td style={{fontSize:12,color:'#6b7280'}}>
                    {['ehs_officer','supervisor','scm_officer','project_director','ehs_manager'].includes(u.role)
                      ? (u.project_access?.length > 0 ? (u.project_access.length === allProjects.length && allProjects.length > 0 ? <span style={{color:'#1D9E75'}}>All Projects</span> : u.project_access.join(', ')) : <span style={{color:'#e53e3e'}}>No access</span>)
                      : <span style={{color:'#9ca3af'}}>All projects</span>}
                  </td>
                  <td style={{fontSize:12,color:'#6b7280'}}>
                    {['ehs_officer','supervisor','scm_officer','project_director','ehs_manager'].includes(u.role)
                      ? (u.client_access?.length > 0 ? (u.client_access.length === allClients.length && allClients.length > 0 ? <span style={{color:'#1D9E75'}}>All Clients</span> : u.client_access.join(', ')) : <span style={{color:'#e53e3e'}}>No access</span>)
                      : <span style={{color:'#9ca3af'}}>All clients</span>}
                  </td>
                  <td style={{fontSize:12,color:'#6b7280',whiteSpace:'nowrap'}}>
                    {u.last_login ? new Date(u.last_login).toLocaleString('en-GB') : <span style={{color:'#9ca3af'}}>Never</span>}
                  </td>
                  <td>
                    <span className={`tag ${u.is_active ? 'tag-green' : 'tag-red'}`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                    {u.must_reset_password && <span className="tag tag-amber" style={{ marginLeft: 4 }}>Reset Pending</span>}
                    {u.locked_until && new Date(u.locked_until) > new Date() && <span className="tag tag-red" style={{ marginLeft: 4 }}>Locked</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => startEdit(u)}>Edit</button>
                      <button className="btn btn-sm" onClick={() => toggleActive(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</button>
                      {u.locked_until && new Date(u.locked_until) > new Date() && <button className="btn btn-sm" onClick={() => unlockUser(u)}>Unlock</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>}
        </div>

        {/* PPE Config */}
        <div className="card">
          <div className="card-header" style={{ cursor:'pointer' }} onClick={() => toggleSection('ppe')}>
            <span className="card-title">PPE Checklist Configuration</span>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {openSections.ppe && <button className="btn btn-primary" style={{ fontSize:13, padding:'6px 14px' }} onClick={e => { e.stopPropagation(); openNew(); }}>+ Add Item</button>}
              <span style={{ fontSize:18, color:'#6b7280' }}>{openSections.ppe ? '▲' : '▼'}</span>
            </div>
          </div>

          {openSections.ppe && <>
          {editingPpe && (
            <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:16, margin:'0 0 16px 0' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:'#64748b', display:'block', marginBottom:4 }}>Item Name</label>
                  <input className="form-input" value={ppeForm.name || ''} onChange={e => setPpeForm(f=>({...f, name:e.target.value}))} placeholder="e.g. Safety Helmet (Yellow)" />
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:'#64748b', display:'block', marginBottom:4 }}>Category</label>
                  <select className="form-input" value={ppeForm.category || ''} onChange={e => setPpeForm(f=>({...f, category:e.target.value}))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:'#64748b', display:'block', marginBottom:4 }}>Sort Order</label>
                  <input className="form-input" type="number" value={ppeForm.sort_order || 99} onChange={e => setPpeForm(f=>({...f, sort_order:parseInt(e.target.value)}))} />
                </div>
                <div style={{ display:'flex', gap:24, alignItems:'center', paddingTop:20 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                    <input type="checkbox" checked={!!ppeForm.has_size} onChange={e => setPpeForm(f=>({...f, has_size:e.target.checked}))} style={{ accentColor:'#1D9E75' }} />
                    Has Size
                  </label>
                  {ppeForm.has_size && (
                    <select className="form-input" style={{ width:'auto' }} value={ppeForm.size_type || 'clothing'} onChange={e => setPpeForm(f=>({...f, size_type:e.target.value}))}>
                      <option value="clothing">S–XXXL</option>
                      <option value="shoe">38–46</option>
                      <option value="harness">S–XL</option>
                    </select>
                  )}
                  <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                    <input type="checkbox" checked={!!ppeForm.is_active} onChange={e => setPpeForm(f=>({...f, is_active:e.target.checked}))} style={{ accentColor:'#1D9E75' }} />
                    Active
                  </label>
                  <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                    <input type="checkbox" checked={!!ppeForm.needs_pda} onChange={e => setPpeForm(f=>({...f, needs_pda:e.target.checked}))} style={{ accentColor:'#1D9E75' }} />
                    Needs PDA
                  </label>
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary" style={{ fontSize:13 }} onClick={savePpe} disabled={ppeSaving}>{ppeSaving ? 'Saving...' : 'Save'}</button>
                <button className="btn btn-secondary" style={{ fontSize:13 }} onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <input className="form-input" style={{ height:32, padding:'4px 10px', fontSize:13, width:220 }} placeholder="Search PPE/Tool Item..." value={ppeSearch} onChange={e=>setPpeSearch(e.target.value)} />
            <select className="form-input" style={{ height:32, padding:'4px 10px', fontSize:13, width:200 }} value={ppeCategoryFilter} onChange={e=>setPpeCategoryFilter(e.target.value)}>
              <option value="">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>)}
            </select>
            {(ppeSearch||ppeCategoryFilter) && <button className="btn btn-secondary" style={{ fontSize:12, height:32 }} onClick={()=>{setPpeSearch('');setPpeCategoryFilter('');}}>✕ Clear</button>}
          </div>
          <table>
            <thead><tr><th>PPE/Tool Item</th><th>Category</th><th>Size</th><th>Active</th><th>PDA</th><th></th></tr></thead>
            <tbody>
              {ppeItems.filter(p => (!ppeSearch || p.name.toLowerCase().includes(ppeSearch.toLowerCase())) && (!ppeCategoryFilter || p.category === ppeCategoryFilter)).map(p => (
                <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.45 }}>
                  <td>{p.name}</td>
                  <td><span className="tag tag-gray" style={{ fontSize:10 }}>{CATEGORY_LABELS[p.category] || p.category}</span></td>
                  <td>{p.has_size ? <span className="tag tag-teal" style={{ fontSize:10 }}>{p.size_type === 'shoe' ? '38–46' : p.size_type === 'harness' ? 'S–XL' : 'S–XXXL'}</span> : '—'}</td>
                  <td>{p.is_active ? <span className="tag tag-green" style={{ fontSize:10 }}>Active</span> : <span className="tag tag-gray" style={{ fontSize:10 }}>Inactive</span>}</td>
                  <td>{p.needs_pda ? <span className="tag tag-teal" style={{ fontSize:10 }}>Required</span> : '—'}</td>
                  <td style={{display:'flex',gap:6}}><button className="btn btn-secondary" style={{ fontSize:12, padding:'4px 10px' }} onClick={() => openEdit(p)}>Edit</button><button className="btn btn-secondary" style={{ fontSize:12, padding:'4px 10px', color:'#e53e3e' }} onClick={() => deletePpe(p.id, p.name)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          </>}
        </div>

        {/* Locations */}
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header" style={{ cursor:'pointer' }} onClick={() => toggleSection('locations')}>
            <span className="card-title">Locations</span>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {openSections.locations && <button className="btn btn-primary" style={{ fontSize:13, padding:'6px 14px' }} onClick={e => { e.stopPropagation(); setEditingLoc('new'); setLocForm({ name:'' }); setLocError(''); }}>+ Add Location</button>}
              <span style={{ fontSize:18, color:'#6b7280' }}>{openSections.locations ? '▲' : '▼'}</span>
            </div>
          </div>

          {openSections.locations && <>
          {editingLoc && (
            <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:16, margin:'0 0 16px 0' }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>{editingLoc === 'new' ? 'New Location' : 'Edit Location'}</div>
              {locError && <div style={{ background:'#FCEBEB', color:'#A32D2D', padding:'8px 12px', borderRadius:6, marginBottom:10, fontSize:13 }}>{locError}</div>}
              <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
                <div className="form-group" style={{ margin:0, flex:1 }}>
                  <label className="form-label">Location Name</label>
                  <input className="form-input" value={locForm.name} onChange={e => setLocForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Nairobi" />
                </div>
                <button className="btn btn-primary" style={{ fontSize:13 }} disabled={locSaving} onClick={async () => {
                  if (!locForm.name.trim()) { setLocError('Name is required'); return; }
                  setLocSaving(true); setLocError('');
                  try {
                    if (editingLoc === 'new') {
                      const r = await api.post('/locations', locForm);
                      setLocations(prev => [...prev, r.data].sort((a,b) => a.name.localeCompare(b.name)));
                    } else {
                      const r = await api.put('/locations/' + editingLoc, locForm);
                      setLocations(prev => prev.map(l => l.id === editingLoc ? r.data : l));
                    }
                    setEditingLoc(null); setLocForm({ name: '' });
                  } catch(e) { setLocError(e.response?.data?.error || 'Save failed'); }
                  setLocSaving(false);
                }}>{locSaving ? 'Saving...' : 'Save'}</button>
                <button className="btn btn-secondary" style={{ fontSize:13 }} onClick={() => { setEditingLoc(null); setLocForm({ name:'' }); setLocError(''); }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ marginBottom:12 }}>
            <input className="form-input" style={{ height:32, padding:'4px 10px', fontSize:13, width:220 }}
              placeholder="Search locations..." value={locSearch} onChange={e => setLocSearch(e.target.value)} />
          </div>

          <table>
            <thead><tr><th>Location Name</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {locations.filter(l => !locSearch || l.name.toLowerCase().includes(locSearch.toLowerCase())).map(l => (
                <tr key={l.id}>
                  <td style={{ fontWeight:500 }}>{l.name}</td>
                  <td><span className={`tag ${l.active ? 'tag-green' : 'tag-gray'}`} style={{ fontSize:10 }}>{l.active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <div style={{ display:'flex', gap:6 }}>
                      <button className="btn btn-secondary" style={{ fontSize:12, padding:'4px 10px' }}
                        onClick={() => { setEditingLoc(l.id); setLocForm({ name: l.name }); setLocError(''); }}>Edit</button>
                      <button className="btn btn-secondary" style={{ fontSize:12, padding:'4px 10px' }}
                        onClick={async () => {
                          const newActive = !l.active;
                          try {
                            const r = await api.put('/locations/' + l.id, { active: newActive });
                            setLocations(prev => prev.map(x => x.id === l.id ? r.data : x));
                          } catch(e) { alert('Failed to update'); }
                        }}>{l.active ? 'Deactivate' : 'Activate'}</button>
                      <button className="btn btn-secondary" style={{ fontSize:12, padding:'4px 10px', color:'#e53e3e' }}
                        onClick={async () => {
                          if (!window.confirm(`Delete "${l.name}"?`)) return;
                          try {
                            await api.delete('/locations/' + l.id);
                            setLocations(prev => prev.filter(x => x.id !== l.id));
                          } catch(e) { alert(e.response?.data?.error || 'Delete failed'); }
                        }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>}
        </div>

        {/* System Logs */}
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header" style={{ cursor:'pointer' }} onClick={() => toggleSection('logs')}>
            <span className="card-title">System Logs</span>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {openSections.logs && <button className="btn btn-secondary" style={{ fontSize:13 }} onClick={e => { e.stopPropagation(); loadLogs(); }}>{logsLoading ? 'Loading...' : 'Refresh'}</button>}
              <span style={{ fontSize:18, color:'#6b7280' }}>{openSections.logs ? '▲' : '▼'}</span>
            </div>
          </div>
          {openSections.logs && <>
            <div style={{ display:'flex', gap:8, marginBottom:12, alignItems:'center' }}>
              <input className="form-input" style={{ height:32, padding:'4px 10px', fontSize:13, width:260 }}
                placeholder="Search endpoint, IP, or user email..." value={logsSearch}
                onChange={e=>setLogsSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') loadLogs(); }}
              />
              <button className="btn btn-secondary" style={{ fontSize:12, height:32 }} onClick={loadLogs}>Search</button>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                <input type="checkbox" style={{ accentColor:'#1D9E75' }} checked={logsErrorsOnly} onChange={e => setLogsErrorsOnly(e.target.checked)} />
                Errors only
              </label>
              <span style={{ fontSize:12, color:'#6b7280' }}>{logs.length} log(s) &middot; last 30 days retained</span>
            </div>
            <table>
              <thead><tr><th>Time</th><th>User</th><th>Endpoint</th><th>IP</th><th>Status</th><th>Duration</th></tr></thead>
              <tbody>
                {logs.map(l => (
                  <React.Fragment key={l.id}>
                    <tr
                      style={{ cursor: l.error_detail ? 'pointer' : 'default' }}
                      onClick={() => l.error_detail && setExpandedLog(expandedLog === l.id ? null : l.id)}
                    >
                      <td style={{fontSize:12,color:'#6b7280',whiteSpace:'nowrap'}}>{new Date(l.created_at).toLocaleString('en-GB')}</td>
                      <td style={{fontSize:12}}>{l.user_name || <span style={{color:'#9ca3af'}}>—</span>}{l.user_email && <div style={{fontSize:10,color:'#6b7280'}}>{l.user_email}</div>}</td>
                      <td style={{fontSize:12,fontFamily:'monospace'}}>{l.endpoint}</td>
                      <td style={{fontSize:12,color:'#6b7280'}}>{l.ip}</td>
                      <td>
                        <span className={`tag ${l.status_code >= 500 ? 'tag-red' : l.status_code >= 400 ? 'tag-amber' : 'tag-green'}`} style={{fontSize:10}}>{l.status_code}</span>
                        {l.error_detail && <span style={{fontSize:10,color:'#e53e3e',marginLeft:6}}>▸ error</span>}
                      </td>
                      <td style={{fontSize:12,color:'#6b7280'}}>{l.duration_ms}ms</td>
                    </tr>
                    {expandedLog === l.id && l.error_detail && (
                      <tr>
                        <td colSpan={6} style={{ background:'#f9fafb', fontFamily:'monospace', fontSize:11, whiteSpace:'pre-wrap', padding:'8px 12px', color:'#A32D2D' }}>
                          {l.error_detail}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {logs.length === 0 && !logsLoading && <tr><td colSpan={6} style={{fontSize:12,color:'#9ca3af',textAlign:'center',padding:16}}>No logs found</td></tr>}
              </tbody>
            </table>
          </>}
        </div>

      </div>
    </>
  );
}
