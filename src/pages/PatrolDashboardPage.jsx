import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import ExcelJS from 'exceljs';
import api, { logError } from '../utils/api';
import DateInput from '../components/DateInput';

// Route Patrol dashboard: the chosen period at a glance (patrols, pins,
// tickets), pins per day, each officer, and which links were reported on.
// Coverage is by pins for now; live tracking will add the path driven.
const COLOUR = { critical: '#E24B4A', medium: '#EF9F27', normal: '#1D9E75' };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
const dayLabel = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const hoursText = (h) => h == null ? '—' : h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h * 10) / 10} h`;
const daysSince = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null;

// Every day of the range, so quiet days show as gaps rather than vanishing.
const fillDays = (from, to, rows) => {
  const byDay = Object.fromEntries(rows.map(r => [r.day, r]));
  const out = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push({ day, label: dayLabel(day), critical: 0, medium: 0, normal: 0, ...byDay[day] });
  }
  return out;
};

function Tile({ label, value, sub, tone, to }) {
  const body = (
    <>
      <div className="stat-label">{label}</div>
      <div className="dash-value" style={tone ? { color: tone } : undefined}>{value}</div>
      {sub && <div className="dash-sub">{sub}</div>}
    </>
  );
  return to ? <Link to={to} className="card dash-tile dash-link">{body}</Link> : <div className="card dash-tile">{body}</div>;
}

export default function PatrolDashboardPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [area, setArea] = useState('');
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (area) p.set('area', area);
    api.get(`/patrol/dashboard?${p}`).then(r => { setD(r.data); setError(''); })
      .catch(e => setError(e.response?.data?.error || 'Could not load the dashboard.'));
  }, [from, to, area]);
  useEffect(() => { load(); }, [load]);

  const days = d ? fillDays(d.from, d.to, d.per_day) : [];
  const t = d?.totals || {};
  const unvisited = (d?.links || []).filter(l => !l.pins);
  const oldestDays = daysSince(d?.now?.oldest_open);

  const exportXlsx = async () => {
    if (!d) return;
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      const style = (ws) => {
        const h = ws.getRow(1);
        h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A4A' } };
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        ws.autoFilter = { from: 'A1', to: { row: 1, column: ws.columns.length } };
      };
      const sum = wb.addWorksheet('Summary');
      sum.columns = [{ header: 'Measure', key: 'k', width: 34 }, { header: 'Value', key: 'v', width: 18 }];
      [
        ['Period', `${fmtDate(d.from)} – ${fmtDate(d.to)}`], ['Area', d.area || 'All'],
        ['Patrols', t.patrols], ['Officers on patrol', t.officers], ['Patrol hours', t.hours],
        ['Pins', t.pins], ['Critical', t.critical], ['Medium', t.medium], ['Normal', t.normal], ['Off route', t.off_route],
        ['Tickets opened', t.opened], ['Tickets closed', t.closed], ['Average hours to close', t.avg_hours_to_close ?? ''],
        ['Awaiting review (now)', d.now.awaiting], ['Open tickets (now)', d.now.open_tickets], ['Links with no pin in the period', unvisited.length],
      ].forEach(([k, v]) => sum.addRow({ k, v }));
      style(sum);
      const day = wb.addWorksheet('Pins per day');
      day.columns = [{ header: 'Date', key: 'date', width: 12 }, { header: 'Critical', key: 'critical', width: 10 }, { header: 'Medium', key: 'medium', width: 10 }, { header: 'Normal', key: 'normal', width: 10 }];
      days.forEach(r => day.addRow({ date: fmtDate(`${r.day}T12:00:00Z`), critical: r.critical, medium: r.medium, normal: r.normal }));
      style(day);
      const off = wb.addWorksheet('Officers');
      off.columns = [
        { header: 'Officer', key: 'n', width: 26 }, { header: 'Patrols', key: 'patrols', width: 9 }, { header: 'Hours', key: 'hours', width: 9 },
        { header: 'Pins', key: 'pins', width: 8 }, { header: 'Critical', key: 'critical', width: 9 }, { header: 'Medium', key: 'medium', width: 9 },
        { header: 'Normal', key: 'normal', width: 9 }, { header: 'Off route', key: 'off_route', width: 10 }, { header: 'Last patrol', key: 'last', width: 18 },
      ];
      d.per_officer.forEach(o => off.addRow({ ...o, n: o.full_name, last: fmtDateTime(o.last_patrol_at) }));
      style(off);
      const lk = wb.addWorksheet('Links');
      lk.columns = [
        { header: 'Link', key: 'name', width: 40 }, { header: 'Area', key: 'area', width: 16 }, { header: 'Length (km)', key: 'length_km', width: 12 },
        { header: 'Pins in period', key: 'pins', width: 14 }, { header: 'Open tickets', key: 'open_tickets', width: 13 }, { header: 'Last pin', key: 'last', width: 18 },
      ];
      d.links.forEach(l => lk.addRow({ ...l, last: fmtDateTime(l.last_pin_at) }));
      style(lk);
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `OneHub_Route_Patrol_${d.from}_to_${d.to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { logError(e); alert('Export failed'); }
    setExporting(false);
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub Operations</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Dashboard</span>
        </div>
      </div>
      <div className="content">
        {error && <div className="login-error" role="alert">{error}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>From</span>
          <DateInput value={from} onChange={setFrom} style={{ width: 140 }} placeholder={d ? fmtDate(`${d.from}T12:00:00Z`) : ''} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>to</span>
          <DateInput value={to} onChange={setTo} style={{ width: 140 }} placeholder={d ? fmtDate(`${d.to}T12:00:00Z`) : ''} />
          {d?.areas?.length > 1 && (
            <select className="form-select" style={{ width: 'auto' }} value={area} onChange={e => setArea(e.target.value)} aria-label="Area">
              <option value="">All areas</option>
              {d.areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          {(from || to || area) && <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => { setFrom(''); setTo(''); setArea(''); }}>Last 30 days</button>}
          <button className="btn btn-secondary" style={{ marginLeft: 'auto' }} disabled={!d || exporting} onClick={exportXlsx}>
            <i className="ti ti-file-spreadsheet" aria-hidden="true" /> {exporting ? 'Exporting…' : 'Export to Excel'}
          </button>
        </div>

        {!d ? <div className="card" style={{ padding: 18 }}>Loading…</div> : (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
              {fmtDate(`${d.from}T12:00:00Z`)} – {fmtDate(`${d.to}T12:00:00Z`)}{d.area ? ` · ${d.area}` : ' · all areas'}
            </div>

            <div className="dash-grid">
              <Tile label="Patrols" value={t.patrols} sub={`${hoursText(t.hours)} · ${t.officers} officer${t.officers === 1 ? '' : 's'}`} />
              <Tile label="Pins" value={t.pins} sub={<><span style={{ color: COLOUR.critical }}>{t.critical} Critical</span> · <span style={{ color: COLOUR.medium }}>{t.medium} Medium</span> · <span style={{ color: COLOUR.normal }}>{t.normal} Normal</span></>} />
              <Tile label="Off route" value={t.off_route} sub={t.pins ? `${Math.round((t.off_route / t.pins) * 100)}% of pins` : 'of pins'} tone={t.off_route ? '#6D28D9' : undefined} />
              <Tile label="Tickets" value={`${t.opened} opened · ${t.closed} closed`} sub={t.avg_hours_to_close != null ? `${hoursText(t.avg_hours_to_close)} on average to close` : 'None closed in the period'} />
            </div>

            <div className="dash-section-title">Right now</div>
            <div className="dash-grid">
              <Tile label="Awaiting review" value={d.now.awaiting} tone={d.now.awaiting ? '#854F0B' : undefined} to="/ops/review" sub="Open the Review Queue" />
              <Tile label="Open tickets" value={d.now.open_tickets} tone={d.now.open_tickets ? COLOUR.critical : undefined} to="/ops/tickets"
                sub={d.now.open_tickets ? `${d.now.open_critical} Critical · oldest ${oldestDays === 0 ? 'today' : `${oldestDays} day${oldestDays === 1 ? '' : 's'}`}` : 'Nothing open'} />
              <Tile label="Links with no pin" value={unvisited.length} sub={`of ${d.links.length} links in the period`} tone={unvisited.length ? '#854F0B' : undefined} />
            </div>

            <div className="card" style={{ marginTop: 16, padding: 16 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Pins per day</div>
              {t.pins === 0 ? <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No pins in this period.</p> : (
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={days} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip labelFormatter={(l, p) => p?.[0] ? fmtDate(`${p[0].payload.day}T12:00:00Z`) : l} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="critical" name="Critical" stackId="s" fill={COLOUR.critical} />
                      <Bar dataKey="medium" name="Medium" stackId="s" fill={COLOUR.medium} />
                      <Bar dataKey="normal" name="Normal" stackId="s" fill={COLOUR.normal} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="dash-two">
              <div className="card">
                <div className="card-header"><span className="card-title">Officers</span></div>
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead><tr><th>Officer</th><th>Patrols</th><th>Hours</th><th>Pins</th><th>Off route</th><th>Last patrol</th></tr></thead>
                    <tbody>
                      {d.per_officer.map(o => (
                        <tr key={o.id}>
                          <td style={{ fontWeight: 500 }}>{o.full_name}</td>
                          <td className="num">{o.patrols}</td>
                          <td className="num">{hoursText(o.hours)}</td>
                          <td className="num">{o.pins}{o.critical ? <span style={{ color: COLOUR.critical, fontWeight: 600 }}> ({o.critical} Critical)</span> : ''}</td>
                          <td className="num">{o.off_route}</td>
                          <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDateTime(o.last_patrol_at)}</td>
                        </tr>
                      ))}
                      {!d.per_officer.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>No patrol officers yet. Give people the Patrol Officer role in the Admin Panel.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><span className="card-title">Most reported</span></div>
                <div style={{ padding: '8px 18px 14px' }}>
                  {d.observations.map(o => (
                    <div key={o.label} className="dash-bar-row">
                      <span style={{ flex: 1, minWidth: 0 }}>{o.label}</span>
                      <span className="dash-bar"><span style={{ width: `${(o.pins / d.observations[0].pins) * 100}%` }} /></span>
                      <span className="num" style={{ width: 34, textAlign: 'right' }}>{o.pins}</span>
                    </div>
                  ))}
                  {!d.observations.length && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No pins in this period.</p>}
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header">
                <span className="card-title">Links</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Links with no pin in the period come first</span>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
                <table>
                  <thead><tr><th>Link</th><th>Area</th><th>Length</th><th>Pins in period</th><th>Open tickets</th><th>Last pin</th></tr></thead>
                  <tbody>
                    {d.links.map(l => (
                      <tr key={`${l.area}-${l.name}`} style={!l.pins ? { background: '#FFFBF2' } : undefined}>
                        <td style={{ fontWeight: 500 }}>{l.name}</td>
                        <td style={{ fontSize: 12 }}>{l.area}</td>
                        <td className="num">{l.length_km} km</td>
                        <td className="num">{l.pins ? l.pins : <span className="tag tag-amber">No pin</span>}</td>
                        <td className="num">{l.open_tickets ? <span style={{ color: COLOUR.critical, fontWeight: 600 }}>{l.open_tickets}</span> : 0}</td>
                        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{l.last_pin_at ? fmtDateTime(l.last_pin_at) : 'Never'}</td>
                      </tr>
                    ))}
                    {!d.links.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>No routes in this period.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
