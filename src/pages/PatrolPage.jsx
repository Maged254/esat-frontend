import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../utils/AuthContext';
import { useLeaflet, AREA_COLOURS, STATUS_COLOUR } from '../utils/patrolShared';

// The officer's phone screen (OneHub Operations → My Patrol). Full screen, no
// sidebar: a map with the routes, the officer's position and their pins, and
// one big "Add pin" button. Adding a pin is three steps: place it (within the
// allowed distance of where they stand), take 1-3 photos with the camera, then
// name it and pick a type and status. Photos are stamped with the time, GPS
// position, officer and point name on the phone before upload.

const STATUS = {
  critical: { label: 'Critical', colour: STATUS_COLOUR.critical, bg: '#FCEBEB' },
  medium: { label: 'Medium', colour: STATUS_COLOUR.medium, bg: '#FAEEDA' },
  normal: { label: 'Normal', colour: STATUS_COLOUR.normal, bg: '#E3F4EC' },
};
const OFF_ROUTE = '#7C3AED';
// A photo must be fresh from the camera: its file time within this window.
const PHOTO_FRESH_MS = 10 * 60 * 1000;
const PHOTO_MAX_PX = 1280;
const PHOTO_QUALITY = 0.7;

const fmtDateTime = (d) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
// Tracker (Traccar Client) states, as the server works them out.
const TRACKER = {
  tracking: { label: 'Tracker on', cls: 'ok' },
  delayed: { label: 'Tracker delayed', cls: 'wait' },
  lost: { label: 'Tracker off', cls: 'bad' },
  not_set_up: { label: 'Tracker not set up', cls: 'bad' },
};
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

// ── geometry (mirrors the server's check, for the on-screen warning) ──
const haversineM = (a, b) => {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const distanceToLineM = (p, pts) => {
  const rad = Math.PI / 180, R = 6371000;
  const kx = Math.cos(p[1] * rad) * rad * R, ky = rad * R;
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = (pts[i - 1][0] - p[0]) * kx, ay = (pts[i - 1][1] - p[1]) * ky;
    const bx = (pts[i][0] - p[0]) * kx, by = (pts[i][1] - p[1]) * ky;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
};
// The point `max` metres from `centre` towards `p`, used to keep a dragged pin
// inside the allowed circle.
const clampTo = (centre, p, max) => {
  const d = haversineM(centre, p);
  if (d <= max) return p;
  const f = max / d;
  return [centre[0] + (p[0] - centre[0]) * f, centre[1] + (p[1] - centre[1]) * f];
};

// ── photos: stamp + resize on the phone ──
const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That photo could not be read. Take it again.')); };
  img.src = url;
});
const toBlob = (canvas, q) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', q));

