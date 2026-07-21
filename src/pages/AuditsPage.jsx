import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Text } from 'recharts';
import api, { logError } from '../utils/api';

// Plain-object `dot` shorthand can fail to render a point that has no line
// segment touching it on either side (e.g. the first real value after a
// run of months with no data). Drawing it explicitly guarantees it shows.
const renderStageDot = (color) => (props) => {
  const { cx, cy, value } = props;
  if (value === null || value === undefined) return null;
  return <circle key={props.key} cx={cx} cy={cy} r={3} fill="#fff" stroke={color} strokeWidth={2} />;
};

// Cycled by index for a dynamic (unknown-length) list of auditors.
const AUDITOR_PALETTE = ['#2a78d6', '#008300', '#e87ba4', '#eda100', '#1baf7a', '#eb6834', '#4a3aa7', '#e34948'];

// Cycled by index for a dynamic (unknown-length) list of projects.
const PROJECT_PALETTE = ['#3FC1C0', '#20BAC5', '#00B2CA', '#04A6C2', '#0899BA', '#0F80AA', '#16679A', '#1A5B92', '#1C558E', '#1D4E89'];

// `highlighted` marks a project as belonging to a currently-ticked client --
// purely a visual cue (dashed accent, no checkmark) so the user can spot and
// click it themselves. It never selects anything on its own.
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

