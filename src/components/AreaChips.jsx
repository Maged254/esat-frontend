import React from 'react';

// "All · Nairobi West · Rift" above a map: pick an area to zoom to it and
// filter to it. The areas come from the cycle's routes, so a new area appears
// here as soon as its KMZ is uploaded.
export const areasOf = (routes) => [...new Set((routes?.features || []).map(f => f.properties.area).filter(Boolean))];

// Bounds of one area's links and sites, as [[lat, lon], ...] for Leaflet.
export const areaPoints = (routes, area) => {
  const pts = [];
  for (const f of routes?.features || []) {
    if (area && f.properties.area !== area) continue;
    const g = f.geometry;
    if (g.type === 'Point') pts.push([g.coordinates[1], g.coordinates[0]]);
    else if (g.type === 'LineString') g.coordinates.forEach(([lon, lat]) => pts.push([lat, lon]));
    else if (g.type === 'Polygon') g.coordinates[0].forEach(([lon, lat]) => pts.push([lat, lon]));
  }
  return pts;
};

export default function AreaChips({ areas, value, onChange }) {
  if (!areas || areas.length < 2) return null;
  return (
    <div className="area-chips" role="group" aria-label="Go to area">
      <button className={!value ? 'on' : ''} onClick={() => onChange('')}><i className="ti ti-world" aria-hidden="true" /> All</button>
      {areas.map(a => (
        <button key={a} className={value === a ? 'on' : ''} onClick={() => onChange(a)}>
          <i className="ti ti-map-pin" aria-hidden="true" /> {a}
        </button>
      ))}
    </div>
  );
}
