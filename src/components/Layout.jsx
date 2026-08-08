import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';

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
  { to: '/employees/change-log', label: 'Change History', icon: 'ti-list-details', roles: ['admin','hr'] },
  { section: 'Operations', roles: ['admin','ehs_officer','ehs_manager','supervisor','project_director'] },
  { to: '/audit/new', label: 'New Audit', icon: 'ti-clipboard-check', roles: ['admin','ehs_officer','ehs_manager','supervisor','project_director'] },
  { to: '/request-ppe', label: 'Request a PPE/Tool', icon: 'ti-shield-plus', roles: ['admin','ehs_officer','ehs_manager','supervisor','project_director'] },
  { to: '/training/request', label: 'Request a Training', icon: 'ti-certificate', roles: ['admin','ehs_manager'] },
  { to: '/training/update', label: 'Update Training Records', icon: 'ti-clipboard-text', roles: ['admin','hr'] },
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

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  return (
    <div className="layout">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <NavLink to="/" className="sidebar-logo" style={{padding:'12px 0'}}>
          <img src="/onehub-logo.jpg" alt="OneHub" style={{width:'100%',maxWidth:200,objectFit:'contain'}} />
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
          <div className="user-chip" style={{ flexDirection: 'column', gap: 8, textAlign: 'center' }} onClick={() => { if (window.confirm('Sign out?')) logout(); }}>
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
