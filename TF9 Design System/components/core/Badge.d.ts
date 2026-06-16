export interface BadgeProps {
  /** Color variant */
  variant?: 'default' | 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'outline';
  /** Show a small colored dot before the label */
  dot?: boolean;
  children?: React.ReactNode;
}
