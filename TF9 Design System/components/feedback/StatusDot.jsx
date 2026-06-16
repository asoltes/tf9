import React from 'react';

/**
 * TF9 StatusDot — small colored circle for inline status indicators.
 * Optionally animates (pulse) for active/running states.
 */
export function StatusDot({ status = 'neutral', size = 8, pulse = false }) {
  const colorMap = {
    running:  'var(--blue)',
    success:  'var(--green)',
    failed:   'var(--red)',
    warning:  'var(--amber)',
    neutral:  'var(--text-3)',
    prod:     '#e5484d',
    staging:  '#f5a623',
    dev:      '#3fb950',
    global:   '#a371f7',
  };

  const color = colorMap[status] || 'var(--text-3)';

  return (
    <span style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      flexShrink: 0,
      animation: pulse ? 'tf9-pulse 1.1s ease-in-out infinite' : 'none',
    }} />
  );
}
