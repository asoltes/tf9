Pill-shaped action button. Use for all clickable actions in the TF9 UI.

```jsx
<Button variant="primary" onClick={startRun}>Start Terraform Run</Button>
<Button variant="normal">Open Repository Workspace</Button>
<Button variant="danger" size="sm">Destroy</Button>
<Button variant="link">View all</Button>
<Button loading>Applying…</Button>
```

**Variants:** `primary` (blue fill), `normal` (outlined blue), `danger` (red fill), `danger-outline`, `ghost`, `link` (no border), `icon` (circle, 32px).
**Sizes:** `md` (34px, default), `sm` (28px).
**States:** `disabled` (40% opacity), `loading` (spinner, auto-disabled).
