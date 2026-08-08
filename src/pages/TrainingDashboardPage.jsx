import React, { useEffect, useLayoutEffect, useState, useId, useRef } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import api, { logError } from '../utils/api';
import TRAINING_ICONS from '../trainingIcons';
import { resolveIconKey } from '../components/TrainingIcon';

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

const KPI = ({ label, value, sub, kind, icon, active, onClick, height }) => {
  const c = C[kind];
  return (
    <div className="card" onClick={onClick}
      style={{ padding: '16px 20px', height, display: 'flex', alignItems: 'center', gap: 14, borderTop: `3px solid ${c.solid}`,
        cursor: onClick ? 'pointer' : 'default', background: active ? c.tint : '',
        outline: active ? `2px solid ${c.solid}` : '', transition: 'outline .1s, background .1s' }}>
      <div style={{ width: 46, height: 46, borderRadius: 13, background: c.tint, color: c.solid, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 24 }} aria-hidden="true"></i>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: '#6b7280', fontWeight: 600, lineHeight: 1.35 }}>{label}</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: c.solid, marginTop: 2, lineHeight: 1 }}>{fmt(value ?? 0)}</div>
        {sub && <div style={{ fontSize: 10.5, color: '#9ca3af', fontWeight: 500, marginTop: 4, lineHeight: 1.3 }}>{sub}</div>}
      </div>
    </div>
  );
};

// Wrap a long name onto up to `maxLines` lines (last line ellipsised).
const wrapLines = (text, maxChars = 19, maxLines = 2) => {
  const words = String(text).split(' ');
  const lines = []; let cur = '';
  words.forEach(w => { const t = (cur ? cur + ' ' : '') + w; if (t.length > maxChars && cur) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur);
  const out = lines.slice(0, maxLines);
  if (lines.length > maxLines) out[maxLines - 1] = out[maxLines - 1].slice(0, maxChars - 1) + '…';
  return out;
};
const stripParen = (s) => String(s || '').replace(/\s*\([^)]*\)\s*$/, '').trim(); // "Foo (KPLC)" -> "Foo"
const truncate = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

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

// Uniform bar-row height shared by every bar chart on the page.
const ROW_H = 44;

