import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, LineChart, Line, Legend, Cell } from 'recharts';
import api, { logError } from '../utils/api';

// Teal-to-navy ramp; bars are colored by rank (highest count = teal) by
// interpolating across these stops instead of picking one color per bar,
// so it reads smoothly regardless of how many employees come back.
const EMPLOYEE_COLOR_STOPS = ['#3FC1C0', '#20BAC5', '#00B2CA', '#04A6C2', '#0899BA', '#0F80AA', '#16679A', '#1A5B92', '#1C558E', '#1D4E89'];
const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixHex = (hex1, hex2, t) => {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const round = (v) => Math.round(v).toString(16).padStart(2, '0');
  return '#' + round(r1 + (r2 - r1) * t) + round(g1 + (g2 - g1) * t) + round(b1 + (b2 - b1) * t);
};
const rampColor = (t) => {
  const scaled = Math.max(0, Math.min(1, t)) * (EMPLOYEE_COLOR_STOPS.length - 1);
  const i = Math.min(EMPLOYEE_COLOR_STOPS.length - 2, Math.floor(scaled));
  return mixHex(EMPLOYEE_COLOR_STOPS[i], EMPLOYEE_COLOR_STOPS[i + 1], scaled - i);
};

// Plain-object `dot` shorthand can fail to render a point that has no line
// segment touching it on either side (e.g. the first real value after a
// run of months with no data). Drawing it explicitly guarantees it shows.
const renderStageDot = (color) => (props) => {
  const { cx, cy, value } = props;
  if (value === null || value === undefined) return null;
  return <circle key={props.key} cx={cx} cy={cy} r={3} fill="#fff" stroke={color} strokeWidth={2} />;
};

const DELAY_SERIES = [
  { key: 'ehs', name: 'EHS processing', color: '#2563EB' },
  { key: 'pm', name: 'PM approval', color: '#BE185D' },
  { key: 'scm', name: 'SCM ordering', color: '#048660' },
  { key: 'supplier', name: 'Supplier delivery', color: '#BB5A08' },
  { key: 'project', name: 'Project distribution', color: '#0C447C' },
];

const AUDITS_REQUESTS_SERIES = [
  { key: 'audits', label: 'Audits', color: '#2563EB', gradientId: 'auditsBarGradient', gradientFrom: '#3b82f6', gradientTo: '#1d4ed8' },
  { key: 'requests', label: 'Requests', color: '#10B981', gradientId: 'requestsBarGradient', gradientFrom: '#34d399', gradientTo: '#059669' },
];

const FilterChip = ({ label, active, highlighted, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap',
      border: '1.2px ' + (active ? 'solid #2563EB' : highlighted ? 'dashed #93b4e8' : 'solid transparent'),
      background: active ? '#E6F1FB' : highlighted ? '#F3F7FD' : '#F1F2F4',
      color: active ? '#2563EB' : highlighted ? '#3B5B92' : '#374151',
      fontSize: 10, fontWeight: active ? 600 : 500,
      cursor: disabled ? 'default' : 'pointer', transition: 'all 0.15s ease',
      opacity: disabled ? 0.6 : 1,
    }}
  >
    {active && <span style={{ fontSize: 9 }}>✓</span>}
    {label}
  </button>
);

