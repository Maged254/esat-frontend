import React, { useState, useRef, useEffect } from 'react';

export default function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef();

  useEffect(() => {
    const handler = (e) => {
      if (btnRef.current && !btnRef.current.contains(e.target)) {
        const dd = document.getElementById('multiselect-dd-' + label);
        if (dd && !dd.contains(e.target)) setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [label]);

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
    }
    setOpen(p => !p);
  };

  const toggle = (val) => {
    if (selected.includes(val)) onChange(selected.filter(v => v !== val));
    else onChange([...selected, val]);
  };

  return (
    <>
      <button ref={btnRef} onClick={handleOpen} className="btn"
        style={{height:30,padding:'0 10px',fontSize:12,display:'flex',alignItems:'center',gap:4}}>
        {label}{selected.length > 0 ? ' ('+selected.length+')' : ''}
        <i className="ti ti-chevron-down" style={{fontSize:11}} aria-hidden="true"></i>
      </button>
      {open && (
        <div id={'multiselect-dd-' + label} style={{
          position:'fixed', top:pos.top, left:pos.left,
          background:'white', border:'0.5px solid #e5e7eb', borderRadius:8,
          padding:'6px 0', zIndex:9999, minWidth:210,
          boxShadow:'0 4px 16px rgba(0,0,0,0.12)'
        }}>
          {options.map(opt => (
            <label key={opt.value} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 14px',fontSize:13,cursor:'pointer',userSelect:'none'}}>
              <input type="checkbox" checked={selected.includes(opt.value)} onChange={()=>toggle(opt.value)}
                style={{accentColor:'#1d9e75',width:14,height:14,cursor:'pointer'}} />
              {opt.label}
            </label>
          ))}
          {options.length === 0 && <div style={{padding:'6px 14px',fontSize:13,color:'#9ca3af'}}>No options</div>}
        </div>
      )}
    </>
  );
}
