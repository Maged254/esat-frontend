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
};

export default function AuditDetailPage() {
  const { auditId } = useParams();
  const navigate = useNavigate();
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [docs, setDocs] = useState([]);
  const [preview, setPreview] = useState(null);

  const downloadDoc = async (e, doc) => {
    e.preventDefault();
    e.stopPropagation();
    const token = localStorage.getItem('esat_token');
    const res = await fetch(`https://esat-backend-drwm.onrender.com/api/audit-documents/${doc.id}/download`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.cloudinary_url.split('/').pop().split('?')[0];
    a.click();
    window.URL.revokeObjectURL(url);
  };
  const reportRef = useRef(null);

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
    let y = 0;
    let remaining = imgHeight;
    while (remaining > 0) {
      pdf.addImage(imgData, 'PNG', 0, -y, imgWidth, imgHeight);
      remaining -= pageHeight;
      y += pageHeight;
      if (remaining > 0) pdf.addPage();
    }
    pdf.save(`Audit_Report_${audit.employee_name?.replace(/ /g,'_')}_${audit.audit_date?.slice(0,10)}.pdf`);
    setExporting(false);
  };

  useEffect(() => {
    api.get(`/audit-documents/${auditId}`).then(r => setDocs(r.data || [])).catch(() => {});
    api.get(`/audits/${auditId}`)
      .then(r => { setAudit(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [auditId]);

  if (loading) return <div className="content" style={{padding:40,textAlign:'center',color:'#6b7280'}}>Loading...</div>;
  if (!audit) return <div className="content" style={{padding:40,textAlign:'center',color:'#6b7280'}}>Audit not found.</div>;

  const grouped = audit.items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const STATUS = { compliant: 'tag-green', partial: 'tag-amber', non_compliant: 'tag-red' };
  const STATUS_LABEL = { compliant: 'Compliant', partial: 'Partial', non_compliant: 'Non-compliant' };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-breadcrumb" style={{cursor:'pointer'}} onClick={()=>navigate('/history')}>Audit History</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Audit Report</span>
        </div>
        <div className="topbar-right">
          <button className="btn" onClick={()=>navigate('/audits')}>← Back</button>
          <button className="btn btn-primary" onClick={exportPDF} disabled={exporting}>{exporting ? 'Exporting...' : '↓ Export PDF'}</button>
        </div>
      </div>

      <div className="content" ref={reportRef}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,padding:'12px 18px',background:'#fff',borderRadius:10,border:'1px solid #e5e7eb'}}>
          <img src="/esat-login-logo.png" alt="ESAT" style={{height:48,objectFit:'contain'}} />
          <div style={{textAlign:'center'}}>
            <div style={{fontWeight:700,fontSize:18,color:'#1a2e4a',letterSpacing:'0.02em'}}>Egypro Safety Audit Report</div>
          </div>
          <img src="/egypro-watermark.png" alt="Egypro" style={{height:48,objectFit:'contain'}} />
        </div>
        <div className="card" style={{marginBottom:16}}>
          {audit.employee_present === false && (
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
            <span className={`tag ${STATUS[audit.overall_status]}`}>{STATUS_LABEL[audit.overall_status]}</span>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,padding:'16px 18px'}}>
            {[
              ['Employee', audit.employee_name],
              ['Employee No.', audit.employee_number],
              ['National ID', audit.national_id || '—'],
              ['Job Title', audit.job_title || '—'],
              ['Department', audit.department || '—'],
              ['Project', audit.project || '—'],
              ['Client', audit.client || '—'],
              ['Organization', audit.organization || '—'],
              ['Resource Type', audit.resource_type ? audit.resource_type.charAt(0).toUpperCase() + audit.resource_type.slice(1) : '—'],
              ['Audit Date', new Date(audit.audit_date).toLocaleDateString('en-GB')],
              ['Audited By', audit.audited_by_name],
              ['Location', audit.location_name || '—'],
              ['Total Items', audit.items.length],
              ['Issues Found', audit.items.filter(i=>i.condition!=='good').length],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{fontSize:11,color:'#6b7280',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</div>
                <div style={{fontWeight:500,fontSize:14}}>{value}</div>
              </div>
            ))}
          </div>
          {audit.notes && (
            <div style={{padding:'12px 18px',borderTop:'0.5px solid #e5e7eb',fontSize:13,color:'#374151'}}>
              <span style={{fontWeight:500}}>Notes: </span>{audit.notes}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">PPE Checklist</span></div>
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div className="ppe-section-header">{CATEGORY_LABELS[category] || category}</div>
              <div className="ppe-col-header">
                <div>PPE Item</div><div>Condition</div><div>Size</div><div>Qty</div><div>Comment</div>
              </div>
              {items.map(item => (
                <div key={item.id} className="ppe-row">
                  <div className="ppe-name">{item.ppe_name}</div>
                  <div className="ppe-cell">
                    <span className={`tag ${item.condition==='good'?'tag-green':item.condition==='not_good'?'tag-red':'tag-amber'}`}>
                      {item.condition==='good'?'✓ Good':item.condition==='not_good'?'✗ Not Good':'— Not Present'}
                    </span>
                  </div>
                  <div className="ppe-cell" style={{fontSize:13}}>{item.size_value || '—'}</div>
                  <div className="ppe-cell" style={{fontSize:13,color:(item.quantity||1)>1?'#e53e3e':'inherit',fontWeight:(item.quantity||1)>1?700:400}}>{item.quantity||1}</div>
                  <div className="ppe-cell" style={{fontSize:12,color:'#6b7280'}}>{item.comment || '—'}</div>
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
