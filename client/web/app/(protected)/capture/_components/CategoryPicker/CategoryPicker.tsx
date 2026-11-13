"use client";

import { radii, space } from "@/lib/theme";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronDown } from "lucide-react";
import { CategoryDot } from "@/components/ui";
import { useListKeyboardNav } from "@/hooks/useListKeyboardNav";
import useClickOutside from "@/hooks/useClickOutside";
import { buildIndentedCategoryList } from "@/utils/categoryUtils";
import type { Category } from "@/types/prisma";
import {
  categoryTrigger,
  categoryTriggerLabel,
  categoryTriggerEmpty,
  categoryTriggerChevron,
  categoryDropdownWrap,
  categoryDropdown,
  categoryDropdownItem,
  categoryDropdownItemActive,
  categoryDropdownItemMuted,
} from "../../page.css";

type CategoryOption = {
  id: string;
  name: string;
  color?: string | null;
  depth: number;
};

const NO_CATEGORY: CategoryOption = {
  id: "",
  name: "No category",
  color: null,
  depth: 0,
};

export function CategoryPicker({
  categories,
  value,
  onChange,
  selected,
}: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  selected: Category | null;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const options: CategoryOption[] = useMemo(
    () => [
      NO_CATEGORY,
      ...buildIndentedCategoryList(categories).map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        depth: c.depth,
      })),
    ],
    [categories],
  );

  const handleSelect = useCallback(
    (opt: CategoryOption) => {
      onChange(opt.id);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  const keyboardNav = useListKeyboardNav<CategoryOption>(
    open ? options : [],
    handleSelect,
  );

  useClickOutside({
    ref: wrapRef,
    onClickOutside: () => setOpen(false),
    isActive: open,
  });

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.id === value);
    keyboardNav.setActiveIndex(idx >= 0 ? idx : 0);
  }, [open]);

  const triggerLabel = selected?.name ?? "No category";
  const isEmpty = !selected;

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (open && e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    keyboardNav.onKeyDown(e);
  };

  return (
    <div
      className={categoryDropdownWrap}
      ref={wrapRef}
      data-capture-picker="true"
    >
      <button
        ref={triggerRef}
        type="button"
        className={categoryTrigger}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected?.color && (
          <CategoryDot color={selected.color} size={10} glow={false} />
        )}
        <span
          className={`${categoryTriggerLabel} ${
            isEmpty ? categoryTriggerEmpty : ""
          }`}
        >
          {triggerLabel}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={2.4}
          className={categoryTriggerChevron}
        />
      </button>

      {open && (
        <div className={categoryDropdown} ref={keyboardNav.containerRef}>
          {options.map((opt, i) => {
            const active = keyboardNav.activeIndex === i;
            const isNone = opt.id === "";
            return (
              <button
                key={opt.id || "none"}
                type="button"
                data-knav-index={i}
                className={`${categoryDropdownItem} ${
                  active ? categoryDropdownItemActive : ""
                } ${isNone ? categoryDropdownItemMuted : ""}`}
                onMouseEnter={() => keyboardNav.setActiveIndex(i)}
                onClick={() => handleSelect(opt)}
              >
                {opt.depth > 0 && (
                  <span
                    aria-hidden
                    style={{ width: opt.depth * space["3"], flexShrink: 0 }}
                  />
                )}
                {isNone ? (
                  <span
                    aria-hidden
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 10,
                      borderRadius: radii["pill"],
                      border: "1px dashed currentColor",
                      opacity: 0.5,
                      flexShrink: 0,
                    }}
                  />
                ) : opt.color ? (
                  <CategoryDot color={opt.color} size={10} glow={false} />
                ) : (
                  <span style={{ width: 10, flexShrink: 0 }} />
                )}
                <span style={{ flex: 1, minWidth: 0 }}>{opt.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