function ValidityBars({ data, nameKey, metric = 'all', availH = 9999 }) {
  const pfx = useId().replace(/[:]/g, ''); // unique, SVG-id-safe gradient namespace per chart
  const single = metric !== 'all';
  const rows = single ? data.filter(d => (d[metric] || 0) > 0).sort((a, b) => (b[metric] || 0) - (a[metric] || 0)) : data;
  if (!rows.length) return <div style={{ color: '#9ca3af', fontSize: 13, padding: 40, textAlign: 'center' }}>No training data.</div>;
  // Every bar is a fixed ROW_H tall so bar thickness is identical across all the
  // bar charts. The chart renders at its natural height; when it fits the card the
  // bars are centered vertically, and when it overflows the card scrolls (from the
  // top, so the scrollbar reaches every bar).
  const innerH = Math.max(rows.length * ROW_H + 20, 130);
  const overflow = innerH > availH;
  const m = METRIC_META[metric];
  const isCourse = nameKey === 'course';
  const isProject = nameKey === 'project';
  const AXIS_W = isCourse ? 150 : 130; // tighter than before; labels are left-aligned
  const renderTick = ({ x, y, payload }) => {
    const left = 4; // label area starts at the chart's left edge (avoids clipping)
    const row = rows[payload.index] || {};
    if (isCourse) {
      const key = resolveIconKey(row.icon, stripParen(payload.value));
      const icon = key && TRAINING_ICONS[key];
      const tx = left + (icon ? 22 : 0);
      const lines = wrapLines(payload.value, 17);
      return (
        <g>
          {icon && <svg x={left} y={y - 8} width={16} height={16} viewBox={icon.vb}><path d={icon.d} fill="#475569" fillRule="evenodd" /></svg>}
          <text x={tx} y={y} textAnchor="start" fill="#374151" fontSize={11}>
            {lines.map((ln, i) => <tspan key={i} x={tx} dy={i === 0 ? (lines.length > 1 ? -3 : 4) : 13}>{ln}</tspan>)}
          </text>
        </g>
      );
    }
    if (isProject) {
      const client = row.client;
      return (
        <text x={left} y={y} textAnchor="start" fill="#374151" fontSize={11}>
          <tspan x={left} dy={client ? -3 : 4}>{truncate(payload.value, 20)}</tspan>
          {client && <tspan x={left} dy={13} fill="#9ca3af" fontSize={10}>{truncate(client, 22)}</tspan>}
        </text>
      );
    }
    const lines = wrapLines(payload.value, 19);
    return (
      <text x={x} y={y} textAnchor="end" fill="#374151" fontSize={11}>
        {lines.map((ln, i) => <tspan key={i} x={x} dy={i === 0 ? (lines.length > 1 ? -3 : 4) : 13}>{ln}</tspan>)}
      </text>
    );
  };
  return (
    <div style={{ height: '100%', overflowY: overflow ? 'auto' : 'hidden', overflowX: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: overflow ? 'flex-start' : 'center' }}>
      <div style={{ flexShrink: 0, width: '100%', height: innerH }}>
      <ResponsiveContainer width="100%" height={innerH}>
        <BarChart layout="vertical" data={rows} margin={{ top: 4, right: 44, left: 2, bottom: 4 }} barCategoryGap={10}>
          <Gradients pfx={pfx} />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey={nameKey} width={AXIS_W} tickLine={false} axisLine={false} interval={0} tick={renderTick} />
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
    </div>
  );
}

