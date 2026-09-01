import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, Navigate } from 'react-router-dom';
import api, { logError } from '../utils/api';
import { useAuth } from '../utils/AuthContext';
import './mobile.css';

// Which tabs a role can actually act on. The queues are role-gated by the API
// as well -- this only keeps a tab off the bar when tapping it would 403.
export const CAN_EHS = ['admin', 'ehs_manager'];
export const CAN_PM = ['admin', 'project_director'];

const TABS = [
  { to: '/m/ehs', label: 'EHS', icon: 'ti-shield-check', roles: CAN_EHS, badge: 'ehs' },
  { to: '/m/pm', label: 'PM', icon: 'ti-checkbox', roles: CAN_PM, badge: 'pm' },
  { to: '/m/training', label: 'Training', icon: 'ti-certificate', roles: null },
];

const TITLES = {
  '/m/ehs': 'Safety Approvals',
  '/m/pm': 'PM Approvals',
  '/m/training': 'Training Status',
};

export default function MobileLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [counts, setCounts] = useState({ ehs: 0, pm: 0 });

  const tabs = TABS.filter(t => !t.roles || t.roles.includes(user?.role));

  // Queue sizes for the tab badges. pageSize=1 -- only the total is wanted.
  useEffect(() => {
    const load = (status, key) =>
      api.get(`/ncr?status=${status}&page=1&pageSize=1`)
        .then(r => setCounts(c => ({ ...c, [key]: r.data.total || 0 })))
        .catch(logError);
    if (CAN_EHS.includes(user?.role)) load('pending', 'ehs');
    if (CAN_PM.includes(user?.role)) load('pda_pending', 'pm');
  }, [user, pathname]);

  if (pathname === '/m' || pathname === '/m/') {
    return <Navigate to={tabs[0]?.to || '/m/training'} replace />;
  }

  return (
    <div className="m-shell">
      <div className="m-topbar">
        <div>
          <div className="m-topbar-title">{TITLES[pathname] || 'OneHub'}</div>
          <div className="m-topbar-sub">{user?.full_name || user?.name}</div>
        </div>
      </div>

      <div className="m-body"><Outlet /></div>

      <nav className="m-tabs">
        {tabs.map(t => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => 'm-tab' + (isActive ? ' active' : '')}>
            <i className={`ti ${t.icon}`} aria-hidden="true" />
            {!!(t.badge && counts[t.badge]) && <span className="m-tab-badge">{counts[t.badge]}</span>}
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
