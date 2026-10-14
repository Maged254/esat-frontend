import React, { useEffect, useState } from 'react';
import api, { logError } from '../utils/api';
import TrainingIcon from '../components/TrainingIcon';

// Two sections, and the line between them is a decision rather than a deduction.
//
// "Requested (Needed)" is every training this person is required to hold,
// whatever state it happens to be in today: waiting on a team, booked, or a
// certificate in date. "Not Requested (Not Needed)" is everything else.
//
// The flag lives in training_requirements and is set by the EHS manager. It is
// not read off the records, because records could not express the decision: an
// expired certificate whose renewal had been cancelled looked identical to one
// nobody had considered, so Hassan Kibet Ronoh's pole climbing reopened every
// cycle for somebody to cancel again (Maged, 2026-10-14).
const OPEN = ['requested', 'scheduled', 'pending', 'not_eligible'];
const ABOUT_TO_EXPIRE_DAYS = 60; // same window the backend uses (EXPIRY_SOON_DAYS)
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '';

// What a card says about the record behind it. A needed training with no record
// at all is the honest "nothing on file yet" rather than a status.
const stateOf = (r) => {
  if (!r.status) return { label: 'Nothing on file', bg: '#F3F4F6', fg: '#4B5563', note: '' };
  if (r.status === 'completed') {
    const note = `Completed ${fmt(r.completed_at)}`;
    if (!r.expiry_date) return { label: 'Valid · no expiry', bg: '#EAF3DE', fg: '#3B6D11', note };
    if (r.expiry_state === 'expired') return { label: `Expired ${fmt(r.expiry_date)}`, bg: '#FDE8E8', fg: '#A32D2D', note };
    if (r.expiry_state === 'expiring') return { label: `About to expire ${fmt(r.expiry_date)}`, bg: '#FEF3C7', fg: '#92400E', note };
    return { label: `Valid until ${fmt(r.expiry_date)}`, bg: '#EAF3DE', fg: '#3B6D11', note };
  }
  if (r.status === 'not_eligible') return { label: 'Not eligible', bg: '#F3F4F6', fg: '#4B5563', note: r.not_eligible_reason || '' };
  if (r.status === 'scheduled') return { label: 'Scheduled', bg: '#E6EEF8', fg: '#042C53', note: r.scheduled_date ? `On ${fmt(r.scheduled_date)}` : '' };
  if (r.status === 'requested') return { label: 'Requested', bg: '#E6EEF8', fg: '#042C53', note: '' };
  return { label: 'Pending', bg: '#FEF3C7', fg: '#92400E', note: r.pending_reason || '' };
};

