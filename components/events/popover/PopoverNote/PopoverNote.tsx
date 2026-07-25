"use client";

import { type ReactNode } from "react";
import { note, noteIcon } from "./PopoverNote.css";

interface PopoverNoteProps {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PopoverNote({ icon, children, className }: PopoverNoteProps) {
  return (
    <div className={className ? `${note} ${className}` : note}>
      {icon && <span className={noteIcon}>{icon}</span>}
      <span>{children}</span>
    </div>
  );
}
