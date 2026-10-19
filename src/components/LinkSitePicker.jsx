import React from 'react';

// "Any link or site" dropdown, links and sites in their own groups.
// `places` comes from usePlaces(routes) in utils/patrolShared.
export default function LinkSitePicker({ places, value, onChange }) {
  return (
    <select className="form-select" style={{ flex: '1 1 240px', minWidth: 0, maxWidth: 380 }} value={value} onChange={e => onChange(e.target.value)} aria-label="Link or site">
      <option value="">Any link or site</option>
      {places.links.length > 0 && <optgroup label="Links">{places.links.map(n => <option key={'l' + n} value={n}>{n}</option>)}</optgroup>}
      {places.sites.length > 0 && <optgroup label="Sites">{places.sites.map(n => <option key={'s' + n} value={n}>{n}</option>)}</optgroup>}
    </select>
  );
}
