// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Isolate the component from the network so the test exercises only render/hooks.
vi.mock('../api', () => ({
  api: { get: vi.fn().mockResolvedValue({ items: [] }), post: vi.fn() },
  repoGit: {
    branches: vi.fn().mockResolvedValue([]),
    status: vi.fn().mockResolvedValue(null),
    pull: vi.fn().mockResolvedValue({ output: '' }),
  },
}));

import NewRunModal from './NewRunModal';

describe('NewRunModal hook stability (regression: React #310)', () => {
  beforeEach(() => {
    // React 18 act() environment flag
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('does not crash when visible flips false -> true (hook count must be constant)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // Hidden render: with a hook declared after the early return, this render
    // calls fewer hooks than the next one and React throws #310 on the flip.
    await act(async () => {
      root.render(<NewRunModal visible={false} onDismiss={() => {}} onCreated={() => {}} />);
    });
    expect(container.querySelector('.run-overlay')).toBeNull();

    // The flip that crashed in the browser. Must not throw.
    await act(async () => {
      root.render(<NewRunModal visible={true} onDismiss={() => {}} onCreated={() => {}} />);
    });
    expect(container.querySelector('.run-overlay')).not.toBeNull();

    await act(async () => { root.unmount(); });
    container.remove();
  });
});
