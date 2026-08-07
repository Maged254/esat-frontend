import React, { useEffect, useState, useId } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import api, { logError } from '../utils/api';

const C = {
  valid:    { solid: '#16a34a', from: '#34d399', to: '#059669', tint: '#dcfce7' },
  expiring: { solid: '#d97706', from: '#fbbf24', to: '#d97706', tint: '#fef3c7' },
  expired:  { solid: '#dc2626', from: '#f87171', to: '#dc2626', tint: '#fee2e2' },
  navy:     { solid: '#042C53', from: '#3b82f6', to: '#1d4ed8', tint: '#e0e7ff' },
  pending:  { solid: '#dc2626', from: '#f87171', to: '#dc2626', tint: '#FCEBEB' }, // reddish (Pending)
};

// Gradient ids are made unique per chart (pfx) — otherwise every chart shares
// `grad-valid` etc., SVG resolves url(#id) to the first one document-wide, and
// when charts mount/unmount on filter change the bars lose their fill (grey).
const fmt = (n) => (n == null ? '' : Number(n).toLocaleString('en-US')); // 1000 -> 1,000

const Gradients = ({ pfx }) => (
  <defs>
    {['valid', 'expiring', 'pending'].map(k => (
      <linearGradient key={k} id={`grad-${k}-${pfx}`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={C[k].from} />
        <stop offset="100%" stopColor={C[k].to} />
      </linearGradient>
    ))}
  </defs>
);

const KPI = ({ label, value, kind, icon, active, onClick }) => {
  const c = C[kind];
  return (
    <div className="card" onClick={onClick}
      style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, borderTop: `3px solid ${c.solid}`,
        cursor: onClick ? 'pointer' : 'default', background: active ? c.tint : '',
        outline: active ? `2px solid ${c.solid}` : '', transition: 'outline .1s, background .1s' }}>
      <div style={{ width: 46, height: 46, borderRadius: 13, background: c.tint, color: c.solid, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 24 }} aria-hidden="true"></i>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: '#6b7280', fontWeight: 600, lineHeight: 1.35 }}>{label}</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: c.solid, marginTop: 2, lineHeight: 1 }}>{fmt(value ?? 0)}</div>
      </div>
    </div>
  );
};

// Y-axis tick that wraps a long name onto up to two lines (so nothing is trimmed).
const WrapTick = ({ x, y, payload }) => {
  const words = String(payload.value).split(' ');
  const lines = []; let cur = '';
  words.forEach(w => { const t = (cur ? cur + ' ' : '') + w; if (t.length > 19 && cur) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur);
  const two = lines.slice(0, 2);
  if (lines.length > 2) two[1] = two[1].slice(0, 16) + '…';
  return (
    <text x={x} y={y} textAnchor="end" fill="#374151" fontSize={11}>
      {two.map((ln, i) => <tspan key={i} x={x} dy={i === 0 ? (two.length > 1 ? -3 : 4) : 13}>{ln}</tspan>)}
    </text>
  );
};

const BarTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div style={{ background: '#0f2a4a', color: '#fff', borderRadius: 8, padding: '8px 11px', fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.28)', minWidth: 160 }}>
      <div style={{ fontWeight: 700, marginBottom: 5, display: 'flex', justifyContent: 'space-between', gap: 14 }}>
        <span>{label}</span><span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</span>
      </div>
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: (C[p.dataKey]?.solid || p.color), flexShrink: 0 }} />
          <span style={{ opacity: 0.85, flex: 1 }}>{p.name}</span>
          <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(p.value)}</b>
        </div>
      ))}
    </div>
  );
};

const PieTip = ({ active, payload, total }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const pct = ((p.value / (total || 1)) * 100).toFixed(1);
  return (
    <div style={{ background: '#0f2a4a', color: '#fff', borderRadius: 8, padding: '8px 11px', fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.28)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: p.payload.color }} />{p.name}: <b>{fmt(p.value)}</b> <span style={{ opacity: 0.7 }}>· {pct}%</span>
    </div>
  );
};

// Fixed viewport height for the bar charts so every card is the same size and
// fits the page; when there are more bars than fit, the list scrolls inside.
const BARS_MAX_H = 320;

// In-bar number: only drawn when the segment is wide enough to hold it legibly
// (~7px/char + padding). Narrow slivers are left blank — the tooltip still shows
// every value on hover.
const BarValueLabel = (props) => {
  const { x, y, width, height, value } = props;
  const w = Number(width) || 0;
  if (!value || value <= 0) return null;
  const txt = fmt(value);
  if (w < txt.length * 7 + 8) return null;
  return <text x={x + w / 2} y={y + height / 2} fill="#fff" fontSize={11} fontWeight={600} textAnchor="middle" dominantBaseline="central">{txt}</text>;
};
const METRIC_META = { valid: { name: 'Valid', grad: 'valid' }, expiring: { name: 'About to Expire', grad: 'expiring' }, pending: { name: 'Pending', grad: 'pending' } };

