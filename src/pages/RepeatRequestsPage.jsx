import React, { useEffect, useState } from 'react';
import api, { logError } from '../utils/api';

// Cycled by first-seen order so each distinct PPE item keeps a stable,
// visually distinct color across the list (unlike a magnitude ramp, these
// need to read as separate categories, not a gradient).
const ITEM_PALETTE = ['#2563EB', '#DB2777', '#059669', '#D97706', '#7C3AED', '#0891B2', '#DC2626', '#65A30D', '#0F766E', '#C2410C', '#4338CA', '#B45309'];
const RANK_MEDAL = ['#F5B300', '#B8C0CC', '#CD7F32'];

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

export default function RepeatRequestsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ projects: [], clients: [] });
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('count'); // 'count' | 'recent'

  const toggleFilter = (key, value) => setFilters(current => ({
    ...current,
    [key]: current[key].includes(value) ? current[key].filter(v => v !== value) : [...current[key], value],
  }));

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
  const itemColor = (name) => ITEM_PALETTE[itemNames.indexOf(name) % ITEM_PALETTE.length];

  const query = search.trim().toLowerCase();
  const visibleItems = repeatItems
    .filter(r => !query || r.employee.toLowerCase().includes(query) || r.item.toLowerCase().includes(query))
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
      <div className="content graphs-content">
        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}
        <div className="card" style={{ marginBottom: 24, position: 'sticky', top: 'var(--header-h)', zIndex: 40 }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <StatTile label="Repeat cases" value={repeatItems.length} sub="employee + item pairs" />
          <StatTile label="Employees affected" value={affectedEmployees} sub="flagged 2+ times for something" />
          <StatTile label="Items involved" value={itemNames.length} sub="distinct PPE items" />
          <StatTile
            label="Highest repeat"
            value={topCase ? `${topCase.count}×` : '—'}
            sub={topCase ? `${topCase.item} · ${topCase.employee}` : 'No repeats in this period'}
            accent={topCase ? itemColor(topCase.item) : undefined}
          />
        </div>

        <div className="card">
          <div className="card-header" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div className="card-title" style={{ fontSize: 15, marginBottom: 4 }}>Repeat PPE Item Requests</div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>Employees flagged for the same item more than once</div>
            </div>
            <span className="tag tag-navy" style={{ whiteSpace: 'nowrap' }}>Last 12 months</span>
          </div>
          <div className="card-body" style={{ paddingTop: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
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
              <div style={{ display: 'flex', gap: 6 }}>
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
              <div style={{ color: '#6b7280', fontSize: 13, padding: '56px 0', textAlign: 'center' }}>
                {repeatItems.length === 0 ? 'No employee has been flagged for the same PPE item more than once in this period' : 'No matches for that search'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 640, overflowY: 'auto', paddingRight: 4 }}>
                {visibleItems.map((row, i) => {
                  const color = itemColor(row.item);
                  const barWidth = Math.max(4, (row.count / maxCount) * 100);
                  return (
                    <div
                      key={row.employee + '::' + row.item}
                      className="pulse-card"
                      style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid #eef0f3', flexShrink: 0 }}
                    >
                      <div style={{ position: 'absolute', inset: 0, width: `${barWidth}%`, background: color + '14', transition: 'width 0.2s ease' }} />
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '11px 16px' }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11.5, fontWeight: 700, color: i < 3 ? '#fff' : '#9ca3af',
                          background: i < 3 ? RANK_MEDAL[i] : '#f3f4f6',
                        }}>
                          {i + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '2px 9px', borderRadius: 999, marginBottom: 4,
                            background: color + '18', color, fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap',
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                            {row.item}
                          </span>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.employee}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 70 }}>
                          <div style={{ fontSize: 19, fontWeight: 700, color }}>{row.count}×</div>
                          <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#9ca3af' }}>requests</div>
                        </div>
                        <div style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0, minWidth: 90, textAlign: 'right' }}>
                          {row.last_flagged ? 'Last ' + formatDate(row.last_flagged) : ''}
                        </div>
                      </div>
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
