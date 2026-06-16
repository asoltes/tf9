import React from 'react';

/**
 * TF9 RunStatus — icon + colored label for run/operation status.
 * Covers all TF9 run states: running, success, partial_success, failed, cancelled, denied.
 */
export function RunStatus({ status, showIcon = true, size = 'md' }) {
  const s = (status || '').toLowerCase();

  const config = {
    running:        { color: 'var(--blue)',   label: 'Running',        icon: 'spin' },
    success:        { color: 'var(--green)',  label: 'Success',        icon: 'check' },
    partial_success:{ color: 'var(--amber)',  label: 'Partial Success',icon: 'warn' },
    failed:         { color: 'var(--red)',    label: 'Failed',         icon: 'x' },
    cancelled:      { color: 'var(--text-2)', label: 'Cancelled',      icon: 'stop' },
    denied:         { color: 'var(--amber)',  label: 'Denied',         icon: 'warn' },
  };

  const { color, label, icon } = config[s] || { color: 'var(--text-3)', label: status || '—', icon: null };
  const sz = size === 'sm' ? 13 : 15;

  const icons = {
    spin: (
      <span style={{
        width: sz, height: sz, border: '2px solid currentColor',
        borderTopColor: 'transparent', borderRadius: '50%',
        display: 'inline-block', animation: 'tf9-spin .7s linear infinite',
      }} />
    ),
    check: (
      <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    x: (
      <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ),
    warn: (
      <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    stop: (
      <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      </svg>
    ),
  };

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '7px',
      fontSize: size === 'sm' ? '12px' : '12.5px',
      fontWeight: 600, color,
    }}>
      {showIcon && icon && icons[icon]}
      {label}
    </span>
  );
}
