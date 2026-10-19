import React, { useEffect, useRef, useState } from 'react';

// Pins on a map, over the cycle's routes. Pins take their status colour, with
// a purple ring when off route; tapping one calls onOpen(pin.id).
//
// Built so that no pin can go unnoticed:
//  - pins that overlap are grouped into one numbered circle, coloured by the
//    most serious pin inside; tapping it zooms in, or fans the pins out when
//    they share a spot;
//  - the view opens fitted to every pin, "Show all pins" brings them back, and
//    a note says how many are outside the current view;
//  - the summary above counts the same pins the list shows, by status.
const STATUS = {
  critical: { colour: '#E24B4A', label: 'Critical', rank: 0 },
  medium: { colour: '#EF9F27', label: 'Medium', rank: 1 },
  normal: { colour: '#1D9E75', label: 'Normal', rank: 2 },
};
const AREA_COLOURS = ['#1D4ED8', '#C026D3', '#6D28D9', '#111827', '#9D174D', '#0E7490', '#4338CA', '#7C2D12'];

const useLeaflet = () => {
  const [L, setL] = useState(() => window.L || null);
  useEffect(() => {
    if (L) return;
    const t = setInterval(() => { if (window.L) { setL(window.L); clearInterval(t); } }, 100);
    return () => clearInterval(t);
  }, [L]);
  return L;
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pinIcon = (L, p) => L.divIcon({
  className: 'pinmap-pin',
  html: `<span class="pinmap-dot${p.off_route ? ' off' : ''}" style="background:${STATUS[p.status]?.colour || '#6b7280'}"></span>`,
  iconSize: [24, 24], iconAnchor: [12, 12],
});

export default function PinsMap({ pins, routes, onOpen, limit }) {
  const L = useLeaflet();
  const el = useRef(null);
  const mapRef = useRef(null);
  const layers = useRef({});
  const [ready, setReady] = useState(false);
  const [outside, setOutside] = useState(0);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  useEffect(() => {
    if (!L || !el.current || mapRef.current) return;
    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery &copy; Esri' });
    const map = L.map(el.current, { center: [-1.29, 36.82], zoom: 11, layers: [street] });
    L.control.layers({ Street: street, Satellite: satellite }, null, { position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    // Routes on their own layer under the pins, so pins are always on top
    // without reordering the routes.
    map.createPane('routes');
    map.getPane('routes').style.zIndex = 350;
    mapRef.current = map;
    setReady(true);
    return () => { map.remove(); mapRef.current = null; layers.current = {}; setReady(false); };
  }, [L]);

  // routes underneath
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map || !routes) return;
    layers.current.routes?.remove();
    const areas = [...new Set(routes.features.map(f => f.properties.area))];
    const g = L.featureGroup();
    for (const f of routes.features) {
      const colour = AREA_COLOURS[areas.indexOf(f.properties.area) % AREA_COLOURS.length];
      if (f.geometry.type === 'LineString') {
        const ll = f.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
        L.polyline(ll, { pane: 'routes', color: '#fff', weight: 7, opacity: 0.9, interactive: false }).addTo(g);
        L.polyline(ll, { pane: 'routes', color: colour, weight: 4, opacity: 1 }).bindTooltip(esc(f.properties.name)).addTo(g);
      } else if (f.geometry.type === 'Point') {
        const [lon, lat] = f.geometry.coordinates;
        L.circleMarker([lat, lon], { pane: 'routes', radius: 4, color: '#fff', weight: 1, fillColor: colour, fillOpacity: 1 }).bindTooltip(esc(f.properties.name)).addTo(g);
      }
    }
    g.addTo(map);
    layers.current.routes = g;
  }, [L, routes, ready]);

  const countOutside = () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    setOutside((pins || []).filter(p => !b.contains([p.lat, p.lon])).length);
  };

  const fitAll = () => {
    const map = mapRef.current;
    if (!map || !(pins || []).length) return;
    map.fitBounds(L.latLngBounds(pins.map(p => [p.lat, p.lon])), { padding: [40, 40], maxZoom: 16 });
  };

  // pins on top, grouped where they overlap
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map) return;
    layers.current.pins?.remove();
    const group = L.markerClusterGroup
      ? L.markerClusterGroup({
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          maxClusterRadius: 40,
          // The group takes the colour of its most serious pin.
          iconCreateFunction: (cluster) => {
            const worst = cluster.getAllChildMarkers().reduce((w, m) => Math.min(w, STATUS[m.options.pinStatus]?.rank ?? 2), 2);
            const st = Object.values(STATUS).find(s => s.rank === worst);
            return L.divIcon({
              className: 'pinmap-cluster',
              html: `<span style="background:${st.colour}">${cluster.getChildCount()}</span>`,
              iconSize: [36, 36], iconAnchor: [18, 18],
            });
          },
        })
      : L.featureGroup(); // add-on not loaded: plain markers still show every pin
    for (const p of pins || []) {
      L.marker([p.lat, p.lon], { icon: pinIcon(L, p), pinStatus: p.status, title: p.name })
        .bindTooltip(`${esc(p.name)} · ${esc(p.observation_label)}`)
        .on('click', () => openRef.current?.(p.id))
        .addTo(group);
    }
    group.addTo(map);
    layers.current.pins = group;
    if ((pins || []).length) fitAll();
    countOutside();
    map.off('moveend', countOutside);
    map.on('moveend', countOutside);
    return () => { map.off('moveend', countOutside); };
    // fitAll / countOutside read the latest pins through this effect's closure
    // eslint-disable-next-line
  }, [L, pins, ready]);

  const counts = Object.fromEntries(Object.keys(STATUS).map(k => [k, (pins || []).filter(p => p.status === k).length]));
  const total = (pins || []).length;

  return (
    <div>
      <div className="pinmap-summary">
        <span>
          <b>{total} pin{total === 1 ? '' : 's'}</b>
          {total > 0 && <> : {Object.entries(STATUS).map(([k, s], i) => (
            <span key={k}>{i ? ' · ' : ''}<span style={{ color: s.colour, fontWeight: 600 }}>{counts[k]} {s.label}</span></span>
          ))}</>}
        </span>
        {outside > 0 && <span className="pinmap-outside">{outside} pin{outside === 1 ? ' is' : 's are'} outside the current view</span>}
        <button className="btn btn-secondary" style={{ fontSize: 12, marginLeft: 'auto' }} disabled={!total} onClick={fitAll}>
          <i className="ti ti-zoom-pan" aria-hidden="true" /> Show all pins
        </button>
      </div>
      {limit && total >= limit && (
        <div className="pinmap-limit">Only the first {limit} pins are shown. Narrow the filters (dates, link or site) to see the rest.</div>
      )}
      <div ref={el} style={{ height: 'min(70vh, 640px)', minHeight: 360, borderRadius: 10, overflow: 'hidden', background: '#e5e7eb' }}>
        {!L && <div style={{ padding: 20, fontSize: 13 }}>Loading map…</div>}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
        Tap a pin to open it. A numbered circle is several pins close together: tap it to zoom in.
      </p>
    </div>
  );
}