export default function RequestTrainingPage() {
  const [step, setStep] = useState(1);
  const [employees, setEmployees] = useState([]);
  const [empPage, setEmpPage] = useState(1);
  const [empTotal, setEmpTotal] = useState(0);
  const empPageSize = 25;
  const [empFilterOptions, setEmpFilterOptions] = useState({ projects: [], departments: [], clients: [] });
  const [selectedPerson, setSelectedPerson] = useState(null);

  const [rows, setRows] = useState([]);           // one row per course in the catalogue
  const [loadingRows, setLoadingRows] = useState(false);
  const [moving, setMoving] = useState(null);     // course_id being moved
  const [moveError, setMoveError] = useState('');

  // Marking a training not needed always asks why -- it stops the chasing for
  // good, so the record has to say who decided and on what grounds.
  const [notNeededModal, setNotNeededModal] = useState(null);
  const [notNeededReason, setNotNeededReason] = useState('');
  const [modalError, setModalError] = useState('');

  const [personSearch, setPersonSearch] = useState('');
  const [personNationalId, setPersonNationalId] = useState('');
  const [personJobTitle, setPersonJobTitle] = useState('');
  const [personFilters, setPersonFilters] = useState({ resource_type: '', department: '', project: '', client: '' });

  const [successMsg, setSuccessMsg] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');

  useEffect(() => {
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

  const loadRows = async (employeeId) => {
    setLoadingRows(true); setMoveError('');
    try {
      const res = await api.get(`/training-requirements/${employeeId}`);
      setRows(res.data.rows || []);
    } catch (e) {
      logError(e); setRows([]); setMoveError('Could not load this person’s trainings.');
    } finally {
      setLoadingRows(false);
    }
  };

  const selectPerson = async (p) => {
    setSelectedPerson(p); setSuccessMsg(''); setStep(2);
    await loadRows(p.id);
  };

  const backToList = () => { setStep(1); setSelectedPerson(null); setRows([]); setMoveError(''); };

  const move = async (row, needed, reason) => {
    setMoving(row.course_id); setMoveError('');
    try {
      const res = await api.put('/training-requirements', {
        employee_id: selectedPerson.id, course_id: row.course_id, needed, reason,
      });
      await loadRows(selectedPerson.id);
      setSuccessMsg(needed
        ? (res.data.opened_request
            ? `${row.course_name} marked as needed — a request has been raised.`
            : `${row.course_name} marked as needed. Nothing raised — the certificate is still in date.`)
        : `${row.course_name} marked as not needed${res.data.cancelled_requests ? ' — its open request was cancelled.' : '.'}`);
      return true;
    } catch (e) {
      logError(e);
      setMoveError(e.response?.data?.error || 'Could not move that training.');
      return false;
    } finally { setMoving(null); }
  };

  const confirmNotNeeded = async () => {
    if (!notNeededReason.trim()) { setModalError('A reason is required.'); return; }
    const ok = await move(notNeededModal, false, notNeededReason.trim());
    if (ok) setNotNeededModal(null);
    else setModalError('Could not save that. Try again.');
  };

  const needed = rows.filter(r => r.needed);
  const notNeeded = rows.filter(r => !r.needed);
  const empTotalPages = Math.max(Math.ceil(empTotal / empPageSize), 1);

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Request / Remove a Training</span>
        </div>
        <div className="topbar-right">
          {step === 2 && <button className="btn" onClick={backToList}>✕ Close</button>}
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
              <button className="btn btn-sm" onClick={backToList}>Change</button>
            </div>

            {moveError && (
              <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>⚠ {moveError}</div>
            )}

            {/* ── Requested (Needed) ─────────────────────────────────── */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <span className="card-title">Requested (Needed)</span>
                {!loadingRows && <span style={{ fontSize: 12, color: '#6b7280' }}>{needed.length} training{needed.length === 1 ? '' : 's'}</span>}
              </div>
              {loadingRows ? (
                <div style={{ padding: 24, fontSize: 13, color: '#9ca3af' }}>Loading…</div>
              ) : needed.length === 0 ? (
                <div style={{ padding: 24, fontSize: 13, color: '#9ca3af' }}>No trainings are marked as needed for this employee.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, padding: 16 }}>
                  {needed.map(r => {
                    const st = stateOf(r);
                    return (
                      <div key={r.course_id} style={{ border: '1.5px solid #e5e7eb', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: 'white' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ flexShrink: 0, width: 54, height: 54, borderRadius: 13, background: '#F0F7FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <TrainingIcon iconKey={r.course_icon} name={r.course_name} size={36} color="var(--eg-navy)" />
                          </span>
                          <span style={{ fontWeight: 600, fontSize: 13, color: '#0f2a4a', lineHeight: 1.25 }}>{r.course_name}</span>
                        </div>
                        <div>
                          <span className="tag" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                          {st.note && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 5 }}>{st.note}</div>}
                          {OPEN.includes(r.status) && r.prior_expiry_date && (
                            <div style={{ fontSize: 11, color: '#A32D2D', marginTop: 3 }}>Renewal · previous certificate expired {fmt(r.prior_expiry_date)}</div>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#9ca3af', borderTop: '0.5px solid #f0f0f0', paddingTop: 8 }}>
                          {r.requested_by_name
                            ? <div>Requested by <b style={{ fontWeight: 600, color: '#6b7280' }}>{r.requested_by_name}</b></div>
                            : <div>{r.prior_expiry_date ? 'Opened automatically on expiry' : 'On record'}</div>}
                          {r.requested_at && <div style={{ marginTop: 2 }}>{fmt(r.requested_at)}</div>}
                        </div>
                        <button className="btn btn-sm" style={{ color: '#c0392b', borderColor: '#f0c9c6' }}
                                disabled={moving === r.course_id}
                                onClick={() => { setNotNeededModal(r); setNotNeededReason(''); setModalError(''); }}>
                          {moving === r.course_id ? 'Moving…' : '✕ Not needed'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Not Requested (Not Needed) ─────────────────────────── */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Not Requested (Not Needed)</span>
                {!loadingRows && <span style={{ fontSize: 12, color: '#6b7280' }}>Tick to mark as needed</span>}
              </div>
              {loadingRows ? (
                <div style={{ padding: 24, fontSize: 13, color: '#9ca3af' }}>Loading…</div>
              ) : notNeeded.length === 0 ? (
                <div style={{ padding: 24, fontSize: 13, color: '#9ca3af' }}>Every training is marked as needed for this employee.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, padding: 16 }}>
                  {notNeeded.map(r => (
                    <button key={r.course_id} onClick={() => move(r, true)} disabled={moving === r.course_id}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                        textAlign: 'center', padding: '24px 14px 16px', borderRadius: 14,
                        border: '1.5px solid #e5e7eb', background: 'white',
                        cursor: moving === r.course_id ? 'wait' : 'pointer', transition: 'all 0.15s ease',
                      }}>
                      <span style={{ flexShrink: 0, width: 62, height: 62, borderRadius: 16, background: '#F0F7FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <TrainingIcon iconKey={r.course_icon} name={r.course_name} size={40} color="var(--eg-navy)" />
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0f2a4a', lineHeight: 1.3 }}>{r.course_name}</span>
                      {r.is_credential && <span className="tag" style={{ background: '#eef2f7', color: '#42607f' }}>Credential</span>}
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{moving === r.course_id ? 'Moving…' : '+ Mark as needed'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Not-needed modal — a reason is mandatory, because this stops the chasing. */}
      {notNeededModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setNotNeededModal(null)}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 460, maxWidth: '92vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a4a' }}>Mark as not needed</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>{notNeededModal.course_name} · {selectedPerson?.full_name}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 10, marginBottom: 16, lineHeight: 1.5 }}>
              {OPEN.includes(notNeededModal.status)
                ? 'Its open request will be cancelled, and no renewal will be raised for this training again until it is marked needed.'
                : 'No renewal will be raised for this training again until it is marked needed. Any certificate on file is kept.'}
            </div>
            {modalError && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{modalError}</div>}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Reason <span style={{ color: '#e24b4a' }}>*</span></label>
              <input className="form-input" value={notNeededReason} onChange={e => { setNotNeededReason(e.target.value); setModalError(''); }}
                     placeholder="Why does this person not need it?" style={{ height: 38 }} autoFocus />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setNotNeededModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmNotNeeded} disabled={moving || !notNeededReason.trim()}
                      style={{ background: notNeededReason.trim() ? '#c0392b' : '', borderColor: notNeededReason.trim() ? '#c0392b' : '' }}>
                {moving ? 'Saving…' : 'Mark as not needed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
