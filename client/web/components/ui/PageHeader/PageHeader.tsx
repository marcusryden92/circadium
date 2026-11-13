import type { ReactNode } from "react";
import {
  pageHeaderRow,
  pageHeaderTitle,
  pageHeaderSummary,
} from "./PageHeader.css";

type Props = {
  title: ReactNode;
  summary?: ReactNode;
  children?: ReactNode;
};

// Shared page header for the standard content routes. Owns the title row and
// the mobile treatment that clears the floating CornerActions pills (centered
// in portrait, reverting to a left-aligned row in landscape). Trailing content
// (action buttons, keyboard hints, status banners) rides in as children.
export function PageHeader({ title, summary, children }: Props) {
  return (
    <div className={pageHeaderRow}>
      <h1 className={pageHeaderTitle}>{title}</h1>
      {summary != null && <span className={pageHeaderSummary}>{summary}</span>}
      {children}
    </div>
  );
}
