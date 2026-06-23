import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';

const NAV = [
  { section: 'Overview', roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { to: '/', label: 'Dashboard', icon: 'ti-layout-dashboard', exact: true, roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { to: '/audit-coverage', label: 'Audit Coverage', icon: 'ti-chart-donut', roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { section: 'Operations', roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { to: '/employees', label: 'Employees', icon: 'ti-users', roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { to: '/casuals', label: 'Casuals', icon: 'ti-user-plus', roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { to: '/audit/new', label: 'New Audit', icon: 'ti-clipboard-check', roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { to: '/history', label: 'Audit History', icon: 'ti-history', roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { section: 'Compliance', roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { to: '/ncr', label: 'NCR List', icon: 'ti-alert-triangle', roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { section: 'SCM', roles: ['admin','ehs_manager','scm_officer','supervisor','ehs_officer'] },
  { to: '/ppe-tracker', label: 'PPE Tracker', icon: 'ti-shield-check', roles: ['admin','ehs_manager','scm_officer','supervisor','ehs_officer'] },
  { section: 'Insights', roles: ['admin','ehs_officer','ehs_manager','supervisor','scm_officer'] },
  { to: '/graphs', label: 'Graphs', icon: 'ti-chart-bar', roles: ['admin','ehs_officer','ehs_manager','supervisor','scm_officer'] },
  { section: 'Admin', roles: ['admin'] },
  { to: '/admin', label: 'Admin Panel', icon: 'ti-settings', roles: ['admin'] },
  { to: '/profile', label: 'My Profile', icon: 'ti-user-circle', roles: ['admin','ehs_officer','ehs_manager','supervisor','scm_officer'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  return (
    <div className="layout">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <NavLink to="/" className="sidebar-logo" style={{padding:'12px 0'}}>
          <img src="/esat-logo.png" alt="ESAT" style={{width:'100%',maxWidth:200,objectFit:'contain'}} />
        </NavLink>

        <nav className="nav">
          {NAV.map((item, i) => {
            if (item.section) {
              if (item.roles && !item.roles.includes(user?.role)) return null;
              return <div key={i} className="nav-section">{item.section}</div>;
            }
            if (item.roles && !item.roles.includes(user?.role)) return null;
            if (
              user?.role !== 'admin' &&
              item.to !== '/profile' &&
              !(Array.isArray(user?.page_access) && user.page_access.includes(item.to))
            ) return null;
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
          <div className="user-chip" onClick={() => { if (window.confirm('Sign out?')) logout(); }}>
            {user?.profile_picture
              ? <img src={user.profile_picture} alt={user.name} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              : <div className="avatar av-green" style={{ width: 28, height: 28, fontSize: 10 }}>{initials}</div>
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
        <div style={{position:'relative',zIndex:1}}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
