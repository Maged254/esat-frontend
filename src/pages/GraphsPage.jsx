import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, LineChart, Line, Legend } from 'recharts';
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

export default function GraphsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ project: '', client: '' });
  const [activeStage, setActiveStage] = useState(null); // clicking a legend pill isolates that series; click again to clear
  const [auditsView, setAuditsView] = useState(null); // null (all) | 'audits' (present, has a result) | 'requests' (not present)

  useEffect(() => {
    setLoading(true);
    setError('');
    api.get('/graphs', { params: filters })
      .then(r => setData(r.data))
      .catch(e => { logError(e); setError(e.response?.data?.error || 'Unable to load graph data'); })
      .finally(() => setLoading(false));
  }, [filters]);

  if (loading && !data) return <div className="content"><div style={{color:'#6b7280',padding:40,textAlign:'center'}}>Loading charts...</div></div>;
  if (error && !data) return <div className="content"><div style={{color:'#A32D2D',padding:40,textAlign:'center'}}>{error}</div></div>;

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

  const stageDelayData = data.ppe_stage_delays_by_month || [];
  const hasStageDelayData = stageDelayData.some(row => DELAY_SERIES.some(series => row[series.key] !== null));

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Graphs</span>
        </div>
        <div className="topbar-right" style={{ flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Project</span>
            <select
              className="form-select"
              style={{ height: 32, minWidth: 170, padding: '4px 28px 4px 9px', fontSize: 12 }}
              value={filters.project}
              disabled={loading}
              onChange={e => setFilters(current => ({ ...current, project: e.target.value }))}
            >
              <option value="">All permitted projects</option>
              {(data.filter_options?.projects || []).map(project => <option key={project} value={project}>{project}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Client</span>
            <select
              className="form-select"
              style={{ height: 32, minWidth: 160, padding: '4px 28px 4px 9px', fontSize: 12 }}
              value={filters.client}
              disabled={loading}
              onChange={e => setFilters(current => ({ ...current, client: e.target.value }))}
            >
              <option value="">All permitted clients</option>
              {(data.filter_options?.clients || []).map(client => <option key={client} value={client}>{client}</option>)}
            </select>
          </label>
          {(filters.project || filters.client) && (
            <button className="btn btn-sm" onClick={() => setFilters({ project: '', client: '' })}>Clear filters</button>
          )}
        </div>
      </div>
      <div className="content">
        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}
        <div className="card" style={{ marginBottom: 24 }}>
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', marginBottom: 12 }}>
                {DELAY_SERIES.map(series => {
                  const isActive = activeStage === series.key;
                  const dimmed = activeStage && !isActive;
                  return (
                    <button
                      key={series.key}
                      onClick={() => setActiveStage(prev => prev === series.key ? null : series.key)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 14px', borderRadius: 999,
                        border: '1.5px solid ' + (dimmed ? '#e5e7eb' : series.color),
                        background: isActive ? series.color + '18' : '#fff',
                        color: dimmed ? '#9ca3af' : series.color,
                        fontSize: 12, fontWeight: isActive ? 700 : 500,
                        cursor: 'pointer', transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dimmed ? '#d1d5db' : series.color }} />
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
                  {DELAY_SERIES.filter(series => !activeStage || activeStage === series.key).map(series => (
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Audits per Month</span>
              <span className="tag tag-navy">Last 6 months</span>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '12px 16px 0', justifyContent: 'flex-end' }}>
              {[{ key: 'audits', label: 'Audits', color: '#1B3A6B' }, { key: 'requests', label: 'Requests', color: '#94A3B8' }].map(opt => {
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
                <BarChart data={data.audits_by_month} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  {auditsView !== 'audits' && (
                    <Bar
                      dataKey="requests_count"
                      name="Requests"
                      stackId="a"
                      fill="#94A3B8"
                      radius={auditsView === 'requests' ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      label={auditsView === 'requests' ? { position: 'top', fontSize: 11, fill: '#374151' } : undefined}
                    />
                  )}
                  {auditsView !== 'requests' && (
                    <Bar
                      dataKey="audits_count"
                      name="Audits"
                      stackId="a"
                      fill="#1B3A6B"
                      radius={[4, 4, 0, 0]}
                      label={{ position: 'top', fontSize: 11, fill: '#374151' }}
                    />
                  )}
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
      </div>
    </>
  );
}
