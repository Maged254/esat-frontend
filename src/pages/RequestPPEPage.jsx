import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const SHOE_SIZES = ['36','37','38','39','40','41','42','43','44','45','46','47'];
const CATEGORY_LABELS = {
  body_protection: 'Body Protection',
  documentation_safety_signage: 'Documentation & Safety Signage',
  fall_protection: 'Fall Protection & Rescue Equipment',
  general_safety: 'General Safety',
  maintenance_tools: 'Maintenance Tools & Equipment',
  testing_measuring: 'Testing & Measuring Instruments',
};

export default function RequestPPEPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [personType, setPersonType] = useState('employee'); // 'employee' | 'casual'

  const [employees, setEmployees] = useState([]);
  const [casuals, setCasuals] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(null);

  const [ppeItems, setPpeItems] = useState([]);
  const [items, setItems] = useState({}); // { ppeId: { size, quantity, applicable, comment } }
  const [notes, setNotes] = useState('');

  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [locSearch, setLocSearch] = useState('');
  const [showLocDropdown, setShowLocDropdown] = useState(false);

  const [personSearch, setPersonSearch] = useState('');
  const [personFilters, setPersonFilters] = useState({ project: '', department: '' });

  const [validationErrors, setValidationErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const [currentUserName, setCurrentUserName] = useState('');

  useEffect(() => {
    api.get('/employees?status=active').then(r => setEmployees(r.data)).catch(console.error);
    api.get('/casuals').then(r => setCasuals(r.data.filter(c => c.employment_status === 'active'))).catch(console.error);
    api.get('/locations').then(r => setLocations(r.data)).catch(console.error);
    try {
      const user = JSON.parse(localStorage.getItem('esat_user'));
      if (user) setCurrentUserName(user.full_name || user.name || '');
    } catch {}
  }, []);

  const selectPerson = async (person, type) => {
    setSelectedPerson(person);
    setPersonType(type);
    try {
      const endpoint = type === 'employee'
        ? `/employees/${person.id}/ppe-assignments`
        : `/casuals/${person.id}/ppe-assignments`;
      const res = await api.get(endpoint);
      const assignedItems = res.data;
      setPpeItems(assignedItems);
      const defaults = {};
      assignedItems.forEach(p => {
        defaults[p.id] = { size: '', quantity: 1, applicable: false, comment: '' };
      });
      setItems(defaults);
    } catch {
      setPpeItems([]);
      setItems({});
    }
    setStep(2);
  };

  const setItemField = (ppeId, field, value) => {
    setItems(prev => ({ ...prev, [ppeId]: { ...prev[ppeId], [field]: value } }));
  };

  const handleSubmit = async () => {
    if (!selectedPerson) return;
    const errors = [];
    if (!locationId) errors.push('Please select a location.');
    const applicableItems = ppeItems.filter(p => items[p.id]?.applicable);
    if (applicableItems.length === 0) errors.push('Please tick at least one PPE/Tool Item.');
    const missingSizes = applicableItems.filter(p => p.has_size && !items[p.id]?.size);
    if (missingSizes.length > 0) errors.push('Please select a size for: ' + missingSizes.map(p => p.name).join(', ') + '.');
    if (errors.length > 0) { setValidationErrors(errors); return; }
    setValidationErrors([]);
    setSubmitting(true);
    try {
      if (personType === 'employee') {
        const auditItems = applicableItems.map(p => ({
          ppe_item_id: p.id,
          condition: 'not_good',
          size_value: items[p.id]?.size || null,
          comment: items[p.id]?.comment || null,
          quantity: items[p.id]?.quantity || 1,
        }));
        await api.post('/audits', {
          employee_id: selectedPerson.id,
          audit_date: new Date().toISOString().split('T')[0],
          employee_present: false,
          location_id: locationId,
          notes: notes,
          items: auditItems,
        });
      } else {
        const reqItems = applicableItems.map(p => ({
          ppe_item_id: p.id,
          size_value: items[p.id]?.size || null,
          quantity: items[p.id]?.quantity || 1,
          comment: items[p.id]?.comment || null,
        }));
        await api.post('/casual-ppe-requests', {
          casual_id: selectedPerson.id,
          items: reqItems,
        });
      }
      setSuccessMsg(`PPE request for ${selectedPerson.full_name} submitted successfully!`);
      setTimeout(() => {
        setSuccessMsg('');
        setStep(1);
        setSelectedPerson(null);
        setItems({});
        setPpeItems([]);
        setLocationId('');
        setLocSearch('');
        setNotes('');
      }, 2500);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const grouped = ppeItems.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  const filteredEmployees = employees.filter(e => {
    if (personSearch && !e.full_name.toLowerCase().includes(personSearch.toLowerCase()) && !(e.national_id || '').includes(personSearch)) return false;
    if (personFilters.project && e.project !== personFilters.project) return false;
    if (personFilters.department && e.department !== personFilters.department) return false;
    return true;
  });

  const filteredCasuals = casuals.filter(c => {
    if (personSearch && !c.full_name.toLowerCase().includes(personSearch.toLowerCase()) && !(c.national_id || '').includes(personSearch)) return false;
    if (personFilters.project && c.project !== personFilters.project) return false;
    return true;
  });

  const initials = name => name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Request a PPE</span>
        </div>
        <div className="topbar-right">
          <button className="btn" onClick={() => navigate(-1)}>✕ Cancel</button>
          {step === 2 && (
            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
              ✓ {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          )}
        </div>
      </div>

      <div className="content">
        {successMsg && (
          <div style={{ background: '#EAF3DE', color: '#3B6D11', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            ✓ {successMsg}
          </div>
        )}

        {step === 1 && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Select person</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className={`btn ${personType === 'employee' ? 'btn-primary' : ''}`}
                  style={{ fontSize: 13 }}
                  onClick={() => { setPersonType('employee'); setPersonSearch(''); }}
                >Employee</button>
                <button
                  className={`btn ${personType === 'casual' ? 'btn-primary' : ''}`}
                  style={{ fontSize: 13 }}
                  onClick={() => { setPersonType('casual'); setPersonSearch(''); }}
                >Casual</button>
              </div>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <input className="form-input" placeholder="Search by name or national ID..." value={personSearch} onChange={e => setPersonSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} autoFocus />
                {personType === 'employee' && (
                  <>
                    <select className="form-select" style={{ height: 38, padding: '4px 8px', fontSize: 13, width: 150 }} value={personFilters.project} onChange={e => setPersonFilters(p => ({ ...p, project: e.target.value }))}>
                      <option value="">All Projects</option>
                      {[...new Set(employees.map(e => e.project).filter(Boolean))].sort().map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select className="form-select" style={{ height: 38, padding: '4px 8px', fontSize: 13, width: 150 }} value={personFilters.department} onChange={e => setPersonFilters(p => ({ ...p, department: e.target.value }))}>
                      <option value="">All Departments</option>
                      {[...new Set(employees.map(e => e.department).filter(Boolean))].sort().map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </>
                )}
                {personType === 'casual' && (
                  <select className="form-select" style={{ height: 38, padding: '4px 8px', fontSize: 13, width: 150 }} value={personFilters.project} onChange={e => setPersonFilters(p => ({ ...p, project: e.target.value }))}>
                    <option value="">All Projects</option>
                    {[...new Set(casuals.map(c => c.project).filter(Boolean))].sort().map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
                <button className="btn" style={{ height: 38, padding: '4px 12px', fontSize: 13 }} onClick={() => { setPersonSearch(''); setPersonFilters({ project: '', department: '' }); }}>✕ Clear</button>
              </div>
            </div>
            {personType === 'employee' ? (
              <table>
                <thead><tr><th>Employee</th><th>Department</th><th>Project</th><th></th></tr></thead>
                <tbody>
                  {filteredEmployees.map((e, i) => (
                    <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => selectPerson(e, 'employee')}>
                      <td>
                        <div className="emp-cell">
                          <div className={`avatar ${['av-teal', 'av-navy', 'av-coral', 'av-purple'][i % 4]}`}>{initials(e.full_name)}</div>
                          <div>
                            <div className="emp-name">{e.full_name}</div>
                            <div className="emp-id">{e.national_id || e.employee_number}</div>
                          </div>
                        </div>
                      </td>
                      <td>{e.department || '—'}</td>
                      <td>{e.project || '—'}</td>
                      <td><button className="btn btn-primary btn-sm">Select →</button></td>
                    </tr>
                  ))}
                  {!filteredEmployees.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#6b7280', padding: 32 }}>No employees found</td></tr>}
                </tbody>
              </table>
            ) : (
              <table>
                <thead><tr><th>Casual</th><th>Project</th><th>Client</th><th></th></tr></thead>
                <tbody>
                  {filteredCasuals.map((c, i) => (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => selectPerson(c, 'casual')}>
                      <td>
                        <div className="emp-cell">
                          <div className={`avatar ${['av-teal', 'av-navy', 'av-coral', 'av-purple'][i % 4]}`}>{initials(c.full_name)}</div>
                          <div>
                            <div className="emp-name">{c.full_name}</div>
                            <div className="emp-id">{c.national_id || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td>{c.project || '—'}</td>
                      <td>{c.client || '—'}</td>
                      <td><button className="btn btn-primary btn-sm">Select →</button></td>
                    </tr>
                  ))}
                  {!filteredCasuals.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#6b7280', padding: 32 }}>No casuals found</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        )}

        {step === 2 && selectedPerson && (
          <>
            <div style={{ background: '#f3f4f6', border: '0.5px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div className="avatar av-coral" style={{ width: 40, height: 40, fontSize: 14 }}>{initials(selectedPerson.full_name)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{selectedPerson.full_name}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  {selectedPerson.national_id || '—'} · {personType === 'employee' ? 'Employee' : 'Casual'} · {selectedPerson.project}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => setStep(1)}>Change</button>
            </div>

            <div className="card">
              {validationErrors.length > 0 && (
                <div style={{ background: '#fcebeb', border: '1px solid #e24b4a', borderRadius: 8, padding: '12px 16px', margin: '12px 16px 0' }}>
                  {validationErrors.map((e, i) => <div key={i} style={{ color: '#c0392b', fontSize: 13, marginBottom: i < validationErrors.length - 1 ? 6 : 0 }}>⚠ {e}</div>)}
                </div>
              )}
              <div className="form-grid" style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                <div className="form-group">
                  <label className="form-label">Requested by</label>
                  <input className="form-input" value={currentUserName} readOnly style={{ background: '#f3f4f6', cursor: 'not-allowed', color: '#6b7280', height: 38 }} />
                </div>
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">Location <span style={{ color: '#e24b4a' }}>*</span></label>
                  <input
                    className="form-input"
                    style={{ height: 38, borderColor: !locationId && validationErrors.length ? '#e24b4a' : '' }}
                    placeholder="Search location..."
                    value={locSearch}
                    onChange={e => { setLocSearch(e.target.value); setLocationId(''); setShowLocDropdown(true); }}
                    onFocus={() => setShowLocDropdown(true)}
                    onBlur={() => setTimeout(() => setShowLocDropdown(false), 150)}
                    autoComplete="off"
                  />
                  {showLocDropdown && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, maxHeight: 200, overflowY: 'auto', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                      {locations.filter(l => !locSearch || l.name.toLowerCase().includes(locSearch.toLowerCase())).map(l => (
                        <div key={l.id}
                          style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}
                          onMouseDown={() => { setLocationId(l.id); setLocSearch(l.name); setShowLocDropdown(false); }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                          onMouseLeave={e => e.currentTarget.style.background = 'white'}
                        >{l.name}</div>
                      ))}
                      {locations.filter(l => !locSearch || l.name.toLowerCase().includes(locSearch.toLowerCase())).length === 0 && (
                        <div style={{ padding: '8px 12px', fontSize: 13, color: '#9ca3af' }}>No locations found</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">General notes (optional)</label>
                  <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Overall observations..." style={{ height: 38 }} />
                </div>
              </div>

              {Object.entries(grouped).map(([category, catItems]) => (
                <div key={category}>
                  <div className="ppe-section-header">{CATEGORY_LABELS[category] || category}</div>
                  <div className="ppe-col-header" style={{ gridTemplateColumns: '1.5fr 140px 70px 1.5fr 90px' }}>
                    <div>PPE/Tool Item</div><div>Size</div><div>Qty</div><div>Comment</div><div style={{ textAlign: 'center' }}>Needed</div>
                  </div>
                  {catItems.map(ppe => {
                    const it = items[ppe.id] || { size: '', quantity: 1, applicable: false, comment: '' };
                    return (
                      <div key={ppe.id} className="ppe-row" style={{ opacity: it.applicable ? 1 : 0.5, gridTemplateColumns: '1.5fr 140px 70px 1.5fr 90px' }}>
                        <div className="ppe-name">{ppe.name}</div>
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
                            style={{ width: 55, height: 32, padding: '4px 8px', borderRadius: 6, border: '1px solid', borderColor: (it.quantity || 1) > 1 ? '#e53e3e' : '#e5e7eb', background: (it.quantity || 1) > 1 ? '#fff5f5' : 'white', color: (it.quantity || 1) > 1 ? '#e53e3e' : '#0f2a4a', fontWeight: (it.quantity || 1) > 1 ? 700 : 400, fontSize: 13, textAlign: 'center' }}
                          />
                        </div>
                        <div className="ppe-cell">
                          <input
                            className="ppe-comment"
                            placeholder="Comment..."
                            value={it.comment || ''}
                            onChange={e => setItemField(ppe.id, 'comment', e.target.value)}
                            disabled={!it.applicable}
                          />
                        </div>
                        <div className="ppe-cell" style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={it.applicable}
                            onChange={e => setItemField(ppe.id, 'applicable', e.target.checked)}
                            style={{ width: 18, height: 18, accentColor: '#1D9E75' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {ppeItems.length === 0 && (
                <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  No PPE items assigned to this {personType === 'employee' ? 'employee' : 'casual'} yet. Go to {personType === 'employee' ? 'Employees' : 'Casuals'} page to assign items first.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
