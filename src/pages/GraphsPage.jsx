import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, LineChart, Line, Legend } from 'recharts';
import api from '../utils/api';

export default function GraphsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/graphs').then(r => { setData(r.data); setLoading(false); }).catch(console.error);
  }, []);

  if (loading) return <div className="content"><div style={{color:'#6b7280',padding:40,textAlign:'center'}}>Loading charts...</div></div>;

  const CustomTooltipPPE = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
          <div style={{ color: '#1D9E75' }}>Open PPE Requests: <strong>{payload[0].value}</strong></div>
          <div style={{ color: '#94a3b8' }}>Average: <strong>{data.ppe_average}</strong></div>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Graphs</span>
        </div>
      </div>
      <div className="content">
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">Open PPE Requests by Employee</span>
            <span className="tag tag-amber">Avg: {data.ppe_average} items</span>
          </div>
          {data.ppe_by_employee.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: 13, padding: '16px 0' }}>No open PPE requests</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data.ppe_by_employee} margin={{ top: 10, right: 20, left: 0, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} interval={0} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltipPPE />} />
                <ReferenceLine y={data.ppe_average} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: 'Avg ' + data.ppe_average, position: 'insideTopRight', fontSize: 11, fill: '#f59e0b' }} />
                <Bar dataKey="count" name="Open PPE Requests" radius={[4, 4, 0, 0]} fill="#1D9E75" label={{ position: 'top', fontSize: 11, fill: '#374151' }} />
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
            {data.audits_by_month.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: 13, padding: '16px 0' }}>No audit data</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.audits_by_month} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Audits" fill="#1B3A6B" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 11, fill: '#374151' }} />
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
