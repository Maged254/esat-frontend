import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';

const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const SHOE_SIZES = ['36','37','38','39','40','41','42','43','44','45','46','47'];

const CATEGORY_LABELS = {
  head_protection: 'Head Protection',
  eye_face_protection: 'Eye & Face Protection',
  hearing_protection: 'Hearing Protection',
  respiratory_protection: 'Respiratory Protection',
  hand_protection: 'Hand Protection',
  body_protection: 'Body Protection',
  foot_protection: 'Foot Protection',
  fall_protection: 'Fall Protection',
  wah_equipment: 'Working at Height Equipment',
};

export default function NewAuditPage() {
  const { employeeId } = useParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(employeeId ? 2 : 1);
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [ppeItems, setPpeItems] = useState([]);
  const [items, setItems] = useState({});    // { ppeId: { condition, size, comment, applicable } }
  const [auditDate, setAuditDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [users, setUsers] = useState([]);
  const [auditedBy, setAuditedBy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [empSearch, setEmpSearch] = useState('');

  useEffect(() => {
    api.get('/employees?status=active').then(r => setEmployees(r.data)).catch(console.error);
    api.get('/ppe').then(r => setPpeItems(r.data)).catch(console.error);
    api.get('/users').then(r => { setUsers(r.data); if (r.data.length > 0) setAuditedBy(r.data[0].id); }).catch(console.error);
  }, []);

  useEffect(() => {
    if (employeeId && employees.length > 0) {
      const emp = employees.find(e => e.id === employeeId);
      if (emp) selectEmployee(emp);
    }
  }, [employeeId, employees]);

  const selectEmployee = async (emp) => {
    setSelectedEmp(emp);
    // Load PPE assignments for this employee
    try {
      const res = await api.get(`/employees/${emp.id}/ppe-assignments`);
      const assignedIds = new Set(res.data.map(p => p.id));
      // Default applicable = true only if assigned
      const defaults = {};
      ppeItems.forEach(p => {
        defaults[p.id] = {
          condition: 'good',
          size: '',
          comment: '',
          applicable: assignedIds.has(p.id)
        };
      });
      setItems(defaults);
    } catch {
      const defaults = {};
      ppeItems.forEach(p => {
        defaults[p.id] = { condition: 'good', size: '', comment: '', applicable: true };
      });
      setItems(defaults);
    }
    setStep(2);
  };

  const setItemField = (ppeId, field, value) => {
    setItems(prev => ({ ...prev, [ppeId]: { ...prev[ppeId], [field]: value } }));
  };

  const handleSubmit = async () => {
    if (!selectedEmp) return;
    setSubmitting(true);
    try {
      const auditItems = ppeItems
        .filter(p => items[p.id]?.applicable)
        .map(p => ({
          ppe_item_id: p.id,
          condition: items[p.id]?.condition || 'good',
          size_value: items[p.id]?.size || null,
          comment: items[p.id]?.comment || null,
        }));

      await api.post('/audits', {
        employee_id: selectedEmp.id,
        audit_date: auditDate,
        audited_by_override: auditedBy,
        notes,
        items: auditItems,
      });
      navigate('/ncr');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit audit');
    } finally {
      setSubmitting(false);
    }
  };

  // Group PPE by category
  const grouped = ppeItems.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  const filteredEmps = employees.filter(e =>
    e.full_name.toLowerCase().includes(empSearch.toLowerCase()) ||
    e.employee_number.toLowerCase().includes(empSearch.toLowerCase())
  );

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
              <input
                className="form-input"
                placeholder="Search by name or employee number..."
                value={empSearch}
                onChange={e => setEmpSearch(e.target.value)}
                style={{ marginBottom: 12 }}
                autoFocus
              />
            </div>
            <table>
              <thead><tr><th>Employee</th><th>Department</th><th>Project</th><th>Last Audit</th><th></th></tr></thead>
              <tbody>
                {filteredEmps.map((e, i) => (
                  <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => selectEmployee(e)}>
                    <td>
                      <div className="emp-cell">
                        <div className={`avatar ${['av-teal','av-navy','av-coral','av-purple'][i%4]}`}>
                          {initials(e.full_name)}
                        </div>
                        <div>
                          <div className="emp-name">{e.full_name}</div>
                          <div className="emp-id">{e.employee_number}</div>
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
              </tbody>
            </table>
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
                  {selectedEmp.employee_number} · {selectedEmp.job_title} · {selectedEmp.department} · {selectedEmp.project}
                </div>
              </div>
              <span className={`tag ${selectedEmp.resource_type === 'inhouse' ? 'tag-navy' : 'tag-gray'}`}>
                {selectedEmp.resource_type}
              </span>
              <button className="btn btn-sm" onClick={() => setStep(1)}>Change</button>
            </div>

            <div className="card">
              <div className="form-grid" style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                <div className="form-group">
                  <label className="form-label">Audit date</label>
                  <input className="form-input" type="date" value={auditDate} readOnly style={{background:"#f3f4f6",cursor:"not-allowed",color:"#6b7280",height:38}} />
                </div>
                <div className="form-group">
                  <label className="form-label">Audited by</label>
                  <select className="form-select" value={auditedBy} onChange={e => setAuditedBy(e.target.value)} style={{height:38}}>
                    {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
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
                    <div>PPE item</div><div>Condition</div><div>Size</div><div>Comment</div><div>Applicable</div>
                  </div>
                  {catItems.map(ppe => {
                    const it = items[ppe.id] || { condition: 'good', size: '', comment: '', applicable: true };
                    return (
                      <div key={ppe.id} className="ppe-row" style={{ opacity: it.applicable ? 1 : 0.4 }}>
                        <div className="ppe-name">{ppe.name}</div>
                        <div className="ppe-cell">
                          <div className="condition-group">
                            {['good','not_good','missing'].map(cond => (
                              <button
                                key={cond}
                                className={`condition-btn ${it.condition === cond ? `sel-${cond === 'not_good' ? 'bad' : cond}` : ''}`}
                                onClick={() => setItemField(ppe.id, 'condition', cond)}
                                disabled={!it.applicable}
                              >
                                {cond === 'good' ? '✓ Good' : cond === 'not_good' ? '✗ Not Good' : '— Missing'}
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
                            className="ppe-comment"
                            placeholder="Comment..."
                            value={it.comment}
                            onChange={e => setItemField(ppe.id, 'comment', e.target.value)}
                            disabled={!it.applicable}
                          />
                        </div>
                        <div className="ppe-cell" style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={it.applicable}
                            onChange={e => setItemField(ppe.id, 'applicable', e.target.checked)}
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
    </>
  );
}
