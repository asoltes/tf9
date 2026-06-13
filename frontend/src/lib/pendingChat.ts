// Transient handoff for a pre-built AI chat prompt across a page navigation.
//
// The live terminal (RunSplitPanel) builds a drift-reconcile prompt and then
// navigates to the Repository Workspace. We can't carry the prompt in the Page
// object: navigate() writes window.location.hash, which fires hashchange and
// re-derives the Page from the hash (dropping any transient fields), and the
// workspace is lazy-loaded so it mounts after that round-trip. A module-level
// one-shot store survives both. The workspace takes (and clears) it on mount.
let pending: { repo: string; seed: string } | null = null;

export function setPendingChatSeed(repo: string, seed: string): void {
  pending = { repo, seed };
}

// takePendingChatSeed returns the seed for repo once, then clears it so a later
// manual visit to the workspace doesn't re-trigger it.
export function takePendingChatSeed(repo: string): string | null {
  if (pending && pending.repo === repo) {
    const seed = pending.seed;
    pending = null;
    return seed;
  }
  return null;
}