const ChartCard = ({ title, height, children }) => (
  <div className="card" style={{ padding: '16px 18px', height, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2a4a', textAlign: 'center', marginBottom: 10, flexShrink: 0 }}>{title}</div>
    <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
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

function Donut({ k, metric = 'all', twoUp = false }) {
  const pfx = useId().replace(/[:]/g, ''); // unique filter id per donut instance
  const all = [
    { name: 'Valid', value: k.valid || 0, color: C.valid.solid, key: 'valid' },
    { name: 'About to Expire', value: k.expiring || 0, color: C.expiring.solid, key: 'expiring' },
    { name: 'Pending', value: k.pending || 0, color: C.pending.solid, key: 'pending' },
  ];
  const single = metric !== 'all';
  const rows = single ? all.filter(d => d.key === metric) : all;
  const grand = all.reduce((s, r) => s + r.value, 0);
  const center = single ? (rows[0]?.value || 0) : grand;
  // Compliance = valid + about-to-expire (i.e. everyone holding a still-valid
  // certificate) over the total, shown in green so it reads at a glance.
  const compliance = grand ? Math.round(((k.valid || 0) + (k.expiring || 0)) / grand * 100) : 0;
  if (grand === 0) return <div style={{ color: '#9ca3af', fontSize: 13, padding: 40, textAlign: 'center' }}>No training data.</div>;
  if (single && center === 0) return <div style={{ color: '#9ca3af', fontSize: 13, padding: 40, textAlign: 'center' }}>None in this category.</div>;
  const shown = rows.filter(d => d.value > 0);
  // The ring flex-fills whatever height is left after the pill + legend, using
  // percentage radii — so the legend never clips no matter how short the card is.
  // The ring (donut + centered total) — reused by both layouts.
  const chart = (
    <>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <defs>
            <filter id={`donutShadow-${pfx}`} x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#1f2937" floodOpacity="0.18" />
            </filter>
          </defs>
          <Pie data={shown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="58%" outerRadius="86%"
            paddingAngle={shown.length > 1 ? 3 : 0} cornerRadius={8} stroke="none" isAnimationActive={false}
            label={single ? false : PieSlicePct} labelLine={false}>
            {shown.map(d => <Cell key={d.name} fill={d.color} style={{ filter: `url(#donutShadow-${pfx})` }} />)}
          </Pie>
          <Tooltip content={<PieTip total={center} />} wrapperStyle={{ zIndex: 60 }} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#0f2a4a', lineHeight: 1 }}>{fmt(center)}</div>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{single ? rows[0].name : 'Trainings'}</div>
      </div>
    </>
  );
  const legend = (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginTop: 6, flexShrink: 0 }}>
      {rows.map(d => (
        <span key={d.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
          <span style={{ width: 11, height: 11, borderRadius: 3, background: d.color, display: 'inline-block' }} />{d.name} <b>{fmt(d.value)}</b>{!single && <span style={{ opacity: 0.6 }}> ({grand ? Math.round(d.value / grand * 100) : 0}%)</span>}
        </span>
      ))}
    </div>
  );

  // Double mode (two resource sections): put the pie on the left (shifted a bit
  // left of centre) with a compact compliance badge to its RIGHT, legend below —
  // saves the vertical room the short cards don't have, keeping the pie big.
  if (!single && twoUp) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1, height: '100%', minWidth: 0 }}>{chart}</div>
          {/* Green outline + soft shadow so the badge catches the eye; it stays in
              its own space to the right (never overlapping the pie). */}
          <div title="Valid + About to Expire ÷ Total" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, color: C.valid.solid, background: C.valid.tint, border: `2px solid ${C.valid.solid}`, borderRadius: 12, padding: '8px 10px', boxShadow: `0 2px 8px ${C.valid.solid}33` }}>
            <i className="ti ti-shield-check" style={{ fontSize: 18 }} aria-hidden="true"></i>
            <span style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.1 }}>{compliance}%</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, lineHeight: 1 }}>Compliant</span>
          </div>
        </div>
        {legend}
      </div>
    );
  }

  // Single mode (one section, fills the page) and metric-focused view: pie stays
  // vertically centred; when the compliance pill is shown it centres in the gap
  // between the ring and the legend.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {!single && <div style={{ flex: 1, minHeight: 0 }} />}
      <div style={{ position: 'relative', minHeight: 90, ...(single ? { flex: 1 } : { flexShrink: 1, width: '100%', aspectRatio: '1 / 1' }) }}>{chart}</div>
      {!single && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span title="Valid + About to Expire ÷ Total" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.valid.tint, color: C.valid.solid, fontWeight: 800, fontSize: 13, padding: '5px 15px', borderRadius: 999, border: `2px solid ${C.valid.solid}`, boxShadow: `0 2px 8px ${C.valid.solid}33` }}>
            <i className="ti ti-shield-check" style={{ fontSize: 15 }} aria-hidden="true"></i>{compliance}% Compliant
          </span>
        </div>
      )}
      {legend}
    </div>
  );
}

const ChartsRow = ({ d, metric, chartH, twoUp }) => {
  const areaH = Math.max(120, chartH - 62); // card height minus padding + title = the chart area
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1.3fr', gap: 18, marginBottom: 16 }}>
      <ChartCard title="Total Validity" height={chartH}><Donut k={d.kpis || {}} metric={metric} twoUp={twoUp} /></ChartCard>
      <ChartCard title="Validity per Training Type" height={chartH}><ValidityBars data={d.by_course || []} nameKey="course" metric={metric} availH={areaH} /></ChartCard>
      <ChartCard title="Validity per Project" height={chartH}><ValidityBars data={d.by_project || []} nameKey="project" metric={metric} availH={areaH} /></ChartCard>
    </div>
  );
};

const Section = ({ icon, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '0 2px 8px' }}>
    <i className={`ti ${icon}`} style={{ fontSize: 17, color: '#042C53' }} aria-hidden="true"></i>
    <span style={{ fontSize: 14.5, fontWeight: 700, color: '#0f2a4a' }}>{label}</span>
    <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
  </div>
);

