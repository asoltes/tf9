export interface SkeletonProps {
  /** Number of lines to render */
  lines?: number;
  /** Optional explicit widths per line (e.g. ['100%', '80%', '60%']) */
  widths?: string[];
  /** Line height in px (default 12) */
  height?: number;
  /** Gap between lines in px (default 10) */
  gap?: number;
}
