import React from 'react';

/**
 * TF9 CommandBadge — colored badge for Terraform commands.
 * Uses the --command-* token system from tokens/commands.css.
 */
export function CommandBadge({ command, size = 'md' }) {
  const cmd = (command || '').trim().toLowerCase();

  const colorMap = {
    init:           'var(--command-init)',
    plan:           'var(--command-plan)',
    apply:          'var(--command-apply)',
    destroy:        'var(--command-destroy)',
    auto:           'var(--command-auto)',
    validate:       'var(--command-validate)',
    refresh:        'var(--command-refresh)',
    state:          'var(--command-state)',
    'state list':   'var(--command-state)',
    output:         'var(--command-output)',
    import:         'var(--command-import)',
    taint:          'var(--command-taint)',
    untaint:        'var(--command-untaint)',
    'force-unlock': 'var(--command-force-unlock)',
    cost:           'var(--command-cost)',
  };

  const color = colorMap[cmd] || 'var(--text-3)';

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      fontFamily: 'var(--mono)',
      fontSize: size === 'sm' ? '11px' : '12px',
      fontWeight: 700,
      padding: size === 'sm' ? '1px 7px' : '2px 9px',
      borderRadius: '4px',
      whiteSpace: 'nowrap',
      color: color,
      background: `color-mix(in srgb, ${color} 12%, var(--container))`,
      border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
    }}>
      {command || '—'}
    </span>
  );
}
