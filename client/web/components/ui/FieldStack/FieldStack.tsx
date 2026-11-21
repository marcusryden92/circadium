import { type ReactNode } from "react";
import {
  fieldStack,
  fieldStackFull,
  fieldLabel,
  fieldValue,
} from "./FieldStack.css";

type FieldStackSize = "sm" | "md" | "lg";

interface FieldStackProps {
  label?: ReactNode;
  // sm: dense drawers/modals. md (default): multi-column grid rows. lg: onboarding.
  size?: FieldStackSize;
  // Spans the full width of a multi-column field grid.
  full?: boolean;
  className?: string;
  children: ReactNode;
  hidden?: boolean;
  disabled?: boolean;
}

// Label stacked above an arbitrary control. Deliberately a <div>, not the
// <label> of the Input primitive's Field: these wrap button-based controls
// (Combobox, SegmentedControl, color/type pickers) that a <label> would hijack.
export function FieldStack({
  label,
  size = "md",
  full,
  className,
  children,
  hidden = false,
  disabled = false,
}: FieldStackProps) {
  const classes = [fieldStack[size], full && fieldStackFull, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={{
        visibility: hidden ? "hidden" : "visible",
        opacity: disabled ? "50%" : "100%",
        pointerEvents: disabled ? "none" : "all",
      }}
    >
      {label != null && <span className={fieldLabel[size]}>{label}</span>}
      {children}
    </div>
  );
}

// The bold tabular read-only counterpart to a control, for fields that only
// display a value (e.g. a goal's rolled-up total duration).
export function FieldValue({ children }: { children: ReactNode }) {
  return <span className={fieldValue}>{children}</span>;
}
