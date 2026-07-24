import { useAuth } from "../utils/AuthContext";
import APP_VERSION from '../version';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { logError } from '../utils/api';

const STATUS_TAG = {
  compliant:     <span className="tag tag-green">Compliant</span>,
  partial:       <span className="tag tag-amber">Partial</span>,
  non_compliant: <span className="tag tag-red">Non-compliant</span>,
};

// Sequential blue intensity scale for the NCR heat map -- zero cells stay
// essentially blank, everything else scales against the grid-wide max so
// cells are comparable across the whole heat map, not just within a row.
const heatCell = (count, max) => {
  if (!count) return { bg: '#f9fafb', text: '#d1d5db' };
  const alpha = 0.16 + (count / max) * 0.74;
  return { bg: `rgba(37,99,235,${alpha})`, text: alpha > 0.55 ? '#fff' : '#1e3a6b' };
};
// "Jul 2026" -> "Jul '26" -- keeps the month header compact enough for 6
// columns to fit a dashboard-card width without wrapping.
const shortMonth = (m) => m.replace(/(\w+) \d{2}(\d{2})/, "$1 '$2");

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [syncLog, setSyncLog] = useState(null);
  const { user } = useAuth();
  const [overdue, setOverdue] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/dashboard').then(r => setData(r.data)).catch(logError);
    api.get('/employees/overdue').then(r => setOverdue(r.data)).catch(logError);
    api.get('/audits/leaderboard').then(r => setLeaderboard(r.data)).catch(logError);
    api.get('/sync-log/latest').then(r => setSyncLog(r.data)).catch(logError);
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
          <span className="badge-info" style={{fontFamily:'monospace',letterSpacing:'0.05em'}}>{APP_VERSION}</span>
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

        {/* PPE Delay Cards */}
        <div className="stat-grid" style={{ marginTop: 16 }}>
          <div className="stat-card">
            <div className="stat-label">EHS Delay</div>
            <div className="stat-value warning">{data?.delays?.ehs ?? '—'}<span style={{fontSize:13,fontWeight:400}}> Days</span></div>
            <div className="stat-sub">Oldest request awaiting EHS approval</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">SCM Delay</div>
            <div className="stat-value warning">{data?.delays?.scm ?? '—'}<span style={{fontSize:13,fontWeight:400}}> Days</span></div>
            <div className="stat-sub">Oldest request awaiting SCM ordering</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Suppliers Delay</div>
            <div className="stat-value warning">{data?.delays?.suppliers ?? '—'}<span style={{fontSize:13,fontWeight:400}}> Days</span></div>
            <div className="stat-sub">Oldest order awaiting warehouse delivery</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Projects Delay</div>
            <div className="stat-value warning">{data?.delays?.projects ?? '—'}<span style={{fontSize:13,fontWeight:400}}> Days</span></div>
            <div className="stat-sub">Oldest item awaiting project distribution</div>
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
                          <div className="emp-id">{e.national_id||e.employee_number}</div>
                        </div>
                      </div>
                    </td>
                    <td>{e.project || "—"}</td>
                    <td>
                      <span className={`dot ${e.days_since_audit > 45 ? 'dot-red' : 'dot-amber'}`}></span>
                      {e.days_since_audit ? `${e.days_since_audit} days` : 'Never'}
                    </td>
                    <td></td>
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
              <span className="card-title">NCRs by PPE/Tool Item</span>
              <button className="btn btn-sm" onClick={() => navigate('/ncr')}>View all</button>
            </div>
            <div className="card-body">
              {(() => {
                const months = data?.ncr?.heatmap?.months || [];
                const items = data?.ncr?.heatmap?.items || [];
                if (!items.length) return <div style={{color:'#6b7280',fontSize:13,padding:'8px 0'}}>No NCRs in the last 6 months</div>;
                const maxCount = Math.max(1, ...items.flatMap(it => it.counts));
                return (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${months.length}, 1fr)`, gap: 4 }}>
                      <div />
                      {months.map(m => (
                        <div key={m} style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textAlign: 'center' }}>{shortMonth(m)}</div>
                      ))}
                      {items.map(it => (
                        <React.Fragment key={it.ppe_name}>
                          <div style={{ fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.ppe_name}>
                            {it.ppe_name}
                          </div>
                          {it.counts.map((count, mi) => {
                            const { bg, text } = heatCell(count, maxCount);
                            return (
                              <div
                                key={mi}
                                title={`${it.ppe_name} · ${months[mi]}: ${count} NCR${count === 1 ? '' : 's'}`}
                                style={{
                                  aspectRatio: '1.5', borderRadius: 5, background: bg, color: text,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 11, fontWeight: 600,
                                }}
                              >
                                {count || ''}
                              </div>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
                      <span style={{ fontSize: 10, color: '#9ca3af' }}>Fewer</span>
                      <div style={{ width: 70, height: 6, borderRadius: 3, background: 'linear-gradient(90deg, rgba(37,99,235,0.16), rgba(37,99,235,0.9))' }} />
                      <span style={{ fontSize: 10, color: '#9ca3af' }}>More</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="two-col" style={{marginBottom:16}}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Auditor Performance</span>
            </div>
            <table>
              <thead><tr><th>#</th><th>Auditor</th><th>Total Audits</th><th>This Month</th><th>Last Month</th></tr></thead>
              <tbody>
                {leaderboard.map((u, i) => (
                  <tr key={u.id}>
                    <td style={{fontWeight:600,color:'#6b7280',fontSize:13}}>{i+1}</td>
                    <td><div className="emp-cell">{u.profile_picture ? <img src={u.profile_picture} alt={u.full_name} style={{width:32,height:32,borderRadius:'50%',objectFit:'cover',flexShrink:0}} /> : <div className={'avatar ' + avatarClass(i)}>{u.full_name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}</div>}<div className="emp-name">{u.full_name}</div></div></td>
                    <td style={{fontWeight:600}}>{u.total_audits}</td>
                    <td style={{fontSize:12,color:'#6b7280'}}>{u.this_month} this month</td>
                    <td style={{fontSize:12,color:'#6b7280'}}>{u.last_month} last month</td>
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
                        <div className="emp-id">{a.national_id||a.employee_number}</div>
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
