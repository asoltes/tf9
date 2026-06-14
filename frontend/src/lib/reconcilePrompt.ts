import type { ActiveBranches, ReconcileStatus } from '../types';
import { stripAnsi } from './runStatus';

export const DEFAULT_RECONCILE_PROMPT = [
  'For each drifted or missing resource, search the recent branches for the matching Terraform change.',
  'Inspect local branch refs first with read-only git commands (git log, git diff, git show <branch>:<file>).',
  'When a branch is marked origin-only or its remote ref is newer, you may run git fetch and inspect',
  'origin/<branch> without checking it out. Identify the branch and commit that explain the deployed state,',
  'then propose the minimal cherry-pick or rebase onto the current working branch. Switch me to autoApply',
  'mode and I will approve before you modify git history. After you change files, you may run `tf9 init`',
  'and `tf9 plan` to verify the fix. Do not push or run terraform apply.',
  '',
  'Respond with:',
  '## Drift diagnosis',
  'State the affected resources, cause, evidence, and smallest safe fix.',
  '## Option A: Fix manually',
  'Give numbered commands with expected results, conflict handling, verification with terraform plan, and abort/rollback steps.',
  '## Option B: Fix with AI',
  'Describe exactly what you would change and verify, then wait for autoApply approval.',
  '## Summary',
  'List investigation, commands, changes, verification, and remaining actions. For each tf9 verification run,',
  'include its run ID, a [Run History](#runs) link, and a concise result summary. In review mode say "No changes were made."',
  '',
  'Do not run terraform apply/destroy, push, mutate state, force-unlock, untaint, or discard local work.',
].join('\n');

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
  configuredPrompt?: string,
): string {
  const integrationRef = status.integrationRef || status.integrationBranch;
  const activeList = activeBranches
    ? (activeBranches.branches
        .filter(b => b.name !== status.currentBranch)
        .map(b => {
          const locations = [b.local && 'local', b.remote && 'origin'].filter(Boolean).join(' + ');
          return `- ${b.name} [${locations || 'unknown ref'}] @ ${b.hash.slice(0, 7)} (${b.author}, ${b.date}): ${b.subject}`;
        })
        .join('\n') || '(no other active branches in the configured window)')
    : '(could not list active branches)';
  const missingCommits = formatCommits(status.behindCommits);
  const branchCommits = formatCommits(status.aheadCommits);

  const parts = [
    `I need help reconciling Terraform drift on the repo "${repo}" before applying.`,
    `Current working branch: ${status.currentBranch}.`,
    `Integration branch: ${integrationRef}.`,
    `Branch relationship: ${status.behind ?? 0} behind, ${status.ahead ?? 0} ahead${status.diverged ? ' (diverged)' : ''}.`,
    `Server recommendation: ${status.recommend}.`,
    '',
    `Commits on ${integrationRef} that are missing from ${status.currentBranch}:`,
    missingCommits,
    '',
    `Commits on ${status.currentBranch} that are not on ${integrationRef}:`,
    branchCommits,
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

  parts.push('', configuredPrompt?.trim() || DEFAULT_RECONCILE_PROMPT);

  return parts.join('\n');
}

function formatCommits(commits: ReconcileStatus['behindCommits']): string {
  if (!commits?.length) return '(none)';
  return commits
    .slice(0, 20)
    .map(commit => `- ${commit.Hash.slice(0, 12)} ${commit.Subject} (${commit.Author}, ${commit.Date})`)
    .join('\n');
}

// truncatePlan keeps the tail of long terraform output (the plan summary and
// resource diffs live near the end) and caps the prompt at a sane size.
function truncatePlan(output: string): string {
  const MAX = 12000;
  if (output.length <= MAX) return output;
  return `… (truncated)\n${output.slice(output.length - MAX)}`;
}
