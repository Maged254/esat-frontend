import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts';
import api, { logError } from '../utils/api';
import MobileLinesTabs from '../components/MobileLinesTabs';

// Mobile Lines dashboard. Two questions it exists to answer: what are we
// spending and where, and what is stuck in the workflow.
//
// Every cost here is package + CUG, the same rule the register's card uses, and
// credit limits are reported separately as headroom — never added into spend.
const OP_COLOR = { safaricom: '#1B7A46', airtel: '#B4322F' };
const SERIES = ['#14538F', '#1B7A46', '#B4711A', '#7A3EA1', '#0E7C86', '#A32D2D', '#5A6B7B', '#B4322F'];
const title = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
const money = (v) => Number(v || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 });

export default function MobileDashboardPage() {
  const [d, setD] = useState(null);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/mobile-lines/dashboard'), api.get('/mobile-lines/stats')])
      .then(([a, b]) => { setD(a.data); setStats(b.data); })
      .catch(logError).finally(() => setLoading(false));
  }, []);

  const card = (label, value, color, sub) => (
    <div className="stat-card wf-stat-card" style={{ borderTopColor: color }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value ?? 0}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const w = d?.workflow || {};
  // The product-change workflow is retired; what is left to watch is who is
  // waiting for a line.
  const queue = [['Waiting for a line', w.pending_line_requests]];
  const projects = (d?.by_project || []).slice(0, 10).map(p => ({ ...p, monthly: Number(p.monthly) }));
  // The axis label carries the client under the project, so a reader can tell
  // BTS - MS for Safaricom from the same project billed to another client.
  const clientOf = Object.fromEntries(projects.map(p => [p.project, p.client]));
  const ProjectTick = ({ x, y, payload }) => (
    <g transform={`translate(${x},${y})`}>
      <text x={-8} y={clientOf[payload.value] ? -1 : 4} textAnchor="end" fontSize={12} fill="#374151">{payload.value}</text>
      {clientOf[payload.value] && (
        <text x={-8} y={12} textAnchor="end" fontSize={10} fill="#9ca3af">{clientOf[payload.value]}</text>
      )}
    </g>
  );
  const packages = (d?.by_package || []).map(p => ({ ...p, lines: Number(p.lines) }));

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Mobile Lines Dashboard</span>
        </div>
      </div>

      <div className="content graphs-content">
        <MobileLinesTabs />

        {loading ? (
          <div className="card" style={{ padding: 24, fontSize: 13, color: '#9ca3af' }}>Loading…</div>
        ) : (
          <>
            <div className="stat-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(5,1fr)' }}>
              {card('Total Lines', stats.total, 'var(--eg-navy)')}
              {card('Assigned', stats.assigned, 'var(--eg-green)')}
              {card('Available', stats.available, '#d97706', 'not held by anyone')}
              {card('Monthly Cost', `KES ${money(stats.monthly_assigned)}`, 'var(--eg-navy)', 'packages + CUG')}
              {card('Credit Headroom', `KES ${money(stats.credit_limit_assigned)}`, '#A32D2D', 'limit, not spend')}
            </div>

            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', marginBottom: 16 }}>
              <div className="card">
                <div className="card-header"><span className="card-title">By Operator</span></div>
                <div style={{ padding: 16 }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table-hover-soft">
                      <thead><tr><th>Operator</th><th>Lines</th><th>Assigned</th><th>Monthly</th><th>Headroom</th></tr></thead>
                      <tbody>
                        {(d.by_operator || []).map(o => (
                          <tr key={o.operator}>
                            <td>
                              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                                             background: OP_COLOR[o.operator], marginRight: 8 }} />
                              {title(o.operator)}
                            </td>
                            <td>{o.lines}</td>
                            <td>{o.assigned}</td>
                            <td>KES {money(o.monthly)}</td>
                            <td style={{ color: '#9ca3af' }}>KES {money(o.credit_limit)}</td>
                          </tr>
                        ))}
                        {(d.by_operator || []).length === 0 && (
                          <tr><td colSpan={5} style={{ padding: 20, color: '#9ca3af', fontSize: 13 }}>No lines yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><span className="card-title">Line Requests</span></div>
                <div style={{ padding: '8px 16px 16px' }}>
                  {queue.map(([label, n]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                              padding: '9px 0', borderBottom: '1px solid #f3f5f8', fontSize: 13 }}>
                      <span style={{ color: '#4b5563' }}>{label}</span>
                      <span style={{ fontWeight: 700, fontSize: 16, color: n ? 'var(--eg-navy)' : '#c8d0da' }}>{n ?? 0}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, fontSize: 12, color: '#9ca3af' }}>
                    <span>Lines handed over, last 30 days</span>
                    <span style={{ fontWeight: 600, color: 'var(--eg-green)' }}>{w.fulfilled_30d ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <span className="card-title">Monthly Cost by Project</span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>top {projects.length}</span>
              </div>
              <div style={{ padding: 16, height: Math.max(220, projects.length * 42 + 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projects} layout="vertical" margin={{ left: 8, right: 60, top: 4, bottom: 4 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="project" width={150} tickLine={false} tick={<ProjectTick />} />
                    <Tooltip formatter={(v) => [`KES ${money(v)}`, 'Monthly']}
                             labelFormatter={l => clientOf[l] ? `${l} · ${clientOf[l]}` : l}
                             labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="monthly" radius={[0, 4, 4, 0]} barSize={18}>
                      {projects.map((p, i) => <Cell key={p.project} fill={SERIES[i % SERIES.length]} />)}
                      <LabelList dataKey="monthly" position="right" formatter={v => `KES ${money(v)}`}
                                 style={{ fontSize: 11, fill: '#6b7280' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
              <div className="card">
                <div className="card-header"><span className="card-title">Package Distribution</span></div>
                <div style={{ padding: 16, height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={packages} dataKey="lines" nameKey="package" innerRadius={60} outerRadius={100} paddingAngle={2}>
                        {packages.map((p, i) => <Cell key={p.package} fill={SERIES[i % SERIES.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [`${v} line${v === 1 ? '' : 's'}`, n]} contentStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><span className="card-title">Cost by Package</span></div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="table-hover-soft">
                    <thead><tr><th>Package</th><th>Price</th><th>Lines</th><th>Monthly</th></tr></thead>
                    <tbody>
                      {packages.map((p, i) => (
                        <tr key={p.package}>
                          <td>
                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                                           background: SERIES[i % SERIES.length], marginRight: 8 }} />
                            {p.package}
                          </td>
                          <td style={{ color: '#9ca3af' }}>{Number(p.price) ? `KES ${money(p.price)}` : '—'}</td>
                          <td>{p.lines}</td>
                          <td style={{ fontWeight: 600 }}>KES {money(p.monthly)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '10px 16px', fontSize: 11, color: '#9ca3af' }}>
                  Monthly includes each operator's CUG subscription for every line that has it switched on,
                  which is why a package's monthly can exceed its price × lines. The rate is set per operator
                  in Product Catalogue.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
