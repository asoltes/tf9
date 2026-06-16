export interface RunStatusProps {
  /** TF9 run status value */
  status: 'running' | 'success' | 'partial_success' | 'failed' | 'cancelled' | 'denied';
  /** Show the leading icon (default true) */
  showIcon?: boolean;
  /** Size of the icon and text */
  size?: 'md' | 'sm';
}
