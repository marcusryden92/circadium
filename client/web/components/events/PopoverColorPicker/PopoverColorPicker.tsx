"use client";

import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import {
  CALENDAR_COLOR_GROUPS,
  type CalendarColorGroup,
} from "@/data/calendarColors";
import { vars, popover as popoverRecipe } from "@/lib/theme";
import {
  trigger,
  triggerDot,
  triggerLabel,
  popup,
  groupSwatches,
  swatch,
} from "./PopoverColorPicker.css";

interface Props {
  /** The currently applied color (used to highlight the active swatch). */
  currentColor: string;
  /** Called with a new color when the user picks a swatch. */
  onChange: (color: string) => void;
  /** Optional extra swatches appended as a "Custom" row. Wired up so
   *  user-saved custom colors will slot in later without touching this API. */
  customColors?: string[];
  /** Replace the grouped base palette with a single flat row. */
  palette?: string[];
  /** Replace the default dot-and-label trigger with a custom element
   *  (must accept a ref — it's rendered via Radix asChild). */
  trigger?: ReactNode;
}

export function PopoverColorPicker({
  currentColor,
  onChange,
  customColors = [],
  palette,
  trigger: customTrigger,
}: Props) {
  const [open, setOpen] = useState(false);

  const groups: CalendarColorGroup[] = palette
    ? [{ name: "Palette", colors: palette }]
    : CALENDAR_COLOR_GROUPS;
  const allGroups: CalendarColorGroup[] =
    customColors.length > 0
      ? [...groups, { name: "Custom", colors: customColors }]
      : groups;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {customTrigger ?? (
          <button type="button" aria-label="Pick color" className={trigger}>
            <span
              aria-hidden
              className={triggerDot}
              style={{ background: currentColor }}
            />
            <span className={triggerLabel}>Color</span>
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={`${popoverRecipe({ size: "sm" })} ${popup}`}
          aria-label="Color swatches"
          align="start"
          sideOffset={6}
          collisionPadding={8}
        >
          {allGroups.map((group) => (
            <div key={group.name} className={groupSwatches}>
              {group.colors.map((color) => {
                const active =
                  currentColor.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      onChange(color);
                      setOpen(false);
                    }}
                    aria-label={`Set color to ${color}`}
                    aria-pressed={active}
                    title={color}
                    className={swatch[active ? "active" : "inactive"]}
                    style={{ background: color }}
                  >
                    {active && (
                      <Check
                        size={9}
                        strokeWidth={3}
                        color={vars.textOnAccent}
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
