import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { AREAS, userAreas, isOpsPath } from '../utils/areas';

// OneHub Operations. Route Patrol pages join this list stage by stage; for now
// every page here is open to anyone with an Operations role.
const OPS_NAV = [
  { section: 'Route Patrol' },
  { to: '/ops', label: 'Overview', icon: 'ti-route', exact: true },
  { section: 'Account' },
  { to: '/ops/profile', label: 'My Profile', icon: 'ti-user-circle' },
];

const NAV = [
  { section: 'Overview', roles: ['admin','ehs_officer','ehs_manager','supervisor','scm_officer','project_director'] },
  { to: '/', label: 'Dashboard', icon: 'ti-layout-dashboard', exact: true, roles: ['admin','ehs_officer','ehs_manager','supervisor','project_director'] },
  { to: '/audit-coverage', label: 'Audit Coverage', icon: 'ti-chart-donut', roles: ['admin','ehs_officer','ehs_manager','supervisor','project_director'] },
  { to: '/audits', label: 'Auditor Performance', icon: 'ti-chart-bar', roles: ['admin','ehs_officer','ehs_manager','supervisor','scm_officer','project_director'] },
  { to: '/requests', label: 'PPE Request Trends', icon: 'ti-chart-line', roles: ['admin','ehs_officer','ehs_manager','supervisor','scm_officer','project_director'] },
  { to: '/repeat-requests', label: 'Repeated Requests', icon: 'ti-repeat', roles: ['admin','ehs_officer','ehs_manager','supervisor','scm_officer','project_director'] },
  { to: '/training/dashboard', label: 'Training Dashboard', icon: 'ti-gauge', roles: ['admin','ehs_manager','ehs_officer','supervisor','project_director'] },
  { section: 'Resources', roles: ['admin','ehs_officer','ehs_manager','supervisor','project_director','fleet'] },
  { to: '/employees', label: 'Employees', icon: 'ti-users', exact: true, roles: ['admin','ehs_officer','ehs_manager','supervisor','project_director'] },
  { to: '/outsource', label: 'Outsource', icon: 'ti-users-group', roles: ['admin','supervisor','fleet'] },
  { to: '/casuals', label: 'Casuals', icon: 'ti-user-plus', roles: ['admin','ehs_officer','ehs_manager','supervisor','project_director'] },
  // Company mobile lines. One entry: the module's screens are tabs inside the
  // page, so the sidebar does not carry five near-identical rows.
  { to: '/mobile-lines', label: 'Mobile Lines', icon: 'ti-device-mobile', roles: ['admin','hr','supervisor','project_director'] },
  { to: '/employees/change-log', label: 'Change History', icon: 'ti-list-details', roles: ['admin','hr'] },
  // Who was allocated which PPE, and when it changed. Admin only: it is the
  // record for everyone, not just the people one role happens to manage.
  { to: '/ppe-assignment-history', label: 'PPE Assignment History', icon: 'ti-shield-search', roles: ['admin'], roleLocked: true },
  // Requests, outcomes, renewals, cancellations and restores on training records.
  { to: '/training-history', label: 'Training History', icon: 'ti-certificate-2', roles: ['admin'], roleLocked: true },
  { section: 'Actions', roles: ['admin','ehs_officer','ehs_manager','supervisor','project_director'] },
  { to: '/audit/new', label: 'New Audit', icon: 'ti-clipboard-check', roles: ['admin','ehs_officer','ehs_manager','supervisor'], roleLocked: true },
  { to: '/request-ppe', label: 'Request a PPE/Tool', icon: 'ti-shield-plus', roles: ['admin','ehs_officer','ehs_manager','supervisor','project_director'] },
  { to: '/training/request', label: 'Request a Training', icon: 'ti-certificate', roles: ['admin','ehs_manager'], roleLocked: true },
  { to: '/training/update', label: 'Update Training Records', icon: 'ti-clipboard-text', roles: ['admin','hr'], roleLocked: true },
  { section: 'Trackers', roles: ['admin','ehs_officer','ehs_manager','supervisor','scm_officer','project_director'] },
  { to: '/history', label: 'Audit/Request History', icon: 'ti-history', roles: ['admin','ehs_officer','ehs_manager','supervisor','project_director'] },
  { to: '/ncr', label: 'NCR List', icon: 'ti-alert-triangle', roles: ['admin','ehs_officer','ehs_manager','supervisor','project_director'] },
  { to: '/ppe-tracker', label: 'PPE Request Tracker', icon: 'ti-shield-check', roles: ['admin','ehs_manager','scm_officer','supervisor','ehs_officer','project_director'] },
  { to: '/training/tracker', label: 'Trainings Tracker', icon: 'ti-list-check', roles: ['admin','ehs_manager','ehs_officer','supervisor','project_director'] },
  { section: 'Admin', roles: ['admin'] },
  { to: '/admin', label: 'Admin Panel', icon: 'ti-settings', roles: ['admin'] },
  { to: '/profile', label: 'My Profile', icon: 'ti-user-circle', roles: ['admin','ehs_officer','ehs_manager','supervisor','scm_officer','project_director','fleet','hr'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const areaKey = isOpsPath(pathname) ? 'ops' : 'people';
  const area = AREAS[areaKey];
  // Switching goes through the tile screen rather than a named button, so it
  // keeps working unchanged when more areas are added.
  const canSwitch = userAreas(user).length > 1;
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = areaKey === 'ops' ? OPS_NAV : NAV;

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // The tab title names the area, so two open tabs can be told apart.
  useEffect(() => { document.title = area.name; }, [area.name]);

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  return (
    <div className="layout">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <NavLink to={area.home} className="sidebar-logo" style={{padding:'24px 12px 12px'}}>
          <img src={area.logo} alt={area.name} style={{width:'100%',maxWidth:200,objectFit:'contain'}} />
        </NavLink>

        <nav className="nav">
          {nav.map((item, i) => {
            // A page is visible when the user can actually reach it:
            //  - /profile: anyone signed in
            //  - /admin: admin only (its route uses ProtectedRoute roles=['admin'])
            //  - everything else: gated by page_access, same as PageGuard — so an
            //    admin-assigned page shows regardless of the coarse role list.
            const canSee = (it) =>
              areaKey === 'ops' ? true
              : it.to === '/profile' ? true
              : it.to === '/admin' ? user?.role === 'admin'
              : user?.role === 'admin' ? true
              // Role-locked items (e.g. Update Training Records) are gated by role, not
              // by the per-user page_access grant.
              : it.roleLocked ? (Array.isArray(it.roles) && it.roles.includes(user?.role))
              : Array.isArray(user?.page_access) && user.page_access.includes(it.to);
            if (item.section) {
              // Show a section header only if ≥1 real page under it is visible.
              // /profile is always-on and shouldn't anchor a section (it would
              // otherwise show the "Admin" header for non-admins).
              const children = [];
              for (let j = i + 1; j < nav.length && !nav[j].section; j++) children.push(nav[j]);
              if (!children.some(it => (areaKey === 'ops' || it.to !== '/profile') && canSee(it))) return null;
              return <div key={i} className="nav-section">{item.section}</div>;
            }
            if (!canSee(item)) return null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
<i className={`ti ${item.icon}`} style={{ fontSize: 18 }} aria-hidden="true"></i>
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {/* The way back to the phone shell for anyone who reached a desktop
              page on a phone by following a link. Phone-width only. */}
          {areaKey === 'people' && <MobileViewLink />}
          {menuOpen && (
            <>
              <div className="user-menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="user-menu" role="menu">
                {canSwitch && (
                  <button role="menuitem" autoFocus onClick={() => { setMenuOpen(false); setSidebarOpen(false); navigate('/home'); }}>
                    <i className="ti ti-layout-grid" aria-hidden="true" /> Switch OneHub area
                  </button>
                )}
                <button role="menuitem" autoFocus={!canSwitch} onClick={() => { setMenuOpen(false); logout(); }}>
                  <i className="ti ti-logout" aria-hidden="true" /> Sign out
                </button>
              </div>
            </>
          )}
          <div className="user-chip" role="button" tabIndex={0} aria-haspopup="menu" aria-expanded={menuOpen}
            style={{ flexDirection: 'column', gap: 8, textAlign: 'center' }}
            onClick={() => setMenuOpen(o => !o)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMenuOpen(o => !o); } }}>
            {user?.profile_picture
              ? <img src={user.profile_picture} alt={user.name} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2.5px solid rgba(255,255,255,0.9)', boxShadow: '0 4px 14px rgba(0,0,0,0.35)' }} />
              : <div className="avatar av-green" style={{ width: 64, height: 64, fontSize: 20, border: '2.5px solid rgba(255,255,255,0.9)', boxShadow: '0 4px 14px rgba(0,0,0,0.35)' }}>{initials}</div>
            }
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-role">Egypro</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="main" style={{position:'relative'}}>
        <button className="hamburger" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle menu">&#9776;</button>
        <div style={{position:'relative',zIndex:1,display:'flex',flexDirection:'column',height:'100%'}}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

// Phone-only: clears the "full site" preference and hands the phone back to the
// mobile shell. It listens for resize so rotating or resizing does not leave a
// stale link on a desktop-width window.
function MobileViewLink() {
  const [phone, setPhone] = React.useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  React.useEffect(() => {
    const onResize = () => setPhone(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  if (!phone) return null;
  const go = () => {
    // Clear the old opt-out too: a phone that stored it before the "Full site"
    // button was removed would otherwise keep it forever, unread and harmless
    // but stale.
    try { localStorage.removeItem('onehub_force_desktop'); } catch { /* private mode */ }
    window.location.href = '/m';
  };
  return (
    <button onClick={go} style={{
      width: '100%', marginBottom: 12, minHeight: 44, cursor: 'pointer',
      background: 'rgba(255,255,255,0.10)', color: '#fff',
      border: '1px solid rgba(255,255,255,0.35)', borderRadius: 10,
      fontSize: 13, fontWeight: 600,
    }}>
      <i className="ti ti-device-mobile" style={{ marginRight: 6 }} aria-hidden="true" />
      Mobile view
    </button>
  );
}
