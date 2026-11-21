"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import { popover as popoverRecipe } from "@/lib/theme";
import type { GraphTickUnits } from "../../_lib/graphModel";
import { trigger, menu, row, rowCheck, hint } from "./MarkerMenu.css";

// Shared with the mobile settings sheet, which renders the same units as
// switch rows instead of this popover.
export const MARKER_UNIT_ROWS: { key: keyof GraphTickUnits; label: string }[] =
  [
    { key: "hour", label: "Hours" },
    { key: "day", label: "Days" },
    { key: "week", label: "Weeks" },
    { key: "month", label: "Months" },
  ];

export function MarkerMenu({
  value,
  onChange,
}: {
  value: GraphTickUnits;
  onChange: (next: GraphTickUnits) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className={trigger} aria-label="Time markers">
          Markers
          <ChevronDown size={13} strokeWidth={2.2} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={`${popoverRecipe({ size: "sm" })} ${menu}`}
          align="end"
          sideOffset={6}
          collisionPadding={8}
        >
          {MARKER_UNIT_ROWS.map((unit) => (
            <button
              key={unit.key}
              type="button"
              className={row}
              aria-pressed={value[unit.key]}
              onClick={() =>
                onChange({ ...value, [unit.key]: !value[unit.key] })
              }
            >
              <span
                className={rowCheck}
                data-checked={value[unit.key] || undefined}
              >
                {value[unit.key] && <Check size={11} strokeWidth={2.8} />}
              </span>
              {unit.label}
            </button>
          ))}
          <span className={hint}>Markers show once the zoom gives them room.</span>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
