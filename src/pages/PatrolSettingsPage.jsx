import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

// OneHub Operations → Settings (admin): the Route Patrol rules. Each change
// applies straight away; the page says who changed a value last and when.
const GROUPS = [
  {
    title: 'Pins',
    fields: [
      { key: 'pin_max_from_officer_m', label: 'Furthest a pin may be from the officer', help: 'The officer can drag the pin up to this far from where they stand.' },
      { key: 'pin_off_route_m', label: 'Off route beyond', help: 'A pin further than this from every route line is marked Off route. It can still be saved.' },
      { key: 'photos_min', label: 'Fewest photos per pin' },
      { key: 'photos_max', label: 'Most photos per pin' },
    ],
  },
  {
    title: 'Patrols',
    fields: [
      { key: 'patrol_idle_end_hours', label: 'End a patrol after no new pin for', help: 'Patrols also end at midnight, and whenever the officer is signed out.' },
    ],
  },
  {
    title: 'Tracker',
    fields: [
      { key: 'tracker_delayed_min', label: 'Show "Delayed" after no position for' },
      { key: 'tracker_lost_min', label: 'Show "Not tracking" after no position for', help: 'Also the gap after which a path is drawn dashed.' },
      { key: 'tracker_required_to_start', label: 'Tracker must be on to start a patrol' },
      { key: 'tracker_alert', label: 'Alert when a patrol\'s tracker stops', help: 'A bell notification to supervisors, PM Coordinators, the Director and admins.' },
    ],
  },
  {
    title: 'Photos',
    fields: [
      { key: 'photo_retention_days', label: 'Remove photos after', help: 'Photos on a pin whose ticket is still open are kept until it closes. The pin and its details always stay.' },
    ],
  },
  {
    title: 'Emails',
    fields: [
      { key: 'normal_summary_time', label: 'Normal pins summary at', help: 'Once a day, East Africa time.' },
      { key: 'ticket_digest_time', label: 'Tickets summary at', help: 'Once a day, East Africa time. The bell still shows each ticket change straight away.' },
      { key: 'email_mode', label: 'Send patrol emails to' },
      { key: 'email_test_to', label: 'Testing address', help: 'Used while emails are in testing. Each email lists who it would have gone to.' },
    ],
  },
];

const fmtWhen = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '';

export default function PatrolSettingsPage() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [errorKey, setErrorKey] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/patrol/settings').then(r => { setData(r.data); setForm(r.data.values); })
    .catch(e => setError(e.response?.data?.error || 'Could not load the settings.'));
  useEffect(() => { load(); }, []);

  const changed = data ? Object.keys(form).filter(k => String(form[k]) !== String(data.values[k])) : [];

  const save = async () => {
    setError(''); setErrorKey(''); setNotice(''); setSaving(true);
    try {
      const values = Object.fromEntries(changed.map(k => [k, data.defs[k].type === 'int' ? Number(form[k]) : form[k]]));
      await api.put('/patrol/settings', { values });
      await load();
      setNotice(`Saved. ${changed.length} setting${changed.length === 1 ? '' : 's'} changed, in effect now.`);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not save.');
      setErrorKey(e.response?.data?.key || '');
    } finally { setSaving(false); }
  };

  const input = (key) => {
    const d = data.defs[key];
    const common = { id: `set-${key}`, className: 'form-input', value: form[key] ?? '', onChange: e => setForm(f => ({ ...f, [key]: e.target.value })) };
    if (d.type === 'enum' && key === 'email_mode') {
      return (
        <select {...common} className="form-select">
          <option value="test">Testing: the testing address only</option>
          <option value="live">The real people (supervisors, PM Coordinators, Director, admins)</option>
        </select>
      );
    }
    if (d.type === 'enum') {
      return (
        <select {...common} className="form-select" style={{ width: 'auto' }}>
          <option value="on">On</option>
          <option value="off">Off</option>
        </select>
      );
    }
    if (d.type === 'time') return <input {...common} type="text" inputMode="numeric" placeholder="16:00" style={{ width: 110 }} />;
    if (d.type === 'email') return <input {...common} type="email" style={{ maxWidth: 320 }} />;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <input {...common} type="number" min={d.min} max={d.max} step="1" style={{ width: 110 }} />
        {d.unit && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{d.unit}</span>}
      </span>
    );
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub Operations</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Settings</span>
        </div>
      </div>
      <div className="content" style={{ maxWidth: 860 }}>
        {error && <div className="login-error" role="alert">{error}</div>}
        {notice && <div style={{ background: '#EAF3DE', color: '#3B6D11', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{notice}</div>}
        {!data ? <div className="card" style={{ padding: 18 }}>Loading…</div> : (
          <>
            {GROUPS.map(g => (
              <div key={g.title} className="card" style={{ marginBottom: 16 }}>
                <div className="card-header"><span className="card-title">{g.title}</span></div>
                <div style={{ padding: '6px 18px 14px' }}>
                  {g.fields.map(f => {
                    const m = data.meta[f.key];
                    const d = data.defs[f.key];
                    return (
                      <div key={f.key} className="setting-row" style={errorKey === f.key ? { background: '#FFF5F5' } : undefined}>
                        <div style={{ minWidth: 0 }}>
                          <label htmlFor={`set-${f.key}`} style={{ fontWeight: 600, fontSize: 14 }}>{f.label}</label>
                          {f.help && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{f.help}</div>}
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                            {m ? `Changed by ${m.updated_by_name || '—'}, ${fmtWhen(m.updated_at)}` : `Starting value${d.def !== undefined ? `: ${d.def}${d.unit ? ' ' + d.unit : ''}` : ''}`}
                          </div>
                        </div>
                        <div>{input(f.key)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="card" style={{ marginBottom: 16, padding: 18 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Lists</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                <b>Areas</b> and <b>Observation types</b> are kept in the <Link to="/ops/admin">Admin Panel</Link>.
              </p>
            </div>

            <div className="settings-save">
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{changed.length ? `${changed.length} unsaved change${changed.length === 1 ? '' : 's'}` : 'No changes'}</span>
              <button className="btn" disabled={!changed.length || saving} onClick={() => { setForm(data.values); setError(''); setErrorKey(''); }}>Undo</button>
              <button className="btn btn-primary" disabled={!changed.length || saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
