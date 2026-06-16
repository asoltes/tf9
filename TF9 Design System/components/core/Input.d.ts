export interface InputProps {
  type?: 'text' | 'password' | 'email' | 'search' | 'url' | 'number';
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  disabled?: boolean;
  /** Use monospace font (for paths, IDs, code values) */
  mono?: boolean;
  /** Field label rendered above the input */
  label?: string;
  /** Helper text rendered below the input */
  hint?: string;
  /** Validation error — overrides hint, turns border red */
  error?: string;
  id?: string;
}
