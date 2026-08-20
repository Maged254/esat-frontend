// ── EmployeesPage ────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { logError } from '../utils/api';
import MultiSelect from '../components/MultiSelect';

const fmtTipDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Resource classification pill colours. Inhouse/Intern are Egypro; the two
// Outsource kinds come from the organization's entity type.
const CLASS_STYLE = {
  'Inhouse': { background: '#e8eefb', color: '#042C53' },
  'Intern': { background: '#fef3c7', color: '#92400e' },
  'Outsource (Services)': { background: '#e0e7ff', color: '#3730a3' },
  'Outsource (Vehicle Supplier)': { background: '#dcfce7', color: '#166534' },
  'Outsource': { background: '#f1f5f9', color: '#475569' },
};
function ClassificationTag({ value }) {
  if (!value) return <span style={{ color: '#9ca3af' }}>—</span>;
  const s = CLASS_STYLE[value] || CLASS_STYLE['Outsource'];
  return <span className="tag" style={{ ...s, whiteSpace: 'nowrap' }}>{value}</span>;
}

// Searchable combobox: type to filter, click to pick. `options` is [{value, badge?}]
// where badge is {text, style}. Used for the Add-form Organization / Department /
// Project / Client fields, which have long, admin-managed lists.
function Combobox({ value, onChange, options, placeholder = 'Type to search…', error, noMatch = '' }) {
  const [open, setOpen] = useState(false);
  const q = (value || '').trim().toLowerCase();
  const list = options.filter(o => o.value.toLowerCase().includes(q));
  return (
    <div style={{ position: 'relative' }}>
      <input className="form-input" value={value || ''} placeholder={placeholder} autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={error ? { borderColor: '#e24b4a' } : undefined} />
      {open && (list.length > 0 || noMatch) && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 2, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.16)', maxHeight: 220, overflowY: 'auto' }}>
          {list.length === 0 && noMatch && <div style={{ padding: '8px 12px', fontSize: 12, color: '#9ca3af' }}>{noMatch}</div>}
          {list.map(o => (
            <div key={o.value} onMouseDown={() => { onChange(o.value); setOpen(false); }}
              style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', borderTop: '1px solid #f3f4f6' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F0F7FF'} onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              <span>{o.value}</span>
              {o.badge && <span className="tag" style={{ fontSize: 10, whiteSpace: 'nowrap', ...o.badge.style }}>{o.badge.text}</span>}
            </div>
          ))}
        </div>
      )}
      {error && <div style={{ fontSize: 11, color: '#e24b4a', marginTop: 3 }}>{error}</div>}
    </div>
  );
}

