/* @ds-bundle: {"format":3,"namespace":"TF9DesignSystem_9faff0","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"CommandBadge","sourcePath":"components/data/CommandBadge.jsx"},{"name":"RunStatus","sourcePath":"components/data/RunStatus.jsx"},{"name":"Skeleton","sourcePath":"components/feedback/Skeleton.jsx"},{"name":"StatusDot","sourcePath":"components/feedback/StatusDot.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"b8452551dc43","components/core/Button.jsx":"00ae5dc925ca","components/core/Input.jsx":"e5cde4c8fb27","components/data/CommandBadge.jsx":"979a90dd20f8","components/data/RunStatus.jsx":"f2e73f31034a","components/feedback/Skeleton.jsx":"b35ad3cbf3b4","components/feedback/StatusDot.jsx":"dca999942aa4","ui_kits/tf9/Dashboard.jsx":"d944b8d3cb44","ui_kits/tf9/RunHistory.jsx":"4975e5098d4b","ui_kits/tf9/Shell.jsx":"4832685a4914","ui_kits/tf9/data.js":"41b7dd58ee04"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.TF9DesignSystem_9faff0 = window.TF9DesignSystem_9faff0 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
/**
 * TF9 Badge — inline status/label pill.
 * Variants: default (grey), blue, green, amber, red, purple, command.
 */
function Badge({
  children,
  variant = 'default',
  dot = false
}) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '12px',
    fontWeight: 600,
    padding: '1px 8px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--sans)'
  };
  const variants = {
    default: {
      background: 'var(--grey-badge)',
      color: 'var(--text)'
    },
    blue: {
      background: '#d1f1ff',
      color: '#033160'
    },
    green: {
      background: '#d4f7d9',
      color: '#04611b'
    },
    amber: {
      background: '#fff8e1',
      color: '#7a5200'
    },
    red: {
      background: '#ffe3e3',
      color: '#9e1515'
    },
    purple: {
      background: '#f0e8ff',
      color: '#5a2da0'
    },
    outline: {
      background: 'transparent',
      color: 'var(--text-2)',
      border: '1px solid var(--border)'
    }
  };
  const style = {
    ...base,
    ...(variants[variant] || variants.default)
  };
  return /*#__PURE__*/React.createElement("span", {
    style: style
  }, dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: 'currentColor',
      flexShrink: 0
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * TF9 Button — primary, normal, danger, ghost, link, icon variants.
 * Pill-shaped (border-radius: 20px), 34px default height.
 */
function Button({
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
    background: 'transparent'
  };
  const variants = {
    primary: {
      background: 'var(--blue)',
      color: '#fff',
      borderColor: 'var(--blue)'
    },
    normal: {
      background: 'var(--container)',
      color: 'var(--link)',
      borderColor: 'var(--link)'
    },
    danger: {
      background: 'var(--red)',
      color: '#fff',
      borderColor: 'var(--red)'
    },
    'danger-outline': {
      background: 'transparent',
      color: 'var(--red)',
      borderColor: 'var(--red)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-2)',
      borderColor: 'transparent'
    },
    link: {
      background: 'transparent',
      color: 'var(--link)',
      border: 'none',
      padding: '4px 8px',
      height: 'auto'
    },
    icon: {
      background: 'transparent',
      color: 'var(--text-2)',
      border: 'none',
      borderRadius: '50%',
      width: '32px',
      height: '32px',
      padding: '0',
      justifyContent: 'center'
    }
  };
  const style = {
    ...base,
    ...(variants[variant] || variants.normal)
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    style: style,
    disabled: disabled || loading,
    onClick: onClick
  }, rest), loading ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: '14px',
      height: '14px',
      border: '2px solid currentColor',
      borderTopColor: 'transparent',
      borderRadius: '50%',
      animation: 'tf9-spin .7s linear infinite',
      display: 'inline-block'
    }
  }) : icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      width: '16px',
      height: '16px'
    }
  }, icon) : null, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * TF9 Input — text, password, search field.
 * Matches the 2px border, 8px radius, 32px height from cloudscape.css.
 */
function Input({
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
    boxSizing: 'border-box'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '5px',
      width: '100%'
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: id,
    style: {
      fontWeight: 700,
      fontSize: '13px',
      color: 'var(--text)',
      display: 'block'
    }
  }, label), /*#__PURE__*/React.createElement("input", _extends({
    id: id,
    type: type,
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    disabled: disabled,
    style: inputStyle
  }, rest)), error && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: 'var(--red)'
    }
  }, error), hint && !error && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: 'var(--text-2)'
    }
  }, hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/data/CommandBadge.jsx
