Animated shimmer placeholder for loading states. Renders grey bars that pulse.

```jsx
<Skeleton lines={3} />
<Skeleton lines={2} widths={['100%', '60%']} height={14} />
<Skeleton lines={4} gap={8} />
```

Last line defaults to 60% width to look natural. Each line staggers its animation by 80ms.
Never use spinners for section-level loading — use Skeleton instead.