// Employment status tag with a modern hover tooltip: for Active shows when/who
// added the employee; for Exit shows when/who exited them.
function StatusCell({ status, createdAt, createdBy, exitDate, exitedBy }) {
  const [show, setShow] = useState(false);
  const active = status === 'active';
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : '—';
  const rows = active
    ? [['Added', fmtTipDate(createdAt)], ['By', createdBy || '—']]
    : [['Exited', fmtTipDate(exitDate)], ['By', exitedBy || '—']];
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span className={`tag ${active ? 'tag-green' : 'tag-red'}`} style={{ cursor: 'default' }}>{label}</span>
      {show && (
        <span style={{ position: 'absolute', bottom: 'calc(100% + 9px)', left: 0, zIndex: 200,
          background: '#0f2a4a', color: '#fff', padding: '8px 11px', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.28)', fontSize: 11, whiteSpace: 'nowrap', lineHeight: 1.6, pointerEvents: 'none' }}>
          {rows.map(([k, v]) => (
            <div key={k}><span style={{ opacity: 0.6 }}>{k}:</span> <b style={{ fontWeight: 600 }}>{v}</b></div>
          ))}
          <span style={{ position: 'absolute', top: '100%', left: 14, width: 0, height: 0,
            borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid #0f2a4a' }} />
        </span>
      )}
    </span>
  );
}

export function EmployeesPage({ outsource = false }) {
  const [employees, setEmployees] = useState([]);
  const [ppeAssignModal, setPpeAssignModal] = useState(null); // employee object
  const [allPpeItems, setAllPpeItems] = useState([]);
  const [assignedPpe, setAssignedPpe] = useState([]); // array of ppe_item ids
  const [ppeAssignSaving, setPpeAssignSaving] = useState(false);
  const [editModal, setEditModal] = useState(null); // employee being edited
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editErrors, setEditErrors] = useState({}); // inline validation for the Edit modal
  const [editConfirm, setEditConfirm] = useState(null); // styled "confirm update" dialog {payload, summary}
  const [exitConfirm, setExitConfirm] = useState(false); // red exit confirmation dialog
  const [deleteConfirm, setDeleteConfirm] = useState(null); // employee pending hard-delete (admin)
  const [convertModal, setConvertModal] = useState(null); // intern being converted to in-house
  const [convertForm, setConvertForm] = useState({ job_title: '', employee_number: '', reason: '' });
  const [convertErrors, setConvertErrors] = useState({});
  const [convertSaving, setConvertSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addModal, setAddModal] = useState(false); // Add Employee modal
  const [addForm, setAddForm] = useState({});
  const [addSaving, setAddSaving] = useState(false);
  const [addType, setAddType] = useState('inhouse'); // 'inhouse' | 'intern'
  const [addFile, setAddFile] = useState(null); // mandatory National ID PDF
  const [addMenu, setAddMenu] = useState(false); // In-House / Intern chooser
  const [addErrors, setAddErrors] = useState({}); // inline per-field validation errors
  // Stat-card clicks (activeStat) and the status/resource dropdowns are
  // mutually exclusive in the UI and collapse to canonical status/
  // resource_type values for the backend -- same pattern as the NCR page's
  // stat cards, so exactly one card (or neither) is ever highlighted.
  const [filters, setFilters] = useState({ status: 'active', department: '', resource_type: '', classification: '', search: '', national_id: '', employee_number: '', project: '', client: '', san: '', job_title: '', audit_age: '', activeStat: 'active' });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 25;
  const [stats, setStats] = useState({ total_active: 0, inhouse: 0, outsource: 0, interns: 0, exits: 0 });
  const [filterOptions, setFilterOptions] = useState({ departments: [], projects: [], clients: [] });
  const [orgLists, setOrgLists] = useState({ department: [], project: [], client: [] }); // admin-managed dropdown options
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [hrTasks, setHrTasks] = useState([]); // current user's hr_task_access
  const [outsourceAccess, setOutsourceAccess] = useState([]); // subtypes this user manages
  const [outsourceEntities, setOutsourceEntities] = useState([]); // {name,type} for the Add-Outsource org dropdown
  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('esat_user'));
      if (user) { setUserRole(user.role); setHrTasks(Array.isArray(user.hr_task_access) ? user.hr_task_access : []); setOutsourceAccess(Array.isArray(user.outsource_access) ? user.outsource_access : []); }
    } catch {}
  }, []);
  // Outsource entities for the Add form's Organization dropdown (only the ones
  // whose subtype the current user may manage; admins see all).
  useEffect(() => {
    if (!outsource) return;
    api.get('/outsource-entities').then(r => setOutsourceEntities(r.data)).catch(logError);
  }, [outsource]);

  const toggleSAN = async (emp) => {
    const newVal = !emp.san;
    await api.put(`/employees/${emp.id}/san`, { san: newVal });
    setEmployees(prev => prev.map(e => e.id === emp.id ? {...e, san: newVal} : e));
  };

  // Collapses activeStat to the status/resource_type pair the backend
  // understands -- 'intern' isn't a real resource_type filter value from a
  // dropdown's perspective, just a card shortcut resolved here.
  const effectiveFilters = () => {
    const f = { ...filters };
    if (f.activeStat === 'active') { f.status = 'active'; f.resource_type = ''; }
    else if (f.activeStat === 'inhouse') { f.status = 'active'; f.resource_type = 'inhouse'; }
    else if (f.activeStat === 'outsource') { f.status = 'active'; f.resource_type = 'outsource'; }
    else if (f.activeStat === 'intern') { f.status = 'active'; f.resource_type = 'intern'; }
    else if (f.activeStat === 'services') { f.status = 'active'; } // classification already set by the card
    else if (f.activeStat === 'vehicle') { f.status = 'active'; }
    else if (f.activeStat === 'exit') { f.status = 'exit'; f.resource_type = ''; }
    delete f.activeStat;
    return f;
  };

  const filterParams = () => {
    const params = new URLSearchParams();
    Object.entries(effectiveFilters()).forEach(([k, v]) => { if (v) params.append(k, v); });
    if (outsource) params.append('outsource_scope', '1');
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
  useEffect(() => {
    api.get('/org-lists').then(r => {
      const g = { department: [], project: [], client: [] };
      r.data.forEach(o => { if (g[o.list_type]) g[o.list_type].push(o.name); });
      setOrgLists(g);
    }).catch(logError);
  }, []);

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
      const headers = ['employee_number','full_name','national_id','job_title','department','project','client','organization','resource_type','classification','employment_status','san','last_audit_date'];
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
  const canAssignPpe = ['admin','ehs_manager'].includes(userRole);
  // Add/Edit Employee are admin-always, or HR with the task assigned (Admin → HR Tasks Managers).
  // On the Outsource page, an outsource subtype-manager (fleet/supervisor) can also add/edit.
  const canAddEmployee = userRole === 'admin' || (userRole === 'hr' && hrTasks.includes('add_employee')) || (outsource && outsourceAccess.length > 0);
  // HR's edit_employee task applies to the Employees page only; the Outsource page
  // is edited by admins and outsource-managers (Fleet) via outsourceAccess.
  const canEditEmployee = userRole === 'admin' || (!outsource && userRole === 'hr' && hrTasks.includes('edit_employee')) || (outsource && outsourceAccess.length > 0);
  // Per-row edit: admin edits everyone; on the Employees page a non-admin (HR)
  // may edit only Inhouse/Intern rows — outsource rows are admin-only.
  const canEditRow = (e) => userRole === 'admin' || (outsource ? canEditEmployee : (canEditEmployee && ['Inhouse','Intern'].includes(e.classification)));
  // Organizations the current user may add an outsource resource under (admins: all).
  const manageableOrgs = outsourceEntities.filter(e => userRole === 'admin' || outsourceAccess.includes(e.type));
  const showSanAudit = userRole !== 'hr'; // HR doesn't need the SAN / Last Audit (audit-compliance) column
  const colCount = (showSanAudit ? 6 : 5) + (canEditEmployee ? 2 : 0) + (canAssignPpe ? 1 : 0);

  // Fields the "Update Resource's Details" modal exposes as Before → After rows.
  const editFields = [
    { key: 'full_name', label: 'Employee Name', type: 'text' },
    { key: 'department', label: 'Department', type: 'select', options: orgLists.department },
    { key: 'project', label: 'Project', type: 'select', options: orgLists.project },
    { key: 'client', label: 'Client', type: 'select', options: orgLists.client },
    { key: 'job_title', label: 'Job Title', type: 'text' },
  ];
  const fieldLabel = (k) => (editFields.find(f => f.key === k) || {}).label || k;
  // Add a new employee directly (for when ESAT is the independent master list,
  // post-ETMS). Mirrors the ETMS "Add New Hire" form; uses POST /employees.
  const openAdd = (type) => {
    setAddType(type);
    setAddMenu(false);
    setAddFile(null);
    setAddErrors({});
    // Interns are always job title "Intern" (field hidden on the intern form).
    setAddForm({ full_name: '', national_id: '', employee_number: '', job_title: type === 'intern' ? 'Intern' : '', department: '', project: '', client: '', organization: type === 'outsource' ? '' : 'Egypro' });
    setAddModal(true);
  };
  // Update a field and clear its inline error as the user types.
  const setAddField = (k, v) => { setAddForm(f => ({ ...f, [k]: v })); setAddErrors(e => (e[k] ? { ...e, [k]: undefined } : e)); };
  const saveAdd = async () => {
    const required = { full_name: 'Resource Name', national_id: 'National ID Number', department: 'Department', project: 'Project Name', client: 'Client', job_title: 'Job Title' };
    if (addType === 'inhouse') required.employee_number = 'Employment ID'; // interns/outsource have no Employment ID
    if (addType === 'outsource') required.organization = 'Organization'; // the org determines the outsource subtype
    const errs = {};
    for (const k in required) { if (!String(addForm[k] || '').trim()) errs[k] = `${required[k]} is required`; }
    if (addForm.national_id && !/^\d+$/.test(addForm.national_id.trim())) errs.national_id = 'Use digits only';
    // Combobox fields must resolve to a value from their (admin-managed) list; accept
    // a case-insensitive typed match and send the canonical value.
    const canon = {};
    if (addType === 'outsource' && String(addForm.organization || '').trim()) {
      const match = manageableOrgs.find(o => o.name.trim().toLowerCase() === String(addForm.organization).trim().toLowerCase());
      if (!match) errs.organization = 'Pick a registered organization from the list';
      else canon.organization = match.name;
    }
    for (const [field, opts] of [['department', orgLists.department], ['project', orgLists.project], ['client', orgLists.client]]) {
      const v = String(addForm[field] || '').trim();
      if (!v) continue; // empty is caught by the required check
      const match = opts.find(o => o.toLowerCase() === v.toLowerCase());
      if (!match) errs[field] = 'Pick from the list';
      else canon[field] = match;
    }
    if (!addFile) errs.file = 'A National ID PDF is required';
    else if (!(/\.pdf$/i.test(addFile.name) || addFile.type === 'application/pdf')) errs.file = 'File must be a PDF';
    else if (addFile.size > 1024 * 1024) errs.file = 'File must be 1MB or smaller';
    if (Object.keys(errs).length) { setAddErrors(errs); return; }
    setAddSaving(true);
    try {
      const fd = new FormData();
      Object.entries({ ...addForm, ...canon }).forEach(([k, v]) => fd.append(k, v));
      fd.append('resource_type', addType);
      fd.append('national_id_doc', addFile);
      const resp = await fetch(`${api.defaults.baseURL}/employees/manual`, {
        method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('esat_token')}` }, body: fd,
      });
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error || 'Failed to add employee'); }
      setAddModal(false);
      reload();
    } catch (e) {
      logError(e);
      const msg = e.message || 'Failed to add employee';
      if (/national id/i.test(msg)) setAddErrors({ national_id: msg });
      else if (/employment id/i.test(msg)) setAddErrors({ employee_number: msg });
      else if (/organization|outsource entit/i.test(msg)) setAddErrors({ organization: msg });
      else setAddErrors({ _server: msg });
    }
    setAddSaving(false);
  };
  const openEdit = (emp) => {
    setEditModal(emp);
    setEditErrors({});
    setEditForm({
      edit: { full_name: false, department: false, project: false, client: false, job_title: false },
      after: { full_name: emp.full_name || '', department: emp.department || '', project: emp.project || '', client: emp.client || '', job_title: emp.job_title || '' },
      reason: '',
    });
  };
  const toggleField = (key) => { setEditForm(f => ({ ...f, edit: { ...f.edit, [key]: !f.edit[key] } })); setEditErrors(e => (e._general ? { ...e, _general: undefined } : e)); };
  const setAfter = (key, val) => { setEditForm(f => ({ ...f, after: { ...f.after, [key]: val } })); setEditErrors(e => (e._general ? { ...e, _general: undefined } : e)); };
  const saveEdit = async () => {
    const changedKeys = Object.keys(editForm.edit).filter(k => editForm.edit[k]);
    const normv = (v) => (v === undefined || v === null) ? '' : String(v).trim();
    const afterVal = (k) => k === 'full_name' ? (editForm.after[k] || '').trim() : editForm.after[k];
    const actuallyChanged = changedKeys.filter(k => normv(afterVal(k)) !== normv(editModal[k]));
    const errs = {};
    if (!changedKeys.length) errs._general = 'Tick at least one field to change.';
    else if (editForm.edit.full_name && !editForm.after.full_name.trim()) errs._general = 'Employee name cannot be empty.';
    else if (!actuallyChanged.length) errs._general = 'No changes to save.';
    if (!editForm.reason.trim()) errs.reason = 'A reason is required';
    if (Object.keys(errs).length) { setEditErrors(errs); return; }
    const val = (k) => editForm.edit[k] ? editForm.after[k] : editModal[k];
    const payload = {
      full_name: (editForm.edit.full_name ? editForm.after.full_name.trim() : editModal.full_name),
      national_id: editModal.national_id,
      job_title: val('job_title'), department: val('department'), project: val('project'), client: val('client'),
      reason: editForm.reason.trim(),
    };
    setEditConfirm({ payload, summary: actuallyChanged.map(fieldLabel).join(', ') });
  };
  // Ticked fields whose value actually differs from the current record — i.e. edits
  // the user made but hasn't saved via "Update Details".
  const pendingEditFields = () => {
    const normv = (v) => (v === undefined || v === null) ? '' : String(v).trim();
    const afterVal = (k) => k === 'full_name' ? (editForm.after[k] || '').trim() : editForm.after[k];
    return Object.keys(editForm.edit)
      .filter(k => editForm.edit[k] && normv(afterVal(k)) !== normv(editModal[k]))
      .map(fieldLabel);
  };
  // Block Exit / Convert when there are unsaved field edits, so they aren't silently
  // lost (those actions don't save the ticked changes).
  const guardUnsaved = (thenFn, verb) => {
    const pend = pendingEditFields();
    if (pend.length) { setEditErrors(e => ({ ...e, _general: `You changed ${pend.join(', ')} but haven't saved. Click "Update Details" first, or untick to discard, before ${verb}.` })); return; }
    thenFn();
  };
  const doEditSave = async () => {
    if (!editConfirm) return;
    setEditSaving(true);
    try {
      await api.put('/employees/' + editModal.id, editConfirm.payload);
      setEditConfirm(null);
      setEditModal(null);
      reload();
    } catch (e) { logError(e); setEditErrors({ _server: e.response?.data?.error || 'Update failed' }); setEditConfirm(null); }
    setEditSaving(false);
  };
  // Exit uses a custom red confirmation dialog (not window.confirm, which can't
  // be styled) since it's a destructive, cascading action.
  // Hard-delete an employee (admin only) — permanent, via a red confirmation.
  const doDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await api.delete('/employees/' + deleteConfirm.id);
      setDeleteConfirm(null);
      setEditModal(null);
      reload();
    } catch (e) { logError(e); alert(e.response?.data?.error || 'Delete failed'); }
    setDeleting(false);
  };
  const doExit = async () => {
    if (!editModal || editModal.employment_status !== 'active') { setExitConfirm(false); return; }
    setExitConfirm(false);
    setEditSaving(true);
    try {
      await api.put('/employees/' + editModal.id + '/status', { employment_status: 'exit', exit_date: new Date().toISOString().slice(0, 10) });
      setEditModal(null);
      reload();
    } catch (e) { logError(e); alert(e.response?.data?.error || 'Exit failed'); }
    setEditSaving(false);
  };
  // Convert an intern to a full in-house employee: collect the missing Job Title +
  // Employment ID; the backend sets the Added date to today and logs it (→ emailed).
  const openConvert = (emp) => {
    setConvertModal(emp);
    setConvertErrors({});
    setConvertForm({ job_title: emp.job_title && !/\bintern\b/i.test(emp.job_title) ? emp.job_title : '', employee_number: '', reason: 'Converted from Intern to In-House' });
  };
  const setConvertField = (k, v) => { setConvertForm(f => ({ ...f, [k]: v })); setConvertErrors(e => (e[k] ? { ...e, [k]: undefined } : e)); };
  const doConvert = async () => {
    const errs = {};
    if (!convertForm.job_title.trim()) errs.job_title = 'Job Title is required';
    else if (/\bintern\b/i.test(convertForm.job_title)) errs.job_title = 'Pick a non-intern job title';
    if (!convertForm.employee_number.trim()) errs.employee_number = 'Employment ID is required';
    if (Object.keys(errs).length) { setConvertErrors(errs); return; }
    setConvertSaving(true);
    try {
      await api.post('/employees/' + convertModal.id + '/promote', {
        job_title: convertForm.job_title.trim(),
        employee_number: convertForm.employee_number.trim(),
        reason: convertForm.reason.trim(),
      });
      setConvertModal(null);
      setEditModal(null);
      reload();
    } catch (e) {
      logError(e);
      const msg = e.response?.data?.error || 'Conversion failed';
      if (/employment id/i.test(msg)) setConvertErrors({ employee_number: msg });
      else setConvertErrors({ _server: msg });
    }
    setConvertSaving(false);
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub</span><span className="topbar-sep">›</span>
          <span className="topbar-title">{outsource ? 'Outsource' : 'Employees'}</span>
        </div>
        <div className="topbar-right">
          {canAddEmployee && outsource && (
            <button className="btn btn-primary" onClick={()=>openAdd('outsource')}>+ Add Outsource</button>
          )}
          {canAddEmployee && !outsource && (
            <div style={{position:'relative'}}>
              <button className="btn btn-primary" onClick={()=>setAddMenu(m=>!m)}>+ Add Employee ▾</button>
              {addMenu && (
                <>
                  <div onClick={()=>setAddMenu(false)} style={{position:'fixed',inset:0,zIndex:900}} />
                  <div style={{position:'absolute',top:'100%',right:0,marginTop:6,background:'#fff',border:'1px solid #e5e7eb',borderRadius:12,boxShadow:'0 12px 32px rgba(0,0,0,0.16)',zIndex:901,minWidth:250,padding:6}}>
                    {[
                      {type:'inhouse', icon:'ti-building', title:'In-House', desc:'In-house resource'},
                      {type:'intern', icon:'ti-school', title:'Intern', desc:'Internship resource'},
                    ].map(opt=>(
                      <button key={opt.type} onClick={()=>openAdd(opt.type)}
                        onMouseEnter={ev=>ev.currentTarget.style.background='#F0F7FF'} onMouseLeave={ev=>ev.currentTarget.style.background='none'}
                        style={{display:'flex',alignItems:'center',gap:12,width:'100%',textAlign:'left',padding:'10px 12px',background:'none',border:'none',cursor:'pointer',borderRadius:8,transition:'background 0.12s'}}>
                        <span style={{width:36,height:36,borderRadius:9,background:'#EAF2FF',color:'var(--eg-navy)',display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                          <i className={`ti ${opt.icon}`} style={{fontSize:19}} aria-hidden="true"></i>
                        </span>
                        <span>
                          <div style={{fontSize:13.5,fontWeight:600,color:'#111'}}>{opt.title}</div>
                          <div style={{fontSize:11,color:'#9ca3af',marginTop:1}}>{opt.desc}</div>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {userRole === 'admin' && <button className="btn" onClick={exportCSV}>↓ Export CSV</button>}
          {userRole === 'admin' && (
            <label className="btn" style={{cursor:'pointer'}}>
              {importing ? 'Importing...' : '↑ Import CSV'}
              <input type="file" accept=".csv" style={{display:'none'}} onChange={handleCSVImport} disabled={importing} />
            </label>
          )}
          
        </div>
      </div>
      <div className="content graphs-content">
        <div className="card" style={{marginBottom:24, position:'sticky', top:'var(--header-h)', zIndex:40}}>
          <div className="card-body" style={{display:'flex',flexDirection:'column',gap:14}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
              <span style={{fontSize:12,fontWeight:600,color:'#6b7280',flexShrink:0,paddingTop:6}}>Search</span>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:150}} placeholder="Search name..." value={filters.search} onChange={e=>setFilters(p=>({...p,search:e.target.value}))} />
                <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:140}} placeholder="Search national ID..." value={filters.national_id} onChange={e=>setFilters(p=>({...p,national_id:e.target.value}))} />
                {!outsource && ['admin','hr'].includes(userRole) && <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:150}} placeholder="Search employment ID..." value={filters.employee_number} onChange={e=>setFilters(p=>({...p,employee_number:e.target.value}))} />}
                <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:140}} placeholder="Search job title..." value={filters.job_title} onChange={e=>setFilters(p=>({...p,job_title:e.target.value}))} />
              </div>
            </div>
            <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
              <span style={{fontSize:12,fontWeight:600,color:'#6b7280',flexShrink:0,paddingTop:6}}>Filter</span>
              <div style={{display:'flex',flexWrap:'wrap',gap:6,alignItems:'center'}}>
                <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:120}} value={filters.status} onChange={e=>setFilters(p=>({...p,status:e.target.value,activeStat:''}))}>
                  <option value="">All Status</option><option value="active">Active</option><option value="exit">Exit</option>
                </select>
                {!outsource && <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:120}} value={filters.resource_type} onChange={e=>setFilters(p=>({...p,resource_type:e.target.value,activeStat:''}))}>
                  <option value="">All Resources</option><option value="inhouse">Inhouse</option><option value="outsource">Outsource</option><option value="intern">Intern</option>
                </select>}
                <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:175}} value={filters.classification} onChange={e=>setFilters(p=>({...p,classification:e.target.value,activeStat:''}))}>
                  <option value="">{outsource ? 'All Subtypes' : 'All Classifications'}</option>
                  {!outsource && <option value="inhouse">Inhouse</option>}
                  {!outsource && <option value="intern">Intern</option>}
                  <option value="outsource_services">Outsource (Services)</option>
                  <option value="outsource_vehicle_supplier">Outsource (Vehicle Supplier)</option>
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
                {showSanAudit && <>
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
                </>}
                <button className="btn" style={{height:30,padding:'4px 12px',fontSize:12}} onClick={()=>setFilters({status:'active',department:'',resource_type:'',classification:'',search:'',national_id:'',employee_number:'',project:'',client:'',san:'',job_title:'',audit_age:'',activeStat:'active'})}>✕ Clear</button>
              </div>
            </div>
          </div>
        </div>
        <div className="stat-grid" style={{gridTemplateColumns:`repeat(${outsource?4:5},1fr)`}}>
          <div className="card" style={{cursor:'pointer',padding:'16px 18px',background:filters.activeStat==='active'?'#F0F7FF':'#fff',outline:filters.activeStat==='active'?'2px solid #042C53':''}} onClick={()=>setFilters(p=>({...p,status:'',resource_type:'',...(outsource?{classification:''}:{}),activeStat:p.activeStat==='active'?'':'active'}))}>
            <div className="stat-label">Total active</div><div className="stat-value green">{stats.total_active}</div>
          </div>
          {!outsource && <>
          <div className="card" style={{cursor:'pointer',padding:'16px 18px',background:filters.activeStat==='inhouse'?'#F0F7FF':'#fff',outline:filters.activeStat==='inhouse'?'2px solid #042C53':''}} onClick={()=>setFilters(p=>({...p,status:'',resource_type:'',activeStat:p.activeStat==='inhouse'?'':'inhouse'}))}>
            <div className="stat-label">Active Inhouse</div><div className="stat-value navy">{stats.inhouse}</div>
          </div>
          <div className="card" style={{cursor:'pointer',padding:'16px 18px',background:filters.activeStat==='outsource'?'#F0F7FF':'#fff',outline:filters.activeStat==='outsource'?'2px solid #042C53':''}} onClick={()=>setFilters(p=>({...p,status:'',resource_type:'',activeStat:p.activeStat==='outsource'?'':'outsource'}))}>
            <div className="stat-label">Active Outsource</div><div className="stat-value">{stats.outsource}</div>
          </div>
          <div className="card" style={{cursor:'pointer',padding:'16px 18px',background:filters.activeStat==='intern'?'#F0F7FF':'#fff',outline:filters.activeStat==='intern'?'2px solid #042C53':''}} onClick={()=>setFilters(p=>({...p,status:'',resource_type:'',activeStat:p.activeStat==='intern'?'':'intern'}))}>
            <div className="stat-label">Active Intern</div><div className="stat-value warning">{stats.interns}</div>
          </div>
          </>}
          {outsource && <>
          <div className="card" style={{cursor:'pointer',padding:'16px 18px',background:filters.activeStat==='services'?'#F0F7FF':'#fff',outline:filters.activeStat==='services'?'2px solid #042C53':''}} onClick={()=>setFilters(p=>({...p,status:'',resource_type:'',classification:p.activeStat==='services'?'':'outsource_services',activeStat:p.activeStat==='services'?'':'services'}))}>
            <div className="stat-label">Services</div><div className="stat-value navy">{stats.services}</div>
          </div>
          <div className="card" style={{cursor:'pointer',padding:'16px 18px',background:filters.activeStat==='vehicle'?'#F0F7FF':'#fff',outline:filters.activeStat==='vehicle'?'2px solid #042C53':''}} onClick={()=>setFilters(p=>({...p,status:'',resource_type:'',classification:p.activeStat==='vehicle'?'':'outsource_vehicle_supplier',activeStat:p.activeStat==='vehicle'?'':'vehicle'}))}>
            <div className="stat-label">Vehicle Supplier</div><div className="stat-value">{stats.vehicle_supplier}</div>
          </div>
          </>}
          <div className="card" style={{cursor:'pointer',padding:'16px 18px',background:filters.activeStat==='exit'?'#F0F7FF':'#fff',outline:filters.activeStat==='exit'?'2px solid #042C53':''}} onClick={()=>setFilters(p=>({...p,status:'',resource_type:'',...(outsource?{classification:''}:{}),activeStat:p.activeStat==='exit'?'':'exit'}))}>
            <div className="stat-label">Exits</div><div className="stat-value">{stats.exits}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header" style={{alignItems:'flex-start',gap:16}}>
            <div>
              <div className="card-title" style={{fontSize:15,marginBottom:4}}>Employee list</div>
              <div style={{color:'#6b7280',fontSize:12}}>All employees matching the current filters</div>
            </div>
            <span className="tag tag-navy" style={{whiteSpace:'nowrap'}}>{total} employee{total===1?'':'s'}</span>
          </div>
          <table className="table-hover-soft">
            <thead><tr><th>Employee</th><th>Organization</th><th>Classification</th><th>Job Title / Department</th><th>Project / Client</th>{showSanAudit && <th>SAN / Last Audit</th>}{canEditEmployee && <th>Last Update (HR)</th>}{canEditEmployee && <th>Edit</th>}{canAssignPpe && <th>PPE</th>}</tr></thead>
            <tbody>
              {employees.map(e => (
                <tr key={e.id}>
                  <td><div className="emp-cell"><div><div className="emp-name">{e.full_name}</div><div className="emp-id">{e.national_id||e.employee_number}</div></div></div></td>
                  <td>
                    <div>{e.organization||'—'}</div>
                    {['admin','hr'].includes(userRole) && e.employee_number && <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{e.employee_number}</div>}
                    <div style={{marginTop:4}}><StatusCell status={e.employment_status} createdAt={e.added_on || e.created_at} createdBy={e.created_by_name} exitDate={e.exit_date} exitedBy={e.exited_by_name} /></div>
                  </td>
                  <td><ClassificationTag value={e.classification} /></td>
                  <td>
                    <div>{e.job_title||'—'}</div>
                    {e.department && <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{e.department}</div>}
                  </td>
                  <td>
                    <div>{e.project||'—'}</div>
                    {e.client && <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{e.client}</div>}
                  </td>
                  {showSanAudit && <td>
                    <div>{userRole === 'admin' ? <button onClick={()=>toggleSAN(e)} className={`tag ${e.san!==false?'tag-green':'tag-red'}`} style={{border:'none',cursor:'pointer'}}>{e.san!==false?'Yes':'No'}</button> : <span className={`tag ${e.san!==false?'tag-green':'tag-red'}`}>{e.san!==false?'Yes':'No'}</span>}</div>
                    <div style={{marginTop:4,fontSize:11}}>{e.last_audit_date ? <><span className={`dot ${e.days_since_audit>30?'dot-red':'dot-green'}`}></span>{e.days_since_audit}d ago</> : <span style={{color:'#9ca3af'}}>Never</span>}</div>
                  </td>}
                  {canEditEmployee && <td>
                    {e.last_edited_by_name ? (
                      <div style={{fontSize:12}} title={e.last_edit_reason ? `Reason: ${e.last_edit_reason}` : ''}>
                        <div>{e.last_edited_by_name}</div>
                        <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{e.last_edited_at ? new Date(e.last_edited_at).toLocaleDateString('en-GB') : ''}</div>
                      </div>
                    ) : <span style={{color:'#9ca3af'}}>—</span>}
                  </td>}
                  {canEditEmployee && <td>{canEditRow(e) ? <button className="btn btn-sm" onClick={()=>openEdit(e)} disabled={userRole!=='admin' && e.employment_status!=='active'} title={(userRole!=='admin' && e.employment_status!=='active')?'Employee has exited — cannot edit':''}>Edit</button> : <span style={{color:'#9ca3af'}}>—</span>}</td>}
                  {canAssignPpe && <td>
                    <div style={{display:'flex',gap:6}}>
                      <button className="btn btn-sm" onClick={()=>openPpeAssign(e)} title="Assign PPE" style={{background:e.ppe_assigned?'#d1fae5':undefined,borderColor:e.ppe_assigned?'#1D9E75':undefined,color:e.ppe_assigned?'#1D9E75':undefined}}>PPE</button>
                    </div>
                  </td>}
                </tr>
              ))}
              {!employees.length && <tr><td colSpan={colCount} style={{textAlign:'center',color:'#6b7280',padding:32}}>No employees found</td></tr>}
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
      {editModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:12,width:'min(720px, 94vw)',maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'28px 32px 16px',overflowY:'auto',display:'flex',flexDirection:'column',gap:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div style={{fontWeight:700,fontSize:16}}>Update Resource's Details</div>
              <button onClick={()=>setEditModal(null)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#6b7280'}}>✕</button>
            </div>
            <div style={{display:'flex',gap:20,flexWrap:'wrap',fontSize:12,color:'#6b7280',background:'#F0F7FF',border:'1px solid #dbeafe',borderRadius:8,padding:'10px 14px'}}>
              <span>National ID: <b style={{color:'#374151'}}>{editModal.national_id||'—'}</b></span>
              {editModal.employee_number && <span>Empl. Number: <b style={{color:'#374151'}}>{editModal.employee_number}</b></span>}
              <span>Organization: <b style={{color:'#374151'}}>{editModal.organization||'—'}</b></span>
              <span>Status: <b style={{color:'#374151'}}>{editModal.employment_status ? editModal.employment_status.charAt(0).toUpperCase() + editModal.employment_status.slice(1) : '—'}</b></span>
            </div>
            <div style={{border:'1px solid #e5e7eb',borderRadius:8,overflow:'hidden'}}>
              <div style={{display:'grid',gridTemplateColumns:'34px 140px 1fr 1fr',background:'#f3f4f6',padding:'8px 12px',fontSize:11,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:.3}}>
                <div></div><div>Field</div><div>Before</div><div>After</div>
              </div>
              {editFields.map(f=>{
                const on = editForm.edit[f.key];
                const before = editModal[f.key] || '—';
                // Interns keep the job title "Intern" — that row can't be changed.
                const locked = f.key === 'job_title' && editModal.job_title === 'Intern';
                return (
                  <div key={f.key} style={{display:'grid',gridTemplateColumns:'34px 140px 1fr 1fr',gap:8,alignItems:'center',padding:'8px 12px',borderTop:'1px solid #f0f0f0',background:on?'#F8FBFF':'#fff'}}>
                    <input type="checkbox" checked={on} disabled={locked} onChange={()=>toggleField(f.key)} style={{cursor:locked?'not-allowed':'pointer',width:16,height:16,opacity:locked?0.4:1}} title={locked?'Interns keep the job title "Intern"':(on?'Will change':'Tick to change this field')} />
                    <div style={{fontSize:13,fontWeight:600,color:locked?'#9ca3af':'#374151'}}>{f.label}</div>
                    <div style={{fontSize:13,color:on?'#9ca3af':'#374151',textDecoration:on?'line-through':'none'}}>{before}</div>
                    <div>
                      {!on
                        ? <span style={{fontSize:12,color:'#c0c4cc'}}>—</span>
                        : f.type==='text'
                          ? <input className="form-input" style={{height:30,fontSize:13,padding:'4px 8px'}} value={editForm.after[f.key]} onChange={ev=>setAfter(f.key,ev.target.value)} autoFocus />
                          : <select className="form-input" style={{height:30,fontSize:13,padding:'4px 8px'}} value={editForm.after[f.key]} onChange={ev=>setAfter(f.key,ev.target.value)}>
                              <option value="">—</option>
                              {f.options.map(o=><option key={o} value={o}>{o}</option>)}
                            </select>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>Reason for updating the resource's details <span style={{color:'#e24b4a'}}>*</span></div>
              <input className="form-input" value={editForm.reason} placeholder="Required — recorded against this update" onChange={ev=>{setEditForm(f=>({...f,reason:ev.target.value})); setEditErrors(e=>e.reason?{...e,reason:undefined}:e);}} style={editErrors.reason?{borderColor:'#e24b4a'}:undefined} />
              {editErrors.reason && <div style={{fontSize:11,color:'#e24b4a',marginTop:3}}>{editErrors.reason}</div>}
            </div>
            {(editErrors._general || editErrors._server) && <div style={{background:'#fef2f2',border:'1px solid #fecaca',color:'#b91c1c',fontSize:12.5,padding:'8px 12px',borderRadius:8}}>{editErrors._general || editErrors._server}</div>}
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,rowGap:8,flexWrap:'wrap',borderTop:'1px solid #e5e7eb',padding:'12px 32px 20px',background:'#fff'}}>
              <div style={{display:'flex',gap:8,rowGap:8,flexWrap:'wrap',alignItems:'center'}}>
                {userRole==='admin' && <button className="btn" onClick={()=>setDeleteConfirm(editModal)} title="Hard delete this resource" style={{color:'#e24b4a',borderColor:'#e24b4a',display:'inline-flex',alignItems:'center',gap:6}}><i className="ti ti-trash" style={{fontSize:16}} aria-hidden="true"></i>Delete</button>}
                <button className="btn" onClick={()=>guardUnsaved(()=>setExitConfirm(true),'exiting')} disabled={editSaving || editModal.employment_status!=='active'} style={editModal.employment_status==='active'?{color:'#e24b4a',borderColor:'#e24b4a'}:undefined} title={editModal.employment_status!=='active'?'Resource already exited':'Exit this resource'}>Exit Resource</button>
                {!outsource && /\bintern\b/i.test(editModal.job_title||'') && editModal.employment_status==='active' && <button className="btn" onClick={()=>guardUnsaved(()=>openConvert(editModal),'converting')} style={{color:'#042C53',borderColor:'#042C53',display:'inline-flex',alignItems:'center',gap:6}} title="Convert this intern to a full in-house employee"><i className="ti ti-arrow-up-circle" style={{fontSize:16}} aria-hidden="true"></i>Convert to In-House</button>}
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="btn" onClick={()=>setEditModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveEdit} disabled={editSaving}>{editSaving?'Saving...':'Update Details'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {editConfirm && editModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:12,padding:24,width:460,borderTop:'4px solid var(--eg-navy)',boxShadow:'0 10px 40px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
              <i className="ti ti-pencil" style={{fontSize:20,color:'var(--eg-navy)'}} aria-hidden="true"></i>
              <div style={{fontWeight:700,fontSize:16,color:'var(--eg-navy)'}}>Confirm update</div>
            </div>
            <div style={{fontSize:13,color:'#374151',lineHeight:1.6,marginBottom:20}}>
              Update <b>{editModal.full_name}</b>'s details (<b>{editConfirm.summary}</b>)? This change is recorded against your name in the change history.
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
              <button className="btn" onClick={()=>setEditConfirm(null)} disabled={editSaving}>Cancel</button>
              <button className="btn btn-primary" onClick={doEditSave} disabled={editSaving}>{editSaving?'Saving…':'Confirm update'}</button>
            </div>
          </div>
        </div>
      )}
      {exitConfirm && editModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:12,padding:24,width:460,borderTop:'4px solid #e24b4a',boxShadow:'0 10px 40px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
              <span style={{fontSize:22}}>⚠️</span>
              <div style={{fontWeight:700,fontSize:16,color:'#c0392b'}}>Exit Resource</div>
            </div>
            <div style={{fontSize:13,color:'#374151',lineHeight:1.6,marginBottom:20}}>
              You are about to exit <b>{editModal.full_name}</b>. This marks the employee as <b style={{color:'#c0392b'}}>Exit</b> and closes their open PPE requests and NCR items. It is recorded in the change history.
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
              <button className="btn" onClick={()=>setExitConfirm(false)} disabled={editSaving}>Cancel</button>
              <button className="btn" onClick={doExit} disabled={editSaving} style={{background:'#e24b4a',borderColor:'#e24b4a',color:'#fff'}}>{editSaving?'Exiting...':'Confirm Exit'}</button>
            </div>
          </div>
        </div>
      )}
      {convertModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:12,padding:24,width:'min(520px, 94vw)',maxHeight:'90vh',overflowY:'auto',borderTop:'4px solid #042C53',boxShadow:'0 10px 40px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
              <i className="ti ti-arrow-up-circle" style={{fontSize:22,color:'#042C53'}} aria-hidden="true"></i>
              <div style={{fontWeight:700,fontSize:16,color:'#042C53'}}>Convert to In-House</div>
            </div>
            <div style={{fontSize:13,color:'#374151',lineHeight:1.6,marginBottom:16}}>
              Promoting <b>{convertModal.full_name}</b> from Intern to a full in-house employee. Their <b>Added</b> date becomes <b>today</b> and the change is recorded in the history.
            </div>
            {convertErrors._server && <div style={{background:'#fef2f2',border:'1px solid #fecaca',color:'#b91c1c',fontSize:12.5,padding:'8px 12px',borderRadius:8,marginBottom:12}}>{convertErrors._server}</div>}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>Job Title <span style={{color:'#e24b4a'}}>*</span></div>
                <input className="form-input" autoFocus value={convertForm.job_title} placeholder="e.g. Field Technician" onChange={ev=>setConvertField('job_title',ev.target.value)} style={convertErrors.job_title?{borderColor:'#e24b4a'}:undefined} />
                {convertErrors.job_title && <div style={{fontSize:11,color:'#e24b4a',marginTop:3}}>{convertErrors.job_title}</div>}
              </div>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>Employment ID <span style={{color:'#e24b4a'}}>*</span></div>
                <input className="form-input" value={convertForm.employee_number} placeholder='Starts with "A"' onChange={ev=>setConvertField('employee_number',ev.target.value)} style={convertErrors.employee_number?{borderColor:'#e24b4a'}:undefined} />
                {convertErrors.employee_number && <div style={{fontSize:11,color:'#e24b4a',marginTop:3}}>{convertErrors.employee_number}</div>}
              </div>
            </div>
            <div style={{marginBottom:18}}>
              <div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>Reason</div>
              <input className="form-input" value={convertForm.reason} onChange={ev=>setConvertField('reason',ev.target.value)} />
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
              <button className="btn" onClick={()=>setConvertModal(null)} disabled={convertSaving}>Cancel</button>
              <button className="btn btn-primary" onClick={doConvert} disabled={convertSaving}>{convertSaving?'Converting…':'Convert to In-House'}</button>
            </div>
          </div>
        </div>
      )}
      {deleteConfirm && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:12,padding:24,width:480,borderTop:'4px solid #e24b4a',boxShadow:'0 10px 40px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
              <span style={{fontSize:22}}>🗑</span>
              <div style={{fontWeight:700,fontSize:16,color:'#c0392b'}}>Hard-delete resource</div>
            </div>
            <div style={{fontSize:13,color:'#374151',lineHeight:1.6,marginBottom:20}}>
              You are about to <b style={{color:'#c0392b'}}>permanently delete</b> <b>{deleteConfirm.full_name}</b> ({deleteConfirm.national_id || deleteConfirm.employee_number}). This also deletes all of their audits, NCR items, and PPE requests, and <b>cannot be undone</b>. To keep their history instead, use <b>Exit</b>.
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
              <button className="btn" onClick={()=>setDeleteConfirm(null)} disabled={deleting}>Cancel</button>
              <button className="btn" onClick={doDelete} disabled={deleting} style={{background:'#e24b4a',borderColor:'#e24b4a',color:'#fff'}}>{deleting?'Deleting…':'Delete permanently'}</button>
            </div>
          </div>
        </div>
      )}
      {addModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:12,width:'min(760px, 94vw)',maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'28px 32px 16px',overflowY:'auto',display:'flex',flexDirection:'column',gap:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div style={{fontWeight:700,fontSize:16}}>{addType==='outsource' ? 'Add Outsource Resource' : addType==='intern' ? 'Add Intern' : 'Add In-House Employee'}</div>
              <button onClick={()=>setAddModal(false)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#6b7280'}}>✕</button>
            </div>
            {addErrors._server && <div style={{background:'#fef2f2',border:'1px solid #fecaca',color:'#b91c1c',fontSize:12.5,padding:'8px 12px',borderRadius:8}}>{addErrors._server}</div>}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>Resource Name <span style={{color:'#e24b4a'}}>*</span></div>
                <input className="form-input" autoFocus value={addForm.full_name} placeholder="Exactly like the National ID" onChange={ev=>setAddField('full_name',ev.target.value)} style={addErrors.full_name?{borderColor:'#e24b4a'}:undefined} />
                {addErrors.full_name && <div style={{fontSize:11,color:'#e24b4a',marginTop:3}}>{addErrors.full_name}</div>}
              </div>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>National ID Number <span style={{color:'#e24b4a'}}>*</span></div>
                <input className="form-input" value={addForm.national_id} placeholder="Use digits only" inputMode="numeric" onChange={ev=>setAddField('national_id',ev.target.value.replace(/\D/g,''))} style={addErrors.national_id?{borderColor:'#e24b4a'}:undefined} />
                {addErrors.national_id && <div style={{fontSize:11,color:'#e24b4a',marginTop:3}}>{addErrors.national_id}</div>}
              </div>
              {addType==='inhouse' && <div>
                <div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>Employment ID <span style={{color:'#e24b4a'}}>*</span></div>
                <input className="form-input" value={addForm.employee_number} placeholder='Starts with "A"' onChange={ev=>setAddField('employee_number',ev.target.value)} style={addErrors.employee_number?{borderColor:'#e24b4a'}:undefined} />
                {addErrors.employee_number && <div style={{fontSize:11,color:'#e24b4a',marginTop:3}}>{addErrors.employee_number}</div>}
              </div>}
              {addType==='outsource' && <div>
                <div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>Organization (Entity) <span style={{color:'#e24b4a'}}>*</span></div>
                <Combobox value={addForm.organization} onChange={v=>setAddField('organization',v)} error={addErrors.organization}
                  noMatch="No match — add it in Admin → Outsource Entities"
                  options={manageableOrgs.map(o=>({ value:o.name, badge:{ text:o.type==='services'?'Services':'Vehicle Supplier', style:{ background:o.type==='services'?'#e0e7ff':'#dcfce7', color:o.type==='services'?'#3730a3':'#166534' } } }))} />
              </div>}
              <div>
                <div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>Department <span style={{color:'#e24b4a'}}>*</span></div>
                <Combobox value={addForm.department} onChange={v=>setAddField('department',v)} error={addErrors.department}
                  options={orgLists.department.map(d=>({ value:d }))} />
              </div>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>Project Name <span style={{color:'#e24b4a'}}>*</span></div>
                <Combobox value={addForm.project} onChange={v=>setAddField('project',v)} error={addErrors.project}
                  options={orgLists.project.map(p=>({ value:p }))} />
              </div>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>Client <span style={{color:'#e24b4a'}}>*</span></div>
                <Combobox value={addForm.client} onChange={v=>setAddField('client',v)} error={addErrors.client}
                  options={orgLists.client.map(c=>({ value:c }))} />
              </div>
              {addType!=='intern' && <div>
                <div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>Job Title <span style={{color:'#e24b4a'}}>*</span></div>
                <input className="form-input" value={addForm.job_title} placeholder={addType==='outsource'?'e.g. Driver':'e.g. Field Technician'} onChange={ev=>setAddField('job_title',ev.target.value)} style={addErrors.job_title?{borderColor:'#e24b4a'}:undefined} />
                {addErrors.job_title && <div style={{fontSize:11,color:'#e24b4a',marginTop:3}}>{addErrors.job_title}</div>}
              </div>}
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>Attach National ID (PDF) <span style={{color:'#e24b4a'}}>*</span></div>
              <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                <label className="btn" style={{cursor:'pointer',...(addErrors.file?{borderColor:'#e24b4a',color:'#e24b4a'}:{})}}>
                  📎 {addFile ? 'Change file' : 'Choose PDF…'}
                  <input type="file" accept="application/pdf" style={{display:'none'}} onChange={ev=>{setAddFile(ev.target.files[0]||null); setAddErrors(e=>e.file?{...e,file:undefined}:e);}} />
                </label>
                {addFile
                  ? <span style={{fontSize:12,color:'#0f2a4a'}}>{addFile.name} <span style={{color:'#9ca3af'}}>({(addFile.size/1024).toFixed(0)} KB)</span></span>
                  : <span style={{fontSize:12,color: addErrors.file?'#e24b4a':'#9ca3af'}}>{addErrors.file || 'Required · PDF, up to 1MB.'}</span>}
              </div>
            </div>
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:8,borderTop:'1px solid #e5e7eb',padding:'12px 32px 20px',background:'#fff'}}>
              <button className="btn" onClick={()=>setAddModal(false)} disabled={addSaving}>Cancel</button>
              <button className="btn btn-primary" onClick={saveAdd} disabled={addSaving}>{addSaving?'Adding…':(addType==='outsource'?'Add Outsource':addType==='intern'?'Add Intern':'Add In-House')}</button>
            </div>
          </div>
        </div>
      )}
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
  const [auditorText, setAuditorText] = useState('');
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
        <div className="topbar-left"><span className="topbar-breadcrumb">OneHub</span><span className="topbar-sep">›</span><span className="topbar-title">Audit/Request History</span></div>
        <div className="topbar-right"><button className="btn" onClick={exportCSV}>↓ Export CSV</button></div>
      </div>
      <div className="content graphs-content">
        <div className="card" style={{marginBottom:16, position:'sticky', top:'var(--header-h)', zIndex:40}}>
          <div className="card-body" style={{display:'flex',flexDirection:'column',gap:14}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
              <span style={{fontSize:12,fontWeight:600,color:'#6b7280',flexShrink:0,paddingTop:6}}>Search</span>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:150}} placeholder="Search name..." value={filters.search} onChange={e=>setFilters(p=>({...p,search:e.target.value}))} />
                <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:140}} placeholder="Search national ID..." value={filters.national_id} onChange={e=>setFilters(p=>({...p,national_id:e.target.value}))} />
              </div>
            </div>
            <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
              <span style={{fontSize:12,fontWeight:600,color:'#6b7280',flexShrink:0,paddingTop:6}}>Filter</span>
              <div style={{display:'flex',flexWrap:'wrap',gap:6,alignItems:'center'}}>
                <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:120}} value={filters.status} onChange={e=>setFilters(p=>({...p,status:e.target.value}))}>
                  <option value="">All Status</option><option value="active">Active</option><option value="exit">Exit</option>
                </select>
                <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:120}} value={filters.resource_type} onChange={e=>setFilters(p=>({...p,resource_type:e.target.value}))}>
                  <option value="">All Resources</option><option value="inhouse">Inhouse</option><option value="outsource">Outsource</option><option value="casual">Casual</option>
                </select>
                <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:130}} value={filters.project} onChange={e=>setFilters(p=>({...p,project:e.target.value}))}>
                  <option value="">All Projects</option>
                  {filterOptions.projects.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
                <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:120}} value={filters.client} onChange={e=>setFilters(p=>({...p,client:e.target.value}))}>
                  <option value="">All Clients</option>
                  {filterOptions.clients.map(cl=><option key={cl} value={cl}>{cl}</option>)}
                </select>
                <input
                  className="form-input" list="auditor-options"
                  style={{height:30,padding:'4px 8px',fontSize:12,width:160}}
                  placeholder="Search auditor..."
                  value={auditorText}
                  onChange={e=>{
                    const val = e.target.value;
                    setAuditorText(val);
                    const match = users.find(u=>u.full_name===val);
                    setFilters(p=>({...p, audited_by: match ? match.id : ''}));
                  }}
                />
                <datalist id="auditor-options">
                  {users.map(u=><option key={u.id} value={u.full_name} />)}
                </datalist>
                <button className="btn" style={{height:30,padding:'4px 12px',fontSize:12}} onClick={()=>{ setFilters({ search: '', national_id: '', resource_type: '', project: '', client: '', status: '', audited_by: '' }); setAuditorText(''); }}>✕ Clear</button>
              </div>
            </div>
          </div>
        </div>
        <div className="stat-grid" style={{marginBottom:16,gridTemplateColumns:"repeat(5,1fr)"}}>
          <div className="card" style={{padding:'16px 18px'}}><div className="stat-label">Total Audits</div><div className="stat-value navy">{stats.total}</div></div>
          <div className="card" style={{padding:'16px 18px'}}><div className="stat-label">Compliant</div><div className="stat-value green">{stats.compliant}</div></div>
          <div className="card" style={{padding:'16px 18px'}}><div className="stat-label">Partial</div><div className="stat-value warning">{stats.partial}</div></div>
          <div className="card" style={{padding:'16px 18px'}}><div className="stat-label">Non-Compliant</div><div className="stat-value danger">{stats.non_compliant}</div></div>
          <div className="card" style={{padding:'16px 18px'}}>
            <div className="stat-label">This Month</div>
            <div className="stat-value" style={{color:stats.this_month>=stats.last_month?'var(--eg-green)':'var(--danger)'}}>{stats.this_month}</div>
            <div style={{fontSize:11,color:'#6b7280',marginTop:4}}>vs {stats.last_month} last month</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">All Audits</span>
          </div>
          <table className="table-hover-soft">
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
  const [filterOptions, setFilterOptions] = useState({ ppe_names: [], projects: [], clients: [] });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 25;
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [selectingPda, setSelectingPda] = useState(false);
  const [selectedPda, setSelectedPda] = useState([]);
  const [stageMenu, setStageMenu] = useState(null);   // 'safety' | 'pm' — Approve/Reject chooser
  const [rejecting, setRejecting] = useState(null);   // 'safety' | 'pm' — per-row reject mode
  const [rejectTarget, setRejectTarget] = useState(null); // the NCR row being rejected
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSaving, setRejectSaving] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [filters, setFilters] = useState({ search: '', period: '', ppe: '', status: '', project: [], client: [], activeStat: 'pending' });
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
    if (filters.project.length) params.append('projects', filters.project.join(','));
    if (filters.client.length) params.append('clients', filters.client.join(','));
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

  // Run an action over the selected rows without letting one refusal hide the
  // rest: every item is attempted, and the server's own message is kept.
  const runBulk = async (ids, fn) => {
    const results = await Promise.allSettled(ids.map(id => fn(id)));
    const failed = results
      .map((r, i) => r.status === 'rejected'
        ? { id: ids[i], msg: r.reason?.response?.data?.error || r.reason?.message || 'Request failed' }
        : null)
      .filter(Boolean);
    return { ok: results.length - failed.length, failed };
  };

  // Say what happened either way. A silent button is the worst outcome: the
  // user cannot tell whether it worked, and the reason never reaches them.
  const reportBulk = (ok, failed, what) => {
    if (!failed.length) { alert(`${ok} item(s) ${what} successfully.`); return; }
    const reasons = [...new Set(failed.map(f => f.msg))];
    alert(
      (ok ? `${ok} item(s) ${what} successfully.\n\n` : '') +
      `${failed.length} item(s) could not be ${what}:\n• ` + reasons.join('\n• ')
    );
  };


  useEffect(() => { load(); }, [filters, page]);
  useEffect(() => { loadStats(); }, []);
  useEffect(() => { setPage(1); }, [filters]);
  useEffect(() => { api.get('/ncr/filter-options').then(r=>setFilterOptions(r.data)).catch(logError); }, []);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  // Same "recently distributed" window (4 months) and color as the Pending PM tag.
  const isRecentDistribution = (date) => !!date && new Date(date) >= new Date(new Date().setMonth(new Date().getMonth() - 4));

  const openReject = (n) => { setRejectTarget(n); setRejectReason(''); };
  const submitReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setRejectSaving(true);
    try {
      await api.put(`/ncr/${rejectTarget.id}/status`, { status: 'rejected', reason: rejectReason.trim() });
      setRejectTarget(null); setRejectReason('');
      reload();
    } catch(e) { alert(e.response?.data?.error || 'Reject failed'); }
    finally { setRejectSaving(false); }
  };

  const statusLabel = (n) =>
    (n.status==='canceled' && n.reject_reason)?
      (n.rejected_stage==='safety'?'Rejected (Safety)':n.rejected_stage==='pm'?'Rejected (PM)':'Rejected'):
    n.status==='pending'?'Flagged':
    n.status==='ehs_purchase_requested'?(n.needs_pda?'Pending PM':'EHS Purchase Requested'):
    n.status==='pda_approved'?'Approved (PM)':
    n.status==='scm_ordered'?'SCM Ordered':
    n.status==='warehouse_available'?'Warehouse Available':
    n.status==='distributed'?'Distributed':
    n.status==='resolved'?'Resolved':
    n.status==='exit'?'Exit':'Canceled';

  const deleteNCR = async (id) => {
    if (!window.confirm('Delete this NCR item? The linked PPE request will also be deleted.')) return;
    await api.delete('/ncr/' + id);
    reload();
  };

  // Approvals go one-by-one and report what actually happened. Promise.all with
  // no catch meant a single refusal (out of scope, wrong stage, wrong role)
  // rejected silently and skipped the reload AND the alert -- so the button
  // simply did nothing, with the reason sitting unread in the response.
  const approvePurchaseRequest = async () => {
    if (selected.length === 0) return;
    if (!window.confirm(`Are you sure you want to approve (Safety) for ${selected.length} item(s)?`)) return;
    const { ok, failed } = await runBulk(selected, id => api.put(`/ncr/${id}/status`, { status: 'ehs_purchase_requested' }));
    reload();
    setSelected([]);
    setSelecting(false);
    reportBulk(ok, failed, 'approved (Safety)');
  };

  const togglePdaSelect = (id) => setSelectedPda(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  const approvePda = async () => {
    if (selectedPda.length === 0) return;
    if (!window.confirm(`Are you sure you want to approve (PM) for ${selectedPda.length} item(s)?`)) return;
    const { ok, failed } = await runBulk(selectedPda, id => api.put(`/ncr/${id}/status`, { status: 'pda_approved' }));
    reload();
    setSelectedPda([]);
    setSelectingPda(false);
    reportBulk(ok, failed, 'approved (PM)');
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
        <div className="topbar-left"><span className="topbar-breadcrumb">OneHub</span><span className="topbar-sep">›</span><span className="topbar-title">NCR List</span></div>
        <div className="topbar-right">
          <button className="btn" onClick={exportCSV}>↓ Export CSV</button>
          {(() => {
            const idle = !selecting && !selectingPda && !rejecting && !stageMenu;
            const safetyAllowed = userRole === 'ehs_manager' || userRole === 'admin';
            const pmAllowed = userRole === 'project_director' || userRole === 'admin';
            return <>
              {idle && safetyAllowed && <button className="btn btn-navy" onClick={()=>setStageMenu('safety')}>Safety</button>}
              {idle && pmAllowed && <button className="btn btn-navy" onClick={()=>setStageMenu('pm')}>PM</button>}
              {stageMenu && (
                <>
                  <span style={{fontSize:12,color:'#6b7280'}}>{stageMenu==='safety'?'Safety':'PM'}:</span>
                  <button className="btn btn-primary" onClick={()=>{
                    const s=stageMenu; setStageMenu(null); setPage(1);
                    if (s==='safety') { setFilters(p=>({...p,status:'pending',activeStat:''})); setSelecting(true); }
                    else { setFilters(p=>({...p,status:'pda_pending',activeStat:''})); setSelectingPda(true); }
                  }}>Approve → pick items</button>
                  <button className="btn" style={{background:'#e24b4a',borderColor:'#e24b4a',color:'#fff'}} onClick={()=>{ const s=stageMenu; setStageMenu(null); setRejecting(s); }}>Reject</button>
                  <button className="btn" onClick={()=>setStageMenu(null)}>✕ Cancel</button>
                </>
              )}
            </>;
          })()}
          {selecting && (
            <>
              <span style={{fontSize:12,color:'#6b7280'}}>Tick Flagged items, then Approve · {selected.length} selected</span>
              <button className="btn btn-primary" onClick={approvePurchaseRequest} disabled={selected.length===0}>✓ Approve (Safety)({selected.length})</button>
              <button className="btn" onClick={()=>{setSelecting(false);setSelected([]);}}>✕ Cancel</button>
            </>
          )}
          {selectingPda && (
            <>
              <span style={{fontSize:12,color:'#6b7280'}}>Tick Pending PM items, then Approve · {selectedPda.length} selected</span>
              <button className="btn btn-primary" onClick={approvePda} disabled={selectedPda.length===0}>✓ Approve (PM) ({selectedPda.length})</button>
              <button className="btn" onClick={()=>{setSelectingPda(false);setSelectedPda([]);}}>✕ Cancel</button>
            </>
          )}
          {rejecting && (
            <>
              <span style={{fontSize:12,color:'#6b7280'}}>Reject ({rejecting==='safety'?'Safety':'PM'}) — click Reject on a row</span>
              <button className="btn" onClick={()=>setRejecting(null)}>✕ Done</button>
            </>
          )}
        </div>
      </div>
      <div className="content graphs-content">
        <div className="card" style={{marginBottom:16, position:'sticky', top:'var(--header-h)', zIndex:40}}>
          <div className="card-body" style={{display:'flex',flexDirection:'column',gap:14}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
              <span style={{fontSize:12,fontWeight:600,color:'#6b7280',flexShrink:0,paddingTop:6}}>Search</span>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                <input className="form-input" style={{height:30,padding:'4px 8px',fontSize:12,width:220}} placeholder="Search name or national ID..." value={filters.search} onChange={e=>setFilters(p=>({...p,search:e.target.value}))} />
              </div>
            </div>
            <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
              <span style={{fontSize:12,fontWeight:600,color:'#6b7280',flexShrink:0,paddingTop:6}}>Filter</span>
              <div style={{display:'flex',flexWrap:'wrap',gap:6,alignItems:'center'}}>
                <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:150}} value={filters.period} onChange={e=>setFilters(p=>({...p,period:e.target.value}))}>
                  <option value="">All Records</option>
                  <option value="current">Current Month</option>
                  <option value="previous">Previous Month</option>
                </select>
                <select className="form-select" style={{height:30,padding:'4px 8px',fontSize:12,width:160}} value={filters.ppe} onChange={e=>setFilters(p=>({...p,ppe:e.target.value}))}>
                  <option value="">All PPE/Tool Items</option>
                  {(filterOptions.ppe_names||[]).map(p=><option key={p} value={p}>{p}</option>)}
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
                  <option value="exit">Exit</option>
                </select>
                <MultiSelect label="All Projects" options={(filterOptions.projects||[]).map(p=>({value:p,label:p}))} selected={filters.project} onChange={v=>setFilters(p=>({...p,project:v}))} />
                <MultiSelect label="All Clients" options={(filterOptions.clients||[]).map(c=>({value:c,label:c}))} selected={filters.client} onChange={v=>setFilters(p=>({...p,client:v}))} />
                <button className="btn" style={{height:30,padding:'4px 12px',fontSize:12}} onClick={()=>setFilters({search:'',period:'',ppe:'',status:'',project:[],client:[],activeStat:''})}>✕ Clear</button>
              </div>
            </div>
          </div>
        </div>
        <div className="stat-grid">
          <div className="card" style={{cursor:'pointer',padding:'16px 18px',background:filters.activeStat===''?'#F0F7FF':'#fff',outline:filters.activeStat===''?'2px solid #042C53':''}} onClick={()=>setFilters(p=>({...p,activeStat:'',status:''}))}><div className="stat-label">Total Open</div><div className="stat-value danger">{stats.total_open}</div></div>
          <div className="card" style={{cursor:'pointer',padding:'16px 18px',background:filters.activeStat==='pending'?'#F0F7FF':'#fff',outline:filters.activeStat==='pending'?'2px solid #042C53':''}} onClick={()=>setFilters(p=>({...p,activeStat:p.activeStat==='pending'?'':'pending',status:''}))}><div className="stat-label">Pending EHS</div><div className="stat-value warning">{stats.pending}</div></div>
          <div className="card" style={{cursor:'pointer',padding:'16px 18px',background:filters.activeStat==='pma'?'#F0F7FF':'#fff',outline:filters.activeStat==='pma'?'2px solid #042C53':''}} onClick={()=>setFilters(p=>({...p,activeStat:p.activeStat==='pma'?'':'pma',status:''}))}><div className="stat-label">Pending PM</div><div className="stat-value navy">{stats.pending_pm}</div></div>
          <div className="card" style={{cursor:'pointer',padding:'16px 18px',background:filters.activeStat==='distributed'?'#F0F7FF':'#fff',outline:filters.activeStat==='distributed'?'2px solid #042C53':''}} onClick={()=>setFilters(p=>({...p,activeStat:p.activeStat==='distributed'?'':'distributed',status:''}))}><div className="stat-label">Distributed</div><div className="stat-value green">{stats.resolved_this_month}</div></div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Open NCR items</span>
          </div>
          <table className="table-hover-soft">
            <thead><tr><th></th><th>Employee</th><th>PPE/Tool Item</th><th>Condition</th><th>Qty</th><th>Project / Client</th><th>Organization</th><th>Flagged</th><th>Status</th>{selecting && <th>Select</th>}{selectingPda && <th>Select PDA</th>}{rejecting && <th>Reject</th>}{userRole === 'admin' && !selecting && !selectingPda && !rejecting && <th></th>}</tr></thead>
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
                  <td><span className={`tag ${n.status==='pending'?'tag-amber':n.status==='ehs_purchase_requested'?'tag-navy':n.status==='scm_ordered'?'tag-navy':n.status==='warehouse_available'?'tag-teal':n.status==='distributed'||n.status==='resolved'?'tag-green':n.status==='exit'?'tag-gray':'tag-red'}`}>{statusLabel(n)}</span>{n.status==='canceled' && (
                    n.reject_reason ? (
                      // A real rejection: reason, who, and when — the record of a decision.
                      <div style={{fontSize:10,color:'#9ca3af',marginTop:2,maxWidth:190,lineHeight:1.5}}>
                        <div style={{color:'#6b7280'}} title={n.reject_reason}>{n.reject_reason}</div>
                        <div>{n.rejected_by_name || 'unknown'}{n.rejected_at ? ` · ${new Date(n.rejected_at).toLocaleDateString('en-GB')}` : ''}</div>
                      </div>
                    ) : n.cancel_reason || n.cancelled_by_name ? (
                      // Closed as a side effect — almost always the audit being
                      // deleted, which does record who and why.
                      <div style={{fontSize:10,color:'#9ca3af',marginTop:2,maxWidth:190,lineHeight:1.5}}>
                        <div style={{color:'#6b7280'}} title={n.cancel_reason||''}>{n.cancel_reason||'Cancelled'}</div>
                        <div>{n.cancelled_by_name || 'unknown'}{n.cancelled_at ? ` · ${new Date(n.cancelled_at).toLocaleDateString('en-GB')}` : ''}</div>
                      </div>
                    ) : (
                      <div style={{fontSize:10,color:'#c8ccd2',marginTop:2,maxWidth:190}}>no reason or person recorded</div>
                    )
                  )}</td>
                  {selecting && <td style={{textAlign:'center'}}>{n.status==='pending' && <input type="checkbox" checked={selected.includes(n.id)} onChange={()=>toggleSelect(n.id)} style={{width:16,height:16,cursor:'pointer',accentColor:'var(--eg-green)'}} />}</td>}
                  {selectingPda && <td style={{textAlign:'center'}}>{n.needs_pda && n.status==='ehs_purchase_requested' && <input type="checkbox" checked={selectedPda.includes(n.id)} onChange={()=>togglePdaSelect(n.id)} style={{width:16,height:16,cursor:'pointer',accentColor:'var(--eg-green)'}} />}</td>}
                  {rejecting && <td style={{textAlign:'center'}}>{((rejecting==='safety' && n.status==='pending') || (rejecting==='pm' && n.needs_pda && n.status==='ehs_purchase_requested')) && <button className="btn" style={{fontSize:11,padding:'3px 10px',background:'#e24b4a',borderColor:'#e24b4a',color:'#fff'}} onClick={()=>openReject(n)}>Reject</button>}</td>}
                  {userRole === 'admin' && !selecting && !selectingPda && !rejecting && <td><button onClick={()=>deleteNCR(n.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#e24b4a',fontSize:16}} title="Delete">🗑</button></td>}
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
      {rejectTarget && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={()=>!rejectSaving && setRejectTarget(null)}>
          <div style={{background:'#fff',borderRadius:10,padding:20,width:440,maxWidth:'90vw'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:15,fontWeight:700,color:'#0f2a4a',marginBottom:6}}>Reject NCR item</div>
            <div style={{fontSize:13,color:'#6b7280',marginBottom:12}}>{rejectTarget.employee_name} · {rejectTarget.ppe_name}</div>
            <label style={{fontSize:12,fontWeight:600,color:'#64748b',display:'block',marginBottom:4}}>Reason for rejection <span style={{color:'#e24b4a'}}>*</span></label>
            <textarea className="form-input" rows={3} autoFocus value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="Why is this item being rejected?" style={{width:'100%',resize:'vertical'}} />
            <div style={{fontSize:11,color:'#94a3b8',margin:'6px 0 14px'}}>This closes the item out and cancels its linked PPE/Tool request.</div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="btn" onClick={()=>setRejectTarget(null)} disabled={rejectSaving}>Cancel</button>
              <button className="btn" style={{background:'#e24b4a',borderColor:'#e24b4a',color:'#fff'}} onClick={submitReject} disabled={rejectSaving || !rejectReason.trim()}>{rejectSaving?'Rejecting…':'Reject'}</button>
            </div>
          </div>
        </div>
      )}
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
        <div className="topbar-left"><span className="topbar-breadcrumb">OneHub</span><span className="topbar-sep">›</span><span className="topbar-title">Purchase Requests</span></div>
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
        <div className="topbar-left"><span className="topbar-breadcrumb">OneHub</span><span className="topbar-sep">›</span><span className="topbar-title">Admin Panel</span></div>
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