export default function AuditsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ projects: [], clients: [] });
  const [activeAuditors, setActiveAuditors] = useState([]); // isolates one or more auditors' lines; empty = show all

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

  const auditors = data.auditors || [];
  const auditorColor = (name) => AUDITOR_PALETTE[auditors.indexOf(name) % AUDITOR_PALETTE.length];
  const auditorTotals = auditors
    .map(name => ({ name, value: (data.audits_by_auditor_month || []).reduce((sum, row) => sum + (row[name] || 0), 0) }))
    .filter(row => row.value > 0)
    .sort((a, b) => b.value - a.value);
  const auditorGrandTotal = auditorTotals.reduce((sum, row) => sum + row.value, 0);

  // "Auditor Pulse" cards: this month vs. last month, plus a trailing 6-month
  // sparkline, all reshaped from audits_by_auditor_month -- no extra endpoint.
  const monthRows = data.audits_by_auditor_month || [];
  const lastMonthRow = monthRows[monthRows.length - 1] || {};
  const prevMonthRow = monthRows[monthRows.length - 2] || {};
  const teamThisMonth = auditors.reduce((sum, name) => sum + (lastMonthRow[name] || 0), 0);
  const trailingMonths = monthRows.slice(-6);
  const initialsOf = (name) => name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const auditorPulse = auditors.map(name => {
    const cur = lastMonthRow[name] || 0;
    const prev = prevMonthRow[name] || 0;
    const pct = prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0);
    return {
      name,
      initials: initialsOf(name),
      photo: (data.auditor_photos || {})[name] || null,
      color: auditorColor(name),
      current: cur,
      pct,
      share: teamThisMonth > 0 ? cur / teamThisMonth : 0,
      series: trailingMonths.map(row => row[name] || 0),
    };
  }).sort((a, b) => b.current - a.current);
  const auditorPulseByName = Object.fromEntries(auditorPulse.map(a => [a.name, a]));

  const renderPulseCard = (a) => {
    const up = a.pct >= 0;
    const sw = 90, sh = 30, pad = 3;
    const sMax = Math.max(...a.series), sMin = Math.min(...a.series);
    const sx = (i) => pad + (i / Math.max(1, a.series.length - 1)) * (sw - pad * 2);
    const sy = (v) => pad + (1 - (v - sMin) / Math.max(1, sMax - sMin)) * (sh - pad * 2);
    const linePts = a.series.map((v, i) => `${sx(i)},${sy(v)}`).join(' ');
    const areaPts = `${sx(0)},${sh} ${linePts} ${sx(a.series.length - 1)},${sh}`;
    const endX = sx(a.series.length - 1), endY = sy(a.series[a.series.length - 1]);
    const gradId = 'pulseGrad-' + a.name.replace(/\s+/g, '');
    return (
      <div
        key={a.name}
        className="pulse-card"
        style={{ border: '1px solid #eef0f3', borderRadius: 12, padding: '14px 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              position: 'relative', width: 72, height: 72, flexShrink: 0, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: `conic-gradient(${a.color} ${a.share * 360}deg, #e7ebf2 0deg)`,
              WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 7px))',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 7px))',
            }} />
            {a.photo ? (
              <img
                src={a.photo}
                alt={a.name}
                style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 0 0 3px #fff' }}
              />
            ) : (
              <div style={{
                width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '0.02em',
                background: `linear-gradient(155deg, ${a.color}, ${a.color}cc)`,
                boxShadow: '0 0 0 3px #fff',
              }}>{a.initials}</div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, paddingTop: 6, flex: 1 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
            <span style={{ fontSize: 10.5, color: '#6b7280' }}>{Math.round(a.share * 100)}% of this month's audits</span>
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0,
            fontSize: 11, fontWeight: 700, padding: '3px 6px', borderRadius: 999,
            color: up ? '#0ca30c' : '#d03b3b',
            background: up ? '#0ca30c1f' : '#d03b3b1f',
          }}>
            {up ? '▲' : '▼'}{Math.abs(a.pct).toFixed(0)}%
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 28 }}>
            <svg viewBox={`0 0 ${sw} ${sh}`} width="100%" height="100%" preserveAspectRatio="none">
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={a.color} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={a.color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={areaPts} fill={`url(#${gradId})`} />
              <polyline points={linePts} fill="none" stroke={a.color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={endX} cy={endY} r="2.6" fill={a.color} stroke="#fff" strokeWidth="1.2" />
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{a.current}</span>
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9ca3af', marginTop: 1 }}>this month</span>
          </div>
        </div>
      </div>
    );
  };

  const auditProjects = data.audit_projects || [];
  const projectColor = (name) => PROJECT_PALETTE[auditProjects.indexOf(name) % PROJECT_PALETTE.length];
  // Ascending by total so the highest bar ends up at the bottom of the chart.
  const auditsByAuditorProject = [...(data.audits_by_auditor_project || [])].sort((a, b) => {
    const totalOf = row => Object.keys(row).filter(k => k !== 'auditor').reduce((sum, k) => sum + (row[k] || 0), 0);
    return totalOf(a) - totalOf(b);
  });
  // Fit the Y-axis label column to the longest auditor name instead of a
  // fixed width -- a fixed width left a lot of unused blank gutter in front
  // of shorter names, space that should go to the bars instead.
  const auditorAxisWidth = Math.min(100, Math.max(50, Math.max(0, ...auditsByAuditorProject.map(r => (r.auditor || '').length)) * 5.5));
  // Recharts right-anchors category tick text toward the axis line by default,
  // which leaves a blank gap in front of any name shorter than the longest one.
  // Left-anchor it instead so every label starts flush at the left edge.
  const renderAuditorTick = ({ y, payload }) => (
    <Text x={14} y={y} width={auditorAxisWidth - 14} textAnchor="start" verticalAnchor="middle" fontSize={11} fill="#374151">
      {payload.value}
    </Text>
  );

  const AuditorTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const monthData = payload[0]?.payload || {};
    const rows = auditors
      .map(name => ({ name, value: monthData[name] }))
      .filter(({ value }) => value !== null && value !== undefined)
      .sort((a, b) => b.value - a.value);
    return (
      <div style={{ background: '#fff', border: '1px solid #dbe2ea', borderRadius: 10, padding: '12px 14px', boxShadow: '0 8px 24px rgba(15,42,74,0.12)', minWidth: 220 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 8 }}>{label}</div>
        {rows.map(({ name, value }) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginTop: 6, fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#4b5563' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: auditorColor(name) }} />
              {name}
            </span>
            <span style={{ color: '#111827', fontWeight: 600 }}>{value}</span>
          </div>
        ))}
      </div>
    );
  };

  const ShareTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    if (!row) return null;
    const pct = Math.round(row.value / auditorGrandTotal * 100);
    return (
      <div style={{ background: '#fff', border: '1px solid #dbe2ea', borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 24px rgba(15,42,74,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#111827' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: auditorColor(row.name), flexShrink: 0 }} />
          {row.name}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
          <span style={{ color: '#111827', fontWeight: 600 }}>{row.value}</span> audits · {pct}%
        </div>
      </div>
    );
  };

  const ProjectTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const rowData = payload[0]?.payload || {};
    const rows = auditProjects
      .map(project => ({ project, value: rowData[project] }))
      .filter(({ value }) => value !== null && value !== undefined)
      .sort((a, b) => b.value - a.value);
    return (
      <div style={{ background: '#fff', border: '1px solid #dbe2ea', borderRadius: 10, padding: '12px 14px', boxShadow: '0 8px 24px rgba(15,42,74,0.12)', minWidth: 220 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 8 }}>{label}</div>
        {rows.map(({ project, value }) => (
          <div key={project} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginTop: 6, fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#4b5563' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: projectColor(project) }} />
              {project}
            </span>
            <span style={{ color: '#111827', fontWeight: 600 }}>{value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Auditor Leaderboard</span>
        </div>
        <div className="topbar-right">
          {(filters.projects.length > 0 || filters.clients.length > 0) && (
            <button className="btn btn-sm" onClick={() => setFilters({ projects: [], clients: [] })} disabled={loading}>Clear filters</button>
          )}
        </div>
      </div>
      <div className="content graphs-content" style={{ display: 'flex', flexDirection: 'column' }}>
        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}
        <div className="card" style={{ marginBottom: 24, position: 'sticky', top: 'var(--header-h)', zIndex: 40, flexShrink: 0 }}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', flexShrink: 0, paddingTop: 6 }}>Client</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <FilterChip label="All clients" active={filters.clients.length === 0} disabled={loading} onClick={() => setFilters(current => ({ ...current, clients: [] }))} />
                {(data.filter_options?.clients || []).map(client => {
                  const isActive = filters.clients.includes(client);
                  return <FilterChip key={client} label={client} active={isActive} disabled={loading} onClick={() => toggleFilter('clients', client)} />;
                })}
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
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 24, marginBottom: 24, flex: 1, minHeight: 420 }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="card-header" style={{ alignItems: 'flex-start', gap: 16 }}>
              <div>
                <div className="card-title" style={{ fontSize: 15, marginBottom: 4 }}>Audits per Month by Auditor</div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>Completed audits only (excludes Not Present requests)</div>
              </div>
              <span className="tag tag-navy" style={{ whiteSpace: 'nowrap' }}>Last 12 months</span>
            </div>
            <div className="card-body" style={{ paddingTop: 20, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {auditors.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: 13, padding: '56px 0', textAlign: 'center' }}>No completed audits in this period</div>
              ) : (
                <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', marginBottom: 12, flexShrink: 0 }}>
                  {auditors.map(name => {
                    const color = auditorColor(name);
                    const isActive = activeAuditors.includes(name);
                    const dimmed = activeAuditors.length > 0 && !isActive;
                    return (
                      <button
                        key={name}
                        onClick={() => setActiveAuditors(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap',
                          border: '1.2px solid ' + (dimmed ? '#e5e7eb' : color),
                          background: isActive ? color + '18' : '#fff',
                          color: dimmed ? '#9ca3af' : color,
                          fontSize: 10, fontWeight: isActive ? 600 : 500,
                          cursor: 'pointer', transition: 'all 0.15s ease',
                        }}
                      >
                        {isActive
                          ? <span style={{ fontSize: 9 }}>✓</span>
                          : <span style={{ width: 8, height: 8, borderRadius: '50%', background: dimmed ? '#d1d5db' : color }} />}
                        {name}
                      </button>
                    );
                  })}
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.audits_by_auditor_month} margin={{ top: 8, right: 22, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf3" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#dbe2ea' }} />
                    <YAxis width={40} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<AuditorTooltip />} />
                    {auditors.filter(name => activeAuditors.length === 0 || activeAuditors.includes(name)).map(name => {
                      const color = auditorColor(name);
                      return (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          name={name}
                          stroke={color}
                          strokeWidth={2.5}
                          connectNulls={true}
                          dot={renderStageDot(color)}
                          activeDot={{ r: 5, strokeWidth: 2, fill: '#fff' }}
                          isAnimationActive={false}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
                </div>
                </>
              )}
            </div>
          </div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="card-header" style={{ alignItems: 'flex-start', gap: 16 }}>
              <div>
                <div className="card-title" style={{ fontSize: 15, marginBottom: 4 }}>Auditor Pulse</div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>Share of audits, trend, and change per auditor</div>
              </div>
              <span className="tag tag-navy" style={{ whiteSpace: 'nowrap' }}>This month vs. last</span>
            </div>
            <div className="card-body" style={{ paddingTop: 20, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {auditorPulse.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: 13, padding: '56px 0', textAlign: 'center' }}>No completed audits in this period</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {auditorPulse.map(renderPulseCard)}
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 7fr', gap: 24, flex: 1, minHeight: 320 }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="card-header">
              <span className="card-title">Auditor Share of Total Audits</span>
              <span className="tag tag-navy">Last 12 months</span>
            </div>
            <div className="card-body" style={{ paddingTop: 20, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
              {auditorTotals.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: 13, padding: '56px 0', textAlign: 'center' }}>No completed audits in this period</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ position: 'relative', width: 240, height: 240, flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <defs>
                          <filter id="donutSliceShadow" x="-50%" y="-50%" width="200%" height="200%">
                            <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#1f2937" floodOpacity="0.18" />
                          </filter>
                        </defs>
                        <Pie
                          data={auditorTotals}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={68}
                          outerRadius={110}
                          paddingAngle={3}
                          cornerRadius={8}
                          stroke="none"
                          isAnimationActive={false}
                        >
                          {auditorTotals.map(row => <Cell key={row.name} fill={auditorColor(row.name)} style={{ filter: 'url(#donutSliceShadow)' }} />)}
                        </Pie>
                        <Tooltip content={<ShareTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{
                      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
                    }}>
                      <span style={{ fontSize: 12.5, color: '#9ca3af', fontWeight: 500 }}>Total</span>
                      <span style={{ fontSize: 26, fontWeight: 700, color: '#111827', marginTop: 2 }}>{auditorGrandTotal}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>audits</span>
                    </div>
                  </div>
                  <div style={{ minWidth: 160, display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {auditorTotals.map(row => {
                      const pulse = auditorPulseByName[row.name];
                      const up = pulse && pulse.pct >= 0;
                      return (
                        <div key={row.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
                          <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, minWidth: 0 }}>
                            <span style={{ display: 'block', width: 3, borderRadius: 999, background: auditorColor(row.name), flexShrink: 0 }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                              <span style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                              <span style={{ fontSize: 19, fontWeight: 700, color: '#111827' }}>
                                {Math.round(row.value / auditorGrandTotal * 100)}%
                                <span style={{ fontSize: 12, fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>({row.value})</span>
                              </span>
                            </div>
                          </div>
                          {pulse && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0,
                              fontSize: 11, fontWeight: 700, padding: '3px 6px', borderRadius: 999,
                              color: up ? '#0ca30c' : '#d03b3b',
                              background: up ? '#0ca30c1f' : '#d03b3b1f',
                            }}>
                              {up ? '▲' : '▼'}{Math.abs(pulse.pct).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="card-header">
              <span className="card-title">Audits per Auditor by Project</span>
              <span className="tag tag-navy">Last 12 months</span>
            </div>
            <div className="card-body" style={{ paddingTop: 20, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
              {auditsByAuditorProject.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: 13, padding: '56px 0', textAlign: 'center' }}>No completed audits in this period</div>
              ) : (
                <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16, justifyContent: 'flex-end', flexShrink: 0 }}>
                  {auditProjects.map(project => (
                    <span
                      key={project}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap',
                        border: '1.2px solid ' + projectColor(project),
                        color: '#374151',
                        fontSize: 10, fontWeight: 500,
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: projectColor(project) }} />
                      {project}
                    </span>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={Math.max(220, auditsByAuditorProject.length * 60)}>
                  <BarChart data={auditsByAuditorProject} layout="vertical" margin={{ top: 8, right: 20, left: 10, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e8edf3" />
                    <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="auditor" tick={renderAuditorTick} width={auditorAxisWidth} />
                    <Tooltip content={<ProjectTooltip />} />
                    {auditProjects.map((project, i) => (
                      <Bar
                        key={project}
                        dataKey={project}
                        name={project}
                        stackId="a"
                        fill={projectColor(project)}
                        radius={i === auditProjects.length - 1 ? [0, 3, 3, 0] : [0, 0, 0, 0]}
                        isAnimationActive={false}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