export default function RequestsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ projects: [], clients: [] });
  const [activeStages, setActiveStages] = useState([]); // ticking legend pills isolates those series; empty = show all
  const [auditsView, setAuditsView] = useState(null); // null (all) | 'audits' (present, has a result) | 'requests' (not present)

  const toggleFilter = (key, value) => setFilters(current => ({
    ...current,
    [key]: current[key].includes(value) ? current[key].filter(v => v !== value) : [...current[key], value],
  }));

  useEffect(() => {
    setLoading(true);
    setError('');
    api.get('/graphs', { params: { project: filters.projects.join(','), client: filters.clients.join(',') } })
      .then(r => setData(r.data))
      .catch(e => { logError(e); setError(e.response?.data?.error || 'Unable to load graph data'); })
      .finally(() => setLoading(false));
  }, [filters]);

  if (loading && !data) return <div className="content graphs-content"><div style={{color:'#6b7280',padding:40,textAlign:'center'}}>Loading charts...</div></div>;
  if (error && !data) return <div className="content graphs-content"><div style={{color:'#A32D2D',padding:40,textAlign:'center'}}>{error}</div></div>;

  // Ticking a client doesn't select anything for you -- it just brings that
  // client's projects to the front of the row with a dashed accent, so
  // they're easy to spot and click yourself.
  const clientProjectsMap = data.filter_options?.client_projects || {};
  const highlightedProjects = new Set(filters.clients.flatMap(c => clientProjectsMap[c] || []));
  const allFilterProjects = data.filter_options?.projects || [];
  const sortedFilterProjects = highlightedProjects.size === 0 ? allFilterProjects : [
    ...allFilterProjects.filter(p => highlightedProjects.has(p)),
    ...allFilterProjects.filter(p => !highlightedProjects.has(p)),
  ];

  const CustomTooltipPPE = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const employees = data.ppe_by_employee;
    const idx = employees.findIndex(r => r.name === label);
    const color = rampColor(employees.length > 1 ? idx / (employees.length - 1) : 0);
    return (
      <div style={{ background: '#fff', border: '1px solid #dbe2ea', borderRadius: 10, padding: '12px 14px', boxShadow: '0 8px 24px rgba(15,42,74,0.12)', minWidth: 190 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 8 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, fontSize: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#4b5563' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            Flagged requests
          </span>
          <span style={{ color: '#111827', fontWeight: 600 }}>{payload[0].value}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginTop: 6, fontSize: 12 }}>
          <span style={{ color: '#9ca3af' }}>Top-20 average</span>
          <span style={{ color: '#111827', fontWeight: 600 }}>{data.ppe_average}</span>
        </div>
      </div>
    );
  };

  const StageDelayTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const monthData = payload[0]?.payload || {};
    return (
      <div style={{ background: '#fff', border: '1px solid #dbe2ea', borderRadius: 10, padding: '12px 14px', boxShadow: '0 8px 24px rgba(15,42,74,0.12)', minWidth: 310 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 8 }}>{label}</div>
        {DELAY_SERIES
          .filter(series => monthData[series.key] !== null && monthData[series.key] !== undefined)
          .sort((a, b) => monthData[b.key] - monthData[a.key])
          .map(series => (
            <div key={series.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginTop: 6, fontSize: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#4b5563' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: series.color }} />
                {series.name}
              </span>
              <span style={{ color: '#111827', fontWeight: 600, whiteSpace: 'nowrap' }}>
                Avg {monthData[series.key]} d
                <span style={{ color: '#6b7280', fontWeight: 400 }}> · Max {monthData[series.key + '_max']} d</span>
                <span style={{ color: '#9ca3af', fontWeight: 400 }}>
                  {' · '}{monthData[series.key + '_count']} items
                  {monthData[series.key + '_open_count'] > 0 ? ` (${monthData[series.key + '_open_count']} open)` : ''}
                </span>
              </span>
            </div>
          ))}
      </div>
    );
  };

  const AuditsRequestsTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload || {};
    return (
      <div style={{ background: '#fff', border: '1px solid #dbe2ea', borderRadius: 10, padding: '12px 14px', boxShadow: '0 8px 24px rgba(15,42,74,0.12)', minWidth: 170 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 8 }}>{label}</div>
        {AUDITS_REQUESTS_SERIES.map(series => (
          <div key={series.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginTop: 6, fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#4b5563' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: series.color }} />
              {series.label}
            </span>
            <span style={{ color: '#111827', fontWeight: 600 }}>{row[series.key + '_count']}</span>
          </div>
        ))}
      </div>
    );
  };

  const stageDelayData = data.ppe_stage_delays_by_month || [];
  const hasStageDelayData = stageDelayData.some(row => DELAY_SERIES.some(series => row[series.key] !== null));

  // Isolating a segment zeroes out the other one instead of unmounting its
  // <Bar> -- toggling which Bar components are mounted confuses Recharts'
  // stacking reconciliation between renders (the pill's "off" click stopped
  // reliably clearing the filter).
  const auditsChartData = data.audits_by_month.map(row => ({
    ...row,
    requests_count_display: auditsView === 'audits' ? 0 : row.requests_count,
    audits_count_display: auditsView === 'requests' ? 0 : row.audits_count,
  }));

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Requests</span>
        </div>
        <div className="topbar-right">
          {(filters.projects.length > 0 || filters.clients.length > 0) && (
            <button className="btn btn-sm" onClick={() => setFilters({ projects: [], clients: [] })} disabled={loading}>Clear filters</button>
          )}
        </div>
      </div>
      <div className="content graphs-content">
        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}
        <div className="card" style={{ marginBottom: 24, position: 'sticky', top: 'var(--header-h)', zIndex: 40 }}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', flexShrink: 0, paddingTop: 6 }}>Client</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <FilterChip label="All clients" active={filters.clients.length === 0} disabled={loading} onClick={() => setFilters(current => ({ ...current, clients: [] }))} />
                {(data.filter_options?.clients || []).map(client => (
                  <FilterChip key={client} label={client} active={filters.clients.includes(client)} disabled={loading} onClick={() => toggleFilter('clients', client)} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', flexShrink: 0, paddingTop: 6 }}>Project</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <FilterChip label="All projects" active={filters.projects.length === 0} disabled={loading} onClick={() => setFilters(current => ({ ...current, projects: [] }))} />
                {sortedFilterProjects.map(project => (
                  <FilterChip
                    key={project}
                    label={project}
                    active={filters.projects.includes(project)}
                    highlighted={highlightedProjects.has(project)}
                    disabled={loading}
                    onClick={() => toggleFilter('projects', project)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '7fr 3fr', gap: 24, marginBottom: 24 }}>
        <div className="card">
          <div className="card-header" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div className="card-title" style={{ fontSize: 15, marginBottom: 4 }}>Average PPE Workflow Delay by Month</div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>Average calendar days in completed and currently open workflow stages</div>
            </div>
            <span className="tag tag-navy" style={{ whiteSpace: 'nowrap' }}>Last 6 months</span>
          </div>
          <div className="card-body" style={{ paddingTop: 20 }}>
            {!hasStageDelayData ? (
              <div style={{ color: '#6b7280', fontSize: 13, padding: '56px 0', textAlign: 'center' }}>No completed or open PPE workflow stages in this period</div>
            ) : (
              <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', marginBottom: 12 }}>
                {DELAY_SERIES.map(series => {
                  const isActive = activeStages.includes(series.key);
                  const dimmed = activeStages.length > 0 && !isActive;
                  return (
                    <button
                      key={series.key}
                      onClick={() => setActiveStages(prev => prev.includes(series.key) ? prev.filter(k => k !== series.key) : [...prev, series.key])}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap',
                        border: '1.2px solid ' + (dimmed ? '#e5e7eb' : series.color),
                        background: isActive ? series.color + '18' : '#fff',
                        color: dimmed ? '#9ca3af' : series.color,
                        fontSize: 10, fontWeight: isActive ? 600 : 500,
                        cursor: 'pointer', transition: 'all 0.15s ease',
                      }}
                    >
                      {isActive
                        ? <span style={{ fontSize: 9 }}>✓</span>
                        : <span style={{ width: 8, height: 8, borderRadius: '50%', background: dimmed ? '#d1d5db' : series.color }} />}
                      {series.name}
                    </button>
                  );
                })}
              </div>
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={stageDelayData} margin={{ top: 8, right: 22, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#dbe2ea' }} />
                  <YAxis width={46} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} unit=" d" allowDecimals={false} />
                  <Tooltip content={<StageDelayTooltip />} />
                  {DELAY_SERIES.filter(series => activeStages.length === 0 || activeStages.includes(series.key)).map(series => (
                    <Line
                      key={series.key}
                      type="monotone"
                      dataKey={series.key}
                      name={series.name}
                      stroke={series.color}
                      strokeWidth={2.5}
                      connectNulls={true}
                      dot={renderStageDot(series.color)}
                      activeDot={{ r: 5, strokeWidth: 2, fill: '#fff' }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              </>
            )}
          </div>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="card-header" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div className="card-title" style={{ fontSize: 15, marginBottom: 4 }}>Audits / Requests per Month</div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>Audits vs. Requests by month</div>
            </div>
            <span className="tag tag-navy" style={{ whiteSpace: 'nowrap' }}>Last 6 months</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', padding: '16px 18px 0' }}>
            {AUDITS_REQUESTS_SERIES.map(opt => {
              const isActive = auditsView === opt.key;
              const dimmed = auditsView && !isActive;
              return (
                <button
                  key={opt.key}
                  onClick={() => setAuditsView(prev => prev === opt.key ? null : opt.key)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap',
                    border: '1.2px solid ' + (dimmed ? '#e5e7eb' : opt.color),
                    background: isActive ? opt.color + '18' : '#fff',
                    color: dimmed ? '#9ca3af' : opt.color,
                    fontSize: 10, fontWeight: isActive ? 600 : 500,
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  {isActive
                    ? <span style={{ fontSize: 9 }}>✓</span>
                    : <span style={{ width: 8, height: 8, borderRadius: '50%', background: dimmed ? '#d1d5db' : opt.color }} />}
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
            {data.audits_by_month.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>No audit data</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={auditsChartData} margin={{ top: 30, right: 16, left: 4, bottom: 4 }}>
                  <defs>
                    {AUDITS_REQUESTS_SERIES.map(series => (
                      <linearGradient key={series.gradientId} id={series.gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={series.gradientFrom} />
                        <stop offset="100%" stopColor={series.gradientTo} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#dbe2ea' }} />
                  <YAxis width={32} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<AuditsRequestsTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar
                    dataKey="requests_count_display"
                    name="Requests"
                    stackId="a"
                    fill="url(#requestsBarGradient)"
                    radius={auditsView === 'requests' ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                    label={auditsView === 'requests' ? { position: 'top', fontSize: 11, fill: '#374151' } : undefined}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="audits_count_display"
                    name="Audits"
                    stackId="a"
                    fill="url(#auditsBarGradient)"
                    radius={[6, 6, 0, 0]}
                    label={auditsView !== 'requests' ? { position: 'top', fontSize: 11, fill: '#374151' } : undefined}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">Flagged PPE Requests by Employee</span>
            <span className="tag tag-amber">Top 20 · Avg: {data.ppe_average} items</span>
          </div>
          {data.ppe_by_employee.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: 13, padding: '16px 0' }}>No flagged PPE requests</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data.ppe_by_employee} margin={{ top: 26, right: 20, left: 0, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf3" />
                <XAxis dataKey="name" angle={-35} textAnchor="end" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#dbe2ea' }} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltipPPE />} cursor={{ fill: '#f8fafc' }} />
                <ReferenceLine y={data.ppe_average} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: 'Avg ' + data.ppe_average, position: 'insideTopRight', fontSize: 11, fill: '#f59e0b' }} />
                <Bar dataKey="count" name="Flagged PPE Requests" radius={[6, 6, 0, 0]} label={{ position: 'top', fontSize: 11, fill: '#374151' }} isAnimationActive={false}>
                  {data.ppe_by_employee.map((row, i) => (
                    <Cell key={row.name} fill={rampColor(data.ppe_by_employee.length > 1 ? i / (data.ppe_by_employee.length - 1) : 0)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">NCRs Created vs Resolved</span>
            <span className="tag tag-teal">Last 6 months</span>
          </div>
          {data.ncr_by_month.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: 13, padding: '16px 0' }}>No NCR data</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.ncr_by_month} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="created" name="Created" stroke="#e24b4a" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#1D9E75" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  );
}
