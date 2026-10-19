import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import AreaChips, { areasOf, areaPoints } from '../components/AreaChips';
import DateInput from '../components/DateInput';
import PinDetail from '../components/PinDetail';
import { useLeaflet, escapeHtml, STATUS_COLOUR, useCurrentRoutes } from '../utils/patrolShared';

// Live Map, in two modes:
//  - Live now: every officer on patrol, at the tracker's latest position.
//  - History: every patrol of one day (and one officer if picked).
// Paths: solid where driven on the route, purple where driven off route
// (further than the off-route setting from every route line), red dashed
// where there was no tracking. The patrols' pins show in their status
// colours and open on a tap. ?patrol=<id> opens one patrol (from the Review
// Queue).
const STATE = {
  tracking: { label: 'Tracking', colour: '#1D9E75', bg: '#E3F4EC' },
  delayed: { label: 'Delayed', colour: '#B26A00', bg: '#FAEEDA' },
  lost: { label: 'Not tracking', colour: '#A32D2D', bg: '#FCEBEB' },
  not_set_up: { label: 'Tracker not set up', colour: '#6b7280', bg: '#f1f3f6' },
};
const PIN_COLOUR = STATUS_COLOUR;
const PATH_COLOURS = ['#2563EB', '#0E7490', '#7C2D12', '#4338CA', '#9D174D', '#111827'];
const OFF_ROUTE = '#7C3AED';
const GAP = '#E24B4A';
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const todayEAT = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
const mins = (m) => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;

// One patrol's path as map layers: runs of on-route / off-route positions,
// and dashed lines across gaps.
function drawPath(L, g, p, colour) {
  const pts = p.positions || [];
  let run = [], runOff = null;
  const flush = () => {
    if (run.length > 1) {
      L.polyline(run, { color: runOff ? OFF_ROUTE : colour, weight: runOff ? 5 : 4, opacity: 0.95 })
        .bindTooltip(`${escapeHtml(p.officer_name)}${runOff ? ' · off route' : ''}`).addTo(g);
    }
  };
  pts.forEach((pt, k) => {
    const ll = [pt.lat, pt.lon];
    if (pt.gap_before && k > 0) {
      flush();
      L.polyline([[pts[k - 1].lat, pts[k - 1].lon], ll], { color: GAP, weight: 3, dashArray: '6 8', opacity: 0.9 })
        .bindTooltip(`No tracking ${fmtTime(pts[k - 1].recorded_at)}–${fmtTime(pt.recorded_at)}`).addTo(g);
      run = [ll]; runOff = !!pt.off_route;
      return;
    }
    if (runOff === null) runOff = !!pt.off_route;
    if (!!pt.off_route !== runOff) {
      run.push(ll); // join the two runs at this point
      flush();
      run = [ll]; runOff = !!pt.off_route;
      return;
    }
    run.push(ll);
  });
  flush();
  if (pts.length) {
    L.circleMarker([pts[0].lat, pts[0].lon], { radius: 5, color: colour, weight: 2, fillColor: '#fff', fillOpacity: 1 })
      .bindTooltip(`${escapeHtml(p.officer_name)} · start ${fmtTime(pts[0].recorded_at)}`).addTo(g);
  }
}

