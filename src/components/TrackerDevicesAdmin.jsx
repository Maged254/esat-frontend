import React, { useEffect, useState } from 'react';
import api, { logError } from '../utils/api';

// Admin Panel card: each patrol officer's tracker (Traccar Client on their
// company phone). The QR code fills in the app's server URL, device id and
// settings in one scan, so a phone can be set up before it is handed out.
// The QR library loads only when this card is opened.
const QR_SRC = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
let qrLoading = null;
const loadQr = () => {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!qrLoading) {
    qrLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = QR_SRC; s.async = true;
      s.onload = () => resolve(window.qrcode);
      s.onerror = () => { qrLoading = null; reject(new Error('QR code could not load')); };
      document.head.appendChild(s);
    });
  }
  return qrLoading;
};

const STATE = {
  tracking: ['Tracking', 'tag-green'], delayed: ['Delayed', 'tag-amber'],
  lost: ['Not tracking', 'tag-red'], not_set_up: ['Never reported', 'tag-gray'],
};
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

function QrImage({ text }) {
  const [svg, setSvg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    loadQr().then(qrcode => {
      const q = qrcode(0, 'M');
      q.addData(text);
      q.make();
      setSvg(q.createSvgTag({ cellSize: 6, margin: 4, scalable: true }));
    }).catch(e => setErr(e.message));
  }, [text]);
  if (err) return <div style={{ color: '#A32D2D', fontSize: 13 }}>{err}</div>;
  // The svg comes from the QR library, built from our own text.
  return <div className="tracker-qr" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export default function TrackerDevicesAdmin() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [show, setShow] = useState(null); // device row shown as a QR

  const load = () => api.get('/patrol/tracker/devices').then(r => setData(r.data)).catch(logError);
  useEffect(() => { if (open) load(); }, [open]);

  const renew = async (d) => {
    if (!window.confirm(`Give ${d.full_name} a new device identifier? The phone set up with the old one stops reporting until it is set up again.`)) return;
    try {
      const r = await api.post(`/patrol/tracker/devices/${d.user_id}/new`);
      setData(prev => ({ ...prev, devices: prev.devices.map(x => x.user_id === d.user_id ? { ...x, device_key: r.data.device_key, qr_text: r.data.qr_text, status: 'not_set_up', last_seen_at: null } : x) }));
    } catch (e) { alert(e.response?.data?.error || 'Could not issue a new identifier.'); }
  };

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <span className="card-title">Route Patrol Trackers</span>
        <span style={{ fontSize: 18, color: '#6b7280' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && <>
        <div style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>
          One tracker per Patrol Officer. In <b>Traccar Client</b>, tap the scan icon (top right of Settings) and scan the officer's QR code. That fills in everything. Then switch the service on.
        </div>
        {!data ? <div style={{ fontSize: 13 }}>Loading…</div> : (
          <table>
            <thead><tr><th>Officer</th><th>Device identifier</th><th>Status</th><th>Last report</th><th></th></tr></thead>
            <tbody>
              {data.devices.map(d => (
                <tr key={d.user_id}>
                  <td style={{ fontWeight: 500 }}>{d.full_name}</td>
                  <td><code style={{ fontSize: 13 }}>{d.device_key}</code></td>
                  <td><span className={`tag ${STATE[d.status]?.[1] || 'tag-gray'}`}>{STATE[d.status]?.[0] || d.status}</span></td>
                  <td style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {fmtDateTime(d.last_seen_at)}{d.last_battery != null ? ` · ${Math.round(d.last_battery)}%` : ''}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setShow(d)}>Show QR</button>
                      <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => renew(d)}>New ID</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!data.devices.length && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>No Patrol Officers yet. Give someone the Patrol Officer role in User Management.</td></tr>}
            </tbody>
          </table>
        )}
      </>}

      {show && (
        <div className="pin-drawer-backdrop" style={{ justifyContent: 'center', alignItems: 'center' }} onClick={() => setShow(null)}>
          <div className="tracker-qr-card" role="dialog" aria-label={`Tracker QR code for ${show.full_name}`} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--eg-navy-dark)' }}>{show.full_name}</div>
            <QrImage text={show.qr_text} />
            <ol className="tracker-steps">
              <li>Open <b>Traccar Client</b> → <b>Settings</b>.</li>
              <li>Tap the <b>scan</b> icon at the top right and scan this code.</li>
              <li>Check <b>Device identifier</b> shows <code>{show.device_key}</code>.</li>
              <li>Go back and switch the service <b>on</b>. Allow location <b>all the time</b>.</li>
            </ol>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Sets: high accuracy, a position every 50 m, and every 60 s while standing still.</div>
            <button className="btn btn-primary" onClick={() => setShow(null)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
