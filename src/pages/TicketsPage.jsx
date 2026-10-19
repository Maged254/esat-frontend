import React, { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';
import PinDetail from '../components/PinDetail';
import PinRows from '../components/PinRows';

// Tickets: pins a supervisor marked "Action needed". PM Coordinators comment
// and close them; a supervisor or PM can reopen one. The Director can see them
// all. Open tickets list Critical first, oldest first within each status.
export default function TicketsPage() {
  const [state, setState] = useState('open');
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get(`/patrol/tickets?state=${state}`).then(r => setRows(r.data)).catch(e => setError(e.response?.data?.error || 'Could not load the tickets.'));
  }, [state]);
  useEffect(() => { setRows(null); load(); }, [load]);

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-breadcrumb">OneHub Operations</span>
          <span className="topbar-sep">›</span>
          <span className="topbar-title">Tickets</span>
        </div>
      </div>
      <div className="content">
        {error && <div className="login-error" role="alert">{error}</div>}
        <div className="seg" style={{ marginBottom: 12 }}>
          <button className={state === 'open' ? 'on' : ''} onClick={() => setState('open')}>Open</button>
          <button className={state === 'closed' ? 'on' : ''} onClick={() => setState('closed')}>Closed</button>
        </div>
        <PinRows pins={rows} onOpen={setOpen} showTicket
          empty={state === 'open' ? 'No open tickets.' : 'No closed tickets yet.'} />
        {open && <PinDetail pinId={open} onClose={() => setOpen(null)} onChanged={load} />}
      </div>
    </>
  );
}