export default function LiveMapPage() {
  const L = useLeaflet();
  const [params] = useSearchParams();
  const onePatrol = params.get('patrol');
  const [mode, setMode] = useState(onePatrol ? 'one' : 'live'); // live | history | one
  const [day, setDay] = useState(todayEAT());
  const [officer, setOfficer] = useState('');
  const [live, setLive] = useState(null);
  const [hist, setHist] = useState(null);
  const [paths, setPaths] = useState({});
  const routes = useCurrentRoutes();
  const [area, setArea] = useState('');
  const [openPin, setOpenPin] = useState(null);
  const [error, setError] = useState('');
  const el = useRef(null);
  const mapRef = useRef(null);
  const layers = useRef({});
  const [ready, setReady] = useState(false);
  const fitKey = useRef('');

  const loadPaths = async (ids) => {
    const got = await Promise.all(ids.map(id => api.get(`/patrol/patrols/${id}/path`).then(x => [id, x.data]).catch(() => [id, null])));
    setPaths(Object.fromEntries(got.filter(([, v]) => v)));
  };

  const load = useCallback(async () => {
    try {
      setError('');
      if (mode === 'one' && onePatrol) { await loadPaths([onePatrol]); return; }
      if (mode === 'live') {
        const r = await api.get('/patrol/live');
        setLive(r.data);
        await loadPaths(r.data.patrols.map(p => p.id));
        return;
      }
      const qs = new URLSearchParams({ date: day });
      if (officer) qs.set('officer', officer);
      const r = await api.get(`/patrol/patrols?${qs}`);
      setHist(r.data);
      await loadPaths(r.data.patrols.map(p => p.id));
    } catch (e) { setError(e.response?.data?.error || 'Could not load the map.'); }
  }, [mode, onePatrol, day, officer]);

  useEffect(() => {
    setPaths({});
    load();
    if (mode !== 'live') return;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load, mode]);

  useEffect(() => {
    if (!L || !el.current || mapRef.current) return;
    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery &copy; Esri' });
    const map = L.map(el.current, { center: [-1.29, 36.82], zoom: 8, layers: [street] });
    L.control.layers({ Street: street, Satellite: satellite }, null, { position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    map.createPane('routes');
    map.getPane('routes').style.zIndex = 350;
    mapRef.current = map;
    setReady(true);
    return () => { map.remove(); mapRef.current = null; layers.current = {}; setReady(false); };
  }, [L]);

  // route lines underneath, grey so the driven path stands out
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map || !routes) return;
    layers.current.routes?.remove();
    const g = L.featureGroup();
    for (const f of routes.features) {
      if (f.geometry.type !== 'LineString') continue;
      L.polyline(f.geometry.coordinates.map(([lon, lat]) => [lat, lon]), { pane: 'routes', color: '#94a3b8', weight: 3, opacity: 0.7 })
        .bindTooltip(escapeHtml(f.properties.name)).addTo(g);
    }
    g.addTo(map);
    layers.current.routes = g;
  }, [L, routes, ready]);

  // paths, current positions (live) and pins
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map) return;
    layers.current.paths?.remove();
    const g = L.featureGroup();
    Object.keys(paths).forEach((id, i) => {
      const p = paths[id];
      const colour = PATH_COLOURS[i % PATH_COLOURS.length];
      drawPath(L, g, p, colour);
      for (const pin of p.pins || []) {
        L.circleMarker([pin.lat, pin.lon], { radius: 7, color: '#fff', weight: 2, fillColor: PIN_COLOUR[pin.status] || '#6b7280', fillOpacity: 1 })
          .bindTooltip(`${escapeHtml(pin.name)} · ${fmtTime(pin.created_at)}`)
          .on('click', () => setOpenPin(pin.id)).addTo(g);
      }
      const pts = p.positions || [];
      if (pts.length && mode !== 'history') {
        const last = pts[pts.length - 1];
        const lp = live?.patrols.find(x => x.id === id);
        const st = STATE[lp?.tracker] || STATE.tracking;
        L.marker([last.lat, last.lon], {
          icon: L.divIcon({ className: 'live-officer', html: `<span style="border-color:${st.colour}">${escapeHtml((p.officer_name || '?').split(' ').map(w => w[0]).slice(0, 2).join(''))}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] }),
        }).bindTooltip(`${escapeHtml(p.officer_name)} · ${fmtTime(last.recorded_at)}`).addTo(g);
      }
    });
    g.addTo(map);
    layers.current.paths = g;
    // Fit once per view (mode, day, officer), not on every 30-second refresh.
    const key = `${mode}|${day}|${officer}|${onePatrol}|${Object.keys(paths).join(',')}`;
    if (fitKey.current !== key && g.getLayers().length && !area) {
      map.fitBounds(g.getBounds(), { padding: [40, 40], maxZoom: 16 });
      fitKey.current = key;
    }
  }, [L, paths, live, ready, mode, day, officer, onePatrol, area]);

  const goToArea = (a) => {
    setArea(a);
    const map = mapRef.current;
    const pts = a ? areaPoints(routes, a)
      : [...areaPoints(routes, ''), ...Object.values(paths).flatMap(p => (p.positions || []).map(x => [x.lat, x.lon]))];
    if (map && L && pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
  };

  const list = mode === 'live' ? (live?.patrols || []) : mode === 'history' ? (hist?.patrols || []) : (paths[onePatrol] ? [paths[onePatrol]] : []);
  const pathColour = (id) => PATH_COLOURS[Object.keys(paths).indexOf(id) % PATH_COLOURS.length] || '#9ca3af';

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub Operations</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Live Map</span>
        </div>
      </div>
      <div className="content">
        {error && <div className="login-error" role="alert">{error}</div>}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <div className="seg">
            <button className={mode === 'live' ? 'on' : ''} onClick={() => setMode('live')}><i className="ti ti-broadcast" aria-hidden="true" /> Live now</button>
            <button className={mode === 'history' ? 'on' : ''} onClick={() => setMode('history')}><i className="ti ti-history" aria-hidden="true" /> History</button>
            {onePatrol && <button className={mode === 'one' ? 'on' : ''} onClick={() => setMode('one')}>This patrol</button>}
          </div>
          {mode === 'history' && (
            <>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Date</span>
              <DateInput value={day} onChange={(v) => v && setDay(v)} style={{ width: 140 }} />
              <select className="form-select" style={{ width: 'auto' }} value={officer} onChange={e => setOfficer(e.target.value)} aria-label="Officer">
                <option value="">All officers</option>
                {(hist?.officers || []).map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
              </select>
            </>
          )}
        </div>

        <div className="live-list">
          {!list.length && (
            <div className="card" style={{ padding: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
              {mode === 'live' ? 'Nobody is on patrol right now.' : mode === 'history' ? `No patrols on ${fmtDate(`${day}T12:00:00Z`)}.` : 'Loading…'}
            </div>
          )}
          {list.map(p => {
            const path = paths[p.id];
            const st = mode === 'live' ? STATE[p.tracker] : null;
            return (
              <div key={p.id} className="card live-item">
                <span className="live-swatch" style={{ background: pathColour(p.id) }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{p.officer_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {mode === 'live' ? `Since ${fmtTime(p.started_at)}` : `${fmtDate(p.started_at)} ${fmtTime(p.started_at)}–${p.ended_at ? fmtTime(p.ended_at) : 'running'}`}
                    {path ? ` · ${path.km} km` : ''}
                    {path?.km_off_route ? <span style={{ color: OFF_ROUTE, fontWeight: 600 }}>{` · ${path.km_off_route} km off route`}</span> : ''}
                    {path?.gaps ? <span style={{ color: GAP, fontWeight: 600 }}>{` · ${path.gaps} gap${path.gaps === 1 ? '' : 's'} (${mins(path.gap_minutes)})`}</span> : ''}
                    {path ? ` · ${(path.pins || []).length} pin${(path.pins || []).length === 1 ? '' : 's'}` : ''}
                  </div>
                  {path && !path.positions.length && <div style={{ fontSize: 12, color: GAP }}>No tracker positions for this patrol.</div>}
                </div>
                {st && <span className="tag" style={{ background: st.bg, color: st.colour, fontWeight: 600 }}>{st.label}</span>}
                {mode === 'live' && p.last_battery != null && <span className="tag tag-gray">{Math.round(p.last_battery)}%{p.last_charging ? ' ⚡' : ''}</span>}
              </div>
            );
          })}
        </div>

        <AreaChips areas={areasOf(routes)} value={area} onChange={goToArea} />
        <div ref={el} style={{ height: 'min(70vh, 640px)', minHeight: 360, borderRadius: 10, overflow: 'hidden', background: '#e5e7eb' }}>
          {!L && <div style={{ padding: 20, fontSize: 13 }}>Loading map…</div>}
        </div>
        <div className="live-legend">
          <span><i style={{ background: PATH_COLOURS[0] }} /> Driven on the route</span>
          <span><i style={{ background: OFF_ROUTE }} /> Driven off route (over {Object.values(paths)[0]?.off_route_m ?? 100} m from every route)</span>
          <span><i className="dash" /> No tracking (over {Object.values(paths)[0]?.lost_min ?? live?.lost_min ?? 10} min)</span>
          <span><i className="dot" style={{ background: PIN_COLOUR.critical }} /><i className="dot" style={{ background: PIN_COLOUR.medium }} /><i className="dot" style={{ background: PIN_COLOUR.normal }} /> Pins (tap to open)</span>
          {mode === 'live' && <span>Updates every 30 seconds.</span>}
        </div>

        {openPin && <PinDetail pinId={openPin} onClose={() => setOpenPin(null)} />}
      </div>
    </>
  );
}
