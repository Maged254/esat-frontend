import React, { useState, useRef, useEffect } from 'react';

export default function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (val) => {
    if (selected.includes(val)) onChange(selected.filter(v => v !== val));
    else onChange([...selected, val]);
  };

  const count = selected.length;

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block'}}>
      <button
        onClick={() => setOpen(p => !p)}
        className="btn"
        style={{height:30,padding:'0 10px',fontSize:12,display:'flex',alignItems:'center',gap:4}}
      >
        {label}{count > 0 ? ' ('+count+')' : ''} <i className="ti ti-chevron-down" style={{fontSize:11}} aria-hidden="true"></i>
      </button>
      {open && (
        <div style={{position:'absolute',top:34,left:0,background:'white',border:'0.5px solid #e5e7eb',borderRadius:8,padding:'6px 0',zIndex:200,minWidth:200,boxShadow:'0 4px 12px rgba(0,0,0,0.08)'}}>
          {options.map(opt => (
            <label key={opt.value} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 12px',fontSize:13,cursor:'pointer',userSelect:'none'}}>
              <input type="checkbox" checked={selected.includes(opt.value)} onChange={()=>toggle(opt.value)} style={{accentColor:'var(--eg-green)',width:14,height:14}} />
              {opt.label}
            </label>
          ))}
          {options.length === 0 && <div style={{padding:'5px 12px',fontSize:13,color:'#9ca3af'}}>No options</div>}
        </div>
      )}
    </div>
  );
}
