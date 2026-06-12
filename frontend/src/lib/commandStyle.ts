const COMMAND_CLASSES: Record<string, string> = {
  init: 'command-init',
  plan: 'command-plan',
  apply: 'command-apply',
  destroy: 'command-destroy',
  auto: 'command-auto',
  validate: 'command-validate',
  refresh: 'command-refresh',
  state: 'command-state',
  'state list': 'command-state',
  output: 'command-output',
  import: 'command-import',
  taint: 'command-taint',
  untaint: 'command-untaint',
  'force-unlock': 'command-force-unlock',
};

export function commandStyleClass(command: string): string {
  return COMMAND_CLASSES[command.trim().toLowerCase()] ?? 'command-default';
}
