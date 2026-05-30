import { useAuth } from "../utils/AuthContext";
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const STATUS_TAG = {
  compliant:     <span className="tag tag-green">Compliant</span>,
  partial:       <span className="tag tag-amber">Partial</span>,
  non_compliant: <span className="tag tag-red">Non-compliant</span>,
};

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const { user } = useAuth();
  const [overdue, setOverdue] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/dashboard').then(r => setData(r.data)).catch(console.error);
    api.get('/employees/overdue').then(r => setOverdue(r.data)).catch(console.error);
    api.get('/audits/leaderboard').then(r => setLeaderboard(r.data)).catch(console.error);
  }, []);

  const initials = name => name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  const avatarClass = i => ['av-teal','av-navy','av-coral','av-purple'][i % 4];

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Dashboard</span>
        </div>
        <div className="topbar-right">
          <span className="badge-info">↺ Synced today 06:00</span>
          <button className="btn btn-primary" onClick={() => navigate('/audit/new')}>
            + New Audit
          </button>
        </div>
      </div>

      <div className="content">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div style={{ fontSize: 20, fontWeight: 500 }}>{greeting()}, {user?.name || "Safety Officer"}</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{dateStr} · Nairobi</div>
          </div>
          <img src="/logo.png" alt="Egypro" style={{ height: 40, opacity: 0.6 }}
               onError={e => { e.target.style.display='none'; }} />
        </div>

        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Total Active Project Members</div>
            <div className="stat-value navy">{data?.employees.active ?? '—'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Overdue (&gt;30 days)</div>
            <div className="stat-value danger">{data?.overdue ?? '—'}</div>
            <div className="stat-sub">Need immediate audit</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Open NCRs</div>
            <div className="stat-value warning">{data?.ncr.open ?? '—'}</div>
            <div className="stat-sub">Pending resolution</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Compliance rate</div>
            <div className="stat-value green">
              {data?.compliance_rate != null ? `${data.compliance_rate}%` : '—'}
            </div>
            <div className="stat-sub">This month</div>
          </div>
        </div>

        <div className="two-col">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Overdue audits</span>
              <span className="tag tag-red">{overdue.length} employees</span>
            </div>
            <table>
              <thead>
                <tr><th>Employee</th><th>Project</th><th>Last audit</th><th></th></tr>
              </thead>
              <tbody>
                {overdue.slice(0, 5).map((e, i) => (
                  <tr key={e.employee_id}>
                    <td>
                      <div className="emp-cell">
                        <div className={`avatar ${avatarClass(i)}`}>{initials(e.full_name)}</div>
                        <div>
                          <div className="emp-name">{e.full_name}</div>
                          <div className="emp-id">{e.employee_number}</div>
                        </div>
                      </div>
                    </td>
                    <td>{e.project || "—"}</td>
                    <td>
                      <span className={`dot ${e.days_since_audit > 45 ? 'dot-red' : 'dot-amber'}`}></span>
                      {e.days_since_audit ? `${e.days_since_audit} days` : 'Never'}
                    </td>
                    <td>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/audit/new/${e.employee_id}`)}
                      >✓</button>
                    </td>
                  </tr>
                ))}
                {overdue.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: '#6b7280', padding: 24 }}>
                    All employees are up to date ✓
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">NCRs by category</span>
              <button className="btn btn-sm" onClick={() => navigate('/ncr')}>View all</button>
            </div>
            <div className="card-body">
              {(data?.ncr?.by_category || []).map((r, i) => {
                const pct2 = Math.max(...(data?.ncr?.by_category||[]).map(x=>parseInt(x.count))) > 0 ? Math.round((parseInt(r.count)/Math.max(...(data?.ncr?.by_category||[]).map(x=>parseInt(x.count))))*100) : 0;
                const cls = pct2 >= 75 ? 'danger' : pct2 >= 40 ? 'warning' : 'navy';
                const label = r.category.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase());
                const pct = Math.max(...(data?.ncr?.by_category||[]).map(x=>parseInt(x.count))) > 0 ? Math.round((parseInt(r.count)/Math.max(...(data?.ncr?.by_category||[]).map(x=>parseInt(x.count))))*100) : 0;
                return (
                  <div key={r.category} style={{ marginBottom: 14 }}>
                    <div className="flex justify-between" style={{ fontSize: 12, marginBottom: 4 }}>
                      <span>{label}</span>
                      <span style={{ color: '#6b7280' }}>{r.count} items</span>
                    </div>
                    <div className="progress-bar">
                      <div className={'progress-fill ' + cls} style={{ width: pct + '%' }}></div>
                    </div>
                  </div>
                );
              })}
              {(!data?.ncr?.by_category?.length) && <div style={{color:'#6b7280',fontSize:13,padding:'8px 0'}}>No open NCRs</div>}
              <div style={{ paddingTop: 12, borderTop: '0.5px solid #e5e7eb', marginTop: 4 }}>
                <button className="btn btn-navy" style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => navigate('/purchase-requests')}>
                  🛒 Generate purchase request
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="two-col" style={{marginBottom:16}}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Auditor Leaderboard</span>
            </div>
            <table>
              <thead><tr><th>#</th><th>Auditor</th><th>Role</th><th>Total Audits</th><th>This Month</th></tr></thead>
              <tbody>
                {leaderboard.map((u, i) => (
                  <tr key={u.id}>
                    <td style={{fontWeight:600,color:'#6b7280',fontSize:13}}>{i+1}</td>
                    <td><div className="emp-cell"><div className={'avatar ' + avatarClass(i)}>{u.full_name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}</div><div className="emp-name">{u.full_name}</div></div></td>
                    <td><span className="tag tag-gray" style={{fontSize:10}}>{u.role.replace('_',' ')}</span></td>
                    <td style={{fontWeight:600}}>{u.total_audits}</td>
                    <td style={{fontSize:12,color:'#6b7280'}}>{u.this_month} this month</td>
                  </tr>
                ))}
                {!leaderboard.length && <tr><td colSpan={5} style={{textAlign:'center',color:'#6b7280',padding:24}}>No audits yet</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Recent audits</span>
              <button className="btn btn-sm" onClick={() => navigate('/history')}>View all</button>
            </div>
          <table>
            <thead>
              <tr><th>Employee</th><th>Project</th><th>Audited by</th><th>Date</th><th>Items</th><th>Issues</th><th>Status</th></tr>
            </thead>
            <tbody>
              {(data?.recent_audits || []).map((a, i) => (
                <tr key={a.id}>
                  <td>
                    <div className="emp-cell">
                      <div className={`avatar ${avatarClass(i)}`}>{initials(a.employee_name)}</div>
                      <div>
                        <div className="emp-name">{a.employee_name}</div>
                        <div className="emp-id">{a.employee_number}</div>
                      </div>
                    </div>
                  </td>
                  <td>{a.project || '—'}</td>
                  <td>{a.audited_by_name}</td>
                  <td>{new Date(a.audit_date).toLocaleDateString('en-GB')}</td>
                  <td>{a.total_items}</td>
                  <td>
                    <span className={`tag ${a.issues_count > 0 ? 'tag-red' : 'tag-green'}`}>
                      {a.issues_count} {a.issues_count === 1 ? 'issue' : 'issues'}
                    </span>
                  </td>
                  <td>{STATUS_TAG[a.overall_status]}</td>
                </tr>
              ))}
              {!data?.recent_audits?.length && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#6b7280', padding: 24 }}>No audits yet</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </>
  );
}
