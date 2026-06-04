import React, { useEffect, useState } from 'react';

const printStyle = `
@media print {
  .topbar, .sidebar, .btn { display: none !important; }
  .content { padding: 0 !important; margin: 0 !important; }
  .card { box-shadow: none !important; border: 1px solid #ddd !important; page-break-inside: avoid; }
  body { background: white !important; }
}
`;
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

  useEffect(() => {
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
      <style>{printStyle}</style>
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
          <button className="btn btn-primary" onClick={()=>window.print()}>↓ Export PDF</button>
        </div>
      </div>

      <div className="content">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,padding:'12px 18px',background:'#fff',borderRadius:10,border:'1px solid #e5e7eb'}}>
          <img src="/esat-login-logo.png" alt="ESAT" style={{height:48,objectFit:'contain'}} />
          <div style={{textAlign:'center'}}>
            <div style={{fontWeight:700,fontSize:18,color:'#1a2e4a',letterSpacing:'0.02em'}}>Egypro Safety Audit Report</div>
          </div>
          <img src="/egypro-watermark.png" alt="Egypro" style={{height:48,objectFit:'contain'}} />
        </div>
        <div className="card" style={{marginBottom:16}}>
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
              ['Resource Type', audit.resource_type || '—'],
              ['Audit Date', new Date(audit.audit_date).toLocaleDateString('en-GB')],
              ['Audited By', audit.audited_by_name],
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
                <div>PPE Item</div><div>Condition</div><div>Size</div><div>Comment</div>
              </div>
              {items.map(item => (
                <div key={item.id} className="ppe-row">
                  <div className="ppe-name">{item.ppe_name}</div>
                  <div className="ppe-cell">
                    <span className={`tag ${item.condition==='good'?'tag-green':item.condition==='not_good'?'tag-red':'tag-amber'}`}>
                      {item.condition==='good'?'✓ Good':item.condition==='not_good'?'✗ Not Good':'— Missing'}
                    </span>
                  </div>
                  <div className="ppe-cell" style={{fontSize:13}}>{item.size_value || '—'}</div>
                  <div className="ppe-cell" style={{fontSize:12,color:'#6b7280'}}>{item.comment || '—'}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
