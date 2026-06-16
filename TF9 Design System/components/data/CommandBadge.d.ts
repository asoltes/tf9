export interface CommandBadgeProps {
  /** Terraform command name (plan, apply, destroy, init, etc.) */
  command: string;
  /** Badge size */
  size?: 'md' | 'sm';
}
