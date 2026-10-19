import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import api from '../utils/api';
import AreaChips, { areaPoints } from '../components/AreaChips';
import { useLeaflet, AREA_COLOURS, escapeHtml } from '../utils/patrolShared';

// Routes (OneHub Operations): the cycles, one KMZ per area, and the
// map of every link and site in the chosen cycle. Planners and Admin upload;
// every Operations role can view and search.

const fmtDate = (ymd) => ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const fmtKm = (km) => `${Number(km || 0).toLocaleString('en-GB', { maximumFractionDigits: 1 })} km`;
const STATUS_TAG = { current: ['tag-green', 'Current'], upcoming: ['tag-navy', 'Upcoming'], past: ['tag-gray', 'Ended'] };
// A cycle has no fixed end: it runs until the next one starts.
const cycleSpan = (c) => c.ends_on ? `${fmtDate(c.starts_on)} – ${fmtDate(c.ends_on)}` : `from ${fmtDate(c.starts_on)}`;
// Suggests the listed area a file is for: "EGYPRO NW DWDM AND PTN LINKS.kmz"
// matches Nairobi West by its initials (NW), "... RIFT ..." matches Rift by
// name. Only a suggestion; the dropdown stays the user's choice.
const guessArea = (filename, areas) => {
  const words = String(filename || '').toUpperCase().replace(/\.KMZ$/, '').split(/[^A-Z0-9]+/);
  return areas.find(a => {
    const name = a.name.toUpperCase();
    const initials = name.split(/\s+/).map(w => w[0]).join('');
    return words.includes(name) || (initials.length > 1 && words.includes(initials));
  })?.name || '';
};

