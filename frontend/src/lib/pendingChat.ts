// Transient handoff for AI reconcile context across a page navigation.
//
// The terminal navigates immediately, without waiting for the comparatively
// slow git fetch used to build the final prompt. The workspace takes this
// context once, loads the git details after mount, and then fills the chat.
export interface PendingReconcileChat {
  repo: string;
  planOutput: string;
}

let pending: PendingReconcileChat | null = null;

export function setPendingReconcileChat(repo: string, planOutput: string): void {
  pending = { repo, planOutput };
}

// Returns the context for repo once, then clears it so a later manual visit to
// the workspace doesn't re-trigger reconciliation.
export function takePendingReconcileChat(repo: string): PendingReconcileChat | null {
  if (pending && pending.repo === repo) {
    const context = pending;
    pending = null;
    return context;
  }
  return null;
}
