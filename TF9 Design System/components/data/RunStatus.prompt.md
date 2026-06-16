Colored status label for Terraform run states. Use in tables, split panels, and status tiles.

```jsx
<RunStatus status="running" />
<RunStatus status="success" />
<RunStatus status="partial_success" size="sm" />
<RunStatus status="failed" />
<RunStatus status="cancelled" showIcon={false} />
<RunStatus status="denied" />
```

Shows an icon (spinner for running, check for success, X for failed, warning triangle for partial/denied, square for cancelled) plus a text label.