export default function RoutesPage() {
  const [data, setData] = useState(null);
  const [cycleId, setCycleId] = useState('');
  const [geo, setGeo] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // filters
  const [areasOn, setAreasOn] = useState(null); // null = all
  const [showLinks, setShowLinks] = useState(true);
  const [showSites, setShowSites] = useState(true);
  const [query, setQuery] = useState('');

  // forms
  const [newCycleOpen, setNewCycleOpen] = useState(false);
  const [uploadArea, setUploadArea] = useState('');
  const [areaList, setAreaList] = useState([]);
  const [uploadFile, setUploadFile] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async (keepCycle) => {
    const r = await api.get('/patrol/cycles');
    setData(r.data);
    setCycleId(prev => {
      const still = keepCycle && r.data.cycles.some(c => c.id === keepCycle) ? keepCycle : null;
      return still || prev && r.data.cycles.some(c => c.id === prev) && prev || r.data.current_cycle_id || r.data.cycles[0]?.id || '';
    });
  }, []);

  useEffect(() => { load().catch(e => setError(e.response?.data?.error || 'Could not load the routes.')); }, [load]);
  useEffect(() => { api.get('/patrol/areas').then(r => setAreaList(r.data)).catch(() => {}); }, []);

  useEffect(() => {
    if (!cycleId) { setGeo(null); return; }
    setGeo(null);
    api.get(`/patrol/cycles/${cycleId}/routes`)
      .then(r => setGeo(r.data))
      .catch(e => setError(e.response?.data?.error || 'Could not load the map data.'));
  }, [cycleId, data]);

  const cycle = data?.cycles.find(c => c.id === cycleId) || null;
  const editable = !!(data?.can_edit && cycle && cycle.status !== 'past');
  const areaNames = useMemo(() => (cycle?.areas || []).map(a => a.area), [cycle]);
  const colourOf = useCallback((area) => AREA_COLOURS[Math.max(0, areaNames.indexOf(area)) % AREA_COLOURS.length], [areaNames]);

  // Features that pass the area / type filters; the search then narrows further.
  const visible = useMemo(() => (geo?.features || []).filter(f =>
    (!areasOn || areasOn.includes(f.properties.area))
    && (f.properties.kind === 'point' ? showSites : showLinks)
  ), [geo, areasOn, showLinks, showSites]);
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => q
    ? visible.filter(f => (f.properties.name || '').toLowerCase().includes(q))
    : [], [visible, q]);

  // ── actions ─────────────────────────────────────────────
  const run = async (fn, okMsg) => {
    setError(''); setNotice(''); setBusy(true);
    try { const msg = await fn(); setNotice(msg || okMsg || ''); }
    catch (e) { setError(e.response?.data?.error || 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  };

  const startCycle = () => run(async () => {
    const r = await api.post('/patrol/cycles');
    setNewCycleOpen(false);
    await load(r.data.id);
    return 'New cycle started. Upload a KMZ for each area.';
  });

  const upload = () => run(async () => {
    if (!uploadFile) throw { response: { data: { error: 'Choose a KMZ file first.' } } };
    const fd = new FormData();
    fd.append('area', uploadArea);
    fd.append('kmz', uploadFile);
    const r = await api.post(`/patrol/cycles/${cycleId}/areas`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    setUploadFile(null); setUploadArea('');
    if (fileRef.current) fileRef.current.value = '';
    await load(cycleId);
    return `${r.data.area} ${r.data.replaced ? 'replaced' : 'uploaded'}: ${r.data.lines} links, ${r.data.points} sites, ${fmtKm(r.data.length_km)}.`;
  });

  const removeArea = (a) => {
    if (!window.confirm(`Remove ${a.area} from this cycle? Its links and sites leave the map.`)) return;
    run(async () => { await api.delete(`/patrol/cycles/${cycleId}/areas/${a.id}`); await load(cycleId); return `${a.area} removed.`; });
  };

  const download = (a) => run(async () => {
    const r = await api.get(`/patrol/areas/${a.id}/download`);
    window.location.href = r.data.url;
    return '';
  });

  // ── map ─────────────────────────────────────────────────
  const L = useLeaflet();
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const layerById = useRef(new Map());
  const fittedFor = useRef(null);

  const hasMap = !!cycle;
  useEffect(() => {
    if (!L || !hasMap || !mapEl.current || mapRef.current) return;
    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Imagery &copy; Esri',
    });
    const map = L.map(mapEl.current, { center: [0.2, 36.5], zoom: 6, layers: [street] });
    L.control.layers({ Street: street, Satellite: satellite }, null, { position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; fittedFor.current = null; };
    // The map's box only exists once a cycle is showing, so wait for that too.
  }, [L, hasMap]);

  // Redraw on any filter change. With a search running, matches stay bright
  // and everything else fades, so a site is easy to spot among 87.
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map) return;
    if (layerRef.current) layerRef.current.remove();
    layerById.current = new Map();
    const matchIds = new Set(matches.map(f => f.id));
    const group = L.featureGroup();
    for (const f of visible) {
      const colour = colourOf(f.properties.area);
      const dim = q && !matchIds.has(f.id);
      const p = f.properties;
      const popup = `<b>${escapeHtml(p.name)}</b><br/><span style="color:#6b7280">${escapeHtml(p.area)}${p.folder ? ' · ' + escapeHtml(p.folder) : ''}</span>`
        + (p.length_m ? `<br/>${fmtKm(p.length_m / 1000)}` : '');
      let layer;
      if (f.geometry.type === 'Point') {
        const [lon, lat] = f.geometry.coordinates;
        layer = L.circleMarker([lat, lon], {
          radius: dim ? 3 : 5, color: '#fff', weight: 1.5, fillColor: colour, fillOpacity: dim ? 0.25 : 1, opacity: dim ? 0.3 : 1,
        });
      } else {
        const coords = (f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates).map(([lon, lat]) => [lat, lon]);
        // A white outline under each line keeps it readable over any road
        // or satellite colour. Not clickable, so the popup stays on the line.
        if (f.geometry.type !== 'Polygon' && !dim) {
          L.polyline(coords, { color: '#fff', weight: 8, opacity: 0.9, interactive: false }).addTo(group);
        }
        layer = (f.geometry.type === 'Polygon' ? L.polygon : L.polyline)(coords, {
          color: colour, weight: dim ? 2 : 4, opacity: dim ? 0.25 : 1,
        });
      }
      layer.bindPopup(popup);
      layer.addTo(group);
      layerById.current.set(f.id, layer);
    }
    group.addTo(map);
    layerRef.current = group;
    // Fit once per cycle, not on every keystroke.
    if (fittedFor.current !== cycleId && visible.length) {
      map.fitBounds(group.getBounds(), { padding: [24, 24] });
      fittedFor.current = cycleId;
    }
  }, [L, hasMap, visible, matches, q, colourOf, cycleId]);

  const focus = (f) => {
    const map = mapRef.current;
    const layer = layerById.current.get(f.id);
    if (!map || !layer) return;
    if (layer.getLatLng) map.setView(layer.getLatLng(), Math.max(map.getZoom(), 14));
    else map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 15 });
    layer.openPopup();
    mapEl.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // ── render ──────────────────────────────────────────────
  const totals = (cycle?.areas || []).reduce((t, a) => ({ lines: t.lines + a.lines, points: t.points + a.points, km: t.km + a.length_km }), { lines: 0, points: 0, km: 0 });

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub Operations</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Routes</span>
        </div>
      </div>
      <div className="content">
        {error && <div className="login-error" role="alert">{error}</div>}
        {notice && <div style={{ background: '#EAF3DE', color: '#3B6D11', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{notice}</div>}

        {!data ? <div className="card" style={{ padding: 20 }}>Loading routes…</div> : (
          <>
            {/* Cycle bar */}
            <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <label className="form-label" htmlFor="cycle-select" style={{ margin: 0 }}>Cycle</label>
              {data.cycles.length ? (
                <select id="cycle-select" className="form-select" style={{ width: 'auto', minWidth: 240 }} value={cycleId} onChange={e => { setCycleId(e.target.value); setAreasOn(null); setQuery(''); }}>
                  {data.cycles.map(c => <option key={c.id} value={c.id}>{c.name} ({cycleSpan(c)}){c.status === 'current' ? ' · current' : c.status === 'upcoming' ? ' · upcoming' : ''}</option>)}
                </select>
              ) : <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No cycles yet.</span>}
              {cycle && <span className={`tag ${STATUS_TAG[cycle.status][0]}`}>{STATUS_TAG[cycle.status][1]}</span>}
              {data.can_edit && !newCycleOpen && (
                <button className="btn btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => setNewCycleOpen(true)}>
                  <i className="ti ti-calendar-plus" aria-hidden="true" /> Start new cycle
                </button>
              )}
              {newCycleOpen && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
                  <span style={{ fontSize: 13 }}>Start a new cycle today, {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}?</span>
                  <button className="btn btn-primary" disabled={busy} onClick={startCycle}>Start cycle</button>
                  <button className="btn" onClick={() => setNewCycleOpen(false)}>Cancel</button>
                  <span style={{ width: '100%', fontSize: 12, color: 'var(--text-secondary)' }}>{data.current_cycle_id ? 'The current cycle will be closed with yesterday as its last day. ' : ''}The new cycle runs until the next one is started. Open tickets will carry over.</span>
                </div>
              )}
            </div>

            {!data.cycles.length && (
              <div className="card" style={{ padding: 22 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>No routes yet</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                  {data.can_edit ? 'Start the first cycle above, then upload one KMZ file for each area.' : 'A Planner has not uploaded any routes yet.'}
                </p>
              </div>
            )}

            {cycle && (
              <>
                {/* Areas */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-header">
                    <span className="card-title">Areas in this cycle</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {totals.lines} links · {totals.points} sites · {fmtKm(totals.km)}
                    </span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead><tr><th>Area</th><th>Links</th><th>Sites</th><th>Length</th><th>File</th><th>Uploaded</th><th></th></tr></thead>
                      <tbody>
                        {cycle.areas.map(a => (
                          <tr key={a.id}>
                            <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: colourOf(a.area), marginRight: 8 }} />{a.area}</td>
                            <td style={{ fontVariantNumeric: 'tabular-nums' }}>{a.lines}</td>
                            <td style={{ fontVariantNumeric: 'tabular-nums' }}>{a.points}</td>
                            <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtKm(a.length_km)}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.original_filename}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{a.uploaded_by_name || '—'}<br />{new Date(a.uploaded_at).toLocaleString('en-GB')}</td>
                            <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                              {a.has_file && <button className="btn btn-secondary" style={{ fontSize: 12 }} disabled={busy} onClick={() => download(a)}>Download KMZ</button>}
                              {editable && <button className="btn" style={{ fontSize: 12, marginLeft: 6 }} disabled={busy} onClick={() => removeArea(a)}>Remove</button>}
                            </td>
                          </tr>
                        ))}
                        {!cycle.areas.length && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>No areas uploaded to this cycle yet.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  {editable && (
                    <div style={{ padding: 16, borderTop: 'var(--border)', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" htmlFor="kmz-file">KMZ file</label>
                        <input id="kmz-file" ref={fileRef} type="file" accept=".kmz" className="form-input" style={{ width: 'auto' }}
                          onChange={e => { const f = e.target.files?.[0] || null; setUploadFile(f); if (f && !uploadArea) setUploadArea(guessArea(f.name, areaList)); }} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" htmlFor="kmz-area">Area</label>
                        <select id="kmz-area" className="form-select" style={{ width: 200 }} value={uploadArea} onChange={e => setUploadArea(e.target.value)}>
                          <option value="">Choose an area…</option>
                          {areaList.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                        </select>
                      </div>
                      <button className="btn btn-primary" disabled={busy || !uploadFile || !uploadArea} onClick={upload}>
                        {busy ? 'Uploading…' : 'Upload'}
                      </button>
                      <span style={{ width: '100%', fontSize: 12, color: 'var(--text-secondary)' }}>
                        Uploading an area that is already in this cycle replaces it.
                        {!data.file_storage && ' The original file is not being stored yet, but its routes are.'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Filters + map */}
                <div className="card" style={{ padding: 16 }}>
                  <AreaChips areas={areaNames} value={areasOn && areasOn.length === 1 ? areasOn[0] : ''}
                    onChange={(a) => {
                      setAreasOn(a ? [a] : null);
                      // Zoom to the area picked (or to everything for All).
                      const pts = areaPoints(geo, a);
                      if (mapRef.current && window.L && pts.length) mapRef.current.fitBounds(window.L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
                    }} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 0 }}>
                      <i className="ti ti-search" aria-hidden="true" style={{ position: 'absolute', left: 10, top: 9, color: '#9ca3af' }} />
                      <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Search links and sites by name" aria-label="Search links and sites by name"
                        value={query} onChange={e => setQuery(e.target.value)} />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <input type="checkbox" checked={showLinks} onChange={e => setShowLinks(e.target.checked)} /> Links
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <input type="checkbox" checked={showSites} onChange={e => setShowSites(e.target.checked)} /> Sites
                    </label>
                    {areaNames.length > 1 && areaNames.map(a => {
                      const on = !areasOn || areasOn.includes(a);
                      return (
                        <label key={a} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                          <input type="checkbox" checked={on} onChange={e => {
                            const cur = areasOn || areaNames;
                            const next = e.target.checked ? [...new Set([...cur, a])] : cur.filter(x => x !== a);
                            setAreasOn(next.length === areaNames.length ? null : next);
                          }} />
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: colourOf(a) }} />{a}
                        </label>
                      );
                    })}
                  </div>

                  {q && (
                    <div style={{ marginBottom: 12, border: '1px solid #e5e7eb', borderRadius: 8, maxHeight: 220, overflowY: 'auto' }}>
                      <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid #e5e7eb' }}>
                        {matches.length ? `${matches.length} match${matches.length === 1 ? '' : 'es'}. Click one to find it on the map.` : 'No link or site matches that name.'}
                      </div>
                      {matches.slice(0, 100).map(f => (
                        <button key={f.id} onClick={() => focus(f)} className="route-result">
                          <i className={`ti ${f.properties.kind === 'point' ? 'ti-map-pin' : 'ti-route'}`} aria-hidden="true" style={{ color: colourOf(f.properties.area) }} />
                          <span style={{ flex: 1, minWidth: 0 }}>{f.properties.name}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {f.properties.area}{f.properties.length_m ? ` · ${fmtKm(f.properties.length_m / 1000)}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div ref={mapEl} style={{ height: 'min(70vh, 640px)', minHeight: 360, borderRadius: 8, overflow: 'hidden', background: '#e5e7eb' }}>
                    {!L && <div style={{ padding: 20, fontSize: 13 }}>Loading map…</div>}
                  </div>
                  {geo && !geo.features.length && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>Nothing to show yet: this cycle has no routes uploaded.</p>}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

