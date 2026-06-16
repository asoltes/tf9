import React from 'react';

/**
 * TF9 Input — text, password, search field.
 * Matches the 2px border, 8px radius, 32px height from cloudscape.css.
 */
export function Input({
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  mono = false,
  label,
  hint,
  error,
  id,
  ...rest
}) {
  const inputStyle = {
    fontFamily: mono ? 'var(--mono)' : 'var(--sans)',
    fontSize: mono ? '12.5px' : '14px',
    color: 'var(--text)',
    background: 'var(--container)',
    border: `2px solid ${error ? 'var(--red)' : 'var(--input-border)'}`,
    borderRadius: 'var(--radius-i)',
    height: '32px',
    padding: '4px 10px',
    width: '100%',
    outline: 'none',
    transition: 'border-color .1s, box-shadow .1s',
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'text',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '100%' }}>
      {label && (
        <label htmlFor={id} style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)', display: 'block' }}>
          {label}
        </label>
      )}
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        style={inputStyle}
        {...rest}
      />
      {error && <span style={{ fontSize: '12px', color: 'var(--red)' }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>{hint}</span>}
    </div>
  );
}
