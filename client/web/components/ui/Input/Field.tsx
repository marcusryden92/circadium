"use client";

import { type ReactNode } from "react";
import { field, fieldLabelCls, fieldNote } from "./Input.css";

interface FieldProps {
  label?: ReactNode;
  note?: ReactNode;
  className?: string;
  children: ReactNode;
}

// Label + control + optional note, stacked. Wraps its control in a <label> so
// clicking the label focuses the input without an explicit htmlFor.
export function Field({ label, note, className, children }: FieldProps) {
  return (
    <label className={className ? `${field} ${className}` : field}>
      {label != null && <span className={fieldLabelCls}>{label}</span>}
      {children}
      {note != null && <span className={fieldNote}>{note}</span>}
    </label>
  );
}
