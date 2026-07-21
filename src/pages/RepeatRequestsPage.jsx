import React, { useEffect, useState, useRef } from 'react';
import api, { logError } from '../utils/api';

// Single blue family shared by both the item pills and the rank badges below.
const BLUE_PALETTE = ['#F0F7FF', '#E6F1FF', '#DCEBFF', '#D2E4FF', '#C7DEFF', '#BED6FF', '#B4CEFF', '#A9C7FF', '#9EC0FF', '#93B9FF', '#88B2FF', '#7DAAFF', '#73A2FF', '#699AFF', '#5F91FF', '#5590FF', '#4C8AFF', '#66B3FF', '#7CC2FF', '#B3D9FF'];
// Cycled by first-seen order so each distinct PPE item keeps a stable pill
// background across the list.
const ITEM_PASTELS = BLUE_PALETTE;

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixHex = (hex1, hex2, t) => {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const round = (v) => Math.round(v).toString(16).padStart(2, '0');
  return '#' + round(r1 + (r2 - r1) * t) + round(g1 + (g2 - g1) * t) + round(b1 + (b2 - b1) * t);
};
const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};
// Every rank gets a badge now (not just the top 3) -- sorted darkest-first
// so #1 stands out and the color fades out toward the bottom of the list.
const RANK_BLUES = [...BLUE_PALETTE].sort((a, b) => luminance(a) - luminance(b));
const rankBlue = (i, total) => {
  const t = total > 1 ? i / (total - 1) : 0;
  const scaled = t * (RANK_BLUES.length - 1);
  const idx = Math.min(RANK_BLUES.length - 2, Math.floor(scaled));
  return mixHex(RANK_BLUES[idx], RANK_BLUES[idx + 1], scaled - idx);
};
// Pastels are too pale to read as text/dot color on their own, so each pill's
// accent is derived by darkening its own pastel toward slate -- keeps the
// same hue family instead of needing a second hand-picked palette.
const inkFromPastel = (hex) => mixHex(hex, '#1e293b', 0.72);

const FilterChip = ({ label, active, highlighted, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap',
      border: '1.2px ' + (active ? 'solid #2563EB' : highlighted ? 'dashed #93b4e8' : 'solid transparent'),
      background: active ? '#E6F1FB' : highlighted ? '#F3F7FD' : '#F1F2F4',
      color: active ? '#2563EB' : highlighted ? '#3B5B92' : '#374151',
      fontSize: 10, fontWeight: active ? 600 : 500,
      cursor: disabled ? 'default' : 'pointer', transition: 'all 0.15s ease',
      opacity: disabled ? 0.6 : 1,
    }}
  >
    {active && <span style={{ fontSize: 9 }}>✓</span>}
    {label}
  </button>
);

