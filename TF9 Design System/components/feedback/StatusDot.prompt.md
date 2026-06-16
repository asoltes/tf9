Small colored dot for inline status. Use in table rows, nav items, terminal headers, and environment selectors.

```jsx
<StatusDot status="running" pulse />
<StatusDot status="success" />
<StatusDot status="failed" />
<StatusDot status="prod" size={10} />
<StatusDot status="dev" />
```

**Status values:** running (blue+pulse), success (green), failed (red), warning (amber), neutral (grey), prod (red), staging (orange), dev (green), global (purple).
