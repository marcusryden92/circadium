"use client";

import { Switch } from "@/components/ui";
import { row, label, title, hint } from "./PopoverToggleField.css";

interface PopoverToggleFieldProps {
  title: string;
  hint: string;
  checked: boolean;
  onCheckedChange: () => void;
  ariaLabel: string;
  className?: string;
}

export function PopoverToggleField({
  title: titleText,
  hint: hintText,
  checked,
  onCheckedChange,
  ariaLabel,
  className,
}: PopoverToggleFieldProps) {
  return (
    <div className={className ? `${row} ${className}` : row}>
      <span className={label}>
        <span className={title}>{titleText}</span>
        <span className={hint}>{hintText}</span>
      </span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={ariaLabel}
      />
    </div>
  );
}
