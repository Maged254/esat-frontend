import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { logError } from '../utils/api';

// Statuses that count as an "open" request -- must match the partial unique
// index on the backend (one_open_training_request_employee), so the list of
// outstanding requests shown here is exactly what would block a duplicate.
const OPEN_STATUSES = 'requested,scheduled,pending';

export default function RequestTrainingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  const [employees, setEmployees] = useState([]);
  const [empPage, setEmpPage] = useState(1);
  const [empTotal, setEmpTotal] = useState(0);
  const empPageSize = 25;
  const [empFilterOptions, setEmpFilterOptions] = useState({ projects: [], departments: [], clients: [] });
  const [selectedPerson, setSelectedPerson] = useState(null);

  const [courses, setCourses] = useState([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState([]); // multi-select
  const [openRequests, setOpenRequests] = useState([]);
  const [loadingOpen, setLoadingOpen] = useState(false);

  const [personSearch, setPersonSearch] = useState('');
  const [personNationalId, setPersonNationalId] = useState('');
  const [personJobTitle, setPersonJobTitle] = useState('');
  const [personFilters, setPersonFilters] = useState({ resource_type: '', department: '', project: '', client: '' });

  const [validationErrors, setValidationErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const [currentUserName, setCurrentUserName] = useState('');

  useEffect(() => {
    api.get('/training-courses').then(r => setCourses(r.data)).catch(logError);
    api.get('/employees/filter-options').then(r => setEmpFilterOptions(r.data)).catch(logError);
    try {
      const user = JSON.parse(localStorage.getItem('esat_user'));
      if (user) setCurrentUserName(user.full_name || user.name || '');
    } catch {}
  }, []);

  const empFilterParams = () => {
    const params = new URLSearchParams();
    // Always active -- training can only be requested for an active employee
    // (the backend rejects non-active), so don't even offer the others.
    params.append('status', 'active');
    if (personSearch) params.append('search', personSearch);
    if (personNationalId) params.append('national_id', personNationalId);
    if (personJobTitle) params.append('job_title', personJobTitle);
    if (personFilters.resource_type) params.append('resource_type', personFilters.resource_type);
    if (personFilters.department) params.append('department', personFilters.department);
    if (personFilters.project) params.append('project', personFilters.project);
    if (personFilters.client) params.append('client', personFilters.client);
    return params;
  };

  useEffect(() => {
    const params = empFilterParams();
    params.append('page', empPage);
    params.append('pageSize', empPageSize);
    api.get('/employees?' + params).then(r => { setEmployees(r.data.rows); setEmpTotal(r.data.total); }).catch(logError);
  }, [personSearch, personNationalId, personJobTitle, personFilters, empPage]);

  useEffect(() => { setEmpPage(1); }, [personSearch, personNationalId, personJobTitle, personFilters]);

  const loadOpenRequests = async (employeeId) => {
    setLoadingOpen(true);
    try {
      const res = await api.get(`/training-records?employee_id=${employeeId}&status=${OPEN_STATUSES}`);
      setOpenRequests(res.data);
    } catch {
      setOpenRequests([]);
    } finally {
      setLoadingOpen(false);
    }
  };

  const selectPerson = async (person) => {
    setSelectedPerson(person);
    setSelectedCourseIds([]);
    setValidationErrors([]);
    setSuccessMsg('');
    await loadOpenRequests(person.id);
    setStep(2);
  };

  // Course ids the employee already has an open request for -- these can't be
  // requested again, so they're shown ticked-off and disabled in the checklist.
  const openCourseIds = new Set(openRequests.map(r => r.course_id));

  const toggleCourse = (id) => {
    setValidationErrors([]);
    setSelectedCourseIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const courseName = (id) => courses.find(c => c.id === id)?.name || 'training';

  const handleSubmit = async () => {
    if (!selectedPerson) return;
    if (selectedCourseIds.length === 0) {
      setValidationErrors(['Please select at least one training to request.']);
      return;
    }
    setValidationErrors([]);
    setSuccessMsg('');
    setSubmitting(true);
    try {
      // One request per course. allSettled so one failure (e.g. a race on the
      // duplicate-open constraint) doesn't discard the others.
      const results = await Promise.allSettled(
        selectedCourseIds.map(id =>
          api.post('/training-requests', { employee_id: selectedPerson.id, course_id: id })
            .then(() => ({ id }))
            .catch(err => { throw { id, error: err.response?.data?.error || 'Failed' }; })
        )
      );
      const ok = results.filter(r => r.status === 'fulfilled').map(r => r.value.id);
      const failed = results.filter(r => r.status === 'rejected').map(r => r.reason);
      if (ok.length) {
        setSuccessMsg(`Requested ${ok.length} training${ok.length === 1 ? '' : 's'} for ${selectedPerson.full_name}: ${ok.map(courseName).join(', ')}.`);
        setTimeout(() => setSuccessMsg(''), 4000);
      }
      if (failed.length) {
        setValidationErrors(failed.map(f => `${courseName(f.id)}: ${f.error}`));
      }
      setSelectedCourseIds([]);
      await loadOpenRequests(selectedPerson.id);
    } catch (e) {
      setValidationErrors(['Failed to submit requests. Please try again.']);
    } finally {
      setSubmitting(false);
    }
  };

  const empTotalPages = Math.max(Math.ceil(empTotal / empPageSize), 1);

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Request a Training</span>
        </div>
        <div className="topbar-right">
          <button className="btn" onClick={() => navigate(-1)}>✕ Cancel</button>
          {step === 2 && (
            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting || selectedCourseIds.length === 0}>
              ✓ {submitting ? 'Submitting...' : selectedCourseIds.length > 0 ? `Submit ${selectedCourseIds.length} Request${selectedCourseIds.length === 1 ? '' : 's'}` : 'Submit Request'}
            </button>
          )}
        </div>
      </div>

      <div className="content graphs-content">
        {successMsg && (
          <div style={{ background: '#EAF3DE', color: '#3B6D11', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            ✓ {successMsg}
          </div>
        )}

        {step === 1 && (
          <>
          <div className="card" style={{ marginBottom: 24, position: 'sticky', top: 'var(--header-h)', zIndex: 40 }}>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', flexShrink: 0, paddingTop: 6 }}>Search</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <input className="form-input" placeholder="Search name..." value={personSearch} onChange={e => setPersonSearch(e.target.value)} style={{height:30,padding:'4px 8px',fontSize:12,width:150}} />
                  <input className="form-input" placeholder="Search national ID..." value={personNationalId} onChange={e => setPersonNationalId(e.target.value)} style={{height:30,padding:'4px 8px',fontSize:12,width:140}} />
                  <input className="form-input" placeholder="Search job title..." value={personJobTitle} onChange={e => setPersonJobTitle(e.target.value)} style={{height:30,padding:'4px 8px',fontSize:12,width:140}} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', flexShrink: 0, paddingTop: 6 }}>Filter</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:120}} value={personFilters.resource_type} onChange={e => setPersonFilters(p => ({ ...p, resource_type: e.target.value }))}>
                    <option value="">All Resources</option><option value="inhouse">Inhouse</option><option value="outsource">Outsource</option><option value="intern">Intern</option>
                  </select>
                  <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} value={personFilters.department} onChange={e => setPersonFilters(p => ({ ...p, department: e.target.value }))}>
                    <option value="">All Departments</option>
                    {empFilterOptions.departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:150}} value={personFilters.project} onChange={e => setPersonFilters(p => ({ ...p, project: e.target.value }))}>
                    <option value="">All Projects</option>
                    {empFilterOptions.projects.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:120}} value={personFilters.client} onChange={e => setPersonFilters(p => ({ ...p, client: e.target.value }))}>
                    <option value="">All Clients</option>
                    {empFilterOptions.clients.map(cl => <option key={cl} value={cl}>{cl}</option>)}
                  </select>
                  <button className="btn" style={{height:30,padding:'4px 12px',fontSize:12}} onClick={() => { setPersonSearch(''); setPersonNationalId(''); setPersonJobTitle(''); setPersonFilters({ resource_type: '', department: '', project: '', client: '' }); }}>✕ Clear</button>
                </div>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Select employee</span>
            </div>
            <table className="table-hover-soft">
              <thead><tr><th>Employee</th><th>Job Title</th><th>Department</th><th>Project</th><th>Client</th><th></th></tr></thead>
              <tbody>
                {employees.map(e => (
                  <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => selectPerson(e)}>
                    <td>
                      <div className="emp-cell">
                        <div>
                          <div className="emp-name">{e.full_name}</div>
                          <div className="emp-id">{e.national_id || e.employee_number}</div>
                        </div>
                      </div>
                    </td>
                    <td>{e.job_title || '—'}</td>
                    <td>{e.department || '—'}</td>
                    <td>{e.project || '—'}</td>
                    <td>{e.client || '—'}</td>
                    <td><button className="btn btn-primary btn-sm">Select →</button></td>
                  </tr>
                ))}
                {!employees.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#6b7280', padding: 32 }}>No employees found</td></tr>}
              </tbody>
            </table>
            {empTotalPages > 1 && (
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 18px',borderTop:'1px solid #e5e7eb'}}>
                <span style={{fontSize:12,color:'#6b7280'}}>{empTotal} employee{empTotal===1?'':'s'} total</span>
                <div style={{display:'flex',gap:4,alignItems:'center'}}>
                  <button className="btn btn-sm" onClick={()=>setEmpPage(p=>Math.max(p-1,1))} disabled={empPage===1}>‹ Prev</button>
                  {Array.from({length: empTotalPages}, (_, i) => i+1)
                    .filter(p => p===1 || p===empTotalPages || Math.abs(p-empPage)<=2)
                    .reduce((acc, p, i, arr) => { if (i>0 && p-arr[i-1]>1) acc.push('…'); acc.push(p); return acc; }, [])
                    .map((p, i) => p==='…'
                      ? <span key={'gap'+i} style={{padding:'0 4px',color:'#9ca3af',fontSize:12}}>…</span>
                      : <button key={p} className="btn btn-sm" onClick={()=>setEmpPage(p)} style={{background:p===empPage?'var(--eg-navy)':'',color:p===empPage?'white':'',fontWeight:p===empPage?700:400}}>{p}</button>
                    )}
                  <button className="btn btn-sm" onClick={()=>setEmpPage(p=>Math.min(p+1,empTotalPages))} disabled={empPage===empTotalPages}>Next ›</button>
                </div>
              </div>
            )}
          </div>
          </>
        )}

        {step === 2 && selectedPerson && (
          <>
            <div style={{ background: '#F0F7FF', outline: '2px solid var(--eg-navy)', boxShadow: 'var(--wf-shadow-hover)', borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontWeight: 600, fontSize: 16, color: '#0f2a4a' }}>{selectedPerson.full_name}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  {[selectedPerson.national_id || selectedPerson.employee_number, selectedPerson.job_title, selectedPerson.department, selectedPerson.client, selectedPerson.project].filter(Boolean).join(' · ')}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Requested by <b style={{ fontWeight: 600, color: '#374151' }}>{currentUserName}</b></div>
              </div>
              <button className="btn btn-sm" onClick={() => { setStep(1); setSelectedPerson(null); setOpenRequests([]); setSelectedCourseIds([]); setValidationErrors([]); }}>Change</button>
            </div>

            {/* ── Current requested trainings for THIS employee ──────── */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <span className="card-title">Currently Requested Trainings</span>
                {!loadingOpen && <span style={{ fontSize: 12, color: '#6b7280' }}>{openRequests.length} open</span>}
              </div>
              {loadingOpen ? (
                <div style={{ padding: 24, fontSize: 13, color: '#9ca3af' }}>Loading…</div>
              ) : openRequests.length === 0 ? (
                <div style={{ padding: 24, fontSize: 13, color: '#9ca3af' }}>No open training requests for this employee.</div>
              ) : (
                <table className="table-hover-soft">
                  <thead><tr><th>Training Type</th><th>Status</th><th>Requested</th><th>Requested by</th></tr></thead>
                  <tbody>
                    {openRequests.map(r => (
                      <tr key={r.id}>
                        <td>{r.course_name}</td>
                        <td><span className="tag" style={{ background: 'var(--wf-pm-light)', color: 'var(--wf-pm)' }}>{r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : ''}</span></td>
                        <td>{r.requested_at ? new Date(r.requested_at).toLocaleDateString('en-GB') : '—'}</td>
                        <td>{r.requested_by_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* ── Pick one or more trainings to request ──────────────── */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Request Training <span style={{ color: '#e24b4a' }}>*</span></span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Tick one or more — already-requested trainings are disabled</span>
              </div>
              {validationErrors.length > 0 && (
                <div style={{ background: '#fcebeb', border: '1px solid #e24b4a', borderRadius: 8, padding: '12px 16px', margin: '12px 16px 0' }}>
                  {validationErrors.map((e, i) => <div key={i} style={{ color: '#c0392b', fontSize: 13, marginBottom: i < validationErrors.length - 1 ? 6 : 0 }}>⚠ {e}</div>)}
                </div>
              )}
              <div style={{ padding: '8px 0' }}>
                {courses.length === 0 && (
                  <div style={{ padding: 24, fontSize: 13, color: '#9ca3af' }}>No training types available.</div>
                )}
                {courses.map(c => {
                  const isOpen = openCourseIds.has(c.id);
                  const checked = selectedCourseIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className={isOpen ? '' : 'table-hover-soft'}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 16px', borderBottom: '0.5px solid #f0f0f0',
                        cursor: isOpen ? 'not-allowed' : 'pointer',
                        opacity: isOpen ? 0.55 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isOpen}
                        onChange={() => toggleCourse(c.id)}
                        style={{ width: 18, height: 18, accentColor: '#1D9E75', flexShrink: 0, cursor: isOpen ? 'not-allowed' : 'pointer' }}
                      />
                      <span style={{ fontSize: 14, color: '#0f2a4a', flex: 1 }}>{c.name}</span>
                      {c.is_credential && <span className="tag" style={{ background: '#eef2f7', color: '#42607f' }}>Credential</span>}
                      {isOpen && <span className="tag" style={{ background: 'var(--wf-pm-light)', color: 'var(--wf-pm)' }}>Already requested</span>}
                    </label>
                  );
                })}
              </div>
              {selectedCourseIds.length > 0 && (
                <div style={{ padding: '12px 16px', borderTop: '0.5px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: '#374151' }}>
                    {selectedCourseIds.length} training{selectedCourseIds.length === 1 ? '' : 's'} selected
                  </span>
                  <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                    ✓ {submitting ? 'Submitting...' : `Submit ${selectedCourseIds.length} Request${selectedCourseIds.length === 1 ? '' : 's'}`}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
