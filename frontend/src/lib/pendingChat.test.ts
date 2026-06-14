import { describe, expect, it } from 'vitest';
import { setPendingReconcileChat, takePendingReconcileChat } from './pendingChat';

describe('pending reconcile chat handoff', () => {
  it('returns matching context once', () => {
    setPendingReconcileChat('infra', 'plan output');

    expect(takePendingReconcileChat('other')).toBeNull();
    expect(takePendingReconcileChat('infra')).toEqual({
      repo: 'infra',
      planOutput: 'plan output',
    });
    expect(takePendingReconcileChat('infra')).toBeNull();
  });
});
