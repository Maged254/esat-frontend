import React from 'react';
import { NavLink } from 'react-router-dom';

// The Mobile Lines module is one sidebar entry; its screens are tabs here.
// Each tab lists the roles that may use it, matching the route guard and the
// endpoint behind it — so a tab is never shown that would only lead to a refusal.
const TABS = [
  { to: '/mobile-lines', label: 'Lines Register', end: true, roles: ['admin', 'hr', 'supervisor', 'project_director'] },
  { to: '/mobile-lines/dashboard', label: 'Dashboard', roles: ['admin', 'hr', 'supervisor', 'project_director'] },
  { to: '/mobile-lines/available', label: 'Available Lines', roles: ['admin', 'hr'] },
  { to: '/mobile-lines/change-requests', label: 'Change Requests', roles: ['admin', 'hr', 'supervisor', 'project_director'] },
  { to: '/mobile-lines/operator-email', label: 'Operator Email', roles: ['admin'] },
  { to: '/mobile-lines/catalogue', label: 'Product Catalogue', roles: ['admin'] },
];

export default function MobileLinesTabs() {
  const role = (JSON.parse(localStorage.getItem('esat_user') || '{}')).role;
  const visible = TABS.filter(t => t.roles.includes(role));
  if (visible.length < 2) return null; // nothing to move between

  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e5eaf0', flexWrap: 'wrap' }}>
      {visible.map(t => (
        <NavLink key={t.to} to={t.to} end={t.end}
          className={({ isActive }) => (isActive ? 'ml-tab ml-tab-active' : 'ml-tab')}
          style={({ isActive }) => ({
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: isActive ? 700 : 500,
            color: isActive ? 'var(--eg-navy)' : '#6b7280',
            borderBottom: `2px solid ${isActive ? 'var(--eg-navy)' : 'transparent'}`,
            marginBottom: -1,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          })}>
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
