import type { ActiveBranches, ReconcileStatus } from '../types';
import { stripAnsi } from './runStatus';

// buildReconcilePrompt assembles the structured drift prompt handed to the AI
// chat. It is shared by the Reconcile panel (RepositoryWorkspace) and the live
// terminal (RunSplitPanel). The terminal path additionally passes planOutput —
// the terraform output already on screen — so Claude can match drifted resource
// addresses to the active branches without re-running the plan.
//
// activeBranches is null when the caller could not list them; planOutput is
// omitted by the workspace path (no plan in hand there).
export function buildReconcilePrompt(
  repo: string,
  status: ReconcileStatus,
  activeBranches: ActiveBranches | null,
  planOutput?: string,
): string {
  const activeList = activeBranches
    ? (activeBranches.branches
        .filter(b => b.name !== status.currentBranch)
        .map(b => {
          const locations = [b.local && 'local', b.remote && 'origin'].filter(Boolean).join(' + ');
          return `- ${b.name} [${locations || 'unknown ref'}] @ ${b.hash.slice(0, 7)} (${b.author}, ${b.date}): ${b.subject}`;
        })
        .join('\n') || '(no other active branches in the configured window)')
    : '(could not list active branches)';

  const parts = [
    `I need help reconciling Terraform drift on the repo "${repo}" before applying.`,
    `Current working branch: ${status.currentBranch}.`,
    '',
    'Recent teammate branches that may contain the Terraform change responsible for the deployed state:',
    activeList,
  ];

  if (planOutput && planOutput.trim()) {
    parts.push(
      '',
      'The most recent terraform run produced this output (use it to identify which resources drifted):',
      '```terraform',
      truncatePlan(stripAnsi(planOutput)),
      '```',
    );
  }

  parts.push(
    '',
    'For each drifted or missing resource, search the recent branches for the matching Terraform change.',
    'Inspect local branch refs first with read-only git commands (git log, git diff, git show <branch>:<file>).',
    'When a branch is marked origin-only or its remote ref is newer, you may run git fetch and inspect',
    'origin/<branch> without checking it out. Identify the branch and commit that explain the deployed state,',
    'then propose the minimal cherry-pick or rebase onto the current working branch. Switch me to autoApply',
    'mode and I will approve before you modify git history. Do not push or run terraform apply.',
  );

  return parts.join('\n');
}

// truncatePlan keeps the tail of long terraform output (the plan summary and
// resource diffs live near the end) and caps the prompt at a sane size.
function truncatePlan(output: string): string {
  const MAX = 12000;
  if (output.length <= MAX) return output;
  return `… (truncated)\n${output.slice(output.length - MAX)}`;
}
