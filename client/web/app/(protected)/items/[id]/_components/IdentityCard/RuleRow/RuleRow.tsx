"use client";

import { useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { SlidersHorizontal } from "lucide-react";
import { Switch } from "@/components/ui";
import { popover as popoverRecipe } from "@/lib/theme";
import {
  row,
  rowMain,
  rowLabel,
  rowSummary,
  rowSummaryOn,
  rowIcon,
  panel,
  panelTitle,
} from "./RuleRow.css";

interface RuleRowProps {
  label: string;
  // One-line value readout shown on the row ("Mon–Fri · 09:00–17:00", "Off").
  summary: string;
  enabled: boolean;
  // Omitted → no switch; the row is a plain open-editor button (Repeats).
  onToggle?: (checked: boolean) => void;
  children: ReactNode;
}

// One-line scheduling rule: switch + label + value summary. The editor opens
// in an anchored popover so the card height never changes with editor state.
export function RuleRow({
  label,
  summary,
  enabled,
  onToggle,
  children,
}: RuleRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={row}>
        {onToggle && (
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => {
              onToggle(checked);
              if (!checked) setOpen(false);
            }}
            aria-label={label}
          />
        )}
        <Popover.Trigger asChild>
          <button
            type="button"
            className={rowMain}
            onClick={() => {
              if (!enabled && onToggle) onToggle(true);
            }}
          >
            <span className={rowLabel}>{label}</span>
            <span className={`${rowSummary} ${enabled ? rowSummaryOn : ""}`}>
              {summary}
            </span>
            <SlidersHorizontal size={12} strokeWidth={2.2} className={rowIcon} />
          </button>
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Content
          className={`${popoverRecipe({ size: "md" })} ${panel}`}
          align="end"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          // The editors nest their own portaled Radix pickers (TimePicker,
          // DateTimePicker, Combobox); interactions inside those panels must
          // not dismiss this popover.
          onPointerDownOutside={(e) => {
            const target = e.target as Element | null;
            if (target?.closest("[data-radix-popper-content-wrapper]")) {
              e.preventDefault();
            }
          }}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <div className={panelTitle}>{label}</div>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