const StatTile = ({ label, value, sub, accent }) => (
  <div className="card" style={{ padding: '16px 18px' }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 700, color: accent || '#111827', marginTop: 6 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
  </div>
);

const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

// Searchable multi-select popover, reused for both the "Items" (include) and
// "Exclude" filters -- same list of options, opposite effect on the result.
const ItemMultiSelect = ({ label, options, selected, onToggle, onClear, itemColor, itemInk, accentActive }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredOptions = options.filter(o => o.toLowerCase().includes(q.trim().toLowerCase()));
  const hasSelection = selected.length > 0;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 30, padding: '0 12px', borderRadius: 999, whiteSpace: 'nowrap',
          border: '1.2px solid ' + (hasSelection ? accentActive : '#e5e7eb'),
          background: hasSelection ? accentActive + '14' : '#fff',
          color: hasSelection ? accentActive : '#6b7280',
          fontSize: 11.5, fontWeight: hasSelection ? 600 : 500, cursor: 'pointer', transition: 'all 0.15s ease',
        }}
      >
        {label}{hasSelection ? ` (${selected.length})` : ''}
        <span style={{ fontSize: 9 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 36, right: 0, zIndex: 100, width: 250,
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(15,42,74,0.14)', padding: 10,
        }}>
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search items..."
            style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12, marginBottom: 8, outline: 'none', boxSizing: 'border-box' }}
          />
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {filteredOptions.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9ca3af', padding: '8px 4px' }}>No items match</div>
            ) : filteredOptions.map(name => (
              <label key={name} onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5 }}>
                <input type="checkbox" checked={selected.includes(name)} onChange={() => onToggle(name)} style={{ width: 14, height: 14, accentColor: itemInk(name), flexShrink: 0 }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: itemInk(name), flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151' }}>{name}</span>
              </label>
            ))}
          </div>
          {hasSelection && (
            <button onClick={onClear} style={{ marginTop: 8, width: '100%', padding: '5px 0', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#6b7280', fontSize: 11.5, cursor: 'pointer' }}>
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default function RepeatRequestsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ projects: [], clients: [] });
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('count'); // 'count' | 'recent'
  const [includeItems, setIncludeItems] = useState([]); // empty = no include filter
  const [excludeItems, setExcludeItems] = useState([]); // empty = no exclude filter
  const [hoveredRow, setHoveredRow] = useState(null); // row key showing its flagged-dates tooltip

  const toggleFilter = (key, value) => setFilters(current => ({
    ...current,
    [key]: current[key].includes(value) ? current[key].filter(v => v !== value) : [...current[key], value],
  }));
  const toggleInclude = (name) => setIncludeItems(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  const toggleExclude = (name) => setExcludeItems(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);

  useEffect(() => {
    setLoading(true);
    setError('');
    api.get('/graphs', { params: { project: filters.projects.join(','), client: filters.clients.join(',') } })
      .then(r => setData(r.data))
      .catch(e => { logError(e); setError(e.response?.data?.error || 'Unable to load repeat request data'); })
      .finally(() => setLoading(false));
  }, [filters]);

  if (loading && !data) return <div className="content graphs-content"><div style={{color:'#6b7280',padding:40,textAlign:'center'}}>Loading...</div></div>;
  if (error && !data) return <div className="content graphs-content"><div style={{color:'#A32D2D',padding:40,textAlign:'center'}}>{error}</div></div>;

  // Ticking a client doesn't select anything for you -- it just brings that
  // client's projects to the front of the row with a dashed accent, so
  // they're easy to spot and click yourself.
  const clientProjectsMap = data.filter_options?.client_projects || {};
  const highlightedProjects = new Set(filters.clients.flatMap(c => clientProjectsMap[c] || []));
  const allFilterProjects = data.filter_options?.projects || [];
  const sortedFilterProjects = highlightedProjects.size === 0 ? allFilterProjects : [
    ...allFilterProjects.filter(p => highlightedProjects.has(p)),
    ...allFilterProjects.filter(p => !highlightedProjects.has(p)),
  ];

  const repeatItems = data.ppe_repeat_items || [];
  const itemNames = [...new Set(repeatItems.map(r => r.item))];
  const itemColor = (name) => ITEM_PASTELS[itemNames.indexOf(name) % ITEM_PASTELS.length];
  const itemInk = (name) => inkFromPastel(itemColor(name));

  const query = search.trim().toLowerCase();
  const visibleItems = repeatItems
    .filter(r => !query || r.employee.toLowerCase().includes(query) || r.item.toLowerCase().includes(query))
    .filter(r => includeItems.length === 0 || includeItems.includes(r.item))
    .filter(r => excludeItems.length === 0 || !excludeItems.includes(r.item))
    .slice()
    .sort((a, b) => sortBy === 'recent'
      ? new Date(b.last_flagged) - new Date(a.last_flagged)
      : b.count - a.count || a.employee.localeCompare(b.employee));

  const maxCount = Math.max(1, ...repeatItems.map(r => r.count));
  const affectedEmployees = new Set(repeatItems.map(r => r.employee)).size;
  const topCase = repeatItems[0];

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">ESAT</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Repeat Requests</span>
        </div>
        <div className="topbar-right">
          {(filters.projects.length > 0 || filters.clients.length > 0) && (
            <button className="btn btn-sm" onClick={() => setFilters({ projects: [], clients: [] })} disabled={loading}>Clear filters</button>
          )}
        </div>
      </div>
      <div className="content graphs-content" style={{ display: 'flex', flexDirection: 'column' }}>
        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}
        <div className="card" style={{ marginBottom: 24, position: 'sticky', top: 'var(--header-h)', zIndex: 40, flexShrink: 0 }}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', flexShrink: 0, paddingTop: 6 }}>Client</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <FilterChip label="All clients" active={filters.clients.length === 0} disabled={loading} onClick={() => setFilters(current => ({ ...current, clients: [] }))} />
                {(data.filter_options?.clients || []).map(client => (
                  <FilterChip key={client} label={client} active={filters.clients.includes(client)} disabled={loading} onClick={() => toggleFilter('clients', client)} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', flexShrink: 0, paddingTop: 6 }}>Project</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <FilterChip label="All projects" active={filters.projects.length === 0} disabled={loading} onClick={() => setFilters(current => ({ ...current, projects: [] }))} />
                {sortedFilterProjects.map(project => (
                  <FilterChip
                    key={project}
                    label={project}
                    active={filters.projects.includes(project)}
                    highlighted={highlightedProjects.has(project)}
                    disabled={loading}
                    onClick={() => toggleFilter('projects', project)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24, flexShrink: 0 }}>
          <StatTile label="Repeat cases" value={repeatItems.length} sub="employee + item pairs" />
          <StatTile label="Employees affected" value={affectedEmployees} sub="flagged 2+ times for something" />
          <StatTile label="Items involved" value={itemNames.length} sub="distinct PPE items" />
          <StatTile
            label="Highest repeat"
            value={topCase ? `${topCase.count}×` : '—'}
            sub={topCase ? `${topCase.item} · ${topCase.employee}` : 'No repeats in this period'}
            accent={topCase ? itemInk(topCase.item) : undefined}
          />
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 480 }}>
          <div className="card-header" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div className="card-title" style={{ fontSize: 15, marginBottom: 4 }}>Repeat PPE Item Requests</div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>Employees flagged for the same item more than once</div>
            </div>
            <span className="tag tag-navy" style={{ whiteSpace: 'nowrap' }}>Last 12 months</span>
          </div>
          <div className="card-body" style={{ paddingTop: 16, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search employee or item..."
                style={{
                  flex: '1 1 220px', maxWidth: 320, padding: '7px 12px', borderRadius: 8,
                  border: '1px solid #e5e7eb', fontSize: 12.5, color: '#374151', outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <ItemMultiSelect
                  label="Items" options={itemNames} selected={includeItems} onToggle={toggleInclude}
                  onClear={() => setIncludeItems([])} itemColor={itemColor} itemInk={itemInk} accentActive="#2563EB"
                />
                <ItemMultiSelect
                  label="Exclude" options={itemNames} selected={excludeItems} onToggle={toggleExclude}
                  onClear={() => setExcludeItems([])} itemColor={itemColor} itemInk={itemInk} accentActive="#DC2626"
                />
                {[{ key: 'count', label: 'Most repeated' }, { key: 'recent', label: 'Recently flagged' }].map(opt => {
                  const isActive = sortBy === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setSortBy(opt.key)}
                      style={{
                        padding: '5px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: isActive ? 600 : 500,
                        border: '1.2px solid ' + (isActive ? '#2563EB' : '#e5e7eb'),
                        background: isActive ? '#E6F1FB' : '#fff',
                        color: isActive ? '#2563EB' : '#6b7280',
                        cursor: 'pointer', transition: 'all 0.15s ease', whiteSpace: 'nowrap',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {visibleItems.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: 13, padding: '56px 0', textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {repeatItems.length === 0 ? 'No employee has been flagged for the same PPE item more than once in this period' : 'No matches for that search / filter combination'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
                {visibleItems.map((row, i) => {
                  const bg = itemColor(row.item);
                  const ink = itemInk(row.item);
                  const barWidth = Math.max(4, (row.count / maxCount) * 100);
                  const badgeColor = rankBlue(i, visibleItems.length);
                  const badgeText = luminance(badgeColor) > 190 ? '#1e3a6b' : '#fff';
                  const rowKey = row.employee + '::' + row.item;
                  const dates = row.flagged_dates || (row.last_flagged ? [row.last_flagged] : []);
                  return (
                    <div
                      key={rowKey}
                      className="pulse-card"
                      onMouseEnter={() => setHoveredRow(rowKey)}
                      onMouseLeave={() => setHoveredRow(prev => prev === rowKey ? null : prev)}
                      style={{ position: 'relative', borderRadius: 10, overflow: 'visible', flexShrink: 0 }}
                    >
                      <div style={{ position: 'absolute', inset: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid #eef0f3' }}>
                        <div style={{ position: 'absolute', inset: 0, width: `${barWidth}%`, background: bg, transition: 'width 0.2s ease' }} />
                      </div>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '11px 16px' }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11.5, fontWeight: 700, color: badgeText,
                          background: badgeColor,
                        }}>
                          {i + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '2px 9px', borderRadius: 999, marginBottom: 4,
                            background: bg, color: ink, fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap',
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: ink }} />
                            {row.item}
                          </span>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.employee}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 70 }}>
                          <div style={{ fontSize: 19, fontWeight: 700, color: ink }}>{row.count}×</div>
                          <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: ink }}>requests</div>
                        </div>
                        <div style={{ fontSize: 11, color: ink, flexShrink: 0, minWidth: 90, textAlign: 'right', cursor: dates.length > 1 ? 'help' : 'default', textDecoration: dates.length > 1 ? 'underline dotted' : 'none', textUnderlineOffset: 3 }}>
                          {row.last_flagged ? 'Last ' + formatDate(row.last_flagged) : ''}
                        </div>
                      </div>
                      {hoveredRow === rowKey && dates.length > 0 && (
                        <div style={{
                          position: 'absolute', top: '100%', right: 16, marginTop: 4, zIndex: 50, minWidth: 160,
                          background: '#fff', border: '1px solid #dbe2ea', borderRadius: 10,
                          boxShadow: '0 8px 24px rgba(15,42,74,0.14)', padding: '10px 14px',
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                            {dates.length === 1 ? 'Flagged on' : `Flagged ${dates.length}×`}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {dates.map((d, di) => (
                              <div key={d + di} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#374151' }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: ink, flexShrink: 0 }} />
                                {formatDate(d)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
