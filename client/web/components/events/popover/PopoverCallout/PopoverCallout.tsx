"use client";

import { type ReactNode } from "react";
import { callout, calloutIcon, calloutText } from "./PopoverCallout.css";

interface PopoverCalloutProps {
  tone: "warning" | "error";
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PopoverCallout({
  tone,
  icon,
  children,
  className,
}: PopoverCalloutProps) {
  return (
    <div className={className ? `${callout[tone]} ${className}` : callout[tone]}>
      {icon && (
        <span className={calloutIcon[tone]} aria-hidden>
          {icon}
        </span>
      )}
      <span className={calloutText}>{children}</span>
    </div>
  );
}
