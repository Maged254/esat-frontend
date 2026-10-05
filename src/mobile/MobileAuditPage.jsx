import React, { useEffect, useState } from 'react';
import api, { logError } from '../utils/api';
import { useAuth } from '../utils/AuthContext';

// The phone version of New Audit. Same three steps, same endpoints and the same
// validation as the desktop page -- only the controls are rebuilt for a thumb:
// the 5-filter picker becomes one search box, and the six-column PPE grid
// becomes one card per item. Everything that decides what gets stored (who is
// recorded as auditor, the audit date, the rules below) is copied deliberately
// from NewAuditPage so the two surfaces cannot disagree about what an audit is.

const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const SHOE_SIZES = ['38', '39', '40', '41', '42', '43', '44', '45', '46'];
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

const DOC_LABELS = {
  JHA: 'Job Hazard Analysis',
  Toolbox_Talk_Sheet: 'Toolbox Talk Sheet',
  PPE_Inspection_Checklist: 'PPE Inspection Checklist',
  Emergency_Response_Plan: 'Emergency Response Plan',
  Vehicle_Safety_Checklist: 'Vehicle Safety Checklist',
};
const emptyDocs = () => Object.fromEntries(Object.keys(DOC_LABELS).map(k => [k, null]));

const PAGE_SIZE = 25;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '';
// Same "recently distributed" window (4 months) as the desktop page.
const isRecentDistribution = (date) =>
  !!date && new Date(date) >= new Date(new Date().setMonth(new Date().getMonth() - 4));

