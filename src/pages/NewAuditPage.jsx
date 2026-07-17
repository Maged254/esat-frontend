import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { logError } from '../utils/api';

const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const SHOE_SIZES = ['38','39','40','41','42','43','44','45','46'];
const FIRE_EXTINGUISHER_ITEM = 'Fire Extinguisher - 6KG - Dry Powder With Inspection Sticker';
const FIRE_EXTINGUISHER_COMMENT_OPTIONS = ['New Issuance', 'Replacement'];

const CATEGORY_LABELS = {
  body_protection: 'Body Protection',
  documentation_safety_signage: 'Documentation & Safety Signage',
  fall_protection: 'Fall Protection & Rescue Equipment',
  general_safety: 'General Safety',
  maintenance_tools: 'Maintenance Tools & Equipment',
  testing_measuring: 'Testing & Measuring Instruments',
};

export default function NewAuditPage() {
  const { employeeId } = useParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(employeeId ? 2 : 1);
  const [employees, setEmployees] = useState([]);
  const [empPage, setEmpPage] = useState(1);
  const [empTotal, setEmpTotal] = useState(0);
  const empPageSize = 25;
  const [empFilterOptions, setEmpFilterOptions] = useState({ projects: [], departments: [] });
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [ppeItems, setPpeItems] = useState([]);
  const [items, setItems] = useState({});    // { ppeId: { condition, size, comment, applicable } }
  const [auditDate, setAuditDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [users, setUsers] = useState([]);
  const [auditedBy, setAuditedBy] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');
  const [employeePresent, setEmployeePresent] = useState(true);
  const [validationErrors, setValidationErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [auditId, setAuditId] = useState(null);
  const [docs, setDocs] = useState({
    'JHA': null,
    'Toolbox_Talk_Sheet': null,
    'PPE_Inspection_Checklist': null,
    'Emergency_Response_Plan': null,
    'Vehicle_Safety_Checklist': null
  });
  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [uploadProgress, setUploadProgress] = useState({});
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [locSearch, setLocSearch] = useState('');
  const [showLocDropdown, setShowLocDropdown] = useState(false);
  const [auditorSearch, setAuditorSearch] = useState('');
  const [showAuditorDrop, setShowAuditorDrop] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [empFilters, setEmpFilters] = useState({ project: '', department: '', audit_age: '' });

  useEffect(() => {
    api.get('/ppe').then(r => setPpeItems(r.data)).catch(logError);
    api.get('/users').then(r => { setUsers(r.data.filter(u => !['admin@egypro.com','sync@egypro.com','eats-sync@egypro.app'].includes(u.email) && u.role !== 'scm_officer')); }).catch(logError);
    api.get('/locations').then(r => setLocations(r.data)).catch(logError);
    api.get('/employees/filter-options').then(r => setEmpFilterOptions(r.data)).catch(logError);
    try {
      const user = JSON.parse(localStorage.getItem('esat_user'));
      if (user) {
        setCurrentUserName(user.full_name || user.name || '');
        setAuditedBy(user.id);
      }
    } catch {}
  }, []);

  // Deep-linked employee (e.g. /audits/new/:employeeId) may not be on the
  // currently loaded picker page anymore, so fetch it directly instead of
  // searching the paginated `employees` list.
  useEffect(() => {
    if (employeeId) {
      api.get(`/employees/${employeeId}`).then(r => selectEmployee(r.data)).catch(logError);
    }
  }, [employeeId]);

  const empFilterParams = () => {
    const params = new URLSearchParams();
    params.append('status', 'active');
    params.append('san', 'yes');
    if (empSearch) params.append('search', empSearch);
    if (empFilters.project) params.append('project', empFilters.project);
    if (empFilters.department) params.append('department', empFilters.department);
    if (empFilters.audit_age) params.append('audit_age', empFilters.audit_age);
    return params;
  };

  useEffect(() => {
    const params = empFilterParams();
    params.append('page', empPage);
    params.append('pageSize', empPageSize);
    api.get('/employees?' + params).then(r => { setEmployees(r.data.rows); setEmpTotal(r.data.total); }).catch(logError);
  }, [empSearch, empFilters, empPage]);

  useEffect(() => { setEmpPage(1); }, [empSearch, empFilters]);

  const selectEmployee = async (emp) => {
    setSelectedEmp(emp);
    // Load PPE assignments for this employee
    try {
      const res = await api.get(`/employees/${emp.id}/ppe-assignments`);
      const assignedItems = res.data;
      setPpeItems(assignedItems);
      const defaults = {};
      assignedItems.forEach(p => {
        defaults[p.id] = {
          condition: 'good',
          size: '',
          comment: '',
          quantity: 1,
          applicable: false
        };
      });
      setItems(defaults);
    } catch {
      const defaults = {};
      ppeItems.forEach(p => {
        defaults[p.id] = { condition: 'good', size: '', comment: '', quantity: 1, applicable: false };
      });
      setItems(defaults);
    }
    setStep(2);
  };

  const setItemField = (ppeId, field, value) => {
    setItems(prev => ({ ...prev, [ppeId]: { ...prev[ppeId], [field]: value } }));
  };

  // Same "recently distributed" window (4 months) and color as the Pending PM tag.
  const isRecentDistribution = (date) => !!date && new Date(date) >= new Date(new Date().setMonth(new Date().getMonth() - 4));

  const setItemCondition = (ppe, condition) => {
    setItems(prev => {
      const current = prev[ppe.id] || {};
      const shouldDefaultReplacement = ppe.name === FIRE_EXTINGUISHER_ITEM
        && condition === 'not_good'
        && !FIRE_EXTINGUISHER_COMMENT_OPTIONS.includes(current.comment);
      return {
        ...prev,
        [ppe.id]: {
          ...current,
          condition,
          ...(shouldDefaultReplacement ? { comment: 'Replacement' } : {}),
        },
      };
    });
  };

  const handleSubmit = async () => {
    if (!selectedEmp) return;
    const errors = [];
    if (!auditedBy) errors.push('Please select who conducted the audit.');
    if (!locationId) errors.push('Please select a location.');
    const applicableItems = ppeItems.filter(p => items[p.id]?.applicable);
    if (applicableItems.length === 0) errors.push('Please mark at least one PPE/Tool Item as applicable.');
    if (employeePresent) {
      const uncheckedItems = ppeItems.filter(p => !items[p.id]?.applicable);
      if (uncheckedItems.length > 0) errors.push('Employee is marked Present — all PPE/Tool items must be ticked Applicable: ' + uncheckedItems.map(p=>p.name).join(', ') + '.');
    } else {
      const wrongCondition = applicableItems.filter(p => items[p.id]?.condition !== 'not_good');
      if (wrongCondition.length > 0) errors.push('Employee is marked Not Present — ticked items must be set to Not Good: ' + wrongCondition.map(p=>p.name).join(', ') + '.');
    }
    const missingSizes = applicableItems.filter(p => p.has_size && items[p.id]?.applicable && items[p.id]?.condition === 'not_good' && !items[p.id]?.size);
    if (missingSizes.length > 0) errors.push('Please select a size for: ' + missingSizes.map(p=>p.name).join(', ') + '.');
    const fireExtinguisher = applicableItems.find(p =>
      p.name === FIRE_EXTINGUISHER_ITEM && items[p.id]?.condition === 'not_good'
    );
    if (fireExtinguisher && !FIRE_EXTINGUISHER_COMMENT_OPTIONS.includes(items[fireExtinguisher.id]?.comment)) {
      errors.push(`Please select New Issuance or Replacement for: ${FIRE_EXTINGUISHER_ITEM}.`);
    }
    if (errors.length > 0) { setValidationErrors(errors); return; }
    setValidationErrors([]);
    setSubmitting(true);
    try {
      const auditItems = ppeItems
        .filter(p => items[p.id]?.applicable)
        .map(p => ({
          ppe_item_id: p.id,
          condition: items[p.id]?.condition || 'good',
          size_value: items[p.id]?.size || null,
          comment: items[p.id]?.comment || null,
          quantity: items[p.id]?.quantity || 1,
        }));

      const auditRes = await api.post('/audits', {
        employee_id: selectedEmp.id,
        audit_date: auditDate,
        audited_by_override: auditedBy,
        employee_present: employeePresent,
        location_id: locationId || null,
        notes,
        items: auditItems,
      });
      const newAuditId = auditRes.data?.id || auditRes.data?.audit?.id;
      setAuditId(newAuditId);
      setStep(3);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit audit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadAndFinish = async () => {
    setUploading(true);
    const token = localStorage.getItem('esat_token');
    for (const [fieldName, file] of Object.entries(docs)) {
      if (!file) continue;
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('audit_id', auditId);
        formData.append('employee_id', selectedEmp.id);
        formData.append('field_name', fieldName);
        formData.append('national_id', selectedEmp.national_id || 'unknown');
        formData.append('employee_name', selectedEmp.full_name);
        formData.append('audit_date', auditDate);
        const response = await fetch((process.env.REACT_APP_API_URL || 'https://esat-backend-drwm.onrender.com') + '/api/audit-documents/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          console.error('Upload failed for', fieldName, errData);
          setUploadProgress(p => ({ ...p, [fieldName]: 'error' }));
        } else {
          setUploadProgress(p => ({ ...p, [fieldName]: 'done' }));
        }
      } catch (err) {
        console.error('Upload exception for', fieldName, err);
        setUploadProgress(p => ({ ...p, [fieldName]: 'error' }));
      }
    }
    setUploading(false);
    setSuccessMsg(`Audit for ${selectedEmp?.full_name} submitted successfully!`);
    setTimeout(() => {
      setSuccessMsg('');
      setStep(1);
      setSelectedEmp(null);
      setItems({});
      setPpeItems([]);
      setAuditId(null);
      setDocs({ JHA: null, Toolbox_Talk_Sheet: null, PPE_Inspection_Checklist: null, Emergency_Response_Plan: null, Vehicle_Safety_Checklist: null });
      setUploadProgress({});
      setNotes('');
    }, 3000);
  };

  // Group PPE by category
  const grouped = ppeItems.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  const empTotalPages = Math.max(Math.ceil(empTotal / empPageSize), 1);

  const initials = name => name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">New Audit</span>
        </div>
        <div className="topbar-right">
          <button className="btn" onClick={() => navigate(-1)}>✕ Cancel</button>
          {step === 2 && (
            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
              ✓ {submitting ? 'Submitting...' : 'Submit Audit'}
            </button>
          )}
        </div>
      </div>

      <div className="content">
        <div className="steps">
          <div className={`step ${step === 1 ? 'active' : 'done'}`}>
            <div className="step-num">{step > 1 ? '✓' : '1'}</div>
            <span>Select employee</span>
          </div>
          <div className="step-line"></div>
          <div className={`step ${step === 2 ? 'active' : ''}`}>
            <div className="step-num">2</div>
            <span>PPE checklist</span>
          </div>
          <div className="step-line"></div>
          <div className="step">
            <div className="step-num">3</div>
            <span>Review & submit</span>
          </div>
        </div>

        {/* STEP 1 — Select Employee */}
        {step === 1 && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Select employee to audit</span>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
                <input className="form-input" placeholder="Search by name or national ID..." value={empSearch} onChange={e=>setEmpSearch(e.target.value)} style={{flex:1,minWidth:200}} autoFocus />
                <select className="form-select" style={{height:38,padding:'4px 8px',fontSize:13,width:150}} value={empFilters.project} onChange={e=>setEmpFilters(p=>({...p,project:e.target.value}))}>
                  <option value="">All Projects</option>
                  {empFilterOptions.projects.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
                <select className="form-select" style={{height:38,padding:'4px 8px',fontSize:13,width:150}} value={empFilters.department} onChange={e=>setEmpFilters(p=>({...p,department:e.target.value}))}>
                  <option value="">All Departments</option>
                  {empFilterOptions.departments.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
                <select className="form-select" style={{height:38,padding:'4px 8px',fontSize:13,width:180}} value={empFilters.audit_age} onChange={e=>setEmpFilters(p=>({...p,audit_age:e.target.value}))}>
                  <option value="">All Last Audit</option>
                  <option value="1month">Within 1 Month</option>
                  <option value="2months">1 - 2 Months</option>
                  <option value="over2months">More than 2 Months</option>
                </select>
                <button className="btn" style={{height:38,padding:'4px 12px',fontSize:13}} onClick={()=>{setEmpSearch('');setEmpFilters({project:'',department:'',audit_age:''});}}>✕ Clear</button>
              </div>
            </div>
            <table>
              <thead><tr><th>Employee</th><th>Department</th><th>Project</th><th>Last Audit</th><th></th></tr></thead>
              <tbody>
                {employees.map((e, i) => (
                  <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => selectEmployee(e)}>
                    <td>
                      <div className="emp-cell">
                        <div className={`avatar ${['av-teal','av-navy','av-coral','av-purple'][i%4]}`}>
                          {initials(e.full_name)}
                        </div>
                        <div>
                          <div className="emp-name">{e.full_name}</div>
                          <div className="emp-id">{e.national_id||e.employee_number}</div>
                        </div>
                      </div>
                    </td>
                    <td>{e.department || '—'}</td>
                    <td>{e.project || '—'}</td>
                    <td>
                      {e.last_audit_date
                        ? <><span className={`dot ${e.days_since_audit > 30 ? 'dot-red' : 'dot-green'}`}></span>{e.days_since_audit}d ago</>
                        : <span style={{ color: '#6b7280' }}>Never</span>
                      }
                    </td>
                    <td><button className="btn btn-primary btn-sm">Select →</button></td>
                  </tr>
                ))}
                {!employees.length && <tr><td colSpan={5} style={{textAlign:'center',color:'#6b7280',padding:32}}>No employees found</td></tr>}
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
        )}

        {/* STEP 2 — PPE Checklist */}
        {step === 2 && selectedEmp && (
          <>
            <div style={{
              background: '#f3f4f6', border: '0.5px solid #e5e7eb', borderRadius: 8,
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16
            }}>
              <div className="avatar av-coral" style={{ width: 40, height: 40, fontSize: 14 }}>
                {initials(selectedEmp.full_name)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{selectedEmp.full_name}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  {selectedEmp.national_id || selectedEmp.employee_number} · {selectedEmp.job_title} · {selectedEmp.department} · {selectedEmp.project}
                </div>
              </div>
              <span className={`tag ${selectedEmp.resource_type === 'inhouse' ? 'tag-navy' : 'tag-gray'}`}>
                {selectedEmp.resource_type ? selectedEmp.resource_type.charAt(0).toUpperCase() + selectedEmp.resource_type.slice(1) : '—'}
              </span>
              <button className="btn btn-sm" onClick={() => setStep(1)}>Change</button>
            </div>

            <div className="card">
              {validationErrors.length > 0 && (
              <div style={{background:'#fcebeb',border:'1px solid #e24b4a',borderRadius:8,padding:'12px 16px',margin:'12px 16px 0'}}>
                {validationErrors.map((e,i) => <div key={i} style={{color:'#c0392b',fontSize:13,marginBottom:i<validationErrors.length-1?6:0}}>⚠ {e}</div>)}
              </div>
            )}
            <div className="form-grid" style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                <div className="form-group">
                  <label className="form-label">Audit date</label>
                  <input className="form-input" type="date" value={auditDate} readOnly style={{background:"#f3f4f6",cursor:"not-allowed",color:"#6b7280",height:38}} />
                </div>
                <div className="form-group">
                  <label className="form-label">Audited by</label>
                  <input className="form-input" value={currentUserName} readOnly style={{ background: '#f3f4f6', cursor: 'not-allowed', color: '#6b7280', height: 38 }} />
                </div>
                <div className="form-group" style={{ position:'relative' }}>
                  <label className="form-label">Location <span style={{color:'#e24b4a'}}>*</span></label>
                  <input
                    className="form-input"
                    style={{ height:38, borderColor: !locationId && validationErrors.length ? '#e24b4a' : '' }}
                    placeholder="Search location..."
                    value={locSearch}
                    onChange={e => { setLocSearch(e.target.value); setLocationId(''); setShowLocDropdown(true); }}
                    onFocus={() => setShowLocDropdown(true)}
                    onBlur={() => setTimeout(() => setShowLocDropdown(false), 150)}
                    autoComplete="off"
                  />
                  {showLocDropdown && (
                    <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'white', border:'1px solid #e5e7eb', borderRadius:8, maxHeight:200, overflowY:'auto', zIndex:100, boxShadow:'0 4px 12px rgba(0,0,0,0.1)' }}>
                      {locations.filter(l => !locSearch || l.name.toLowerCase().includes(locSearch.toLowerCase())).map(l => (
                        <div key={l.id}
                          style={{ padding:'8px 12px', cursor:'pointer', fontSize:13 }}
                          onMouseDown={() => { setLocationId(l.id); setLocSearch(l.name); setShowLocDropdown(false); }}
                          onMouseEnter={e => e.currentTarget.style.background='#f3f4f6'}
                          onMouseLeave={e => e.currentTarget.style.background='white'}
                        >{l.name}</div>
                      ))}
                      {locations.filter(l => !locSearch || l.name.toLowerCase().includes(locSearch.toLowerCase())).length === 0 && (
                        <div style={{ padding:'8px 12px', fontSize:13, color:'#9ca3af' }}>No locations found</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Is the Employee Physically Present?</label>
                  <div style={{display:'flex',gap:8}}>
                    <button type="button"
                      disabled
                      style={{flex:1,padding:'8px',borderRadius:8,border:'2px solid',borderColor:'#16a34a',background:'#dcfce7',color:'#15803d',fontWeight:600,cursor:'not-allowed',fontSize:13}}>
                      ✓ Present
                    </button>
                    <button type="button"
                      disabled
                      style={{flex:1,padding:'8px',borderRadius:8,border:'2px solid',borderColor:'#e5e7eb',background:'#f9fafb',color:'#9ca3af',fontWeight:600,cursor:'not-allowed',fontSize:13,opacity:0.5}}>
                      ✗ Not Present
                    </button>
                  </div>
                </div>
                <div className="form-group" style={{gridColumn:'1 / -1'}}>
                  <label className="form-label">General notes (optional)</label>
                  <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Overall observations..." />
                </div>
              </div>

              {Object.entries(grouped).map(([category, catItems]) => (
                <div key={category}>
                  <div className="ppe-section-header">
                    {CATEGORY_LABELS[category] || category}
                  </div>
                  <div className="ppe-col-header">
                    <div>PPE/Tool Item</div><div>Condition</div><div>Size</div><div>Qty</div><div>Comment</div><div>Applicable</div>
                  </div>
                  {catItems.map(ppe => {
                    const it = items[ppe.id] || { condition: 'good', size: '', comment: '', applicable: true };
                    const requiresIssuanceType = ppe.name === FIRE_EXTINGUISHER_ITEM && it.condition === 'not_good';
                    return (
                      <div key={ppe.id} className="ppe-row" style={{ opacity: it.applicable ? 1 : 0.4 }}>
                        <div className="ppe-name">
                          {ppe.name}
                          {ppe.last_distributed ? (
                            <span className="tag" style={{marginTop:2,fontWeight:400,
                              background: isRecentDistribution(ppe.last_distributed) ? 'var(--wf-pm-light)' : 'transparent',
                              color: isRecentDistribution(ppe.last_distributed) ? 'var(--wf-pm)' : '#9ca3af',
                              padding: isRecentDistribution(ppe.last_distributed) ? '2px 8px' : 0}}>
                              Last distributed: {new Date(ppe.last_distributed).toLocaleDateString('en-GB')}
                            </span>
                          ) : (
                            <div style={{fontSize:11,fontWeight:400,color:'#9ca3af',marginTop:2}}>Never distributed</div>
                          )}
                        </div>
                        <div className="ppe-cell">
                          <div className="condition-group">
                            {['good','not_good','not_present'].map(cond => (
                              <button
                                key={cond}
                                className={`condition-btn ${it.condition === cond ? (cond === 'good' ? 'sel-good' : cond === 'not_good' ? 'sel-bad' : 'sel-missing') : ''}`}
                                onClick={() => setItemCondition(ppe, cond)}
                                disabled={!it.applicable || (!employeePresent && cond !== 'not_good')}
                              >
                                {cond === 'good' ? '✓ Good' : cond === 'not_good' ? '✗ Not Good' : '— Left at Home'}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="ppe-cell">
                          {ppe.has_size ? (
                            <select
                              className="ppe-size"
                              value={it.size}
                              onChange={e => setItemField(ppe.id, 'size', e.target.value)}
                              disabled={!it.applicable}
                            >
                              <option value="">—</option>
                              {(ppe.size_type === 'shoe' ? SHOE_SIZES : CLOTHING_SIZES).map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          ) : <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>}
                        </div>
                        <div className="ppe-cell">
                          <input
                            type="number"
                            min="1"
                            value={it.quantity || 1}
                            onChange={e => setItemField(ppe.id, 'quantity', parseInt(e.target.value) || 1)}
                            disabled={!it.applicable}
                            style={{ width:55, height:32, padding:'4px 8px', borderRadius:6, border:'1px solid', borderColor: (it.quantity||1) > 1 ? '#e53e3e' : '#e5e7eb', background: (it.quantity||1) > 1 ? '#fff5f5' : 'white', color: (it.quantity||1) > 1 ? '#e53e3e' : '#0f2a4a', fontWeight: (it.quantity||1) > 1 ? 700 : 400, fontSize:13, textAlign:'center' }}
                          />
                        </div>
                        <div className="ppe-cell">
                          {requiresIssuanceType ? (
                            <select
                              className="ppe-comment"
                              value={it.comment}
                              onChange={e => setItemField(ppe.id, 'comment', e.target.value)}
                              disabled={!it.applicable}
                              aria-label={`${ppe.name} issuance type`}
                            >
                              <option value="">Select issuance type *</option>
                              {FIRE_EXTINGUISHER_COMMENT_OPTIONS.map(option => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="ppe-comment"
                              placeholder="Comment..."
                              value={it.comment}
                              onChange={e => setItemField(ppe.id, 'comment', e.target.value)}
                              disabled={!it.applicable}
                            />
                          )}
                        </div>
                        <div className="ppe-cell" style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={it.applicable}
                            onChange={e => {
                              const checked = e.target.checked;
                              setItems(prev => ({
                                ...prev,
                                [ppe.id]: {
                                  ...prev[ppe.id],
                                  applicable: checked,
                                  condition: (checked && !employeePresent) ? 'not_good' : (prev[ppe.id]?.condition || 'good'),
                                  ...(
                                    checked
                                    && !employeePresent
                                    && ppe.name === FIRE_EXTINGUISHER_ITEM
                                    && !FIRE_EXTINGUISHER_COMMENT_OPTIONS.includes(prev[ppe.id]?.comment)
                                      ? { comment: 'Replacement' }
                                      : {}
                                  ),
                                },
                              }));
                            }}
                            style={{ width: 16, height: 16, accentColor: 'var(--eg-green)', cursor: 'pointer' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              <div style={{ padding: '16px 18px', display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '0.5px solid #e5e7eb' }}>
                <button className="btn" onClick={() => navigate(-1)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                  ✓ {submitting ? 'Submitting...' : 'Submit Audit'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      {step === 3 && (
        <div style={{ maxWidth: 600, margin: '40px auto', padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            {successMsg && (
              <div style={{ background: '#dcfce7', border: '1px solid #16a34a', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#15803d', fontWeight: 600, fontSize: 14 }}>
                ✅ {successMsg}
              </div>
            )}
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0f2a4a', marginBottom: 4 }}>Upload Documents</div>
            <div style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>Attach safety documents for {selectedEmp?.full_name}</div>
            {Object.keys(docs).map(fieldName => (
              <div key={fieldName} style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                  {({'JHA': 'Job Hazard Analysis', 'Toolbox_Talk_Sheet': 'Toolbox Talk Sheet', 'PPE_Inspection_Checklist': 'PPE Inspection Checklist', 'Emergency_Response_Plan': 'Emergency Response Plan', 'Vehicle_Safety_Checklist': 'Vehicle Safety Checklist'})[fieldName] || fieldName.replace(/_/g, ' ')}
                  {uploadProgress[fieldName] === 'done' && <span style={{ color: '#16a34a', marginLeft: 8 }}>✓ Uploaded</span>}
                  {uploadProgress[fieldName] === 'error' && <span style={{ color: '#dc2626', marginLeft: 8 }}>✗ Failed</span>}
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={e => setDocs(d => ({ ...d, [fieldName]: e.target.files[0] || null }))}
                  style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}
                />
                {docs[fieldName] && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>📎 {docs[fieldName].name}</div>}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button className="btn" onClick={() => navigate('/ncr')} style={{ flex: 1 }}>Skip & Finish</button>
              <button className="btn btn-primary" onClick={handleUploadAndFinish} disabled={uploading} style={{ flex: 1 }}>
                {uploading ? 'Uploading...' : 'Upload & Finish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