try { (() => {
/**
 * TF9 CommandBadge — colored badge for Terraform commands.
 * Uses the --command-* token system from tokens/commands.css.
 */
function CommandBadge({
  command,
  size = 'md'
}) {
  const cmd = (command || '').trim().toLowerCase();
  const colorMap = {
    init: 'var(--command-init)',
    plan: 'var(--command-plan)',
    apply: 'var(--command-apply)',
    destroy: 'var(--command-destroy)',
    auto: 'var(--command-auto)',
    validate: 'var(--command-validate)',
    refresh: 'var(--command-refresh)',
    state: 'var(--command-state)',
    'state list': 'var(--command-state)',
    output: 'var(--command-output)',
    import: 'var(--command-import)',
    taint: 'var(--command-taint)',
    untaint: 'var(--command-untaint)',
    'force-unlock': 'var(--command-force-unlock)',
    cost: 'var(--command-cost)'
  };
  const color = colorMap[cmd] || 'var(--text-3)';
  return /*#__PURE__*/React.createElement("span", {
    style: {
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
      border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`
    }
  }, command || '—');
}
Object.assign(__ds_scope, { CommandBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/CommandBadge.jsx", error: String((e && e.message) || e) }); }

// components/data/RunStatus.jsx
try { (() => {
/**
 * TF9 RunStatus — icon + colored label for run/operation status.
 * Covers all TF9 run states: running, success, partial_success, failed, cancelled, denied.
 */
function RunStatus({
  status,
  showIcon = true,
  size = 'md'
}) {
  const s = (status || '').toLowerCase();
  const config = {
    running: {
      color: 'var(--blue)',
      label: 'Running',
      icon: 'spin'
    },
    success: {
      color: 'var(--green)',
      label: 'Success',
      icon: 'check'
    },
    partial_success: {
      color: 'var(--amber)',
      label: 'Partial Success',
      icon: 'warn'
    },
    failed: {
      color: 'var(--red)',
      label: 'Failed',
      icon: 'x'
    },
    cancelled: {
      color: 'var(--text-2)',
      label: 'Cancelled',
      icon: 'stop'
    },
    denied: {
      color: 'var(--amber)',
      label: 'Denied',
      icon: 'warn'
    }
  };
  const {
    color,
    label,
    icon
  } = config[s] || {
    color: 'var(--text-3)',
    label: status || '—',
    icon: null
  };
  const sz = size === 'sm' ? 13 : 15;
  const icons = {
    spin: /*#__PURE__*/React.createElement("span", {
      style: {
        width: sz,
        height: sz,
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        display: 'inline-block',
        animation: 'tf9-spin .7s linear infinite'
      }
    }),
    check: /*#__PURE__*/React.createElement("svg", {
      width: sz,
      height: sz,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2.5",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("polyline", {
      points: "20 6 9 17 4 12"
    })),
    x: /*#__PURE__*/React.createElement("svg", {
      width: sz,
      height: sz,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2.5",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("line", {
      x1: "18",
      y1: "6",
      x2: "6",
      y2: "18"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "6",
      y1: "6",
      x2: "18",
      y2: "18"
    })),
    warn: /*#__PURE__*/React.createElement("svg", {
      width: sz,
      height: sz,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "12",
      y1: "9",
      x2: "12",
      y2: "13"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "12",
      y1: "17",
      x2: "12.01",
      y2: "17"
    })),
    stop: /*#__PURE__*/React.createElement("svg", {
      width: sz,
      height: sz,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "3",
      width: "18",
      height: "18",
      rx: "2",
      ry: "2"
    }))
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '7px',
      fontSize: size === 'sm' ? '12px' : '12.5px',
      fontWeight: 600,
      color
    }
  }, showIcon && icon && icons[icon], label);
}
Object.assign(__ds_scope, { RunStatus });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/RunStatus.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Skeleton.jsx
try { (() => {
/**
 * TF9 Skeleton — shimmer placeholder for loading states.
 * Renders one or more animated grey bars.
 */
function Skeleton({
  lines = 3,
  widths,
  height = 12,
  gap = 10
}) {
  const lineWidths = widths || Array.from({
    length: lines
  }, (_, i) => i === lines - 1 ? '60%' : '100%');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap
    }
  }, lineWidths.map((w, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      height,
      width: w,
      borderRadius: '6px',
      background: 'var(--surface-3)',
      animation: 'tf9-skeleton 1.4s ease-in-out infinite',
      animationDelay: `${i * 80}ms`
    }
  })));
}
Object.assign(__ds_scope, { Skeleton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Skeleton.jsx", error: String((e && e.message) || e) }); }

// components/feedback/StatusDot.jsx
try { (() => {
/**
 * TF9 StatusDot — small colored circle for inline status indicators.
 * Optionally animates (pulse) for active/running states.
 */
function StatusDot({
  status = 'neutral',
  size = 8,
  pulse = false
}) {
  const colorMap = {
    running: 'var(--blue)',
    success: 'var(--green)',
    failed: 'var(--red)',
    warning: 'var(--amber)',
    neutral: 'var(--text-3)',
    prod: '#e5484d',
    staging: '#f5a623',
    dev: '#3fb950',
    global: '#a371f7'
  };
  const color = colorMap[status] || 'var(--text-3)';
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      flexShrink: 0,
      animation: pulse ? 'tf9-pulse 1.1s ease-in-out infinite' : 'none'
    }
  });
}
Object.assign(__ds_scope, { StatusDot });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/StatusDot.jsx", error: String((e && e.message) || e) }); }

// ui_kits/tf9/Dashboard.jsx
try { (() => {
// TF9 Dashboard — Overview page
// Exports window.TF9Dashboard

const STATUS_TILES = [{
  status: 'running',
  label: 'Running',
  color: 'var(--blue)'
}, {
  status: 'success',
  label: 'Succeeded',
  color: 'var(--green)'
}, {
  status: 'partial_success',
  label: 'Partial Success',
  color: 'var(--amber)'
}, {
  status: 'failed',
  label: 'Failed',
  color: 'var(--red)'
}, {
  status: 'denied',
  label: 'Denied',
  color: 'var(--amber)'
}, {
  status: 'cancelled',
  label: 'Cancelled',
  color: 'var(--border-strong)'
}];
function CommandBadge({
  command
}) {
  const colors = {
    plan: '#1a7f37',
    apply: '#bc4c00',
    destroy: '#cf222e',
    init: '#0969da',
    auto: '#8250df',
    validate: '#0a7c86',
    refresh: '#57606a',
    state: '#9a6700'
  };
  const c = colors[command] || 'var(--text-3)';
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      fontFamily: 'var(--mono)',
      fontSize: '11px',
      fontWeight: 700,
      padding: '1px 7px',
      borderRadius: '4px',
      color: c,
      background: `color-mix(in srgb, ${c} 12%, var(--container))`,
      border: `1px solid color-mix(in srgb, ${c} 28%, transparent)`
    }
  }, command);
}
function StatusLabel({
  status
}) {
  const map = {
    success: ['var(--green)', 'success'],
    partial_success: ['var(--amber)', 'partial success'],
    failed: ['var(--red)', 'failed'],
    running: ['var(--blue)', 'running'],
    cancelled: ['var(--text-2)', 'cancelled'],
    denied: ['var(--amber)', 'denied']
  };
  const [color, label] = map[status] || ['var(--text-3)', status];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      color,
      fontWeight: 600,
      fontSize: '12.5px',
      textTransform: 'capitalize'
    }
  }, label);
}
function Dashboard({
  navigate
}) {
  const {
    runs,
    repos,
    reports
  } = window.TF9_DATA;
  const {
    relativeTime,
    duration
  } = window.TF9_UTILS;
  const counts = STATUS_TILES.map(t => ({
    ...t,
    count: runs.filter(r => r.status === t.status).length
  }));
  const recent = runs.slice(0, 6);
  const completed = runs.filter(r => r.finishedAt);
  const success = runs.filter(r => r.status === 'success').length;
  const successRate = completed.length ? Math.round(success / completed.length * 100) : 0;
  const avgDur = completed.length ? Math.round(completed.reduce((s, r) => s + (new Date(r.finishedAt) - new Date(r.startedAt)) / 1000, 0) / completed.length) : 0;
  const sequential = runs.filter(r => !r.parallel).length;
  const parallel = runs.length - sequential;
  const changes = runs.reduce((s, r) => s + (r.add || 0) + (r.change || 0) + (r.destroy || 0), 0);
  const card = {
    background: 'var(--container)',
    borderRadius: 16,
    boxShadow: 'var(--shadow-c)',
    marginBottom: 22
  };
  const cHead = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    padding: '16px 20px',
    borderBottom: '1px solid var(--divider)'
  };
  const cTitle = {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text)'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 20,
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 28,
      fontWeight: 700,
      color: 'var(--text)',
      letterSpacing: '-.3px',
      lineHeight: 1.1
    }
  }, "Dashboard"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-2)',
      fontSize: 14,
      marginTop: 6
    }
  }, "Operational summary for tf9 \u2014 Terraform runs across your ordered repository targets.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => navigate('workspace'),
    style: {
      fontFamily: 'var(--sans)',
      fontWeight: 700,
      fontSize: 14,
      borderRadius: 20,
      padding: '4px 20px',
      height: 34,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      border: '2px solid var(--link)',
      background: 'var(--container)',
      color: 'var(--link)'
    }
  }, "Open Repository Workspace"), /*#__PURE__*/React.createElement("button", {
    onClick: () => navigate('runs'),
    style: {
      fontFamily: 'var(--sans)',
      fontWeight: 700,
      fontSize: 14,
      borderRadius: 20,
      padding: '4px 20px',
      height: 34,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      border: '2px solid var(--blue)',
      background: 'var(--blue)',
      color: '#fff'
    }
  }, "Start Terraform Run"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      flexWrap: 'wrap',
      marginBottom: 22
    }
  }, counts.map(t => /*#__PURE__*/React.createElement("a", {
    key: t.status,
    onClick: e => {
      e.preventDefault();
      navigate('runs');
    },
    style: {
      flex: '1',
      minWidth: 128,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      background: 'var(--container)',
      borderRadius: 12,
      boxShadow: 'var(--shadow-c)',
      padding: '14px 16px',
      textDecoration: 'none',
      color: 'var(--text)',
      borderTop: `3px solid ${t.color}`,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 26,
      fontWeight: 700,
      lineHeight: 1.1
    }
  }, t.count), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--text-2)'
    }
  }, t.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      flexBasis: '100%',
      fontSize: 12,
      color: 'var(--text-3)',
      marginTop: -6
    }
  }, "Last ", runs.length, " runs")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(560px,1.5fr) minmax(400px,1fr)',
      gap: 22,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      overflow: 'hidden',
      marginBottom: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: cHead
  }, /*#__PURE__*/React.createElement("div", {
    style: cTitle
  }, "Recent runs"), /*#__PURE__*/React.createElement("a", {
    onClick: e => {
      e.preventDefault();
      navigate('runs');
    },
    style: {
      fontSize: 13,
      color: 'var(--link)',
      cursor: 'pointer',
      textDecoration: 'none'
    }
  }, "View all")), /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 13.5
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['Command', 'Repository', 'Status', 'Started', 'Duration'].map(h => /*#__PURE__*/React.createElement("th", {
    key: h,
    style: {
      textAlign: 'left',
      fontWeight: 700,
      color: 'var(--text)',
      fontSize: 12,
      padding: '10px 20px',
      borderBottom: '1px solid var(--divider)',
      background: 'var(--th)',
      position: 'sticky',
      top: 0,
      whiteSpace: 'nowrap'
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, recent.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r.id,
    onClick: () => navigate('runs'),
    style: {
      cursor: 'pointer'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'var(--th)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent'
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 20px',
      borderBottom: '1px solid var(--divider)'
    }
  }, /*#__PURE__*/React.createElement(CommandBadge, {
    command: r.command
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 20px',
      borderBottom: '1px solid var(--divider)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--mono)',
      fontSize: 12,
      display: 'inline-block',
      maxWidth: 200,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      verticalAlign: 'bottom'
    }
  }, r.repo)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 20px',
      borderBottom: '1px solid var(--divider)'
    }
  }, /*#__PURE__*/React.createElement(StatusLabel, {
    status: r.status
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 20px',
      borderBottom: '1px solid var(--divider)',
      color: 'var(--text-2)',
      fontSize: 12.5,
      whiteSpace: 'nowrap'
    }
  }, relativeTime(r.startedAt)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 20px',
      borderBottom: '1px solid var(--divider)',
      color: 'var(--text-2)',
      fontSize: 12.5
    }
  }, r.status === 'running' ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--blue)',
      fontWeight: 600
    }
  }, "in progress") : duration(r.startedAt, r.finishedAt))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: card
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...cHead,
      borderBottom: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: cTitle
  }, "Execution modes")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '4px 20px 18px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 16,
      display: 'flex',
      overflow: 'hidden',
      borderRadius: 999,
      background: 'var(--surface-3)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--blue)',
      flexGrow: sequential
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--purple)',
      flexGrow: parallel
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      color: 'var(--text-2)',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'var(--blue)',
      display: 'inline-block'
    }
  }), "Sequential ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--text)'
    }
  }, sequential)), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'var(--purple)',
      display: 'inline-block'
    }
  }), "Parallel ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--text)'
    }
  }, parallel))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 12,
      marginTop: 18,
      paddingTop: 16,
      borderTop: '1px solid var(--divider)'
    }
  }, [[successRate + '%', 'Success rate'], [avgDur + 's', 'Avg. duration'], [changes, 'Resource changes']].map(([val, label]) => /*#__PURE__*/React.createElement("div", {
    key: label,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      padding: '12px 14px',
      border: '1px solid var(--divider)',
      borderRadius: 10,
      background: 'var(--surface-2)'
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--text)',
      fontSize: 21,
      lineHeight: 1.1
    }
  }, val), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-2)',
      fontSize: 12,
      lineHeight: 1.3
    }
  }, label)))))), /*#__PURE__*/React.createElement("div", {
    style: card
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...cHead,
      borderBottom: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: cTitle
  }, "Resources")), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: 'none',
      margin: 0,
      padding: '0 20px 14px'
    }
  }, [['Repositories', /*#__PURE__*/React.createElement("a", {
    onClick: e => {
      e.preventDefault();
      navigate('repos');
    },
    style: {
      color: 'var(--link)',
      cursor: 'pointer'
    }
  }, repos.length)], ['Terraform reports', /*#__PURE__*/React.createElement("a", {
    onClick: e => {
      e.preventDefault();
      navigate('reports');
    },
    style: {
      color: 'var(--link)',
      cursor: 'pointer'
    }
  }, reports.length)], ['AWS session', /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--mono)',
      fontSize: 12
    }
  }, "123456789012")], ['Cost Analysis', /*#__PURE__*/React.createElement("a", {
    onClick: e => {
      e.preventDefault();
      navigate('cost');
    },
    style: {
      color: 'var(--link)',
      cursor: 'pointer'
    }
  }, "Open")]].map(([label, value]) => /*#__PURE__*/React.createElement("li", {
    key: label,
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '8px 0',
      borderBottom: '1px solid var(--divider)',
      fontSize: 13.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-2)'
    }
  }, label), value)))), /*#__PURE__*/React.createElement("div", {
    style: card
  }, /*#__PURE__*/React.createElement("div", {
    style: cHead
  }, /*#__PURE__*/React.createElement("div", {
    style: cTitle
  }, "Recent reports"), /*#__PURE__*/React.createElement("a", {
    onClick: e => {
      e.preventDefault();
      navigate('reports');
    },
    style: {
      fontSize: 13,
      color: 'var(--link)',
      cursor: 'pointer',
      textDecoration: 'none'
    }
  }, "View all")), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: 'none',
      margin: 0,
      padding: '0 12px 12px',
      maxHeight: 280,
      overflowY: 'auto'
    }
  }, reports.slice(0, 8).map(rep => /*#__PURE__*/React.createElement("li", {
    key: rep.name
  }, /*#__PURE__*/React.createElement("a", {
    onClick: e => e.preventDefault(),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      padding: '7px 8px',
      borderRadius: 8,
      color: 'var(--text)',
      textDecoration: 'none',
      cursor: 'pointer'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'var(--surface-2)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent'
  }, /*#__PURE__*/React.createElement(CommandBadge, {
    command: rep.command
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontFamily: 'var(--mono)',
      fontSize: 11.5
    }
  }, rep.name), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)',
      fontSize: 12,
      flexShrink: 0
    }
  }, relativeTime(rep.runAt))))))))));
}
Object.assign(window, {
  TF9Dashboard: Dashboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/tf9/Dashboard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/tf9/RunHistory.jsx
try { (() => {
// TF9 Run History page
// Exports window.TF9RunHistory

function RunHistory({
  navigate
}) {
  const {
    runs
  } = window.TF9_DATA;
  const {
    relativeTime,
    duration
  } = window.TF9_UTILS;
  const [selectedId, setSelectedId] = React.useState(runs[0]?.id || null);
  const [cmdFilter, setCmdFilter] = React.useState('');
  const selected = runs.find(r => r.id === selectedId);
  const filtered = cmdFilter ? runs.filter(r => r.command === cmdFilter || r.status === cmdFilter) : runs;
  const commandColors = {
    plan: '#1a7f37',
    apply: '#bc4c00',
    destroy: '#cf222e',
    init: '#0969da',
    auto: '#8250df',
    validate: '#0a7c86',
    refresh: '#57606a',
    state: '#9a6700'
  };
  const statusColors = {
    success: 'var(--green)',
    partial_success: 'var(--amber)',
    failed: 'var(--red)',
    running: 'var(--blue)',
    cancelled: 'var(--text-2)',
    denied: 'var(--amber)'
  };
  function CmdBadge({
    cmd
  }) {
    const c = commandColors[cmd] || 'var(--text-3)';
    return /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--mono)',
        fontSize: 11,
        fontWeight: 700,
        padding: '1px 7px',
        borderRadius: 4,
        color: c,
        background: `color-mix(in srgb,${c} 12%,var(--container))`,
        border: `1px solid color-mix(in srgb,${c} 28%,transparent)`,
        whiteSpace: 'nowrap'
      }
    }, cmd);
  }
  function StatusChip({
    status
  }) {
    const svgs = {
      running: /*#__PURE__*/React.createElement("span", {
        style: {
          width: 13,
          height: 13,
          border: '2px solid currentColor',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          display: 'inline-block',
          animation: 'tf9-spin .7s linear infinite'
        }
      }),
      success: /*#__PURE__*/React.createElement("svg", {
        width: 14,
        height: 14,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2.5",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }, /*#__PURE__*/React.createElement("polyline", {
        points: "20 6 9 17 4 12"
      })),
      failed: /*#__PURE__*/React.createElement("svg", {
        width: 14,
        height: 14,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2.5",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }, /*#__PURE__*/React.createElement("line", {
        x1: "18",
        y1: "6",
        x2: "6",
        y2: "18"
      }), /*#__PURE__*/React.createElement("line", {
        x1: "6",
        y1: "6",
        x2: "18",
        y2: "18"
      })),
      partial_success: /*#__PURE__*/React.createElement("svg", {
        width: 14,
        height: 14,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }, /*#__PURE__*/React.createElement("path", {
        d: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
      }), /*#__PURE__*/React.createElement("line", {
        x1: "12",
        y1: "9",
        x2: "12",
        y2: "13"
      }), /*#__PURE__*/React.createElement("line", {
        x1: "12",
        y1: "17",
        x2: "12.01",
        y2: "17"
      })),
      cancelled: /*#__PURE__*/React.createElement("svg", {
        width: 14,
        height: 14,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }, /*#__PURE__*/React.createElement("rect", {
        x: "3",
        y: "3",
        width: "18",
        height: "18",
        rx: "2"
      })),
      denied: /*#__PURE__*/React.createElement("svg", {
        width: 14,
        height: 14,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }, /*#__PURE__*/React.createElement("circle", {
        cx: "12",
        cy: "12",
        r: "10"
      }), /*#__PURE__*/React.createElement("line", {
        x1: "4.93",
        y1: "4.93",
        x2: "19.07",
        y2: "19.07"
      }))
    };
    const labels = {
      partial_success: 'Partial Success'
    };
    return /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 12.5,
        fontWeight: 600,
        color: statusColors[status] || 'var(--text-3)'
      }
    }, svgs[status], labels[status] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : '—'));
  }
  const CMDS = ['plan', 'apply', 'destroy', 'init', 'validate'];
  const STATUSES = ['running', 'success', 'failed', 'partial_success', 'cancelled'];

  // Terminal output mock
  const termLines = selected ? [{
    cls: 'dim',
    text: `# Initializing provider plugins...`
  }, {
    cls: 'plan',
    text: `Terraform will perform the following actions:`
  }, {
    cls: '',
    text: ''
  }, {
    cls: 'add',
    text: `  # aws_vpc.main will be created`
  }, {
    cls: 'add',
    text: `  + resource "aws_vpc" "main" {`
  }, {
    cls: 'add',
    text: `      + cidr_block = "10.0.0.0/16"`
  }, {
    cls: 'add',
    text: `      + id         = (known after apply)`
  }, {
    cls: 'add',
    text: `    }`
  }, {
    cls: '',
    text: ''
  }, {
    cls: 'chg',
    text: `  # aws_security_group.web will be updated in-place`
  }, {
    cls: 'chg',
    text: `  ~ resource "aws_security_group" "web" {`
  }, {
    cls: 'chg',
    text: `      ~ description = "Old" -> "Updated web SG"`
  }, {
    cls: 'chg',
    text: `    }`
  }, {
    cls: '',
    text: ''
  }, {
    cls: 'plan',
    text: `Plan: ${selected.add || 1} to add, ${selected.change || 0} to change, ${selected.destroy || 0} to destroy.`
  }, {
    cls: 'ok',
    text: selected.status === 'success' ? `Apply complete! Resources: ${selected.add || 1} added.` : ''
  }].filter(l => l.text !== undefined) : [];
  const lineColors = {
    add: 'var(--green)',
    del: 'var(--red)',
    chg: 'var(--amber)',
    plan: 'var(--blue)',
    ok: 'var(--green)',
    dim: 'var(--text-3)',
    err: 'var(--red)'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 'calc(100vh - 56px)',
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
      overflow: 'hidden',
      fontFamily: 'var(--sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      padding: '24px 28px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 26,
      fontWeight: 700,
      color: 'var(--text)',
      letterSpacing: '-.3px'
    }
  }, "Run History"), /*#__PURE__*/React.createElement("button", {
    onClick: () => navigate('runs'),
    style: {
      fontFamily: 'var(--sans)',
      fontWeight: 700,
      fontSize: 14,
      borderRadius: 20,
      padding: '4px 20px',
      height: 34,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      border: '2px solid var(--blue)',
      background: 'var(--blue)',
      color: '#fff'
    }
  }, "+ New Run")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
      paddingBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--text-2)',
      fontWeight: 600
    }
  }, "Command:"), ['', ...CMDS].map(c => /*#__PURE__*/React.createElement("button", {
    key: c,
    onClick: () => setCmdFilter(c),
    style: {
      height: 28,
      padding: '0 12px',
      border: '1px solid var(--border)',
      borderRadius: 6,
      background: cmdFilter === c ? 'var(--blue-bg)' : 'var(--surface-1)',
      color: cmdFilter === c ? 'var(--blue)' : 'var(--text-2)',
      borderColor: cmdFilter === c ? 'var(--blue)' : 'var(--border)',
      fontFamily: 'var(--sans)',
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, c || 'All')), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-2)',
      fontSize: 12,
      marginLeft: 'auto'
    }
  }, filtered.length, " run", filtered.length !== 1 ? 's' : ''))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      minHeight: 0,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      minWidth: 0,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: '0 28px 24px',
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 13.5
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['Run ID', 'Command', 'Repository', 'Status', 'Started', 'Duration'].map(h => /*#__PURE__*/React.createElement("th", {
    key: h,
    style: {
      position: 'sticky',
      top: 0,
      background: 'var(--th)',
      textAlign: 'left',
      fontWeight: 700,
      color: 'var(--text)',
      fontSize: 12,
      padding: '11px 16px',
      borderBottom: '1px solid var(--divider)',
      whiteSpace: 'nowrap',
      zIndex: 2
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, filtered.map(r => {
    const active = r.id === selectedId;
    return /*#__PURE__*/React.createElement("tr", {
      key: r.id,
      onClick: () => setSelectedId(r.id),
      style: {
        cursor: 'pointer',
        background: active ? 'var(--blue-bg)' : 'transparent',
        transition: 'background .08s'
      },
      onMouseEnter: e => {
        if (!active) e.currentTarget.style.background = 'var(--th)';
      },
      onMouseLeave: e => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '12px 16px',
        borderBottom: '1px solid var(--divider)',
        boxShadow: active ? 'inset 3px 0 0 var(--blue)' : 'none'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--mono)',
        fontSize: 12,
        fontWeight: 700,
        color: 'var(--text)',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, r.status === 'running' && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: 'var(--blue)',
        animation: 'tf9-pulse 1.1s ease-in-out infinite',
        display: 'inline-block'
      }
    }), r.id.slice(0, 14))), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '12px 16px',
        borderBottom: '1px solid var(--divider)'
      }
    }, /*#__PURE__*/React.createElement(CmdBadge, {
      cmd: r.command
    })), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '12px 16px',
        borderBottom: '1px solid var(--divider)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--mono)',
        fontSize: 12,
        color: 'var(--text)'
      }
    }, r.repo)), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '12px 16px',
        borderBottom: '1px solid var(--divider)'
      }
    }, /*#__PURE__*/React.createElement(StatusChip, {
      status: r.status
    })), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '12px 16px',
        borderBottom: '1px solid var(--divider)',
        color: 'var(--text-2)',
        fontSize: 12.5,
        whiteSpace: 'nowrap'
      }
    }, relativeTime(r.startedAt)), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '12px 16px',
        borderBottom: '1px solid var(--divider)',
        color: 'var(--text-2)',
        fontSize: 12.5
      }
    }, r.status === 'running' ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--blue)',
        fontWeight: 600
      }
    }, "live") : duration(r.startedAt, r.finishedAt)));
  }))))), selected && /*#__PURE__*/React.createElement("div", {
    style: {
      width: '42%',
      minWidth: 380,
      borderLeft: '1px solid var(--border-strong)',
      background: 'var(--container)',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '-4px 0 18px rgba(0,7,22,.05)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 14,
      padding: '12px 20px',
      borderBottom: '1px solid var(--divider)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 11,
      minWidth: 0
    }
  }, selected.status === 'running' && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: 'var(--blue)',
      animation: 'tf9-pulse 1.1s ease-in-out infinite',
      display: 'inline-block'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--mono)',
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--text)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, selected.id), /*#__PURE__*/React.createElement(CmdBadge, {
    cmd: selected.command
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => setSelectedId(null),
    style: {
      border: 'none',
      background: 'transparent',
      color: 'var(--text-2)',
      cursor: 'pointer',
      padding: 4,
      borderRadius: 6,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "18",
    y1: "6",
    x2: "6",
    y2: "18"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "6",
    y1: "6",
    x2: "18",
    y2: "18"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px 22px',
      padding: '12px 20px 14px',
      borderBottom: '1px solid var(--divider)',
      flexShrink: 0
    }
  }, [['Repository', selected.repo], ['Branch', selected.branch || 'main'], ['Status', /*#__PURE__*/React.createElement(StatusChip, {
    key: "s",
    status: selected.status
  })], ['Duration', selected.status === 'running' ? 'running…' : duration(selected.startedAt, selected.finishedAt)], ['Changes', `+${selected.add || 0} ~${selected.change || 0} -${selected.destroy || 0}`]].map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'var(--text-2)',
      textTransform: 'uppercase',
      letterSpacing: .4,
      fontWeight: 600
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--text)',
      fontWeight: 600,
      fontFamily: k === 'Repository' || k === 'Branch' ? 'var(--mono)' : 'inherit'
    }
  }, v)))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: '12px 16px',
      fontFamily: 'var(--mono)',
      fontSize: 12,
      lineHeight: 1.6,
      color: 'var(--tc-text, #c9d1d9)',
      background: 'var(--tc-card-bg, #0b1220)',
      minHeight: 0,
      '--tc-add': '#3fb950',
      '--tc-del': '#f85149',
      '--tc-chg': '#d29922',
      '--tc-plan': '#58a6ff',
      '--tc-ok': '#3fb950',
      '--tc-dim': '#6e7681',
      '--tc-err': '#ff7b72'
    }
  }, termLines.map((line, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      color: lineColors[line.cls] || 'inherit',
      fontWeight: line.cls === 'plan' || line.cls === 'ok' ? 600 : 400
    }
  }, line.text || '\u00A0')), selected.status === 'running' && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      width: 7,
      height: 13,
      background: '#58a6ff',
      verticalAlign: 'text-bottom',
      animation: 'tf9-blink 1s step-end infinite'
    }
  })))));
}
Object.assign(window, {
  TF9RunHistory: RunHistory
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/tf9/RunHistory.jsx", error: String((e && e.message) || e) }); }

// ui_kits/tf9/Shell.jsx
try { (() => {
// TF9 Shell — topnav + collapsible sidenav
// Exports to window.TF9Shell

const NAV_GROUPS = [{
  label: 'Operations',
  links: [{
    id: 'overview',
    text: 'Dashboard',
    path: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-4H3zM13 7h8V3h-8z'
  }, {
    id: 'runs',
    text: 'Run History',
    path: 'M4 17l6-6-6-6M12 19h8'
  }, {
    id: 'workspace',
    text: 'Repository Workspace',
    path: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
  }]
}, {
  label: 'Configuration',
  links: [{
    id: 'repos',
    text: 'Repositories',
    path: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'
  }, {
    id: 'config',
    text: 'Configuration',
    path: 'M16 18l6-6-6-6M8 6l-6 6 6 6'
  }, {
    id: 'profiles',
    text: 'AWS Profile Mappings',
    path: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM5 21v-2a7 7 0 0 1 14 0v2'
  }]
}, {
  label: 'Insights & Support',
  links: [{
    id: 'reports',
    text: 'Terraform Reports',
    path: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5'
  }, {
    id: 'graph',
    text: 'Graph View',
    path: 'M6 5h4v4H6zM14 3h4v4h-4zM14 15h4v4h-4zM4 16h4v4H4zM10 7l4-2M8 9l7 6M8 18l6-1'
  }, {
    id: 'cost',
    text: 'Cost Analysis',
    path: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'
  }, {
    id: 'logs',
    text: 'System Logs',
    path: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'
  }]
}];
const CRUMBS = {
  overview: [{
    text: 'tf9'
  }, {
    text: 'Dashboard',
    current: true
  }],
  runs: [{
    text: 'tf9'
  }, {
    text: 'Run History',
    current: true
  }],
  workspace: [{
    text: 'tf9'
  }, {
    text: 'Repository Workspace',
    current: true
  }],
  repos: [{
    text: 'tf9'
  }, {
    text: 'Configuration'
  }, {
    text: 'Repositories',
    current: true
  }],
  config: [{
    text: 'tf9'
  }, {
    text: 'Configuration'
  }, {
    text: 'Configuration',
    current: true
  }],
  profiles: [{
    text: 'tf9'
  }, {
    text: 'Configuration'
  }, {
    text: 'AWS Profile Mappings',
    current: true
  }],
  reports: [{
    text: 'tf9'
  }, {
    text: 'Terraform Reports',
    current: true
  }],
  graph: [{
    text: 'tf9'
  }, {
    text: 'Graph View',
    current: true
  }],
  cost: [{
    text: 'tf9'
  }, {
    text: 'Cost Analysis',
    current: true
  }],
  logs: [{
    text: 'tf9'
  }, {
    text: 'System Logs',
    current: true
  }]
};
function Icon({
  path,
  size = 16
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: path
  }));
}
function SunIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"
  }));
}
function MoonIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"
  }));
}
function Shell({
  page,
  navigate,
  mode,
  toggleTheme,
  children,
  fullWidth
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const crumbs = CRUMBS[page] || [{
    text: 'tf9'
  }, {
    text: page,
    current: true
  }];
  const topnavStyle = {
    height: '56px',
    background: 'var(--nav-bg)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    gap: '18px',
    position: 'sticky',
    top: 0,
    zIndex: 1000,
    flexShrink: 0
  };
  const sidenavStyle = {
    width: collapsed ? '52px' : '236px',
    flexShrink: 0,
    background: 'var(--container)',
    borderRight: '1px solid var(--divider)',
    position: 'sticky',
    top: '56px',
    alignSelf: 'flex-start',
    height: 'calc(100vh - 56px)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    transition: 'width .18s ease'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      fontFamily: 'var(--sans)',
      background: 'var(--bg-layout)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: topnavStyle
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      cursor: 'pointer'
    },
    onClick: () => navigate('overview')
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/tf9-logo.svg",
    alt: "tf9",
    style: {
      width: 120,
      height: 42,
      display: 'block'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 20,
      background: '#2f3e51'
    }
  }), [['workspace', 'Repository Workspace'], ['runs', 'Run History'], ['reports', 'Terraform Reports']].map(([id, label]) => /*#__PURE__*/React.createElement("a", {
    key: id,
    onClick: e => {
      e.preventDefault();
      navigate(id);
    },
    style: {
      color: page === id ? '#fff' : '#d5dbdb',
      fontSize: '13px',
      display: 'flex',
      alignItems: 'center',
      height: '56px',
      padding: '0 8px',
      cursor: 'pointer',
      textDecoration: 'none',
      background: page === id ? 'var(--nav-bg-2)' : 'transparent'
    }
  }, label)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: toggleTheme,
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 32,
      height: 32,
      borderRadius: 6,
      border: 'none',
      background: 'transparent',
      color: '#d5dbdb',
      cursor: 'pointer'
    }
  }, mode === 'light' ? /*#__PURE__*/React.createElement(SunIcon, null) : /*#__PURE__*/React.createElement(MoonIcon, null)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#d5dbdb',
      fontSize: 13,
      padding: '0 8px'
    }
  }, window.TF9_DATA?.userEmail || 'andres@company.io'))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("nav", {
    style: sidenavStyle
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      overflowX: 'hidden',
      padding: '14px 0'
    }
  }, NAV_GROUPS.map((group, gi) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: gi
  }, gi > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--divider)',
      margin: '12px 16px'
    }
  }), !collapsed && /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-2)',
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: '.3px',
      padding: '16px 18px 6px',
      whiteSpace: 'nowrap'
    }
  }, group.label), group.links.map(link => {
    const active = page === link.id;
    return /*#__PURE__*/React.createElement("a", {
      key: link.id,
      onClick: e => {
        e.preventDefault();
        navigate(link.id);
      },
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        color: active ? 'var(--link)' : 'var(--text)',
        padding: collapsed ? '9px 0' : '7px 18px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        fontSize: 14,
        borderLeft: `2px solid ${active ? 'var(--link)' : 'transparent'}`,
        background: active ? 'var(--blue-bg)' : 'transparent',
        fontWeight: active ? 700 : 400,
        cursor: 'pointer',
        textDecoration: 'none',
        whiteSpace: 'nowrap'
      },
      title: collapsed ? link.text : undefined
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        flexShrink: 0,
        color: active ? 'var(--link)' : 'var(--text-2)'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      path: link.path
    })), !collapsed && /*#__PURE__*/React.createElement("span", null, link.text));
  })))), /*#__PURE__*/React.createElement("button", {
    onClick: () => setCollapsed(c => !c),
    style: {
      width: '100%',
      border: 'none',
      borderTop: '1px solid var(--divider)',
      background: 'var(--container)',
      color: 'var(--text-3)',
      cursor: 'pointer',
      padding: '8px 0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, collapsed ? /*#__PURE__*/React.createElement("polyline", {
    points: "9 18 15 12 9 6"
  }) : /*#__PURE__*/React.createElement("polyline", {
    points: "15 18 9 12 15 6"
  })))), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      minWidth: 0,
      padding: fullWidth ? '0' : '28px 36px 80px',
      maxWidth: fullWidth ? 'none' : '1320px'
    }
  }, !fullWidth && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 13,
      color: 'var(--text-2)',
      marginBottom: 18
    }
  }, crumbs.map((c, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, "/"), c.current ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-2)'
    }
  }, c.text) : /*#__PURE__*/React.createElement("a", {
    onClick: e => {
      e.preventDefault();
      if (i === 0) navigate('overview');
    },
    style: {
      color: 'var(--link)',
      cursor: 'pointer',
      textDecoration: 'none'
    }
  }, c.text)))), children)));
}
Object.assign(window, {
  TF9Shell: Shell,
  TF9Icon: Icon
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/tf9/Shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/tf9/data.js
try { (() => {
// TF9 UI Kit — mock data
// Realistic fake runs, repos, reports

const REPOS = ['aws-platform/infra-live', 'aws-platform/eks-clusters', 'aws-platform/vpc-networking', 'data-platform/s3-buckets', 'security/iam-policies'];
const COMMANDS = ['plan', 'apply', 'destroy', 'init', 'validate', 'refresh', 'state', 'import'];
const STATUSES = ['success', 'success', 'success', 'failed', 'partial_success', 'running', 'cancelled', 'denied'];
const BRANCHES = ['main', 'feature/vpc-peering', 'hotfix/sg-rules', 'main', 'main'];
function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function genRun(i) {
  const cmd = randomFrom(['plan', 'plan', 'apply', 'apply', 'destroy', 'init', 'validate']);
  const status = i === 0 ? 'running' : randomFrom(['success', 'success', 'success', 'failed', 'partial_success', 'cancelled', 'denied']);
  const startedAt = new Date(Date.now() - i * 23 * 60 * 1000 - Math.random() * 3600000);
  const duration = Math.floor(30 + Math.random() * 300);
  return {
    id: `run_${Math.random().toString(36).slice(2, 12)}`,
    command: cmd,
    repo: randomFrom(REPOS),
    branch: randomFrom(BRANCHES),
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: status === 'running' ? null : new Date(startedAt.getTime() + duration * 1000).toISOString(),
    duration,
    add: status === 'success' ? Math.floor(Math.random() * 12) : 0,
    change: status === 'success' ? Math.floor(Math.random() * 5) : 0,
    destroy: cmd === 'destroy' ? Math.floor(Math.random() * 3) : 0,
    targets: Math.random() > 0.5 ? [randomFrom(REPOS).split('/')[1]] : [],
    parallel: Math.random() > 0.6
  };
}
window.TF9_DATA = {
  runs: Array.from({
    length: 40
  }, (_, i) => genRun(i)),
  repos: REPOS.map((path, i) => ({
    id: `repo_${i}`,
    path,
    provider: 'github',
    branch: 'main',
    lastRun: new Date(Date.now() - i * 86400000).toISOString()
  })),
  reports: Array.from({
    length: 12
  }, (_, i) => ({
    name: `${randomFrom(['plan', 'apply', 'destroy'])}_${REPOS[i % REPOS.length].split('/')[1]}_${new Date(Date.now() - i * 3600000 * 6).toISOString().slice(0, 10)}`,
    command: randomFrom(['plan', 'apply', 'destroy']),
    runAt: new Date(Date.now() - i * 3600000 * 6).toISOString()
  })),
  identity: {
    arn: 'arn:aws:sts::123456789012:assumed-role/AdminRole/andres',
    account: '123456789012'
  },
  userEmail: 'andres@company.io'
};
function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}
function duration(s, e) {
  if (!e) return '—';
  const ms = new Date(e) - new Date(s);
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round(ms % 60000 / 1000)}s`;
}
window.TF9_UTILS = {
  relativeTime,
  duration
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/tf9/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.CommandBadge = __ds_scope.CommandBadge;

__ds_ns.RunStatus = __ds_scope.RunStatus;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.StatusDot = __ds_scope.StatusDot;

})();