export default function MobileAuditPage() {
  const { user } = useAuth();

  const [step, setStep] = useState('pick');          // pick | check | docs

  // Step 1 -- picker
  const [term, setTerm] = useState('');
  const [people, setPeople] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);

  // Step 2 -- checklist
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [ppeItems, setPpeItems] = useState([]);
  const [items, setItems] = useState({});
  const [loadingPpe, setLoadingPpe] = useState(false);
  const [auditDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [locSearch, setLocSearch] = useState('');
  const [validationErrors, setValidationErrors] = useState([]);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Step 3 -- documents
  const [auditId, setAuditId] = useState(null);
  const [docs, setDocs] = useState(emptyDocs);
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => { api.get('/locations').then(r => setLocations(r.data)).catch(logError); }, []);

  // The same list the desktop picker shows: active people who need a safety
  // audit. Neither filter is user-adjustable there either.
  useEffect(() => {
    if (step !== 'pick') return;
    setSearching(true);
    const t = setTimeout(() => {
      const p = new URLSearchParams({ status: 'active', san: 'yes', page: String(page), pageSize: String(PAGE_SIZE) });
      if (term.trim()) p.append('search', term.trim());
      api.get('/employees?' + p)
        .then(r => {
          const rows = r.data.rows || [];
          setPeople(prev => page === 1 ? rows : [...prev, ...rows]);
          setTotal(r.data.total || 0);
        })
        .catch(logError)
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [term, page, step]);

  useEffect(() => { setPage(1); }, [term]);

  const selectEmployee = async (emp) => {
    setSelectedEmp(emp);
    setStep('check');
    setLoadingPpe(true);
    setValidationErrors([]);
    setSubmitError('');
    try {
      const { data } = await api.get(`/employees/${emp.id}/ppe-assignments`);
      setPpeItems(data);
      setItems(Object.fromEntries(data.map(p =>
        [p.id, { condition: 'good', size: '', comment: '', quantity: 1, applicable: false }])));
    } catch (e) {
      logError(e);
      setPpeItems([]);
      setItems({});
      setSubmitError('Could not load this person’s PPE items. Go back and try again.');
    } finally {
      setLoadingPpe(false);
    }
  };

  const backToPicker = () => {
    setStep('pick');
    setSelectedEmp(null);
    setPpeItems([]);
    setItems({});
    setLocationId(''); setLocSearch('');
    setNotes('');
    setValidationErrors([]); setSubmitError('');
  };

  const setItemField = (ppeId, field, value) =>
    setItems(prev => ({ ...prev, [ppeId]: { ...prev[ppeId], [field]: value } }));

  // Size and quantity only describe a replacement, so they are only asked for
  // on a Not Good item. Moving off Not Good clears them rather than leaving a
  // size the auditor can no longer see but would still submit.
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
          ...(condition === 'not_good' ? {} : { size: '', quantity: 1 }),
          ...(shouldDefaultReplacement ? { comment: 'Replacement' } : {}),
        },
      };
    });
  };

  const toggleApplicable = (ppe) =>
    setItems(prev => {
      const checked = !prev[ppe.id]?.applicable;
      return { ...prev, [ppe.id]: { ...prev[ppe.id], applicable: checked } };
    });

  const ticked = ppeItems.filter(p => items[p.id]?.applicable).length;

  // Byte-for-byte the desktop rules. `employeePresent` is hard-wired to true
  // there (both buttons are disabled), so the "not present" branch cannot be
  // reached from either surface and is not reproduced here -- but its
  // consequence is: with the employee present, every item must be ticked.
  const handleSubmit = async () => {
    if (!selectedEmp) return;
    const errors = [];
    if (!user?.id) errors.push('Could not tell who you are — sign in again.');
    if (!locationId) errors.push('Please select a location.');
    const applicableItems = ppeItems.filter(p => items[p.id]?.applicable);
    if (applicableItems.length === 0) errors.push('Please tick at least one PPE/Tool item as applicable.');
    const unticked = ppeItems.filter(p => !items[p.id]?.applicable);
    if (unticked.length > 0) {
      errors.push(`Every PPE/Tool item must be ticked Applicable — ${unticked.length} still untick${unticked.length === 1 ? 'ed' : 'ed'}.`);
    }
    const missingSizes = applicableItems.filter(p =>
      p.has_size && items[p.id]?.condition === 'not_good' && !items[p.id]?.size);
    if (missingSizes.length > 0) errors.push('Please select a size for: ' + missingSizes.map(p => p.name).join(', ') + '.');
    const fireExtinguisher = applicableItems.find(p =>
      p.name === FIRE_EXTINGUISHER_ITEM && items[p.id]?.condition === 'not_good');
    if (fireExtinguisher && !FIRE_EXTINGUISHER_COMMENT_OPTIONS.includes(items[fireExtinguisher.id]?.comment)) {
      errors.push(`Please select New Issuance or Replacement for: ${FIRE_EXTINGUISHER_ITEM}.`);
    }
    if (errors.length > 0) {
      setValidationErrors(errors);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setValidationErrors([]); setSubmitError('');
    setSubmitting(true);
    try {
      const auditItems = applicableItems.map(p => ({
        ppe_item_id: p.id,
        condition: items[p.id]?.condition || 'good',
        size_value: items[p.id]?.size || null,
        comment: items[p.id]?.comment || null,
        quantity: items[p.id]?.quantity || 1,
      }));
      const res = await api.post('/audits', {
        employee_id: selectedEmp.id,
        audit_date: auditDate,
        audited_by_override: user.id,
        employee_present: true,
        location_id: locationId || null,
        notes,
        items: auditItems,
      });
      setAuditId(res.data?.id || res.data?.audit?.id);
      setStep('docs');
      window.scrollTo({ top: 0 });
    } catch (err) {
      logError(err);
      setSubmitError(err.response?.data?.error || 'Failed to submit the audit. Nothing was saved — try again.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  const finish = () => {
    setSuccessMsg('');
    setAuditId(null);
    setDocs(emptyDocs());
    setUploadProgress({});
    backToPicker();
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
        const response = await fetch(
          (process.env.REACT_APP_API_URL || 'https://esat-backend-drwm.onrender.com') + '/api/audit-documents/upload',
          { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
        setUploadProgress(p => ({ ...p, [fieldName]: response.ok ? 'done' : 'error' }));
      } catch (err) {
        logError(err);
        setUploadProgress(p => ({ ...p, [fieldName]: 'error' }));
      }
    }
    setUploading(false);
    setSuccessMsg(`Audit for ${selectedEmp?.full_name} submitted.`);
    setTimeout(finish, 3000);
  };

  // ── Step 1 — who ────────────────────────────────────────────
  if (step === 'pick') {
    const more = people.length < total;
    return (
      <>
        <input className="m-input" placeholder="Name, employee number, ID…" value={term}
               onChange={e => setTerm(e.target.value)} autoComplete="off" />
        <div className="m-count">
          {searching && !people.length ? 'Searching…' : `${total} awaiting a safety audit`}
        </div>
        {!searching && !people.length ? (
          <div className="m-empty">{term.trim() ? `Nobody matches “${term.trim()}”.` : 'Nobody to audit.'}</div>
        ) : (
          <>
            {people.map(p => (
              <button className="m-row" key={p.id} onClick={() => selectEmployee(p)}>
                <span>
                  <span style={{ fontWeight: 600, color: '#0f2a4a', fontSize: 14 }}>{p.full_name}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#6b7280', marginTop: 3 }}>
                    {[p.national_id || p.employee_number, p.job_title, p.project].filter(Boolean).join(' · ')}
                  </span>
                  <span style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
                    {p.last_audit_date
                      ? <><span className={`dot ${p.days_since_audit > 30 ? 'dot-red' : 'dot-green'}`} />
                          <span style={{ color: p.days_since_audit > 30 ? '#A32D2D' : '#166534' }}>
                            Audited {p.days_since_audit}d ago</span></>
                      : <span style={{ color: '#9ca3af' }}>Never audited</span>}
                  </span>
                </span>
                <i className="ti ti-chevron-right" style={{ color: '#9ca3af' }} aria-hidden="true" />
              </button>
            ))}
            {more && (
              <button className="m-btn" style={{ width: '100%', marginTop: 4 }}
                      disabled={searching} onClick={() => setPage(p => p + 1)}>
                {searching ? 'Loading…' : `Load more (${people.length} of ${total})`}
              </button>
            )}
          </>
        )}
      </>
    );
  }

  // ── Step 3 — documents ──────────────────────────────────────
  if (step === 'docs') {
    return (
      <>
        {successMsg && <div className="m-ok">✅ {successMsg}</div>}
        <div className="m-card">
          <div className="m-card-title">Upload documents</div>
          <div className="m-card-sub">Optional — attach safety documents for {selectedEmp?.full_name}.</div>
        </div>
        {Object.keys(DOC_LABELS).map(fieldName => (
          <div className="m-card" key={fieldName}>
            <div className="m-field-label">
              {DOC_LABELS[fieldName]}
              {uploadProgress[fieldName] === 'done' && <span style={{ color: '#166534', marginLeft: 8 }}>✓ Uploaded</span>}
              {uploadProgress[fieldName] === 'error' && <span style={{ color: '#A32D2D', marginLeft: 8 }}>✗ Failed</span>}
            </div>
            <input type="file" accept="image/*,.pdf" className="m-file"
                   onChange={e => setDocs(d => ({ ...d, [fieldName]: e.target.files[0] || null }))} />
            {docs[fieldName] && <div className="m-card-sub">📎 {docs[fieldName].name}</div>}
          </div>
        ))}
        <div className="m-stickybar-space" />
        <div className="m-stickybar">
          <button className="m-btn" onClick={finish} disabled={uploading}>Skip</button>
          <button className="m-btn m-btn-approve" onClick={handleUploadAndFinish} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload & finish'}
          </button>
        </div>
      </>
    );
  }

  // ── Step 2 — the checklist ──────────────────────────────────
  const grouped = ppeItems.reduce((acc, p) => { (acc[p.category] = acc[p.category] || []).push(p); return acc; }, {});
  const locMatches = locations.filter(l => !locSearch || l.name.toLowerCase().includes(locSearch.toLowerCase()));

  return (
    <>
      {validationErrors.map((e, i) => <div className="m-error" key={i}>⚠ {e}</div>)}
      {submitError && <div className="m-error">⚠ {submitError}</div>}

      <div className="m-card">
        <div className="m-card-title">{selectedEmp.full_name}</div>
        <div className="m-card-sub">
          {[selectedEmp.national_id || selectedEmp.employee_number, selectedEmp.job_title].filter(Boolean).join(' · ')}<br />
          {[selectedEmp.department, selectedEmp.project, selectedEmp.client].filter(Boolean).join(' · ')}
        </div>
        <div className="m-card-actions">
          <button className="m-btn" onClick={backToPicker}>Change person</button>
        </div>
      </div>

      <div className="m-card">
        <div className="m-card-sub" style={{ marginTop: 0 }}>
          {fmtDate(auditDate)} · audited by {user?.full_name || user?.name}
        </div>

        <div className="m-field-label" style={{ marginTop: 14 }}>Location <span style={{ color: '#e24b4a' }}>*</span></div>
        <input className="m-input" placeholder="Search location…" autoComplete="off" value={locSearch}
               onChange={e => { setLocSearch(e.target.value); setLocationId(''); }} />
        {/* Shown until one is picked rather than hidden on blur: a blur-timed
            dropdown is a coin toss on touch. */}
        {!locationId && locSearch.trim() !== '' && (
          <div className="m-drop">
            {locMatches.length
              ? locMatches.slice(0, 40).map(l => (
                  <button className="m-drop-item" key={l.id}
                          onClick={() => { setLocationId(l.id); setLocSearch(l.name); }}>{l.name}</button>
                ))
              : <div className="m-drop-item" style={{ color: '#9ca3af' }}>No locations found</div>}
          </div>
        )}

        <div className="m-field-label" style={{ marginTop: 14 }}>General notes (optional)</div>
        <textarea className="m-input" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Overall observations…" />
      </div>

      {loadingPpe ? <div className="m-empty">Loading PPE items…</div>
        : !ppeItems.length ? <div className="m-empty">No PPE items assigned to this person.</div>
        : Object.entries(grouped).map(([category, catItems]) => (
          <div key={category}>
            <div className="m-section">{CATEGORY_LABELS[category] || category}</div>
            {catItems.map(ppe => {
              const it = items[ppe.id] || { condition: 'good', size: '', comment: '', quantity: 1, applicable: false };
              const requiresIssuanceType = ppe.name === FIRE_EXTINGUISHER_ITEM && it.condition === 'not_good';
              return (
                <div className={'m-card m-ppe' + (it.applicable ? '' : ' m-ppe-off')} key={ppe.id}>
                  <button className="m-check" onClick={() => toggleApplicable(ppe)} aria-pressed={it.applicable}>
                    <span className={'m-check-box' + (it.applicable ? ' on' : '')} aria-hidden="true">
                      {it.applicable ? '✓' : ''}
                    </span>
                    <span>
                      <span className="m-card-title" style={{ fontSize: 14 }}>{ppe.name}</span>
                      <span className="m-card-sub" style={{ display: 'block' }}>
                        {ppe.last_distributed
                          ? <span style={{ color: isRecentDistribution(ppe.last_distributed) ? 'var(--wf-pm, #7c3aed)' : '#9ca3af' }}>
                              Last distributed {fmtDate(ppe.last_distributed)}</span>
                          : 'Never distributed'}
                      </span>
                    </span>
                  </button>

                  {it.applicable && (
                    <>
                      <div className="m-seg">
                        {[['good', '✓ Good'], ['not_good', '✗ Not Good'], ['not_present', '— Left at Home']].map(([cond, label]) => (
                          <button key={cond} onClick={() => setItemCondition(ppe, cond)}
                                  className={'m-seg-btn' + (it.condition === cond ? ` on-${cond}` : '')}>
                            {label}
                          </button>
                        ))}
                      </div>

                      {it.condition === 'not_good' && (
                        <div className="m-ppe-grid">
                          {ppe.has_size && (
                            <div>
                              <div className="m-field-label">Size <span style={{ color: '#e24b4a' }}>*</span></div>
                              <select className="m-input" value={it.size}
                                      onChange={e => setItemField(ppe.id, 'size', e.target.value)}>
                                <option value="">—</option>
                                {(ppe.size_type === 'shoe' ? SHOE_SIZES : CLOTHING_SIZES).map(s =>
                                  <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                          )}
                          <div>
                            <div className="m-field-label">Quantity</div>
                            <div className="m-qty">
                              <button onClick={() => setItemField(ppe.id, 'quantity', Math.max((it.quantity || 1) - 1, 1))}
                                      aria-label="Decrease quantity">−</button>
                              <span className={(it.quantity || 1) > 1 ? 'hot' : ''}>{it.quantity || 1}</span>
                              <button onClick={() => setItemField(ppe.id, 'quantity', (it.quantity || 1) + 1)}
                                      aria-label="Increase quantity">+</button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="m-field-label" style={{ marginTop: 10 }}>
                        {requiresIssuanceType ? 'Issuance type *' : 'Comment'}
                      </div>
                      {requiresIssuanceType ? (
                        <select className="m-input" value={it.comment}
                                onChange={e => setItemField(ppe.id, 'comment', e.target.value)}
                                aria-label={`${ppe.name} issuance type`}>
                          <option value="">Select issuance type *</option>
                          {FIRE_EXTINGUISHER_COMMENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input className="m-input" placeholder="Comment…" value={it.comment}
                               onChange={e => setItemField(ppe.id, 'comment', e.target.value)} />
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}

      <div className="m-stickybar-space" />
      <div className="m-stickybar">
        <span className="m-stickybar-note">{ticked}/{ppeItems.length} ticked</span>
        <button className="m-btn m-btn-approve" onClick={handleSubmit} disabled={submitting || loadingPpe}>
          {submitting ? 'Submitting…' : 'Submit audit'}
        </button>
      </div>
    </>
  );
}