// Checkbox multi-select dropdown (used for Clients / Projects).
function MultiSelect({ label, options, selected, onChange, width = 165 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const summary = !selected.length ? label : selected.length === 1 ? selected[0] : `${selected.length} selected`;
  return (
    <div ref={ref} style={{ position: 'relative', width }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ height: 30, padding: '4px 8px', fontSize: 12, width, textAlign: 'left', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, color: selected.length ? '#111827' : '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span><span style={{ opacity: .55, flexShrink: 0 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 60, top: 'calc(100% + 2px)', left: 0, width: Math.max(width, 190), maxHeight: 250, overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', padding: 4 }}>
          {selected.length > 0 && <div onClick={() => onChange([])} style={{ fontSize: 11, color: '#A32D2D', padding: '4px 6px', cursor: 'pointer', fontWeight: 600 }}>✕ Clear ({selected.length})</div>}
          {options.map(o => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 6px', fontSize: 12, cursor: 'pointer', borderRadius: 4 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F0F7FF')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} style={{ margin: 0 }} />{o}
            </label>
          ))}
          {!options.length && <div style={{ fontSize: 12, color: '#9ca3af', padding: 6 }}>No options</div>}
        </div>
      )}
    </div>
  );
}

const EMPTY = { kpis: {}, pending_reasons: [], by_course: [], by_project: [] };

const RT_LABEL = { inhouse: 'In-House', outsource: 'Outsource', intern: 'Interns' };
const RT_ICON = { inhouse: 'ti-building', outsource: 'ti-users-group', intern: 'ti-school' };
const DEFAULT_FILTERS = { client: [], project: [], course_id: '', organization: '', resource_type: '', employment_status: 'active', pending_reason: '' };

