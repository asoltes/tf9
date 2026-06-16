Controlled text input. 32px height, 2px border, 8px radius. Matches TF9 cloudscape.css .inp style.

```jsx
<Input label="Repository URL" placeholder="https://github.com/org/repo" />
<Input label="Run ID" mono placeholder="run_b4f2a19c3d" hint="Paste the run ID from the logs" />
<Input label="AWS Profile" error="Profile not found in config" value="prod-admin" />
```

Use `mono={true}` for technical values: paths, IDs, ARNs, commands.
