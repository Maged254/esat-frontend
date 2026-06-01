import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';

const NAV = [
  { section: 'Overview', roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { to: '/', label: 'Dashboard', icon: '⊞', exact: true, roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { section: 'Operations', roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { to: '/employees', label: 'Employees', icon: '👥', roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { to: '/audit/new', label: 'New Audit', icon: '✓', roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { to: '/history', label: 'Audit History', icon: '⏱', roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { section: 'Compliance', roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { to: '/ncr', label: 'NCR List', icon: '⚠', roles: ['admin','ehs_officer','ehs_manager','supervisor'] },
  { section: 'SCM', roles: ['admin','scm_officer'] },
  { to: '/ppe-tracker', label: 'PPE Tracker', icon: '📦', roles: ['admin','scm_officer'] },
  { section: 'Admin', roles: ['admin'] },
  { to: '/admin', label: 'Admin Panel', icon: '⚙', roles: ['admin'] },
  { to: '/profile', label: 'My Profile', icon: '👤', roles: ['admin'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  return (
    <div className="layout">
      <aside className="sidebar">
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
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
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
              <div className="user-role">{user?.role?.replace('_', ' ')} · Egypro</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="main" style={{position:'relative'}}>

        <div style={{position:'relative',zIndex:1}}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