export default function TrainingDashboardPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [overall, setOverall] = useState(EMPTY);
  const [inhouse, setInhouse] = useState(EMPTY);
  const [outsource, setOutsource] = useState(EMPTY);
  const [courses, setCourses] = useState([]);
  const [pendingReasons, setPendingReasons] = useState([]);
  const [opts, setOpts] = useState({ projects: [], clients: [], organizations: [] });
  const [loading, setLoading] = useState(true);
  // Which KPI is focused: 'all' (Current Requested) filters nothing; a specific
  // metric filters the charts below to just that category.
  const [metric, setMetric] = useState('all');
  const pickMetric = (m) => setMetric(cur => (cur === m ? 'all' : m));

  useEffect(() => {
    api.get('/training-courses').then(r => setCourses(r.data)).catch(logError);
    api.get('/training-pending-reasons').then(r => setPendingReasons(r.data)).catch(logError);
    api.get('/employees/filter-options').then(r => setOpts(r.data)).catch(logError);
  }, []);

  useEffect(() => {
    const build = (rtOverride) => {
      const p = new URLSearchParams();
      if (filters.client.length) p.append('clients', filters.client.join(','));
      if (filters.project.length) p.append('projects', filters.project.join(','));
      if (filters.course_id) p.append('course_id', filters.course_id);
      if (filters.organization) p.append('organization', filters.organization);
      if (filters.employment_status) p.append('employment_status', filters.employment_status);
      if (filters.pending_reason) p.append('pending_reason', filters.pending_reason);
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
  const KPI_H = 156; // sized so the pending-reason panel shows exactly 4 rows
  // Size the chart sections so the WHOLE dashboard fits in the viewport (no page
  // scroll): split the space below the KPI row across however many sections are
  // shown — so a single-resource view fills the page, and the two-section view
  // gives both an equal, fixed height. Height tracks the section count and the
  // viewport only (NOT the other filters, which just change row counts inside the
  // fixed-height cards); bar charts scroll internally for their overflow.
  const sectionCount = filters.resource_type ? 1 : 2;
  const sectionsRef = useRef(null);
  const [chartH, setChartH] = useState(300);
  useLayoutEffect(() => {
    const compute = () => {
      const el = sectionsRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;      // viewport-relative start of the sections
      const chrome = 34 + 16;                           // each section: header + row gap
      const avail = window.innerHeight - top - 18;      // leave a small bottom margin
      setChartH(Math.max(230, Math.floor((avail - sectionCount * chrome) / sectionCount)));
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [sectionCount]);

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub</span><span className="topbar-sep">›</span>
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
                <MultiSelect label="All Clients" options={opts.clients} selected={filters.client} onChange={v => setFilters(f => ({ ...f, client: v }))} width={150} />
                <MultiSelect label="All Projects" options={opts.projects} selected={filters.project} onChange={v => setFilters(f => ({ ...f, project: v }))} width={165} />
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
                <select className="form-select" style={sel} value={filters.pending_reason} onChange={e => setFilters(f => ({ ...f, pending_reason: e.target.value }))}>
                  <option value="">All Pending Reasons</option>
                  {pendingReasons.map(r => <option key={r.id} value={r.label}>{r.label}</option>)}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) 1.3fr', gap: 16, marginBottom: 20 }}>
          <KPI label="Current Requested Trainings" sub="All needed trainings" value={k.all_records ?? k.total} kind="navy" icon="ti-clipboard-list" active={metric === 'all'} onClick={() => setMetric('all')} height={KPI_H} />
          <KPI label="Valid Certificates" sub="Valid — over 60 days to expiry" value={k.valid} kind="valid" icon="ti-circle-check" active={metric === 'valid'} onClick={() => pickMetric('valid')} height={KPI_H} />
          <KPI label="About to Expire" sub="Valid — under 60 days to expiry" value={k.expiring} kind="expiring" icon="ti-clock-exclamation" active={metric === 'expiring'} onClick={() => pickMetric('expiring')} height={KPI_H} />
          <KPI label="Pending Certificates" sub="Invalid — need action" value={pendingTotal} kind="pending" icon="ti-hourglass" active={metric === 'pending'} onClick={() => pickMetric('pending')} height={KPI_H} />
          <div className="card" style={{ padding: '14px 18px', height: KPI_H, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: .4, borderBottom: '1px solid #eef1f5', paddingBottom: 8, marginBottom: 6, flexShrink: 0 }}>
              <span style={{ width: 34, textAlign: 'right', flexShrink: 0 }}>Count</span><span>Pending Reason</span>
            </div>
            {/* Fixed height (shows 4 rows); scrollbar appears on the right when there are more. */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {(overall.pending_reasons || []).map(r => (
                <div key={r.reason} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, color: '#374151' }}>
                  <span style={{ minWidth: 26, height: 20, padding: '0 6px', borderRadius: 10, background: C.pending.tint, color: C.pending.solid, fontWeight: 700, fontSize: 11.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{fmt(r.count)}</span>
                  <span>{r.reason}</span>
                </div>
              ))}
              {!overall.pending_reasons?.length && <div style={{ fontSize: 12, color: '#9ca3af', padding: '6px 0' }}>No pending trainings.</div>}
            </div>
          </div>
        </div>

        {/* Charts — one section per selected resource type, else In-House vs Outsource */}
        <div ref={sectionsRef}>
          {filters.resource_type ? (
            <>
              <Section icon={RT_ICON[filters.resource_type] || 'ti-users'} label={RT_LABEL[filters.resource_type] || 'Resources'} />
              <ChartsRow d={overall} metric={metric} chartH={chartH} />
            </>
          ) : (
            <>
              <Section icon={RT_ICON.inhouse} label="In-House" />
              <ChartsRow d={inhouse} metric={metric} chartH={chartH} twoUp />
              <Section icon={RT_ICON.outsource} label="Outsource" />
              <ChartsRow d={outsource} metric={metric} chartH={chartH} twoUp />
            </>
          )}
        </div>
      </div>
    </>
  );
}
