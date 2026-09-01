import React, { useEffect, useState } from 'react';

// A tab left open across a frontend deploy keeps running the old bundle against
// a backend that has moved on -- the phone case especially, where a tab can sit
// in a pocket for days. CRA writes a content-hashed main.js and lists it in
// asset-manifest.json, so comparing the manifest against the bundle this tab
// actually loaded is an exact check for "a new version has shipped".
//
// A backend deploy needs no equivalent: it invalidates every token, so the next
// request signs the user out and they come back on the current bundle.
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

const loadedMainJs = () => {
  const el = document.querySelector('script[src*="/static/js/main."]');
  if (!el) return null;
  try { return new URL(el.src, window.location.origin).pathname; } catch { return null; }
};

export default function UpdateAvailable() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const mine = loadedMainJs();
    if (!mine) return; // dev server: no hashed bundle, nothing to compare

    let stopped = false;
    const check = async () => {
      // Only worth asking when the tab is in front and online; a background tab
      // polling every five minutes is wasted battery on a phone.
      if (stopped || document.hidden || navigator.onLine === false) return;
      try {
        const res = await fetch('/asset-manifest.json', { cache: 'no-store' });
        if (!res.ok) return;
        const manifest = await res.json();
        const current = manifest?.files?.['main.js'];
        if (current && current !== mine) setStale(true);
      } catch { /* offline or the file moved -- say nothing rather than nag */ }
    };

    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', check);
    return () => { stopped = true; clearInterval(id); document.removeEventListener('visibilitychange', check); };
  }, []);

  if (!stale) return null;

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9998,
      background: '#0F2A4A', color: '#fff',
      padding: `12px 16px calc(12px + env(safe-area-inset-bottom))`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      fontSize: 13, boxShadow: '0 -4px 16px rgba(0,0,0,0.25)',
    }}>
      <span>A newer version of OneHub is available.</span>
      <button
        onClick={() => window.location.reload(true)}
        style={{
          minHeight: 36, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
          background: '#fff', color: '#0F2A4A', border: 0, fontSize: 13, fontWeight: 700,
        }}>
        Reload
      </button>
    </div>
  );
}
