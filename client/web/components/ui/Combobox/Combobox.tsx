"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import {
  comboboxWrap,
  comboSmallPadding,
  comboboxTrigger,
  comboboxTriggerDisabled,
  comboboxMenu,
  comboboxOption,
  comboboxOptionActive,
  comboboxChevron,
} from "./Combobox.css";

export interface ComboboxOption<V extends string | null> {
  value: V;
  label: ReactNode;
  searchLabel?: string;
}

interface ComboboxProps<V extends string | null> {
  value: V;
  options: ComboboxOption<V>[];
  onChange: (value: V) => void;
  renderValue?: (option: ComboboxOption<V> | undefined) => ReactNode;
  placeholder?: ReactNode;
  ariaLabel?: string;
  width?: number | string;
  // Cap the trigger's width so a long value truncates instead of overflowing a
  // narrow container. Unlike `width` it lets the pill keep hugging its content
  // until it hits the cap (pass "100%" to bound it to the field column).
  maxWidth?: number | string;
  disabled?: boolean;
  small?: boolean;
}

export function Combobox<V extends string | null>({
  value,
  options,
  onChange,
  renderValue,
  placeholder = "Select…",
  ariaLabel,
  width,
  maxWidth,
  disabled = false,
  small = false,
}: ComboboxProps<V>) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  const wrapStyle: CSSProperties = {};
  if (width != null) {
    wrapStyle.width = width;
    wrapStyle.display = "block";
  }
  if (maxWidth != null) wrapStyle.maxWidth = maxWidth;

  const triggerStyle: CSSProperties = {};
  if (width != null) triggerStyle.width = "100%";
  if (maxWidth != null) triggerStyle.maxWidth = "100%";

  const hasWrapStyle = width != null || maxWidth != null;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
      }}
    >
      <div
        className={comboboxWrap}
        style={hasWrapStyle ? wrapStyle : undefined}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={`${comboboxTrigger} ${disabled ? comboboxTriggerDisabled : ""} ${small ? comboSmallPadding : ""}`}
            aria-haspopup="listbox"
            aria-label={ariaLabel}
            aria-disabled={disabled}
            disabled={disabled}
            style={hasWrapStyle ? triggerStyle : undefined}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "left",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {renderValue
                ? renderValue(current)
                : (current?.label ?? placeholder)}
            </span>
            <ChevronDown
              size={12}
              strokeWidth={2.2}
              className={comboboxChevron}
              aria-hidden
            />
          </button>
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Content
          className={comboboxMenu}
          role="listbox"
          align="start"
          sideOffset={6}
          style={{ minWidth: "var(--radix-popover-trigger-width)" }}
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                role="option"
                aria-selected={active}
                className={`${comboboxOption} ${
                  active ? comboboxOptionActive : ""
                }`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
