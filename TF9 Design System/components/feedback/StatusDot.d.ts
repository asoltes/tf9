export interface StatusDotProps {
  /** Semantic status */
  status?: 'running' | 'success' | 'failed' | 'warning' | 'neutral' | 'prod' | 'staging' | 'dev' | 'global';
  /** Dot diameter in px (default 8) */
  size?: number;
  /** Animate with a pulse (use for active/running states) */
  pulse?: boolean;
}
