import React, { useEffect, useRef, useState } from 'react';

// Pins on a map, over the cycle's routes. Pins take their status colour, with
// a purple ring when off route; tapping one calls onOpen(pin.id). The view
// fits the pins each time the set of pins changes.
const STATUS_COLOUR = { critical: '#E24B4A', medium: '#EF9F27', normal: '#1D9E75' };
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

export default function PinsMap({ pins, routes, onOpen }) {
  const L = useLeaflet();
  const el = useRef(null);
  const mapRef = useRef(null);
  const layers = useRef({});
  const [ready, setReady] = useState(false);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  useEffect(() => {
    if (!L || !el.current || mapRef.current) return;
    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery &copy; Esri' });
    const map = L.map(el.current, { center: [-1.29, 36.82], zoom: 11, layers: [street] });
    L.control.layers({ Street: street, Satellite: satellite }, null, { position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    // Routes get their own layer under the pins' one, so pins always sit on top
    // without reordering the routes (which would put each white outline over
    // its coloured line).
    map.createPane('routes');
    map.getPane('routes').style.zIndex = 350;
    mapRef.current = map;
    setReady(true);
    return () => { map.remove(); mapRef.current = null; layers.current = {}; setReady(false); };
  }, [L]);

  // routes underneath, thin so the pins stand out
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

  // pins on top
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map) return;
    layers.current.pins?.remove();
    const g = L.featureGroup();
    for (const p of pins || []) {
      if (p.off_route) L.circleMarker([p.lat, p.lon], { radius: 12, color: '#7C3AED', weight: 3, fill: false, interactive: false }).addTo(g);
      L.circleMarker([p.lat, p.lon], { radius: 8, color: '#fff', weight: 2, fillColor: STATUS_COLOUR[p.status] || '#6b7280', fillOpacity: 1 })
        .bindTooltip(`${esc(p.name)} · ${esc(p.observation_label)}`)
        .on('click', () => openRef.current?.(p.id))
        .addTo(g);
    }
    g.addTo(map);
    layers.current.pins = g;
    if ((pins || []).length) map.fitBounds(g.getBounds(), { padding: [40, 40], maxZoom: 16 });
  }, [L, pins, ready]);

  return (
    <div ref={el} style={{ height: 'min(70vh, 640px)', minHeight: 360, borderRadius: 10, overflow: 'hidden', background: '#e5e7eb' }}>
      {!L && <div style={{ padding: 20, fontSize: 13 }}>Loading map…</div>}
    </div>
  );
}
