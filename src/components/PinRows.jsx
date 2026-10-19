import React from 'react';
import { StatusChip, REVIEW, TICKET, fmtDateTime } from './PinDetail';

// A list of pins as tappable rows: works on a desk and on a supervisor's phone.
export default function PinRows({ pins, onOpen, empty, showTicket }) {
  if (!pins) return <div className="card" style={{ padding: 18, fontSize: 13 }}>Loading…</div>;
  if (!pins.length) return <div className="card" style={{ padding: 18, fontSize: 13, color: 'var(--text-secondary)' }}>{empty}</div>;
  return (
    <div className="pin-rows">
      {pins.map(p => (
        <button key={p.id} className="pin-row" onClick={() => onOpen(p.id)}>
          <span className="pin-row-dot" style={{ background: p.status === 'critical' ? '#E24B4A' : p.status === 'medium' ? '#EF9F27' : '#1D9E75' }} />
          <span className="pin-row-main">
            <span className="pin-row-title">{p.name}</span>
            <span className="pin-row-sub">
              {p.observation_label} · {p.officer_name} · {fmtDateTime(showTicket && p.ticket_status === 'closed' ? p.ticket_closed_at : p.created_at)}
              {p.nearest_route_name ? ` · ${p.nearest_route_name}` : ''}
            </span>
            {p.last_comment && <span className="pin-row-comment">“{p.last_comment}”</span>}
          </span>
          <span className="pin-row-tags">
            <StatusChip status={p.status} />
            {showTicket && p.ticket_status
              ? <span className={`tag ${TICKET[p.ticket_status].cls}`}>{TICKET[p.ticket_status].label}</span>
              : <span className={`tag ${REVIEW[p.review_status]?.cls || 'tag-gray'}`}>{REVIEW[p.review_status]?.label}</span>}
            {p.off_route && <span className="tag" style={{ background: '#EDE9FE', color: '#6D28D9' }}>Off route</span>}
            {p.tracker_silent && <span className="tag" style={{ background: '#FCEBEB', color: '#A32D2D' }} title="The tracker had sent no position for a while when this pin was added">⚠ Tracker silent</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
