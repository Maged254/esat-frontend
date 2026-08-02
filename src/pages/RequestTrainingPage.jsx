import React, { useEffect, useState } from 'react';
import api, { logError } from '../utils/api';
import TrainingIcon from '../components/TrainingIcon';

// Statuses that count as an "open" request -- must match the partial unique
// index on the backend (one_open_training_request_employee), so the list of
// outstanding requests shown here is exactly what would block a duplicate.
const OPEN_STATUSES = 'requested,scheduled,pending';

export default function RequestTrainingPage() {
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
  const [cancelledRequests, setCancelledRequests] = useState([]);
  const [loadingOpen, setLoadingOpen] = useState(false);

  // Remove-request modal
  const [removeModal, setRemoveModal] = useState(null); // the request being removed
  const [removeReason, setRemoveReason] = useState('');
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');

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
      const [openRes, cancelledRes] = await Promise.all([
        api.get(`/training-records?employee_id=${employeeId}&status=${OPEN_STATUSES}`),
        api.get(`/training-records?employee_id=${employeeId}&status=cancelled`),
      ]);
      setOpenRequests(openRes.data);
      setCancelledRequests(cancelledRes.data);
    } catch {
      setOpenRequests([]);
      setCancelledRequests([]);
    } finally {
      setLoadingOpen(false);
    }
  };

  const openRemove = (r) => { setRemoveModal(r); setRemoveReason(''); setRemoveError(''); };
  const confirmRemove = async () => {
    if (!removeReason.trim()) { setRemoveError('A reason is required.'); return; }
    setRemoving(true); setRemoveError('');
    try {
      await api.put(`/training-records/${removeModal.id}/cancel`, { cancel_reason: removeReason.trim() });
      setRemoveModal(null);
      await loadOpenRequests(selectedPerson.id);
    } catch (e) {
      setRemoveError(e.response?.data?.error || 'Failed to remove request');
    } finally {
      setRemoving(false);
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

  // Course ids the employee already has an OPEN request for. These are dropped
  // from the "Request Training" list entirely (a cancelled one isn't open, so it
  // comes back and can be requested again).
  const openCourseIds = new Set(openRequests.map(r => r.course_id));
  const availableCourses = courses.filter(c => !openCourseIds.has(c.id));

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
          <span className="topbar-title">Request / Remove a Training</span>
        </div>
        <div className="topbar-right">
          {step === 2 && (
            <button className="btn" onClick={() => { setStep(1); setSelectedPerson(null); setOpenRequests([]); setSelectedCourseIds([]); setValidationErrors([]); }}>✕ Cancel</button>
          )}
          {step === 2 && (
            <button className={`btn ${selectedCourseIds.length > 0 ? 'btn-primary' : ''}`} onClick={handleSubmit} disabled={submitting || selectedCourseIds.length === 0} style={selectedCourseIds.length === 0 ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
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
                <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {[
                    ['National ID', selectedPerson.national_id || selectedPerson.employee_number],
                    ['Job Title', selectedPerson.job_title],
                    ['Department', selectedPerson.department],
                    ['Client', selectedPerson.client],
                    ['Project', selectedPerson.project],
                  ].map(([label, value], i, arr) => (
                    <React.Fragment key={label}>
                      <span><span style={{ fontWeight: 600, color: '#374151' }}>{label}:</span> {value || '—'}</span>
                      {i < arr.length - 1 && <span style={{ color: '#cbd5e1' }}>|</span>}
                    </React.Fragment>
                  ))}
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, padding: 16 }}>
                  {openRequests.map(r => (
                    <div key={r.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, background: 'white' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ flexShrink: 0, width: 54, height: 54, borderRadius: 13, background: '#F0F7FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <TrainingIcon iconKey={r.course_icon} name={r.course_name} size={36} color="var(--eg-navy)" />
                        </span>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#0f2a4a', lineHeight: 1.25 }}>{r.course_name}</span>
                      </div>
                      <span className="tag" style={{ alignSelf: 'flex-start', background: 'var(--wf-pm-light)', color: 'var(--wf-pm)' }}>{r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : ''}</span>
                      <div style={{ fontSize: 11, color: '#9ca3af', borderTop: '0.5px solid #f0f0f0', paddingTop: 8 }}>
                        <div>Requested by <b style={{ fontWeight: 600, color: '#6b7280' }}>{r.requested_by_name || '—'}</b></div>
                        <div style={{ marginTop: 2 }}>{r.requested_at ? new Date(r.requested_at).toLocaleDateString('en-GB') : '—'}</div>
                      </div>
                      <button className="btn btn-sm" style={{ color: '#c0392b', borderColor: '#f0c9c6' }} onClick={() => openRemove(r)}>✕ Remove Request</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Removed (cancelled) training requests ──────────────── */}
            {cancelledRequests.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <span className="card-title">Removed Training Requests</span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{cancelledRequests.length} removed</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, padding: 16 }}>
                  {cancelledRequests.map(r => (
                    <div key={r.id} style={{ border: '1px solid #f0dede', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, background: '#fdf7f7' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ flexShrink: 0, width: 54, height: 54, borderRadius: 13, background: '#fbeaea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <TrainingIcon iconKey={r.course_icon} name={r.course_name} size={36} color="#c0392b" />
                        </span>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#0f2a4a', lineHeight: 1.25 }}>{r.course_name}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#374151', borderTop: '0.5px solid #f0dede', paddingTop: 8 }}>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Reason</div>
                        {r.cancel_reason || '—'}
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>
                        Removed by <b style={{ fontWeight: 600, color: '#6b7280' }}>{r.cancelled_by_name || '—'}</b>
                        {r.cancelled_at ? ` · ${new Date(r.cancelled_at).toLocaleDateString('en-GB')}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Pick one or more trainings to request ──────────────── */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Request Training <span style={{ color: '#e24b4a' }}>*</span></span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Tick one or more — trainings with an open request aren't listed</span>
              </div>
              {validationErrors.length > 0 && (
                <div style={{ background: '#fcebeb', border: '1px solid #e24b4a', borderRadius: 8, padding: '12px 16px', margin: '12px 16px 0' }}>
                  {validationErrors.map((e, i) => <div key={i} style={{ color: '#c0392b', fontSize: 13, marginBottom: i < validationErrors.length - 1 ? 6 : 0 }}>⚠ {e}</div>)}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, padding: 16 }}>
                {courses.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#9ca3af' }}>No training types available.</div>
                ) : availableCourses.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#9ca3af' }}>All trainings already have an open request for this employee.</div>
                ) : availableCourses.map(c => {
                  const checked = selectedCourseIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      style={{
                        position: 'relative',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                        textAlign: 'center', padding: '24px 14px 16px', borderRadius: 14,
                        border: `1.5px solid ${checked ? 'var(--eg-navy)' : '#e5e7eb'}`,
                        background: checked ? '#F0F7FF' : 'white',
                        boxShadow: checked ? 'var(--wf-shadow-hover)' : 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCourse(c.id)}
                        style={{ position: 'absolute', top: 12, left: 12, width: 18, height: 18, accentColor: '#1D9E75', cursor: 'pointer' }}
                      />
                      <span style={{ flexShrink: 0, width: 62, height: 62, borderRadius: 16, background: checked ? 'var(--eg-navy)' : '#F0F7FF', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease' }}>
                        <TrainingIcon iconKey={c.icon} name={c.name} size={40} color={checked ? 'white' : 'var(--eg-navy)'} />
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0f2a4a', lineHeight: 1.3 }}>{c.name}</span>
                      {c.is_credential && <span className="tag" style={{ background: '#eef2f7', color: '#42607f' }}>Credential</span>}
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

      {/* Remove-request modal */}
      {removeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setRemoveModal(null)}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 440, maxWidth: '92vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a4a' }}>Remove training request</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6, marginBottom: 16 }}>{removeModal.course_name} · {selectedPerson?.full_name}</div>
            {removeError && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{removeError}</div>}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Reason <span style={{ color: '#e24b4a' }}>*</span></label>
              <input className="form-input" value={removeReason} onChange={e => { setRemoveReason(e.target.value); setRemoveError(''); }} placeholder="Why is this request being removed?" style={{ height: 38 }} autoFocus />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setRemoveModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmRemove} disabled={removing || !removeReason.trim()} style={{ background: removeReason.trim() ? '#c0392b' : '', borderColor: removeReason.trim() ? '#c0392b' : '' }}>
                {removing ? 'Removing...' : 'Remove Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
