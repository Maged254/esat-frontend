import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../utils/api';

// One pin, opened from the Review Queue or Tickets: photos, where it is, what
// was reported, and its full history (who did what, when). The buttons shown
// are the ones the server says this person may use right now (pin.can).

export const STATUS = {
  critical: { label: 'Critical', colour: '#E24B4A', bg: '#FCEBEB', text: '#A32D2D' },
  medium: { label: 'Medium', colour: '#EF9F27', bg: '#FAEEDA', text: '#854F0B' },
  normal: { label: 'Normal', colour: '#1D9E75', bg: '#E3F4EC', text: '#0F6E56' },
};
export const REVIEW = {
  awaiting_review: { label: 'Awaiting review', cls: 'tag-amber' },
  no_action: { label: 'No action', cls: 'tag-gray' },
  action_needed: { label: 'Action needed', cls: 'tag-red' },
};
export const TICKET = { open: { label: 'Ticket open', cls: 'tag-red' }, closed: { label: 'Ticket closed', cls: 'tag-green' } };

export const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

export function StatusChip({ status }) {
  const s = STATUS[status];
  if (!s) return null;
  return <span className="tag" style={{ background: s.bg, color: s.text, fontWeight: 600 }}>{s.label}</span>;
}

const ACTION_TEXT = {
  created: 'Pin added',
  reviewed: (d) => d.bulk ? 'Confirmed as No action (Confirm all Normal)' : `Reviewed: ${d.decision === 'action_needed' ? 'Action needed' : 'No action'}`,
  decision_changed: (d) => `Decision changed to ${d.decision === 'action_needed' ? 'Action needed' : 'No action'}`,
  ticket_opened: 'Ticket opened',
  ticket_comment: 'Comment',
  ticket_closed: 'Ticket closed',
  ticket_reopened: 'Ticket reopened',
};
const eventText = (e) => {
  const t = ACTION_TEXT[e.action];
  return typeof t === 'function' ? t(e.detail || {}) : (t || e.action);
};

