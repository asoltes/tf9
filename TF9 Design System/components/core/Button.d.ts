export interface ButtonProps {
  /** Visual style */
  variant?: 'primary' | 'normal' | 'danger' | 'danger-outline' | 'ghost' | 'link' | 'icon';
  /** Size */
  size?: 'md' | 'sm';
  /** Disabled state */
  disabled?: boolean;
  /** Shows a spinner and disables the button */
  loading?: boolean;
  /** Optional leading icon (React node, typically an SVG) */
  icon?: React.ReactNode;
  /** Click handler */
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  /** Button type attribute */
  type?: 'button' | 'submit' | 'reset';
  children?: React.ReactNode;
}
