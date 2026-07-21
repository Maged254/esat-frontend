import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, LineChart, Line, Legend, PieChart, Pie, Cell } from 'recharts';
import api, { logError } from '../utils/api';

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

// Cycled by index for a dynamic (unknown-length) list of auditors.
const AUDITOR_PALETTE = ['#2a78d6', '#008300', '#e87ba4', '#eda100', '#1baf7a', '#eb6834', '#4a3aa7', '#e34948'];

// Cycled by index for a dynamic (unknown-length) list of projects.
const PROJECT_PALETTE = ['#1B3A6B', '#1D9E75', '#BE185D', '#eda100', '#7c3aed', '#0891b2', '#dc2626', '#65a30d', '#0f766e', '#c2410c', '#4338ca', '#a16207'];

const FilterChip = ({ label, active, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap',
      border: '1.2px solid ' + (active ? '#2563EB' : 'transparent'),
      background: active ? '#E6F1FB' : '#F1F2F4',
      color: active ? '#2563EB' : '#374151',
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
  const [activeAuditor, setActiveAuditor] = useState(null); // isolates one auditor's line; click again to clear

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

  const CustomTooltipPPE = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
          <div style={{ color: '#1D9E75' }}>Flagged PPE Requests: <strong>{payload[0].value}</strong></div>
          <div style={{ color: '#94a3b8' }}>Average: <strong>{data.ppe_average}</strong></div>
        </div>
      );
    }
    return null;
  };

  const StageDelayTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const monthData = payload[0]?.payload || {};
    return (
      <div style={{ background: '#fff', border: '1px solid #dbe2ea', borderRadius: 10, padding: '12px 14px', boxShadow: '0 8px 24px rgba(15,42,74,0.12)', minWidth: 310 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 8 }}>{label}</div>
        {DELAY_SERIES.map(series => monthData[series.key] !== null && monthData[series.key] !== undefined ? (
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
        ) : null)}
      </div>
    );
  };

  const auditors = data.auditors || [];
  const auditorColor = (name) => AUDITOR_PALETTE[auditors.indexOf(name) % AUDITOR_PALETTE.length];
  const auditorTotals = auditors
    .map(name => ({ name, value: (data.audits_by_auditor_month || []).reduce((sum, row) => sum + (row[name] || 0), 0) }))
    .filter(row => row.value > 0)
    .sort((a, b) => b.value - a.value);
  const auditorGrandTotal = auditorTotals.reduce((sum, row) => sum + row.value, 0);

  const auditProjects = data.audit_projects || [];
  const projectColor = (name) => PROJECT_PALETTE[auditProjects.indexOf(name) % PROJECT_PALETTE.length];
  const auditsByAuditorProject = data.audits_by_auditor_project || [];

  const AuditorTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const monthData = payload[0]?.payload || {};
    return (
      <div style={{ background: '#fff', border: '1px solid #dbe2ea', borderRadius: 10, padding: '12px 14px', boxShadow: '0 8px 24px rgba(15,42,74,0.12)', minWidth: 220 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 8 }}>{label}</div>
        {auditors.map(name => monthData[name] !== null && monthData[name] !== undefined ? (
          <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginTop: 6, fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#4b5563' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: auditorColor(name) }} />
              {name}
            </span>
            <span style={{ color: '#111827', fontWeight: 600 }}>{monthData[name]}</span>
          </div>
        ) : null)}
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
        <div className="card" style={{ marginBottom: 24 }}>
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
                {(data.filter_options?.projects || []).map(project => (
                  <FilterChip key={project} label={project} active={filters.projects.includes(project)} disabled={loading} onClick={() => toggleFilter('projects', project)} />
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
        <div className="card">
          <div className="card-header">
            <span className="card-title">Audits / Requests per Month</span>
            <span className="tag tag-navy">Last 6 months</span>
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 0', justifyContent: 'flex-end' }}>
            {[{ key: 'audits', label: 'Audits', color: '#1B3A6B' }, { key: 'requests', label: 'Requests', color: '#1D9E75' }].map(opt => {
              const isActive = auditsView === opt.key;
              const dimmed = auditsView && !isActive;
              return (
                <button
                  key={opt.key}
                  onClick={() => setAuditsView(prev => prev === opt.key ? null : opt.key)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 999,
                    border: '1.5px solid ' + (dimmed ? '#e5e7eb' : opt.color),
                    background: isActive ? opt.color + '18' : '#fff',
                    color: dimmed ? '#9ca3af' : opt.color,
                    fontSize: 12, fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: dimmed ? '#d1d5db' : opt.color }} />
                  {opt.label}
                </button>
              );
            })}
          </div>
          {data.audits_by_month.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: 13, padding: '16px 0' }}>No audit data</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={auditsChartData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar
                  dataKey="requests_count_display"
                  name="Requests"
                  stackId="a"
                  fill="#1D9E75"
                  radius={auditsView === 'requests' ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  label={auditsView === 'requests' ? { position: 'top', fontSize: 11, fill: '#374151' } : undefined}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="audits_count_display"
                  name="Audits"
                  stackId="a"
                  fill="#1B3A6B"
                  radius={[4, 4, 0, 0]}
                  label={auditsView !== 'requests' ? { position: 'top', fontSize: 11, fill: '#374151' } : undefined}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div className="card-title" style={{ fontSize: 15, marginBottom: 4 }}>Audits per Month by Auditor</div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>Completed audits only (excludes Not Present requests)</div>
            </div>
            <span className="tag tag-navy" style={{ whiteSpace: 'nowrap' }}>Last 12 months</span>
          </div>
          <div className="card-body" style={{ paddingTop: 20 }}>
            {auditors.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: 13, padding: '56px 0', textAlign: 'center' }}>No completed audits in this period</div>
            ) : (
              <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', marginBottom: 12 }}>
                {auditors.map(name => {
                  const color = auditorColor(name);
                  const isActive = activeAuditor === name;
                  const dimmed = activeAuditor && !isActive;
                  return (
                    <button
                      key={name}
                      onClick={() => setActiveAuditor(prev => prev === name ? null : name)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 14px', borderRadius: 999,
                        border: '1.5px solid ' + (dimmed ? '#e5e7eb' : color),
                        background: isActive ? color + '18' : '#fff',
                        color: dimmed ? '#9ca3af' : color,
                        fontSize: 12, fontWeight: isActive ? 700 : 500,
                        cursor: 'pointer', transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dimmed ? '#d1d5db' : color }} />
                      {name}
                    </button>
                  );
                })}
              </div>
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={data.audits_by_auditor_month} margin={{ top: 8, right: 22, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#dbe2ea' }} />
                  <YAxis width={40} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<AuditorTooltip />} />
                  {auditors.filter(name => !activeAuditor || activeAuditor === name).map(name => {
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
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Auditor Share of Total Audits</span>
              <span className="tag tag-navy">{auditorGrandTotal} audits · Last 12 months</span>
            </div>
            <div className="card-body" style={{ paddingTop: 20 }}>
              {auditorTotals.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: 13, padding: '56px 0', textAlign: 'center' }}>No completed audits in this period</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
                  <div style={{ width: 220, height: 220, flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={auditorTotals}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={55}
                          outerRadius={95}
                          paddingAngle={1.5}
                          isAnimationActive={false}
                        >
                          {auditorTotals.map(row => <Cell key={row.name} fill={auditorColor(row.name)} stroke="#fff" strokeWidth={2} />)}
                        </Pie>
                        <Tooltip formatter={(value, name) => [value + ' audits (' + Math.round(value / auditorGrandTotal * 100) + '%)', name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {auditorTotals.map(row => (
                      <div key={row.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151' }}>
                          <span style={{ width: 9, height: 9, borderRadius: '50%', background: auditorColor(row.name), flexShrink: 0 }} />
                          {row.name}
                        </span>
                        <span style={{ color: '#111827', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {row.value} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({Math.round(row.value / auditorGrandTotal * 100)}%)</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Audits per Auditor by Project</span>
              <span className="tag tag-navy">Last 12 months</span>
            </div>
            <div className="card-body" style={{ paddingTop: 20 }}>
              {auditsByAuditorProject.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: 13, padding: '56px 0', textAlign: 'center' }}>No completed audits in this period</div>
              ) : (
                <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {auditProjects.map(project => (
                    <span
                      key={project}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', borderRadius: 999,
                        border: '1.5px solid ' + projectColor(project),
                        color: projectColor(project),
                        fontSize: 11, fontWeight: 500,
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: projectColor(project) }} />
                      {project}
                    </span>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={auditsByAuditorProject} margin={{ top: 8, right: 10, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf3" />
                    <XAxis dataKey="auditor" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} interval={0} height={60} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    {auditProjects.map((project, i) => (
                      <Bar
                        key={project}
                        dataKey={project}
                        name={project}
                        stackId="a"
                        fill={projectColor(project)}
                        radius={i === auditProjects.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
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
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">Flagged PPE Requests by Employee</span>
            <span className="tag tag-amber">Avg: {data.ppe_average} items</span>
          </div>
          {data.ppe_by_employee.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: 13, padding: '16px 0' }}>No flagged PPE requests</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data.ppe_by_employee} margin={{ top: 26, right: 20, left: 0, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} interval={0} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltipPPE />} />
                <ReferenceLine y={data.ppe_average} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: 'Avg ' + data.ppe_average, position: 'insideTopRight', fontSize: 11, fill: '#f59e0b' }} />
                <Bar dataKey="count" name="Flagged PPE Requests" radius={[4, 4, 0, 0]} fill="#1D9E75" label={{ position: 'top', fontSize: 11, fill: '#374151' }} />
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
