import { useEffect, useMemo, useState } from 'react';
import api from './api';

// Shared by the Route Patrol pages (OneHub Operations), so a colour or a
// loader is changed in one place.

// Pin status colours: Critical red, Medium amber, Normal green.
export const STATUS_COLOUR = { critical: '#E24B4A', medium: '#EF9F27', normal: '#1D9E75' };

// Area colours on the maps, in upload order. None of the street map's own
// colours (orange/yellow roads, green parks, light-blue water) and no red,
// which is kept for Critical pins.
export const AREA_COLOURS = ['#1D4ED8', '#C026D3', '#6D28D9', '#111827', '#9D174D', '#0E7490', '#4338CA', '#7C2D12'];

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Leaflet is loaded by index.html with `defer`; wait for it rather than assume.
export const useLeaflet = () => {
  const [L, setL] = useState(() => window.L || null);
  useEffect(() => {
    if (L) return;
    const t = setInterval(() => { if (window.L) { setL(window.L); clearInterval(t); } }, 100);
    return () => clearInterval(t);
  }, [L]);
  return L;
};

// The routes (GeoJSON) of the cycle in force today, or null while loading or
// when no cycle has started.
export const useCurrentRoutes = () => {
  const [routes, setRoutes] = useState(null);
  useEffect(() => {
    api.get('/patrol/cycles').then(r => {
      const id = r.data.current_cycle_id;
      if (id) api.get(`/patrol/cycles/${id}/routes`).then(x => setRoutes(x.data)).catch(() => {});
    }).catch(() => {});
  }, []);
  return routes;
};

// Every link and site name in a set of routes, sorted, for the link-or-site
// picker.
export const usePlaces = (routes) => useMemo(() => {
  const links = new Set(), sites = new Set();
  for (const f of routes?.features || []) {
    if (f.geometry.type === 'LineString') links.add(f.properties.name);
    else if (f.geometry.type === 'Point') sites.add(f.properties.name);
  }
  const sort = (set) => [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
  return { links: sort(links), sites: sort(sites) };
}, [routes]);
