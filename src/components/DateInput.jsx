import React, { useEffect, useRef, useState } from 'react';

// Day-first date field.
//
// A native <input type="date"> always renders in the BROWSER's locale, which
// shows mm/dd/yyyy on a US profile -- there is no attribute or CSS that changes
// it. Every date ESAT displays is dd/mm/yyyy (toLocaleDateString('en-GB')), so
// the inputs have to match. This renders a dd/mm/yyyy text field and keeps the
// native calendar behind a button.
//
// `value` and `onChange` speak ISO yyyy-mm-dd, exactly like the input it
// replaces, so callers need no other changes.

const isoToDisplay = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return (y && m && d) ? `${d}/${m}/${y}` : '';
};

// Returns ISO for a complete, real dd/mm/yyyy -- '' for anything else.
const displayToIso = (txt) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(txt);
  if (!m) return '';
  const [, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  // Date silently rolls 31/02 over to 03/03, so check the parts survived.
  if (isNaN(d.getTime()) || d.getDate() !== +dd || d.getMonth() + 1 !== +mm) return '';
  return `${yyyy}-${mm}-${dd}`;
};

// Digits in, dd/mm/yyyy out -- the slashes appear as you type.
const maskDigits = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += '/' + digits.slice(2, 4);
  if (digits.length > 4) out += '/' + digits.slice(4, 8);
  return out;
};

export default function DateInput({
  value, onChange, className = 'form-input', style, disabled, readOnly, ...rest
}) {
  const [text, setText] = useState(isoToDisplay(value));
  const picker = useRef(null);

  // Follow the form when it resets or loads an existing record.
  useEffect(() => { setText(isoToDisplay(value)); }, [value]);

  // An incomplete or impossible date reports '' so the form stays invalid
  // rather than silently holding the previous value.
  const handleText = (raw) => {
    const masked = maskDigits(raw);
    setText(masked);
    onChange(displayToIso(masked));
  };

  const openPicker = () => {
    const el = picker.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  };

  const incomplete = text.length > 0 && !displayToIso(text);

  if (readOnly) {
    return <input className={className} value={text} readOnly style={style} {...rest} />;
  }

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <input
        className={className}
        value={text}
        onChange={e => handleText(e.target.value)}
        placeholder="dd/mm/yyyy"
        inputMode="numeric"
        disabled={disabled}
        aria-invalid={incomplete || undefined}
        style={{ ...style, paddingRight: 34, ...(incomplete ? { borderColor: '#e24b4a' } : null) }}
        {...rest}
      />
      <button type="button" onClick={openPicker} disabled={disabled} title="Open calendar"
        aria-label="Open calendar"
        style={{
          position: 'absolute', right: 6, background: 'none', border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 14, lineHeight: 1,
          padding: 2, color: '#6b7280',
        }}>📅</button>
      {/* Transparent, but still laid out -- showPicker() refuses to open on an
          element that is not being rendered. */}
      <input ref={picker} type="date" tabIndex={-1} aria-hidden="true"
        value={value || ''} onChange={e => onChange(e.target.value)}
        style={{ position: 'absolute', right: 6, width: 18, height: 18, opacity: 0, pointerEvents: 'none' }} />
    </div>
  );
}
