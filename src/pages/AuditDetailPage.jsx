import React, { useEffect, useState, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';

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
  documentation_safety_signage: 'Documentation & Safety Signage',
  general_safety: 'General Safety',
  maintenance_tools: 'Maintenance Tools',
  testing_measuring: 'Testing & Measuring',
};

const CLOTHING_SIZES = ['XS','S','M','L','XL','XXL','XXXL'];
const SHOE_SIZES = Array.from({length:9},(_,i)=>(38+i).toString());

export default function AuditDetailPage() {
  const { auditId } = useParams();
  const navigate = useNavigate();
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [docs, setDocs] = useState([]);
  const [preview, setPreview] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState(null);
  const [locations, setLocations] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const reportRef = useRef(null);

  const currentUser = JSON.parse(localStorage.getItem('esat_user') || '{}');
  const isAdmin = currentUser.role === 'admin';

  const canEdit = audit && (
    isAdmin ||
    (audit.audited_by === currentUser.id &&
      (Date.now() - new Date(audit.created_at).getTime()) < 24 * 60 * 60 * 1000)
  );

  const loadAudit = () => {
    api.get('/audits/' + auditId)
      .then(r => { setAudit(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    api.get('/audit-documents/' + auditId).then(r => setDocs(r.data || [])).catch(() => {});
    api.get('/locations').then(r => setLocations(r.data || [])).catch(() => {});
    loadAudit();
  }, [auditId]);

  const startEdit = () => {
    setEditData({
      notes: audit.notes || '',
      location_id: audit.location_id ? String(audit.location_id) : '',
      employee_present: audit.employee_present,
      items: audit.items.map(i => ({
        ppe_item_id: i.ppe_item_id,
        ppe_name: i.ppe_name,
        category: i.category,
        has_size: i.has_size,
        size_type: i.size_type,
        condition: i.condition,
        size_value: i.size_value || '',
        comment: i.comment || '',
        quantity: i.quantity || 1,
      }))
    });
    setSaveError('');
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setEditData(null); setSaveError(''); };

  const saveEdit = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await api.put('/audits/' + auditId, {
        notes: editData.notes,
        location_id: editData.location_id ? Number(editData.location_id) : null,
        employee_present: audit.employee_present,
        items: editData.items.map(i => ({
          ppe_item_id: i.ppe_item_id,
          condition: i.condition,
          size_value: i.size_value || null,
          comment: i.comment || null,
          quantity: i.quantity || 1,
        }))
      });
      setEditing(false);
      setEditData(null);
      loadAudit();
    } catch(e) {
      setSaveError(e.response?.data?.error || 'Save failed.');
    }
    setSaving(false);
  };

  const deleteAudit = async () => {
    if (!window.confirm('Delete this request? It will remain visible in history but be removed from NCR and PPE tracker.')) return;
    try {
      await api.delete('/audits/' + auditId);
      navigate('/history');
    } catch(e) {
      alert(e.response?.data?.error || 'Delete failed.');
    }
  };

  const updateItem = (ppe_item_id, field, value) => {
    setEditData(d => ({
      ...d,
      items: d.items.map(i => i.ppe_item_id === ppe_item_id ? {...i, [field]: value} : i)
    }));
  };

  const removeItem = (ppe_item_id, ppe_name) => {
    if (!window.confirm(`Remove "${ppe_name}" from this audit? This deletes the line everywhere — NCR, PPE tracker, and dashboards — once you save.`)) return;
    setEditData(d => ({ ...d, items: d.items.filter(i => i.ppe_item_id !== ppe_item_id) }));
  };

  const downloadDoc = async (e, doc) => {
    e.preventDefault(); e.stopPropagation();
    const token = localStorage.getItem('esat_token');
    const res = await fetch('https://esat-backend-drwm.onrender.com/api/audit-documents/' + doc.id + '/download', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.cloudinary_url.split('/').pop().split('?')[0];
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    setExporting(true);
    const el = reportRef.current;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#f3f4f6' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let y = 0, remaining = imgHeight;
    while (remaining > 0) {
      pdf.addImage(imgData, 'PNG', 0, -y, imgWidth, imgHeight);
      remaining -= pageHeight;
      y += pageHeight;
      if (remaining > 0) pdf.addPage();
    }
    pdf.save('Audit_Report_' + (audit.employee_name||'').replace(/ /g,'_') + '_' + (audit.audit_date||'').slice(0,10) + '.pdf');
    setExporting(false);
  };

  if (loading) return <div className="content" style={{padding:40,textAlign:'center',color:'#6b7280'}}>Loading...</div>;
  if (!audit) return <div className="content" style={{padding:40,textAlign:'center',color:'#6b7280'}}>Audit not found.</div>;

  const displayItems = editing ? editData.items : audit.items;
  const grouped = displayItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const STATUS = { compliant: 'tag-green', partial: 'tag-amber', non_compliant: 'tag-red' };
  const STATUS_LABEL = { compliant: 'Compliant', partial: 'Partial', non_compliant: 'Non-compliant' };
  const notPresent = editing ? !editData.employee_present : audit.employee_present === false;

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-breadcrumb" style={{cursor:'pointer'}} onClick={()=>navigate('/history')}>Audit History</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">{editing ? 'Edit Request' : 'Audit Report'}</span>
        </div>
        <div className="topbar-right">
          {editing ? (
            <>
              {saveError && <span style={{color:'#e53e3e',fontSize:13,marginRight:8}}>{saveError}</span>}
              <button className="btn" onClick={cancelEdit} disabled={saving}>✕ Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? 'Saving...' : '✓ Save Changes'}</button>
            </>
          ) : (
            <>
              <button className="btn" onClick={()=>navigate('/history')}>← Back</button>
              {canEdit && !audit.is_deleted && (
                <button className="btn" onClick={startEdit} style={{borderColor:'#1a2e4a',color:'#1a2e4a'}}>✎ Edit</button>
              )}
              {canEdit && !audit.is_deleted && (
                <button className="btn" onClick={deleteAudit} style={{borderColor:'#e24b4a',color:'#e24b4a'}}>🗑 Delete</button>
              )}
              <button className="btn btn-primary" onClick={exportPDF} disabled={exporting}>{exporting ? 'Exporting...' : '↓ Export PDF'}</button>
            </>
          )}
        </div>
      </div>

      <div className="content" ref={reportRef}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,padding:'12px 18px',background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',position:'relative'}}>
          <img src="/esat-login-logo.png" alt="ESAT" style={{height:48,objectFit:'contain'}} />
          <div style={{textAlign:'center'}}>
            <div style={{fontWeight:700,fontSize:18,color:'#1a2e4a',letterSpacing:'0.02em'}}>Egypro Safety Audit Report</div>
          </div>
          <img src="/egypro-watermark.png" alt="Egypro" style={{height:48,objectFit:'contain'}} />
          {audit.last_edited_at && (
            <div style={{position:'absolute',bottom:6,right:12,fontSize:10,color:'#9ca3af',textAlign:'right',lineHeight:1.4}}>
              <span style={{fontStyle:'italic'}}>Edited by {audit.last_edited_by_name} · {new Date(audit.last_edited_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
            </div>
          )}
        </div>

        <div className="card" style={{marginBottom:16}}>
          {notPresent && (
            <div style={{background:'#fff3cd',borderBottom:'0.5px solid #ffc107',padding:'10px 18px',display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:20}}>⚠️</span>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:'#856404'}}>Employee Not Present</div>
                <div style={{fontSize:12,color:'#856404',opacity:0.85}}>This audit was recorded but the employee was absent. It does not count toward audit compliance.</div>
              </div>
            </div>
          )}
          <div className="card-header">
            <span className="card-title">Audit Summary</span>
              <span className={'tag ' + STATUS[audit.overall_status]}>{STATUS_LABEL[audit.overall_status]}</span>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,padding:'16px 18px'}}>
            {[
              ['Employee', audit.employee_name],
              ['Employee No.', audit.employee_number],
              ['National ID', audit.national_id || '—'],
              ['Job Title', audit.job_title || '—'],
              ['Department', audit.is_casual ? 'Projects' : (audit.department || '—')],
              ['Project', audit.project || '—'],
              ['Client', audit.client || '—'],
              ['Organization', audit.is_casual ? 'Casual' : (audit.organization || '—')],
              ['Resource Type', audit.is_casual ? 'Casual' : (audit.resource_type ? audit.resource_type.charAt(0).toUpperCase() + audit.resource_type.slice(1) : '—')],
              ['Audit Date', new Date(audit.audit_date).toLocaleDateString('en-GB')],
              ['Audited By', audit.audited_by_name],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{fontSize:11,color:'#6b7280',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</div>
                <div style={{fontWeight:500,fontSize:14}}>{value}</div>
              </div>
            ))}
            <div>
              <div style={{fontSize:11,color:'#6b7280',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.05em'}}>Location</div>
              {editing ? (
                <select value={editData.location_id} onChange={e=>setEditData(d=>({...d,location_id:e.target.value}))}
                  style={{fontSize:13,padding:'4px 8px',border:'1px solid #d1d5db',borderRadius:6,width:'100%'}}>
                  <option value="">— Select —</option>
                  {locations.filter(l=>l.is_active!==false).map(l=><option key={l.id} value={String(l.id)}>{l.name}</option>)}
                </select>
              ) : (
                <div style={{fontWeight:500,fontSize:14}}>{audit.location_name || '—'}</div>
              )}
            </div>
            <div>
              <div style={{fontSize:11,color:'#6b7280',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.05em'}}>Total Items</div>
              <div style={{fontWeight:500,fontSize:14}}>{audit.items.length}</div>
            </div>
            <div>
              <div style={{fontSize:11,color:'#6b7280',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.05em'}}>Issues Found</div>
              <div style={{fontWeight:500,fontSize:14}}>{displayItems.filter(i=>i.condition!=='good').length}</div>
            </div>
          </div>
          <div style={{padding:'12px 18px',borderTop:'0.5px solid #e5e7eb'}}>
            <div style={{fontSize:11,color:'#6b7280',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.05em'}}>Notes</div>
            {editing ? (
              <textarea value={editData.notes} onChange={e=>setEditData(d=>({...d,notes:e.target.value}))}
                style={{width:'100%',fontSize:13,padding:'8px',border:'1px solid #d1d5db',borderRadius:6,resize:'vertical',minHeight:60,boxSizing:'border-box'}}
                placeholder="General notes..." />
            ) : (
              <div style={{fontSize:13,color:'#374151'}}>{audit.notes || '—'}</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">PPE Checklist</span></div>
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div className="ppe-section-header">{CATEGORY_LABELS[category] || category}</div>
              <div className="ppe-col-header">
                <div>PPE/Tool Item</div><div>Condition</div><div>Size</div><div>Qty</div><div>Comment</div><div>{editing && isAdmin ? 'Remove' : ''}</div>
              </div>
              {items.map(item => (
                <div key={item.ppe_item_id || item.id} className="ppe-row">
                  <div className="ppe-name">{item.ppe_name}</div>
                  <div className="ppe-cell">
                    {editing ? (
                      <select value={item.condition} onChange={e=>updateItem(item.ppe_item_id,'condition',e.target.value)}
                        style={{fontSize:12,padding:'3px 6px',border:'1px solid #d1d5db',borderRadius:6}}>
                        <option value="good">✓ Good</option>
                        <option value="not_good">✗ Not Good</option>
                        <option value="not_present">— Not Present</option>
                      </select>
                    ) : (
                      <span className={'tag ' + (item.condition==='good'?'tag-green':item.condition==='not_good'?'tag-red':'tag-amber')}>
                        {item.condition==='good'?'✓ Good':item.condition==='not_good'?'✗ Not Good':'— Left at Home'}
                      </span>
                    )}
                  </div>
                  <div className="ppe-cell" style={{fontSize:13}}>
                    {editing && item.has_size ? (
                      <select value={item.size_value} onChange={e=>updateItem(item.ppe_item_id,'size_value',e.target.value)}
                        style={{fontSize:12,padding:'3px 6px',border:'1px solid #d1d5db',borderRadius:6}}>
                        <option value="">—</option>
                        {(item.size_type==='shoe' ? SHOE_SIZES : CLOTHING_SIZES).map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (item.size_value || '—')}
                  </div>
                  <div className="ppe-cell">
                    {editing ? (
                      <input type="number" min="1" value={item.quantity}
                        onChange={e=>updateItem(item.ppe_item_id,'quantity',parseInt(e.target.value)||1)}
                        style={{width:50,fontSize:12,padding:'3px 6px',border:'1px solid #d1d5db',borderRadius:6,textAlign:'center'}} />
                    ) : (
                      <span style={{fontSize:13,color:(item.quantity||1)>1?'#e53e3e':'inherit',fontWeight:(item.quantity||1)>1?700:400}}>{item.quantity||1}</span>
                    )}
                  </div>
                  <div className="ppe-cell">
                    {editing ? (
                      <input type="text" value={item.comment}
                        onChange={e=>updateItem(item.ppe_item_id,'comment',e.target.value)}
                        placeholder="Comment..."
                        style={{fontSize:12,padding:'3px 8px',border:'1px solid #d1d5db',borderRadius:6,width:'100%'}} />
                    ) : (
                      <span style={{fontSize:12,color:'#6b7280'}}>{item.comment || '—'}</span>
                    )}
                  </div>
                  <div className="ppe-cell" style={{textAlign:'center'}}>
                    {editing && isAdmin && (
                      <button onClick={()=>removeItem(item.ppe_item_id, item.ppe_name)} title="Remove this line item"
                        style={{background:'none',border:'none',cursor:'pointer',color:'#e24b4a',fontSize:16}}>🗑</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {docs.length > 0 && (
          <div className="card" style={{marginTop:16}}>
            <div className="card-header"><span className="card-title">Attached Documents</span></div>
            <div style={{padding:'16px 18px',display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12}}>
              {docs.map(doc => (
                <div key={doc.id} onClick={() => setPreview(doc)}
                  style={{position:'relative',display:'flex',flexDirection:'column',alignItems:'center',padding:'16px 16px 12px',border:'1px solid #e5e7eb',borderRadius:10,color:'#1a2e4a',background:'#f9fafb',gap:8,cursor:'pointer'}}>
                  <span onClick={e => downloadDoc(e, doc)}
                    style={{position:'absolute',top:8,right:8,width:24,height:24,borderRadius:6,background:'#f1f5f9',border:'1px solid #e2e8f0',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#64748b',fontSize:13,lineHeight:1}}>
                    ↓
                  </span>
                  <div style={{fontSize:28,marginTop:4}}>📄</div>
                  <div style={{fontSize:12,fontWeight:600,textAlign:'center',lineHeight:1.3}}>{doc.field_name.replace(/_/g,' ')}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {preview && (
        <div onClick={() => setPreview(null)} style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.7)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div onClick={e => e.stopPropagation()} style={{background:'white',borderRadius:16,padding:24,maxWidth:'80vw',maxHeight:'85vh',overflow:'auto',position:'relative',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div style={{fontWeight:600,fontSize:15,color:'#1a2e4a'}}>{preview.field_name.replace(/_/g,' ')}</div>
              <div style={{display:'flex',gap:8}}>
                <span onClick={e => downloadDoc(e, preview)} style={{padding:'6px 14px',borderRadius:8,background:'#f1f5f9',border:'1px solid #e2e8f0',cursor:'pointer',fontSize:13,color:'#374151'}}>↓ Download</span>
                <span onClick={() => setPreview(null)} style={{padding:'6px 14px',borderRadius:8,background:'#f1f5f9',border:'1px solid #e2e8f0',cursor:'pointer',fontSize:13,color:'#374151'}}>✕ Close</span>
              </div>
            </div>
            <img src={preview.cloudinary_url} alt={preview.field_name} style={{maxWidth:'100%',borderRadius:8,display:'block'}} />
          </div>
        </div>
      )}
    </>
  );
}
