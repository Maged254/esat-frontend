import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import api, { logError } from '../utils/api';

const VALID = '#1D9E75';   // green
const EXPIRING = '#F59E0B'; // amber
const EXPIRED = '#E24B4A';  // red

const KPI = ({ label, value, color }) => (
  <div className="card" style={{ padding: '18px 20px', textAlign: 'center' }}>
    <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, lineHeight: 1.3, minHeight: 34 }}>{label}</div>
    <div style={{ fontSize: 40, fontWeight: 800, color, marginTop: 6 }}>{value ?? 0}</div>
  </div>
);

// Horizontal stacked validity bar chart (per course / per project).
function ValidityBars({ data, nameKey }) {
  if (!data.length) return <div style={{ color: '#9ca3af', fontSize: 13, padding: 24, textAlign: 'center' }}>No certificate data.</div>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(data.length * 34 + 24, 120)}>
      <BarChart layout="vertical" data={data} margin={{ top: 4, right: 46, left: 8, bottom: 4 }} barCategoryGap={6}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey={nameKey} width={150} tick={{ fontSize: 11, fill: '#374151' }} interval={0} />
        <Tooltip cursor={{ fill: '#f8fafc' }} />
        <Bar dataKey="valid" stackId="a" fill={VALID} isAnimationActive={false}>
          <LabelList dataKey="valid" position="center" fill="#fff" fontSize={11} formatter={v => v > 0 ? v : ''} />
        </Bar>
        <Bar dataKey="expiring" stackId="a" fill={EXPIRING} isAnimationActive={false}>
          <LabelList dataKey="expiring" position="center" fill="#fff" fontSize={11} formatter={v => v > 0 ? v : ''} />
        </Bar>
        <Bar dataKey="expired" stackId="a" fill={EXPIRED} isAnimationActive={false}>
          <LabelList dataKey="expired" position="center" fill="#fff" fontSize={11} formatter={v => v > 0 ? v : ''} />
          <LabelList dataKey="total" position="right" fontSize={12} fontWeight={700} fill="#374151" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function TrainingDashboardPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ client: '', project: '', course_id: '', resource_type: 'inhouse', employment_status: 'active' });
  const [data, setData] = useState({ kpis: {}, pending_reasons: [], by_course: [], by_project: [] });
  const [courses, setCourses] = useState([]);
  const [opts, setOpts] = useState({ projects: [], clients: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/training-courses').then(r => setCourses(r.data)).catch(logError);
    api.get('/employees/filter-options').then(r => setOpts(r.data)).catch(logError);
  }, []);

  useEffect(() => {
    const p = new URLSearchParams();
    if (filters.client) p.append('clients', filters.client);
    if (filters.project) p.append('projects', filters.project);
    if (filters.course_id) p.append('course_id', filters.course_id);
    if (filters.resource_type) p.append('resource_type', filters.resource_type);
    if (filters.employment_status) p.append('employment_status', filters.employment_status);
    setLoading(true);
    api.get(`/training-records/dashboard?${p}`).then(r => setData(r.data)).catch(logError).finally(() => setLoading(false));
  }, [filters]);

  const k = data.kpis || {};
  const pieData = [
    { name: 'Valid', value: k.valid || 0, color: VALID },
    { name: 'About to Expire', value: k.expiring || 0, color: EXPIRING },
    { name: 'Expired', value: k.expired || 0, color: EXPIRED },
  ];
  const pendingTotal = (data.pending_reasons || []).reduce((s, r) => s + r.count, 0);
  const sel = { height: 30, padding: '4px 8px', fontSize: 12 };

  return (
    <div className="content graphs-content">
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span><span className="topbar-sep">›</span>
          <span className="topbar-title">Training Dashboard</span>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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
            <option value="inhouse">Inhouse</option>
            <option value="outsource">Outsource</option>
            <option value="intern">Intern</option>
          </select>
          <select className="form-select" style={sel} value={filters.employment_status} onChange={e => setFilters(f => ({ ...f, employment_status: e.target.value }))}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="exit">Exit</option>
          </select>
          <button className="btn" style={{ height: 30, padding: '4px 12px', fontSize: 12 }}
            onClick={() => setFilters({ client: '', project: '', course_id: '', resource_type: 'inhouse', employment_status: 'active' })}>✕ Clear</button>
          {loading && <span style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</span>}
        </div>
      </div>

      {/* KPI row + pending reasons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) 1.4fr', gap: 14, marginBottom: 16 }}>
        <KPI label="Current Requested Trainings" value={k.total} color="#042C53" />
        <KPI label="Valid Certificates" value={k.valid} color={VALID} />
        <KPI label="About to Expire Certificates" value={k.expiring} color={EXPIRING} />
        <KPI label="Expired Certificates" value={k.expired} color={EXPIRED} />
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 10, fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: .3, borderBottom: '1px solid #e5e7eb', paddingBottom: 6, marginBottom: 4 }}>
            <span style={{ width: 40, textAlign: 'right' }}>Count</span><span>Pending Reason</span>
          </div>
          <div style={{ maxHeight: 130, overflowY: 'auto' }}>
            {(data.pending_reasons || []).map(r => (
              <div key={r.reason} style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '2px 0', color: '#374151' }}>
                <span style={{ width: 40, textAlign: 'right', fontWeight: 600, color: '#042C53' }}>{r.count}</span><span>{r.reason}</span>
              </div>
            ))}
            {!data.pending_reasons?.length && <div style={{ fontSize: 12, color: '#9ca3af', padding: '6px 0' }}>No pending trainings.</div>}
          </div>
          {pendingTotal > 0 && <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 4, paddingTop: 4, fontSize: 12.5, fontWeight: 700, color: '#042C53' }}>{pendingTotal}</div>}
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1.3fr', gap: 14 }}>
        <div className="card">
          <div className="card-title" style={{ fontSize: 14, textAlign: 'center', marginBottom: 6 }}>Total Validity</div>
          {(k.total || 0) === 0
            ? <div style={{ color: '#9ca3af', fontSize: 13, padding: 40, textAlign: 'center' }}>No certificate data.</div>
            : <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                    label={({ percent }) => `${(percent * 100).toFixed(1)}%`} isAnimationActive={false}>
                    {pieData.map(d => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>}
        </div>
        <div className="card">
          <div className="card-title" style={{ fontSize: 14, textAlign: 'center', marginBottom: 6 }}>Validity per Training Type</div>
          <ValidityBars data={data.by_course || []} nameKey="course" />
        </div>
        <div className="card">
          <div className="card-title" style={{ fontSize: 14, textAlign: 'center', marginBottom: 6 }}>Validity per Project</div>
          <ValidityBars data={data.by_project || []} nameKey="project" />
        </div>
      </div>
    </div>
  );
}
