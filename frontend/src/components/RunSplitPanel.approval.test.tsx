// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APPROVAL_SENTINEL } from '../lib/runStatus';
import type { Run } from '../types';
import RunSplitPanel from './RunSplitPanel';
import { ToastProvider } from './ToastProvider';

const run: Run = {
  id: 'run-destroy-approval',
  status: 'running',
  command: 'destroy',
  envFilter: 'dev',
  repo: 'platform',
  startedAt: new Date().toISOString(),
  request: {
    command: 'destroy',
    repo: 'platform',
    envFilter: 'dev',
    profile: 'default',
    extraArgs: [],
    nonprodOnly: false,
    autoApprove: false,
    parallel: false,
    promotionOrder: ['dev'],
  },
};

describe('RunSplitPanel destroy approval', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('requires final confirmation before sending yes to Terraform', async () => {
    const inputs: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/input')) inputs.push(JSON.parse(String(init?.body)));
      return {
        ok: true,
        json: async () => url === '/api/web/settings'
          ? { approvalTimeoutSeconds: 300, reviewedPlanTimeoutSeconds: 900 }
          : null,
      } as Response;
    }));

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ToastProvider>
          <RunSplitPanel
            run={run}
            lines={[
              'Plan: 0 to add, 0 to change, 1 to destroy.',
              APPROVAL_SENTINEL,
            ]}
            dock="side"
            onDockChange={() => {}}
          />
        </ToastProvider>,
      );
    });

    const button = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.trim() === 'Approve destroy');
    expect(button()).toBeDefined();

    await act(async () => button()!.click());
    expect(inputs).toEqual([]);
    expect(container.textContent).toContain('Are you sure?');

    const finalButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.trim() === 'Destroy permanently');
    expect(finalButton).toBeDefined();
    await act(async () => finalButton!.click());

    expect(inputs).toEqual([{ value: 'yes' }]);
    await act(async () => root.unmount());
  });
});