function ValidityBars({ data, nameKey, metric = 'all' }) {
  const pfx = useId().replace(/[:]/g, ''); // unique, SVG-id-safe gradient namespace per chart
  const single = metric !== 'all';
  const rows = single ? data.filter(d => (d[metric] || 0) > 0).sort((a, b) => (b[metric] || 0) - (a[metric] || 0)) : data;
  if (!rows.length) return <div style={{ color: '#9ca3af', fontSize: 13, padding: 40, textAlign: 'center' }}>No training data.</div>;
  const innerH = Math.max(rows.length * 44 + 20, 130);
  const m = METRIC_META[metric];
  return (
    <div style={{ maxHeight: BARS_MAX_H, overflowY: 'auto', overflowX: 'hidden' }}>
      <ResponsiveContainer width="100%" height={innerH}>
        <BarChart layout="vertical" data={rows} margin={{ top: 4, right: 44, left: 6, bottom: 4 }} barCategoryGap={10}>
          <Gradients pfx={pfx} />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey={nameKey} width={146} tickLine={false} axisLine={false} interval={0} tick={<WrapTick />} />
          <Tooltip content={<BarTip />} cursor={{ fill: '#f1f5f9' }} />
          {single ? (
            <Bar dataKey={metric} name={m.name} fill={`url(#grad-${m.grad}-${pfx})`} radius={[4, 4, 4, 4]} isAnimationActive={false} background={{ fill: '#f1f5f9', radius: 5 }}>
              <LabelList dataKey={metric} content={BarValueLabel} />
              <LabelList dataKey={metric} position="right" fontSize={12} fontWeight={800} fill="#0f2a4a" formatter={fmt} />
            </Bar>
          ) : (
            <>
              <Bar dataKey="valid" name="Valid" stackId="a" fill={`url(#grad-valid-${pfx})`} radius={[4, 0, 0, 4]} isAnimationActive={false} background={{ fill: '#f1f5f9', radius: 5 }}>
                <LabelList dataKey="valid" content={BarValueLabel} />
              </Bar>
              <Bar dataKey="expiring" name="About to Expire" stackId="a" fill={`url(#grad-expiring-${pfx})`} isAnimationActive={false}>
                <LabelList dataKey="expiring" content={BarValueLabel} />
              </Bar>
              <Bar dataKey="pending" name="Pending" stackId="a" fill={`url(#grad-pending-${pfx})`} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                <LabelList dataKey="pending" content={BarValueLabel} />
                <LabelList dataKey="total" position="right" fontSize={12} fontWeight={800} fill="#0f2a4a" formatter={fmt} />
              </Bar>
            </>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const ChartCard = ({ title, children }) => (
  <div className="card" style={{ padding: 20 }}>
    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2a4a', textAlign: 'center', marginBottom: 12 }}>{title}</div>
    {children}
  </div>
);

// Percentage drawn inside each donut slice (hidden on slices too small to fit —
// those still show in the tooltip and legend).
const PieSlicePct = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (!percent || percent < 0.06) return null;
  const RAD = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RAD);
  const y = cy + r * Math.sin(-midAngle * RAD);
  return <text x={x} y={y} fill="#fff" fontSize={11} fontWeight={700} textAnchor="middle" dominantBaseline="central">{Math.round(percent * 100)}%</text>;
};

function Donut({ k, metric = 'all' }) {
  const all = [
    { name: 'Valid', value: k.valid || 0, color: C.valid.solid, key: 'valid' },
    { name: 'About to Expire', value: k.expiring || 0, color: C.expiring.solid, key: 'expiring' },
    { name: 'Pending', value: k.pending || 0, color: C.pending.solid, key: 'pending' },
  ];
  const single = metric !== 'all';
  const rows = single ? all.filter(d => d.key === metric) : all;
  const grand = all.reduce((s, r) => s + r.value, 0);
  const center = single ? (rows[0]?.value || 0) : grand;
  if (grand === 0) return <div style={{ color: '#9ca3af', fontSize: 13, padding: 40, textAlign: 'center' }}>No training data.</div>;
  if (single && center === 0) return <div style={{ color: '#9ca3af', fontSize: 13, padding: 40, textAlign: 'center' }}>None in this category.</div>;
  const shown = rows.filter(d => d.value > 0);
  return (
    <>
      <div style={{ position: 'relative' }}>
        <ResponsiveContainer width="100%" height={230}>
          <PieChart>
            <Pie data={shown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={92}
              paddingAngle={shown.length > 1 ? 2 : 0} cornerRadius={4} stroke="none" isAnimationActive={false}
              label={single ? false : PieSlicePct} labelLine={false}>
              {shown.map(d => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip content={<PieTip total={center} />} wrapperStyle={{ zIndex: 60 }} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#0f2a4a', lineHeight: 1 }}>{fmt(center)}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{single ? rows[0].name : 'Trainings'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
        {rows.map(d => (
          <span key={d.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: d.color, display: 'inline-block' }} />{d.name} <b>{fmt(d.value)}</b>{!single && <span style={{ opacity: 0.6 }}> ({grand ? Math.round(d.value / grand * 100) : 0}%)</span>}
          </span>
        ))}
      </div>
    </>
  );
}

const ChartsRow = ({ d, metric }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1.3fr', gap: 18, marginBottom: 20 }}>
    <ChartCard title="Total Validity"><Donut k={d.kpis || {}} metric={metric} /></ChartCard>
    <ChartCard title="Validity per Training Type"><ValidityBars data={d.by_course || []} nameKey="course" metric={metric} /></ChartCard>
    <ChartCard title="Validity per Project"><ValidityBars data={d.by_project || []} nameKey="project" metric={metric} /></ChartCard>
  </div>
);

const Section = ({ icon, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 2px 14px' }}>
    <i className={`ti ${icon}`} style={{ fontSize: 18, color: '#042C53' }} aria-hidden="true"></i>
    <span style={{ fontSize: 15, fontWeight: 700, color: '#0f2a4a' }}>{label}</span>
    <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
  </div>
);

const EMPTY = { kpis: {}, pending_reasons: [], by_course: [], by_project: [] };

const RT_LABEL = { inhouse: 'In-House', outsource: 'Outsource', intern: 'Interns' };
const RT_ICON = { inhouse: 'ti-building', outsource: 'ti-briefcase', intern: 'ti-school' };
const DEFAULT_FILTERS = { client: '', project: '', course_id: '', organization: '', resource_type: '', employment_status: 'active' };

export default function TrainingDashboardPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [overall, setOverall] = useState(EMPTY);
  const [inhouse, setInhouse] = useState(EMPTY);
  const [outsource, setOutsource] = useState(EMPTY);
  const [courses, setCourses] = useState([]);
  const [opts, setOpts] = useState({ projects: [], clients: [], organizations: [] });
  const [loading, setLoading] = useState(true);
  // Which KPI is focused: 'all' (Current Requested) filters nothing; a specific
  // metric filters the charts below to just that category.
  const [metric, setMetric] = useState('all');
  const pickMetric = (m) => setMetric(cur => (cur === m ? 'all' : m));

  useEffect(() => {
    api.get('/training-courses').then(r => setCourses(r.data)).catch(logError);
    api.get('/employees/filter-options').then(r => setOpts(r.data)).catch(logError);
  }, []);

  useEffect(() => {
    const build = (rtOverride) => {
      const p = new URLSearchParams();
      if (filters.client) p.append('clients', filters.client);
      if (filters.project) p.append('projects', filters.project);
      if (filters.course_id) p.append('course_id', filters.course_id);
      if (filters.organization) p.append('organization', filters.organization);
      if (filters.employment_status) p.append('employment_status', filters.employment_status);
      const rt = rtOverride !== undefined ? rtOverride : filters.resource_type;
      if (rt) p.append('resource_type', rt);
      return `/training-records/dashboard?${p.toString()}`;
    };
    // With no resource-type filter, show the In-House vs Outsource split (two
    // extra fetches). With one selected, a single section driven by `overall`.
    const split = !filters.resource_type;
    setLoading(true);
    const reqs = [api.get(build())];
    if (split) reqs.push(api.get(build('inhouse')), api.get(build('outsource')));
    Promise.all(reqs)
      .then(res => { setOverall(res[0].data); if (split) { setInhouse(res[1].data); setOutsource(res[2].data); } })
      .catch(logError).finally(() => setLoading(false));
  }, [filters]);

  const k = overall.kpis || {};
  const pendingTotal = (overall.pending_reasons || []).reduce((s, r) => s + r.count, 0);
  const sel = { height: 30, padding: '4px 8px', fontSize: 12, width: 165 };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span><span className="topbar-sep">›</span>
          <span className="topbar-title">Training Dashboard</span>
        </div>
      </div>
      <div className="content graphs-content">
        {/* Filters — the standard card used across the app */}
        <div className="card" style={{ marginBottom: 20, position: 'sticky', top: 'var(--header-h)', zIndex: 40 }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', flexShrink: 0, paddingTop: 6 }}>Filter</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <select className="form-select" style={sel} value={filters.client} onChange={e => setFilters(f => ({ ...f, client: e.target.value }))}>
                  <option value="">All Clients</option>
                  {opts.clients.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="form-select" style={sel} value={filters.project} onChange={e => setFilters(f => ({ ...f, project: e.target.value }))}>
                  <option value="">All Projects</option>
                  {opts.projects.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select className="form-select" style={sel} value={filters.course_id} onChange={e => setFilters(f => ({ ...f, course_id: e.target.value }))}>
                  <option value="">All Training Types</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className="form-select" style={sel} value={filters.resource_type} onChange={e => setFilters(f => ({ ...f, resource_type: e.target.value }))}>
                  <option value="">All Resources</option>
                  <option value="inhouse">In-House</option>
                  <option value="outsource">Outsource</option>
                  <option value="intern">Intern</option>
                </select>
                <input className="form-input" list="dash-organizations" style={sel} placeholder="All Organizations"
                  value={filters.organization} onChange={e => setFilters(f => ({ ...f, organization: e.target.value }))} />
                <datalist id="dash-organizations">
                  {(opts.organizations || []).map(o => <option key={o} value={o} />)}
                </datalist>
                <select className="form-select" style={sel} value={filters.employment_status} onChange={e => setFilters(f => ({ ...f, employment_status: e.target.value }))}>
                  <option value="">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="exit">Exit</option>
                </select>
                <button className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12 }}
                  onClick={() => setFilters(DEFAULT_FILTERS)}>✕ Clear</button>
                {loading && <span style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</span>}
              </div>
            </div>
          </div>
        </div>

        {/* KPI row + pending reasons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) 1.3fr', gap: 16, marginBottom: 22 }}>
          <KPI label="Current Requested Trainings" value={k.all_records ?? k.total} kind="navy" icon="ti-clipboard-list" active={metric === 'all'} onClick={() => setMetric('all')} />
          <KPI label="Valid Certificates" value={k.valid} kind="valid" icon="ti-circle-check" active={metric === 'valid'} onClick={() => pickMetric('valid')} />
          <KPI label="About to Expire" value={k.expiring} kind="expiring" icon="ti-clock-exclamation" active={metric === 'expiring'} onClick={() => pickMetric('expiring')} />
          <KPI label="Pending Certificates" value={pendingTotal} kind="pending" icon="ti-hourglass" active={metric === 'pending'} onClick={() => pickMetric('pending')} />
          <div className="card" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: .4, borderBottom: '1px solid #eef1f5', paddingBottom: 8, marginBottom: 6 }}>
              <span style={{ width: 34, textAlign: 'right', flexShrink: 0 }}>Count</span><span>Pending Reason</span>
            </div>
            <div style={{ maxHeight: 128, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {(overall.pending_reasons || []).map(r => (
                <div key={r.reason} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, color: '#374151' }}>
                  <span style={{ minWidth: 26, height: 20, padding: '0 6px', borderRadius: 10, background: C.pending.tint, color: C.pending.solid, fontWeight: 700, fontSize: 11.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{fmt(r.count)}</span>
                  <span>{r.reason}</span>
                </div>
              ))}
              {!overall.pending_reasons?.length && <div style={{ fontSize: 12, color: '#9ca3af', padding: '6px 0' }}>No pending trainings.</div>}
            </div>
            {pendingTotal > 0 && <div style={{ borderTop: '1px solid #eef1f5', marginTop: 8, paddingTop: 6, fontSize: 12.5, fontWeight: 800, color: '#0f2a4a' }}>{fmt(pendingTotal)} total</div>}
          </div>
        </div>

        {/* Charts — one section per selected resource type, else In-House vs Outsource */}
        {filters.resource_type ? (
          <>
            <Section icon={RT_ICON[filters.resource_type] || 'ti-users'} label={RT_LABEL[filters.resource_type] || 'Resources'} />
            <ChartsRow d={overall} metric={metric} />
          </>
        ) : (
          <>
            <Section icon="ti-building" label="In-House" />
            <ChartsRow d={inhouse} metric={metric} />
            <Section icon="ti-briefcase" label="Outsource" />
            <ChartsRow d={outsource} metric={metric} />
          </>
        )}
      </div>
    </>
  );
}
