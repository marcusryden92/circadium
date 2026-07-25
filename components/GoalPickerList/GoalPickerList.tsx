"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Check, Search, Target } from "lucide-react";
import { Input } from "@/components/ui";
import type { Planner } from "@/types/prisma";
import {
  container,
  inputRow,
  inputIcon,
  input,
  scrollArea,
  option,
  optionActive,
  optionIcon,
  optionTitle,
  optionCheck,
  emptyState,
} from "./GoalPickerList.css";

// A search-and-pick list for choosing a goal, styled to match the global
// search palette. Self-contained: owns the query + selection. Nothing is
// picked until the user clicks a row (or arrows to it) — hovering only shows a
// hover highlight, it never marks — and the marked row is reported via onSelect.
export function GoalPickerList({
  goals,
  onSelect,
  onSubmit,
  autoFocus = true,
}: {
  goals: Planner[];
  onSelect: (goalId: string | null) => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return goals;
    return goals.filter((g) =>
      (g.title || "Untitled").toLowerCase().includes(q),
    );
  }, [goals, query]);

  // Drop the selection if the query narrows it out of view, so a confirm can
  // never act on a goal the user can no longer see.
  useEffect(() => {
    if (selectedId && !filtered.some((g) => g.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    onSelect(selectedId);
  }, [selectedId, onSelect]);

  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [autoFocus]);

  const step = (delta: number) => {
    if (filtered.length === 0) return;
    setSelectedId((cur) => {
      const idx = filtered.findIndex((g) => g.id === cur);
      const next =
        idx < 0
          ? delta > 0
            ? 0
            : filtered.length - 1
          : (idx + delta + filtered.length) % filtered.length;
      return filtered[next].id;
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "Enter") {
      if (!selectedId) return;
      e.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <div className={container}>
      <div className={inputRow}>
        <span className={inputIcon} aria-hidden>
          <Search size={16} strokeWidth={2} />
        </span>
        <Input
          ref={inputRef}
          variant="bare"
          className={input}
          placeholder="Search goals…"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Search goals"
        />
      </div>

      <div className={scrollArea} role="listbox" aria-label="Choose a goal">
        {filtered.length === 0 ? (
          <div className={emptyState}>
            {query.trim()
              ? `No goals match "${query.trim()}"`
              : "No goals to file under yet."}
          </div>
        ) : (
          filtered.map((g) => {
            const isSelected = g.id === selectedId;
            return (
              <button
                key={g.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`${option} ${isSelected ? optionActive : ""}`}
                onClick={() => setSelectedId(g.id)}
              >
                <span className={optionIcon} aria-hidden>
                  <Target size={16} strokeWidth={2} />
                </span>
                <span className={optionTitle}>{g.title || "Untitled"}</span>
                {isSelected && (
                  <Check className={optionCheck} size={15} strokeWidth={2.4} />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