export default function PinDetail({ pinId, onClose, onChanged }) {
  const [pin, setPin] = useState(null);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState(null); // full-size viewer

  useEffect(() => {
    setPin(null); setError(''); setComment('');
    api.get(`/patrol/pins/${pinId}`).then(r => setPin(r.data)).catch(e => setError(e.response?.data?.error || 'Could not load the pin.'));
  }, [pinId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { if (photo) setPhoto(null); else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photo, onClose]);

  const act = async (path, body) => {
    setError(''); setBusy(true);
    try {
      const r = await api.post(`/patrol/pins/${pinId}/${path}`, body);
      setPin(r.data); setComment('');
      onChanged?.(r.data);
    } catch (e) { setError(e.response?.data?.error || 'Could not save. Please try again.'); }
    finally { setBusy(false); }
  };

  const decide = (decision) => {
    if (decision === 'action_needed' && !window.confirm('Mark as Action needed? This opens a ticket for the PM Coordinators.')) return;
    act('review', { decision, comment: comment.trim() });
  };

  // Rendered at the top of the page: inside the layout it would sit under the
  // phone menu button, which is stacked above the main content.
  return createPortal(
    <div className="pin-drawer-backdrop" onClick={onClose}>
      <aside className="pin-drawer" role="dialog" aria-label="Pin details" onClick={e => e.stopPropagation()}>
        <div className="pin-drawer-head">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--eg-navy-dark)' }}>{pin?.name || 'Pin'}</div>
            {pin && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{pin.officer_name} · {fmtDateTime(pin.created_at)}</div>}
          </div>
          <button className="pin-drawer-close" onClick={onClose} aria-label="Close"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>

        {error && <div className="login-error" role="alert">{error}</div>}
        {!pin && !error && <div style={{ padding: 16, fontSize: 13 }}>Loading…</div>}

        {pin && (
          <div className="pin-drawer-body">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <StatusChip status={pin.status} />
              <span className={`tag ${REVIEW[pin.review_status]?.cls || 'tag-gray'}`}>{REVIEW[pin.review_status]?.label}</span>
              {pin.ticket_status && <span className={`tag ${TICKET[pin.ticket_status].cls}`}>{TICKET[pin.ticket_status].label}</span>}
              {pin.off_route && <span className="tag" style={{ background: '#EDE9FE', color: '#6D28D9' }}>Off route</span>}
              {pin.tracker_silent && <span className="tag" style={{ background: '#FCEBEB', color: '#A32D2D' }} title="The tracker had sent no position for a while when this pin was added">⚠ Tracker silent</span>}
            </div>

            <div className="pin-photos">
              {pin.photos.map(ph => ph.thumb_url
                ? <button key={ph.id} onClick={() => setPhoto(ph)} aria-label={`Open photo ${ph.position}`}><img src={ph.thumb_url} alt={`Photo ${ph.position}`} /></button>
                : <div key={ph.id} className="pin-photo-gone">Photo removed after 2 months</div>)}
            </div>

            <dl className="pin-facts">
              <dt>Observation</dt><dd>{pin.observation_label}</dd>
              {pin.location_note && <><dt>Location guidance</dt><dd>{pin.location_note}</dd></>}
              <dt>Nearest link</dt><dd>{pin.nearest_route_name ? `${pin.nearest_route_name}${pin.nearest_route_area ? ` (${pin.nearest_route_area})` : ''} · ${Math.round(pin.distance_to_route_m)} m away` : '—'}</dd>
              <dt>Nearest site</dt><dd>{pin.nearest_site_name ? `${pin.nearest_site_name} · ${Math.round(pin.nearest_site_distance_m)} m away` : '—'}</dd>
              <dt>Position</dt>
              <dd>
                {pin.lat.toFixed(6)}, {pin.lon.toFixed(6)}{' '}
                <a href={`https://www.google.com/maps?q=${pin.lat},${pin.lon}`} target="_blank" rel="noreferrer">Open in Google Maps</a>
              </dd>
              <dt>Officer</dt><dd>{pin.officer_name}, {Math.round(pin.distance_from_officer_m)} m from the pin</dd>
            </dl>

            {/* Actions */}
            {(pin.can.review || pin.can.comment || pin.can.close || pin.can.reopen) && (
              <div className="pin-actions">
                <label className="form-label" htmlFor="pin-comment">
                  {pin.can.review ? 'Comment (optional)' : pin.can.reopen ? 'Why reopen?' : 'Comment'}
                </label>
                <textarea id="pin-comment" className="form-input" rows={3} value={comment} onChange={e => setComment(e.target.value)}
                  placeholder={pin.can.close ? 'What is being done, or how it was resolved' : ''} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {pin.can.review && pin.review_status === 'awaiting_review' && (
                    <button className="btn btn-secondary" disabled={busy} onClick={() => decide('no_action')}>No action</button>
                  )}
                  {pin.can.review && (
                    <button className="btn btn-primary" style={{ background: '#E24B4A', borderColor: '#E24B4A' }} disabled={busy} onClick={() => decide('action_needed')}>
                      {pin.review_status === 'no_action' ? 'Change to Action needed' : 'Action needed'}
                    </button>
                  )}
                  {pin.can.comment && <button className="btn btn-secondary" disabled={busy || !comment.trim()} onClick={() => act('ticket/comment', { comment })}>Add comment</button>}
                  {pin.can.close && <button className="btn btn-primary" disabled={busy || !comment.trim()} onClick={() => act('ticket/close', { comment })}>Close ticket</button>}
                  {pin.can.reopen && <button className="btn btn-secondary" disabled={busy || !comment.trim()} onClick={() => act('ticket/reopen', { comment })}>Reopen ticket</button>}
                </div>
              </div>
            )}

            <div>
              <div className="form-label" style={{ marginBottom: 6 }}>History</div>
              <ol className="pin-history">
                {pin.events.map(e => (
                  <li key={e.id}>
                    <div><b>{eventText(e)}</b> · {e.user_name || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDateTime(e.created_at)}</div>
                    {e.detail?.comment && <div className="pin-history-comment">{e.detail.comment}</div>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </aside>

      {photo && (
        <div className="pin-photo-viewer" onClick={e => { e.stopPropagation(); setPhoto(null); }}>
          <img src={photo.url} alt={`Photo ${photo.position} full size`} />
          <span>Tap anywhere to close</span>
        </div>
      )}
    </div>,
    document.body,
  );
}
