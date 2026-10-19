import React from 'react';
import { useAuth } from '../utils/AuthContext';
import { patrolRoleLabel } from '../utils/areas';

// Landing page of OneHub Operations. Route Patrol is delivered in stages; this
// page says plainly what exists today and what is on the way, so nobody opening
// the area early mistakes an empty screen for a broken one.
const STAGES = [
  { title: 'Routes', text: 'Planners upload the KMZ route files for each 3-month cycle, and the routes appear on the map.' },
  { title: 'Patrol on the phone', text: 'Officers start a patrol, drop pins with 1 to 3 photos, and pick a status: Critical, Medium or Normal.' },
  { title: 'Live tracking', text: 'The tracker app on each phone sends its position, so the path driven shows on the map.' },
  { title: 'Review and tickets', text: 'Supervisors review pins. Action needed opens a ticket for the PM Coordinators to close.' },
  { title: 'Notifications', text: 'Instant alerts for Critical and Medium pins, and an hourly summary for Normal ones.' },
  { title: 'Dashboards and settings', text: 'Coverage, open tickets and reports, plus every rule adjustable by the admin.' },
];

export default function OpsHomePage() {
  const { user } = useAuth();
  const roleLabel = user?.role === 'admin' && !user?.patrol_role ? 'Admin' : patrolRoleLabel(user?.patrol_role);

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub Operations</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Route Patrol</span>
        </div>
      </div>
      <div className="content">
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body" style={{ padding: 22 }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--eg-navy-dark)' }}>Route Patrol is being set up</div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 6, maxWidth: 640 }}>
              The pages below arrive one at a time. Each shows up in the menu on the left as soon as it is ready.
            </p>
            {roleLabel && (
              <p style={{ fontSize: 13, marginTop: 12 }}>
                Your Operations role: <span className="tag tag-navy">{roleLabel}</span>
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {STAGES.map(s => (
            <div key={s.title} className="card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{s.title}</span>
                <span className="tag tag-gray">Coming</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
