import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import AreaChips, { areasOf, areaPoints } from '../components/AreaChips';

// Live Map: every officer on patrol now, at their tracker's latest position,
// with the path driven so far. A stretch with no position for longer than the
// "lost" limit is drawn dashed: the route between is unknown, not driven.
// ?patrol=<id> shows one patrol's path, running or ended (from the Review Queue).
const STATE = {
  tracking: { label: 'Tracking', colour: '#1D9E75', bg: '#E3F4EC' },
  delayed: { label: 'Delayed', colour: '#B26A00', bg: '#FAEEDA' },
  lost: { label: 'Not tracking', colour: '#A32D2D', bg: '#FCEBEB' },
  not_set_up: { label: 'Tracker not set up', colour: '#6b7280', bg: '#f1f3f6' },
};
const PATH_COLOURS = ['#2563EB', '#C026D3', '#0E7490', '#7C2D12', '#4338CA', '#9D174D'];
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const useLeaflet = () => {
  const [L, setL] = useState(() => window.L || null);
  useEffect(() => {
    if (L) return;
    const t = setInterval(() => { if (window.L) { setL(window.L); clearInterval(t); } }, 100);
    return () => clearInterval(t);
  }, [L]);
  return L;
};

export default function LiveMapPage() {
  const L = useLeaflet();
  const [params] = useSearchParams();
  const onePatrol = params.get('patrol');
  const [live, setLive] = useState(null);
  const [paths, setPaths] = useState({});   // patrol id → path response
  const [routes, setRoutes] = useState(null);
  const [error, setError] = useState('');
  const el = useRef(null);
  const mapRef = useRef(null);
  const layers = useRef({});
  const [ready, setReady] = useState(false);
  const fitted = useRef(false);

  const load = useCallback(async () => {
    try {
      if (onePatrol) {
        const r = await api.get(`/patrol/patrols/${onePatrol}/path`);
        setPaths({ [onePatrol]: r.data });
        setLive(null);
        return;
      }
      const r = await api.get('/patrol/live');
      setLive(r.data);
      const got = await Promise.all(r.data.patrols.map(p => api.get(`/patrol/patrols/${p.id}/path`).then(x => [p.id, x.data]).catch(() => [p.id, null])));
      setPaths(Object.fromEntries(got.filter(([, v]) => v)));
      setError('');
    } catch (e) { setError(e.response?.data?.error || 'Could not load the live map.'); }
  }, [onePatrol]);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    api.get('/patrol/cycles').then(r => {
      const id = r.data.current_cycle_id;
      if (id) api.get(`/patrol/cycles/${id}/routes`).then(x => setRoutes(x.data)).catch(() => {});
    }).catch(() => {});
  }, []);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map || !routes) return;
    layers.current.routes?.remove();
    const g = L.featureGroup();
    for (const f of routes.features) {
      if (f.geometry.type !== 'LineString') continue;
      L.polyline(f.geometry.coordinates.map(([lon, lat]) => [lat, lon]), { pane: 'routes', color: '#94a3b8', weight: 3, opacity: 0.7 })
        .bindTooltip(esc(f.properties.name)).addTo(g);
    }
    g.addTo(map);
    layers.current.routes = g;
  }, [L, routes, ready]);

  // paths and current positions
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map) return;
    layers.current.paths?.remove();
    const g = L.featureGroup();
    const ids = Object.keys(paths);
    ids.forEach((id, i) => {
      const p = paths[id];
      const colour = PATH_COLOURS[i % PATH_COLOURS.length];
      const pts = p.positions || [];
      let seg = [];
      const flush = () => { if (seg.length > 1) L.polyline(seg, { color: colour, weight: 4, opacity: 0.9 }).bindTooltip(esc(p.officer_name)).addTo(g); };
      pts.forEach((pt, k) => {
        if (pt.gap_before && k > 0) {
          flush();
          L.polyline([[pts[k - 1].lat, pts[k - 1].lon], [pt.lat, pt.lon]], { color: '#E24B4A', weight: 3, dashArray: '6 8', opacity: 0.9 })
            .bindTooltip(`No tracking ${fmtTime(pts[k - 1].recorded_at)}–${fmtTime(pt.recorded_at)}`).addTo(g);
          seg = [];
        }
        seg.push([pt.lat, pt.lon]);
      });
      flush();
      if (pts.length) {
        const first = pts[0], last = pts[pts.length - 1];
        L.circleMarker([first.lat, first.lon], { radius: 5, color: colour, weight: 2, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(`Start ${fmtTime(first.recorded_at)}`).addTo(g);
        const lp = live?.patrols.find(x => x.id === id);
        const st = STATE[lp?.tracker] || STATE.tracking;
        L.marker([last.lat, last.lon], {
          icon: L.divIcon({ className: 'live-officer', html: `<span style="border-color:${st.colour}">${esc((p.officer_name || '?').split(' ').map(w => w[0]).slice(0, 2).join(''))}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] }),
        }).bindTooltip(`${esc(p.officer_name)} · ${fmtTime(last.recorded_at)}`).addTo(g);
      }
    });
    g.addTo(map);
    layers.current.paths = g;
    if (!fitted.current && g.getLayers().length) { map.fitBounds(g.getBounds(), { padding: [40, 40], maxZoom: 16 }); fitted.current = true; }
  }, [L, paths, live, ready]);

  const one = onePatrol ? paths[onePatrol] : null;
  const [area, setArea] = useState('');
  const goToArea = (a) => {
    setArea(a);
    const map = mapRef.current;
    const pts = a ? areaPoints(routes, a) : [
      ...areaPoints(routes, ''),
      ...Object.values(paths).flatMap(p => (p.positions || []).map(x => [x.lat, x.lon])),
    ];
    if (map && L && pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub Operations</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">{onePatrol ? 'Patrol path' : 'Live Map'}</span>
        </div>
      </div>
      <div className="content">
        {error && <div className="login-error" role="alert">{error}</div>}

        {onePatrol ? (
          one && (
            <div className="card" style={{ padding: 14, marginBottom: 12, fontSize: 13 }}>
              <b>{one.officer_name}</b> · {fmtDateTime(one.started_at)} – {one.ended_at ? fmtTime(one.ended_at) : 'still running'}
              {' · '}{one.km} km driven · {one.positions.length} positions
              {one.gaps ? <span style={{ color: '#A32D2D', fontWeight: 600 }}> · {one.gaps} gap{one.gaps === 1 ? '' : 's'} with no tracking</span> : ''}
              {!one.positions.length && <div style={{ marginTop: 6, color: 'var(--text-secondary)' }}>No tracker positions were recorded for this patrol.</div>}
            </div>
          )
        ) : (
          <div className="live-list">
            {live && !live.patrols.length && <div className="card" style={{ padding: 16, fontSize: 13, color: 'var(--text-secondary)' }}>Nobody is on patrol right now.</div>}
            {live?.patrols.map((p, i) => {
              const st = STATE[p.tracker];
              const path = paths[p.id];
              return (
                <div key={p.id} className="card live-item">
                  <span className="live-swatch" style={{ background: PATH_COLOURS[i % PATH_COLOURS.length] }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{p.officer_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Since {fmtTime(p.started_at)} · {p.pins} pin{p.pins === 1 ? '' : 's'}{path ? ` · ${path.km} km` : ''}
                      {p.last_seen_at ? ` · last position ${fmtTime(p.last_seen_at)}` : ''}
                    </div>
                  </div>
                  <span className="tag" style={{ background: st.bg, color: st.colour, fontWeight: 600 }}>{st.label}</span>
                  {p.last_battery != null && <span className="tag tag-gray">{Math.round(p.last_battery)}%{p.last_charging ? ' ⚡' : ''}</span>}
                </div>
              );
            })}
          </div>
        )}

        <AreaChips areas={areasOf(routes)} value={area} onChange={goToArea} />
        <div ref={el} style={{ height: 'min(70vh, 640px)', minHeight: 360, borderRadius: 10, overflow: 'hidden', background: '#e5e7eb' }}>
          {!L && <div style={{ padding: 20, fontSize: 13 }}>Loading map…</div>}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
          Solid lines are the paths driven. A red dashed line is a stretch with no tracker position for more than {live?.lost_min ?? one?.lost_min ?? 10} minutes. {onePatrol ? '' : 'Updates every 30 seconds.'}
        </p>
      </div>
    </>
  );
}
