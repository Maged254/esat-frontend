import React, { useState } from 'react';

export default function PasswordInput({ value, onChange, placeholder, className, style, ...rest }) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <input
        className={className || 'form-input'}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{ paddingRight: 36, ...style }}
        {...rest}
      />
      <i
        className={visible ? 'ti ti-eye-off' : 'ti ti-eye'}
        onClick={() => setVisible(v => !v)}
        title={visible ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          fontSize: 16, color: '#6b7280', cursor: 'pointer',
        }}
      />
    </div>
  );
}