async function stampPhoto(file, lines) {
  const img = await loadImage(file);
  // 1280 px on the long side at quality 0.7 keeps signs, plates and the stamp
  // readable at roughly 250-350 KB, which uploads quickly on a weak signal.
  const scale = Math.min(1, PHOTO_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  // A dark band along the bottom, like a site camera's timestamp.
  const size = Math.max(14, Math.round(w / 45));
  const pad = Math.round(size * 0.6);
  const band = lines.length * (size + 6) + pad * 2;
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(0, h - band, w, band);
  g.fillStyle = '#fff';
  g.font = `600 ${size}px Arial, sans-serif`;
  g.textBaseline = 'top';
  lines.forEach((t, i) => g.fillText(t, pad, h - band + pad + i * (size + 6), w - pad * 2));
  const full = await toBlob(c, PHOTO_QUALITY);
  const tc = document.createElement('canvas');
  const ts = 320 / Math.max(w, h);
  tc.width = Math.round(w * ts); tc.height = Math.round(h * ts);
  tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
  const thumb = await toBlob(tc, 0.75);
  return { full, thumb };
}

export default function PatrolPage() {
  const { user } = useAuth();
  const L = useLeaflet();
  const [state, setState] = useState(null);        // GET /patrols/mine
  const [routes, setRoutes] = useState(null);      // GeoJSON of the current cycle
  const [types, setTypes] = useState([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  // live position: { lon, lat, accuracy, at }
  const [pos, setPos] = useState(null);
  const [geoError, setGeoError] = useState('');
  const [setup, setSetup] = useState(null);         // tracker setup details, when the sheet is open
  const [copied, setCopied] = useState('');

  // add-pin flow
  const [step, setStep] = useState(null);           // null | 'place' | 'photos' | 'details'
  const [pinAt, setPinAt] = useState(null);         // [lon, lat]
  const [placedFrom, setPlacedFrom] = useState(null); // officer [lon, lat] when placing
  const [shots, setShots] = useState([]);           // [{ file, preview, captured_at, lat, lon }]
  const [form, setForm] = useState({ name: '', location_note: '', observation_type_id: '', status: '' });
  const camRef = useRef(null);

  const patrol = state?.patrol || null;
  const rules = state?.rules || { pin_max_from_officer_m: 100, pin_off_route_m: 100, photos_min: 1, photos_max: 3 };

  const load = useCallback(async () => {
    const r = await api.get('/patrol/patrols/mine');
    setState(r.data);
    return r.data;
  }, []);

  useEffect(() => {
    load().then(d => {
      if (d.current_cycle_id) api.get(`/patrol/cycles/${d.current_cycle_id}/routes`).then(r => setRoutes(r.data)).catch(() => {});
    }).catch(e => setError(e.response?.data?.error || 'Could not load your patrol.'));
    api.get('/patrol/observation-types').then(r => setTypes(r.data)).catch(() => {});
  }, [load]);

  // The tracker state comes from the server (it is the Traccar app reporting,
  // not this page), so check it every 30 seconds.
  useEffect(() => {
    const t = setInterval(() => { load().catch(() => {}); }, 30000);
    return () => clearInterval(t);
  }, [load]);

  const openSetup = async () => {
    setError('');
    try { const r = await api.get('/patrol/tracker/me'); setSetup(r.data); }
    catch (e) { setError(e.response?.data?.error || 'Could not load the tracker details.'); }
  };
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 2000); }
    catch { setCopied(''); window.prompt('Copy this:', text); }
  };

  // GPS: watch while the page is open.
  useEffect(() => {
    if (!navigator.geolocation) { setGeoError('This phone cannot share its location.'); return; }
    const id = navigator.geolocation.watchPosition(
      p => { setGeoError(''); setPos({ lon: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy, at: Date.now() }); },
      e => setGeoError(e.code === 1 ? 'Location is blocked. Allow location for OneHub in the browser settings.' : 'Waiting for GPS… move to open sky if it takes long.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Keep the screen on during a patrol, where the phone allows it.
  useEffect(() => {
    if (!patrol || !('wakeLock' in navigator)) return;
    let lock = null;
    const get = () => navigator.wakeLock.request('screen').then(l => { lock = l; }).catch(() => {});
    get();
    const onVis = () => { if (document.visibilityState === 'visible') get(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch(() => {}); };
  }, [patrol]);

  // A warning from one step (say, a rejected gallery photo) does not follow
  // the officer into the next.
  useEffect(() => { setError(''); }, [step]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 5000); return () => clearTimeout(t); }, [toast]);

  const lines = useMemo(() => (routes?.features || []).filter(f => f.geometry.type === 'LineString'), [routes]);
  const nearestRoute = useCallback((p) => {
    let best = null;
    for (const f of lines) {
      const d = distanceToLineM(p, f.geometry.coordinates);
      if (!best || d < best.d) best = { d, name: f.properties.name };
    }
    return best;
  }, [lines]);

  // ── map ──
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layers = useRef({});
  const centred = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!L || !mapEl.current || mapRef.current) return;
    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '&copy; Esri' });
    const map = L.map(mapEl.current, { center: [-1.29, 36.82], zoom: 12, layers: [street], zoomControl: false });
    L.control.layers({ Street: street, Satellite: satellite }, null, { position: 'topright' }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    mapRef.current = map;
    setMapReady(true);
    return () => { map.remove(); mapRef.current = null; layers.current = {}; centred.current = false; setMapReady(false); };
  }, [L]);

  // routes
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map || !routes) return;
    layers.current.routes?.remove();
    const areas = [...new Set(routes.features.map(f => f.properties.area))];
    const g = L.featureGroup();
    for (const f of routes.features) {
      const colour = AREA_COLOURS[areas.indexOf(f.properties.area) % AREA_COLOURS.length];
      if (f.geometry.type === 'Point') {
        const [lon, lat] = f.geometry.coordinates;
        L.circleMarker([lat, lon], { radius: 4, color: '#fff', weight: 1, fillColor: colour, fillOpacity: 1 }).bindPopup(f.properties.name).addTo(g);
      } else if (f.geometry.type === 'LineString') {
        const ll = f.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
        L.polyline(ll, { color: '#fff', weight: 7, opacity: 0.9, interactive: false }).addTo(g);
        L.polyline(ll, { color: colour, weight: 4 }).bindPopup(f.properties.name).addTo(g);
      }
    }
    g.addTo(map);
    layers.current.routes = g;
  }, [L, routes, mapReady]);

  // me
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map || !pos) return;
    const ll = [pos.lat, pos.lon];
    if (!layers.current.me) {
      layers.current.meAcc = L.circle(ll, { radius: pos.accuracy, color: '#2563EB', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
      layers.current.me = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#2563EB', fillOpacity: 1 }).addTo(map);
    } else {
      layers.current.me.setLatLng(ll);
      layers.current.meAcc.setLatLng(ll).setRadius(pos.accuracy);
    }
    if (!centred.current) { map.setView(ll, 16); centred.current = true; }
  }, [L, pos, mapReady]);

  // my pins
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map) return;
    layers.current.pins?.remove();
    const g = L.featureGroup();
    for (const p of patrol?.pins || []) {
      const st = STATUS[p.status];
      if (p.off_route) L.circleMarker([p.lat, p.lon], { radius: 13, color: OFF_ROUTE, weight: 3, fill: false, interactive: false }).addTo(g);
      L.circleMarker([p.lat, p.lon], { radius: 9, color: '#fff', weight: 2, fillColor: st.colour, fillOpacity: 1 })
        .bindPopup(`<b>${escapeHtml(p.name)}</b><br/>${escapeHtml(p.observation_label)} · ${st.label}<br/>${fmtTime(p.created_at)}${p.off_route ? '<br/><span style="color:' + OFF_ROUTE + '">Off route</span>' : ''}`)
        .addTo(g);
    }
    g.addTo(map);
    layers.current.pins = g;
  }, [L, patrol, mapReady]);

  // the pin being placed: draggable, held inside the allowed circle
  useEffect(() => {
    const map = mapRef.current;
    layers.current.placing?.remove();
    layers.current.placingCircle?.remove();
    if (!L || !map || step !== 'place' || !pinAt || !placedFrom) return;
    layers.current.placingCircle = L.circle([placedFrom[1], placedFrom[0]], {
      radius: rules.pin_max_from_officer_m, color: '#2563EB', weight: 2, dashArray: '6 6', fillOpacity: 0.06, interactive: false,
    }).addTo(map);
    // Drawn in code rather than Leaflet's default marker image, which does not
    // load when Leaflet comes from a CDN.
    const icon = L.divIcon({
      className: 'patrol-drop-pin',
      html: '<svg width="36" height="48" viewBox="0 0 36 48" aria-hidden="true"><path d="M18 0C8 0 0 8 0 18c0 13 18 30 18 30s18-17 18-30C36 8 28 0 18 0z" fill="#042C53" stroke="#fff" stroke-width="2"/><circle cx="18" cy="18" r="7" fill="#fff"/></svg>',
      iconSize: [36, 48], iconAnchor: [18, 48],
    });
    const marker = L.marker([pinAt[1], pinAt[0]], { draggable: true, autoPan: true, icon }).addTo(map);
    marker.on('drag', (e) => {
      const { lat, lng } = e.target.getLatLng();
      const c = clampTo(placedFrom, [lng, lat], rules.pin_max_from_officer_m);
      if (c[0] !== lng || c[1] !== lat) e.target.setLatLng([c[1], c[0]]);
    });
    marker.on('dragend', (e) => { const { lat, lng } = e.target.getLatLng(); setPinAt([lng, lat]); });
    layers.current.placing = marker;
    map.setView([pinAt[1], pinAt[0]], Math.max(map.getZoom(), 17));
    // pinAt is read once to place the marker; dragging updates it without a redraw
  }, [L, step, placedFrom, rules.pin_max_from_officer_m, mapReady]);

  // ── actions ──
  const startPatrol = async () => {
    setError(''); setBusy(true);
    try { await api.post('/patrol/patrols'); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Could not start the patrol.'); }
    finally { setBusy(false); }
  };

  const endPatrol = async () => {
    if (!window.confirm('End this patrol?')) return;
    setError(''); setBusy(true);
    try { await api.post(`/patrol/patrols/${patrol.id}/end`); await load(); setToast('Patrol ended.'); }
    catch (e) { setError(e.response?.data?.error || 'Could not end the patrol.'); }
    finally { setBusy(false); }
  };

  const resetPin = () => {
    shots.forEach(s => URL.revokeObjectURL(s.preview));
    setStep(null); setPinAt(null); setPlacedFrom(null); setShots([]);
    setForm({ name: '', location_note: '', observation_type_id: '', status: '' });
  };

  const beginPin = () => {
    if (!pos) { setError('Waiting for your location. Make sure location is on.'); return; }
    setError('');
    const me = [pos.lon, pos.lat];
    setPlacedFrom(me); setPinAt(me); setStep('place');
  };

  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { setError('That is not a photo.'); return; }
    // The camera writes the file as the photo is taken; an old file means a
    // picture picked from the gallery.
    if (file.lastModified && Math.abs(Date.now() - file.lastModified) > PHOTO_FRESH_MS) {
      setError('Use the camera to take the photo now. Photos from the gallery are not accepted.');
      return;
    }
    setError('');
    setShots(prev => [...prev, { file, preview: URL.createObjectURL(file), captured_at: new Date().toISOString(), lat: pos?.lat, lon: pos?.lon }]);
  };

  const savePin = async () => {
    const offWarn = nearestRoute(pinAt);
    setError(''); setBusy(true);
    try {
      const fd = new FormData();
      const meta = [];
      for (let i = 0; i < shots.length; i++) {
        const s = shots[i];
        const where = Number.isFinite(s.lat) ? `${s.lat.toFixed(6)}, ${s.lon.toFixed(6)}` : 'GPS unavailable';
        const { full, thumb } = await stampPhoto(s.file, [
          `${fmtDateTime(s.captured_at)}  ·  ${where}`,
          `${user?.name || ''}  ·  ${form.name.trim()}`,
        ]);
        fd.append(`photo${i}`, full, `photo${i + 1}.jpg`);
        fd.append(`thumb${i}`, thumb, `thumb${i + 1}.jpg`);
        meta.push({ captured_at: s.captured_at, lat: s.lat, lon: s.lon });
      }
      fd.append('photos_meta', JSON.stringify(meta));
      fd.append('lat', pinAt[1]); fd.append('lon', pinAt[0]);
      fd.append('officer_lat', placedFrom[1]); fd.append('officer_lon', placedFrom[0]);
      if (pos?.accuracy) fd.append('accuracy', Math.round(pos.accuracy));
      fd.append('name', form.name.trim());
      fd.append('location_note', form.location_note.trim());
      fd.append('observation_type_id', form.observation_type_id);
      fd.append('status', form.status);
      const r = await api.post(`/patrol/patrols/${patrol.id}/pins`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      resetPin();
      await load();
      setToast(r.data.off_route
        ? `Pin saved. It is off route: ${r.data.distance_to_route_m ?? Math.round(offWarn?.d || 0)} m from the nearest route.`
        : 'Pin saved.');
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Could not save the pin. Check your signal and try again.');
    } finally { setBusy(false); }
  };

  // ── derived ──
  const fromMe = pinAt && placedFrom ? haversineM(placedFrom, pinAt) : 0;
  const offRoute = pinAt && lines.length ? nearestRoute(pinAt) : null;
  const isOff = offRoute && offRoute.d > rules.pin_off_route_m;
  const grouped = useMemo(() => {
    const m = new Map();
    for (const t of types) { const k = t.category || 'Other'; if (!m.has(k)) m.set(k, []); m.get(k).push(t); }
    return [...m.entries()];
  }, [types]);
  const detailsOk = form.name.trim() && form.observation_type_id && form.status;

  // ── render ──
  return (
    <div className="patrol-screen">
      <header className="patrol-top">
        <Link to="/ops" className="patrol-top-btn" aria-label="Menu"><i className="ti ti-menu-2" aria-hidden="true" /></Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{patrol ? 'Patrol running' : 'My Patrol'}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {patrol ? `Since ${fmtTime(patrol.started_at)} · ${patrol.pins.length} pin${patrol.pins.length === 1 ? '' : 's'}` : (state ? (state.current_cycle_id ? 'Ready to start' : 'No cycle yet') : 'Loading…')}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span className={`patrol-gps ${pos && !geoError ? 'ok' : 'wait'}`}>
            <i className="ti ti-current-location" aria-hidden="true" /> {pos && !geoError ? `GPS ±${Math.round(pos.accuracy)} m` : 'GPS…'}
          </span>
          {state?.tracker && (
            <button className={`patrol-gps ${TRACKER[state.tracker.state]?.cls}`} style={{ border: 0, cursor: 'pointer' }} onClick={openSetup}>
              <i className="ti ti-satellite" aria-hidden="true" /> {TRACKER[state.tracker.state]?.label}
              {state.tracker.battery != null ? ` · ${Math.round(state.tracker.battery)}%` : ''}
            </button>
          )}
        </div>
      </header>

      {(error || geoError) && <div className="patrol-banner" role="alert">{error || geoError}</div>}
      {toast && <div className="patrol-toast" role="status">{toast}</div>}

      <div ref={mapEl} className="patrol-map" />

      {/* bottom actions */}
      {!step && (
        <div className="patrol-bottom">
          {!patrol ? (
            <button className="patrol-big" disabled={busy || !state?.current_cycle_id} onClick={startPatrol}>
              <i className="ti ti-player-play" aria-hidden="true" /> {busy ? 'Starting…' : 'Start patrol'}
            </button>
          ) : (
            <>
              <button className="patrol-big" disabled={busy} onClick={beginPin}><i className="ti ti-map-pin-plus" aria-hidden="true" /> Add pin</button>
              <button className="patrol-small" disabled={busy} onClick={endPatrol}>End patrol</button>
            </>
          )}
          {state && !state.current_cycle_id && <p className="patrol-note">A Planner has not started a patrol cycle yet.</p>}
          {state?.tracker && state.tracker.state !== 'tracking' && (
            <button className="patrol-small" style={{ minHeight: 44, fontSize: 14 }} onClick={openSetup}>
              <i className="ti ti-satellite" aria-hidden="true" /> {state.tracker.state === 'not_set_up' ? 'Set up the tracker' : 'Tracker help'}
            </button>
          )}
        </div>
      )}

      {/* Tracker setup: what to type into Traccar Client */}
      {setup && (
        <div className="patrol-sheet tall">
          <div className="patrol-sheet-title">Set up the tracker</div>
          <p className="patrol-note">Install <b>Traccar Client</b> from the Play Store (or App Store), open it and enter these two values. This is done once per phone.</p>
          <div className="patrol-label">Device identifier</div>
          <div className="tracker-copy">
            <code>{setup.device_id}</code>
            <button className="patrol-small" onClick={() => copy(setup.device_id, 'id')}>{copied === 'id' ? 'Copied' : 'Copy'}</button>
          </div>
          <div className="patrol-label">Server URL</div>
          <div className="tracker-copy">
            <code>{setup.server_url}</code>
            <button className="patrol-small" onClick={() => copy(setup.server_url, 'url')}>{copied === 'url' ? 'Copied' : 'Copy'}</button>
          </div>
          <ol className="tracker-steps">
            <li>Location accuracy: <b>High</b>. Frequency: <b>{setup.interval_s} seconds</b>.</li>
            <li>Allow location <b>all the time</b> when the phone asks.</li>
            <li>Android: Settings → Apps → Traccar Client → Battery → <b>Unrestricted</b>, so the phone does not stop it.</li>
            <li>Switch the service <b>on</b>. Within a minute the badge at the top turns green: <b>Tracker on</b>.</li>
          </ol>
          <p className="patrol-note">Positions are kept only while a patrol is running.</p>
          <div className="patrol-row">
            <button className="patrol-big" onClick={() => { setSetup(null); load().catch(() => {}); }}>Done</button>
          </div>
        </div>
      )}

      {/* step 1: place */}
      {step === 'place' && (
        <div className="patrol-sheet">
          <div className="patrol-sheet-title">1 of 3 · Place the pin</div>
          <p className="patrol-note">Drag the pin onto the spot. It can be up to {rules.pin_max_from_officer_m} m from you.</p>
          <div className="patrol-facts">
            <span>{Math.round(fromMe)} m from you</span>
            {offRoute && <span style={{ color: isOff ? OFF_ROUTE : '#1D9E75', fontWeight: 600 }}>
              {isOff ? `Off route · ${Math.round(offRoute.d)} m from the nearest route` : `On route · ${offRoute.name}`}
            </span>}
          </div>
          <div className="patrol-row">
            <button className="patrol-small" onClick={resetPin}>Cancel</button>
            <button className="patrol-big" onClick={() => setStep('photos')}>Next</button>
          </div>
        </div>
      )}

      {/* step 2: photos */}
      {step === 'photos' && (
        <div className="patrol-sheet">
          <div className="patrol-sheet-title">2 of 3 · Photos ({shots.length} of {rules.photos_max})</div>
          <div className="patrol-shots">
            {shots.map((s, i) => (
              <div key={i} className="patrol-shot">
                <img src={s.preview} alt={`Photo ${i + 1}`} />
                <button aria-label={`Remove photo ${i + 1}`} onClick={() => { URL.revokeObjectURL(s.preview); setShots(prev => prev.filter((_, j) => j !== i)); }}>✕</button>
              </div>
            ))}
            {shots.length < rules.photos_max && (
              <button className="patrol-shot add" onClick={() => camRef.current?.click()}>
                <i className="ti ti-camera" aria-hidden="true" /><span>Take photo</span>
              </button>
            )}
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onPhoto} />
          <div className="patrol-row">
            <button className="patrol-small" onClick={() => setStep('place')}>Back</button>
            <button className="patrol-big" disabled={shots.length < rules.photos_min} onClick={() => setStep('details')}>Next</button>
          </div>
        </div>
      )}

      {/* step 3: details */}
      {step === 'details' && (
        <div className="patrol-sheet tall">
          <div className="patrol-sheet-title">3 of 3 · Details</div>
          <label className="patrol-label" htmlFor="pin-name">Point name</label>
          <input id="pin-name" className="form-input" placeholder="e.g. Shell Petrol Station" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <label className="patrol-label" htmlFor="pin-note">Location guidance (optional)</label>
          <input id="pin-note" className="form-input" placeholder="e.g. On the main road, left side" value={form.location_note} onChange={e => setForm(f => ({ ...f, location_note: e.target.value }))} />
          <label className="patrol-label" htmlFor="pin-type">Observation</label>
          <select id="pin-type" className="form-select" value={form.observation_type_id} onChange={e => setForm(f => ({ ...f, observation_type_id: e.target.value }))}>
            <option value="">Choose…</option>
            {grouped.map(([cat, list]) => (
              <optgroup key={cat} label={cat}>{list.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</optgroup>
            ))}
          </select>
          <div className="patrol-label">Status</div>
          <div className="patrol-status">
            {Object.entries(STATUS).map(([k, s]) => (
              <button key={k} className={form.status === k ? 'on' : ''} style={{ '--c': s.colour, '--bg': s.bg }} onClick={() => setForm(f => ({ ...f, status: k }))}>{s.label}</button>
            ))}
          </div>
          {isOff && <p className="patrol-note" style={{ color: OFF_ROUTE }}>This pin is off route ({Math.round(offRoute.d)} m from the nearest route). You can still save it.</p>}
          <div className="patrol-row">
            <button className="patrol-small" disabled={busy} onClick={() => setStep('photos')}>Back</button>
            <button className="patrol-big" disabled={busy || !detailsOk} onClick={savePin}>{busy ? 'Saving…' : 'Save pin'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

