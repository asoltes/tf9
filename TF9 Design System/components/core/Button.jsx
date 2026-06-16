import React from 'react';

/**
 * TF9 Button — primary, normal, danger, ghost, link, icon variants.
 * Pill-shaped (border-radius: 20px), 34px default height.
 */
export function Button({
  children,
  variant = 'normal',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  onClick,
  type = 'button',
  ...rest
}) {
  const base = {
    fontFamily: 'var(--sans)',
    fontWeight: 700,
    fontSize: size === 'sm' ? '13px' : '14px',
    lineHeight: '20px',
    borderRadius: 'var(--radius-pill)',
    padding: size === 'sm' ? '2px 14px' : '4px 20px',
    height: size === 'sm' ? '28px' : '34px',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    whiteSpace: 'nowrap',
    border: '2px solid transparent',
    transition: 'background .1s, border-color .1s, color .1s',
    opacity: disabled ? 0.4 : 1,
    textDecoration: 'none',
    background: 'transparent',
  };

  const variants = {
    primary: {
      background: 'var(--blue)',
      color: '#fff',
      borderColor: 'var(--blue)',
    },
    normal: {
      background: 'var(--container)',
      color: 'var(--link)',
      borderColor: 'var(--link)',
    },
    danger: {
      background: 'var(--red)',
      color: '#fff',
      borderColor: 'var(--red)',
    },
    'danger-outline': {
      background: 'transparent',
      color: 'var(--red)',
      borderColor: 'var(--red)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-2)',
      borderColor: 'transparent',
    },
    link: {
      background: 'transparent',
      color: 'var(--link)',
      border: 'none',
      padding: '4px 8px',
      height: 'auto',
    },
    icon: {
      background: 'transparent',
      color: 'var(--text-2)',
      border: 'none',
      borderRadius: '50%',
      width: '32px',
      height: '32px',
      padding: '0',
      justifyContent: 'center',
    },
  };

  const style = { ...base, ...(variants[variant] || variants.normal) };

  return (
    <button type={type} style={style} disabled={disabled || loading} onClick={onClick} {...rest}>
      {loading ? (
        <span style={{
          width: '14px', height: '14px', border: '2px solid currentColor',
          borderTopColor: 'transparent', borderRadius: '50%',
          animation: 'tf9-spin .7s linear infinite', display: 'inline-block',
        }} />
      ) : icon ? (
        <span style={{ display: 'inline-flex', width: '16px', height: '16px' }}>{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
