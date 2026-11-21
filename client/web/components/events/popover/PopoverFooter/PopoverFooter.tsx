"use client";

import { type ReactNode } from "react";
import { footer, group } from "./PopoverFooter.css";

interface PopoverFooterProps {
  /** Left group: quiet utility actions (Delete, Duplicate, Open editor…). */
  utility?: ReactNode;
  /** Right group: prominent in-context actions (Complete, Postpone, links). */
  primary?: ReactNode;
}

export function PopoverFooter({ utility, primary }: PopoverFooterProps) {
  return (
    <div className={footer}>
      <div className={group}>{utility}</div>
      <div className={group}>{primary}</div>
    </div>
  );
}
