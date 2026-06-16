import React from 'react';

/**
 * TF9 Badge — inline status/label pill.
 * Variants: default (grey), blue, green, amber, red, purple, command.
 */
export function Badge({ children, variant = 'default', dot = false }) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '12px',
    fontWeight: 600,
    padding: '1px 8px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--sans)',
  };

  const variants = {
    default: { background: 'var(--grey-badge)', color: 'var(--text)' },
    blue:    { background: '#d1f1ff', color: '#033160' },
    green:   { background: '#d4f7d9', color: '#04611b' },
    amber:   { background: '#fff8e1', color: '#7a5200' },
    red:     { background: '#ffe3e3', color: '#9e1515' },
    purple:  { background: '#f0e8ff', color: '#5a2da0' },
    outline: {
      background: 'transparent',
      color: 'var(--text-2)',
      border: '1px solid var(--border)',
    },
  };

  const style = { ...base, ...(variants[variant] || variants.default) };

  return (
    <span style={style}>
      {dot && (
        <span style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: 'currentColor', flexShrink: 0,
        }} />
      )}
      {children}
    </span>
  );
}
