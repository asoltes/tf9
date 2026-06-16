import React from 'react';

/**
 * TF9 Skeleton — shimmer placeholder for loading states.
 * Renders one or more animated grey bars.
 */
export function Skeleton({ lines = 3, widths, height = 12, gap = 10 }) {
  const lineWidths = widths || Array.from({ length: lines }, (_, i) =>
    i === lines - 1 ? '60%' : '100%'
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {lineWidths.map((w, i) => (
        <div key={i} style={{
          height,
          width: w,
          borderRadius: '6px',
          background: 'var(--surface-3)',
          animation: 'tf9-skeleton 1.4s ease-in-out infinite',
          animationDelay: `${i * 80}ms`,
        }} />
      ))}
    </div>
  );
}
