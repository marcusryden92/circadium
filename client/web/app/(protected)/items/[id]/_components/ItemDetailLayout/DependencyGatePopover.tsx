"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { MoreHorizontal } from "lucide-react";
import type { Planner } from "@/types/prisma";
import { Button } from "@/components/ui";
import { popover as popoverRecipe, vars, text, space } from "@/lib/theme";

export type GateEntry = {
  edgeId: string;
  // The row whose readiness gates — always a root (readiness cascades from
  // roots only). The Ready/Un-ready shortcut targets it.
  goal: Planner;
  // Set when the edge's endpoint is an interior node of `goal`: the row
  // renders "part of <goal>" and the shortcut is withheld.
  viaNode?: Planner;
};

type DependencyGatePopoverProps = {
  // "ready" lists blockers with a Ready shortcut; "unready" lists ready
  // dependents with an Un-ready shortcut.
  mode: "ready" | "unready";
  entries: GateEntry[];
  // Returns null on success or an in-place message when the target goal's
  // own gate refuses (no deep cascade — the user resolves it there).
  onApply: (goal: Planner) => string | null;
  onDisconnect: (edgeId: string) => void;
};

export function DependencyGatePopover({
  mode,
  entries,
  onApply,
  onDisconnect,
}: DependencyGatePopoverProps) {
  const [open, setOpen] = useState(false);
  const [rowMessages, setRowMessages] = useState<Record<string, string>>({});

  if (entries.length === 0) return null;

  const handleApply = (entry: GateEntry) => {
    const message = onApply(entry.goal);
    setRowMessages((prev) => {
      const next = { ...prev };
      if (message) next[entry.edgeId] = message;
      else delete next[entry.edgeId];
      return next;
    });
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={
            mode === "ready" ? "Resolve prerequisites" : "Resolve dependents"
          }
        >
          <MoreHorizontal size={14} strokeWidth={2.2} />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={popoverRecipe({ size: "md" })}
          align="end"
          sideOffset={6}
          style={{ width: 300, zIndex: 100, padding: space["3"] }}
        >
          <div
            className={text.microLabel}
            style={{
              color: vars.muted,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 600,
              marginBottom: space["2"],
            }}
          >
            {mode === "ready" ? "Awaiting" : "Required by"}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: space["2"],
            }}
          >
            {entries.map((entry) => (
              <div key={entry.edgeId}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: space["2"],
                    minWidth: 0,
                  }}
                >
                  <span
                    className={text.bodySm}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      color: vars.ink,
                    }}
                  >
                    {entry.viaNode
                      ? `${entry.viaNode.title || "Untitled"} — part of "${entry.goal.title || "Untitled"}"`
                      : entry.goal.title || "Untitled"}
                  </span>
                  {!entry.viaNode && (
                    <Button
                      variant="glass"
                      size="sm"
                      onClick={() => handleApply(entry)}
                    >
                      {mode === "ready" ? "Ready" : "Un-ready"}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDisconnect(entry.edgeId)}
                  >
                    Disconnect
                  </Button>
                </div>
                {rowMessages[entry.edgeId] && (
                  <div
                    className={text.bodySm}
                    style={{
                      color: vars.status.warning,
                      marginTop: space["1"],
                      lineHeight: 1.4,
                    }}
                  >
                    {rowMessages[entry.edgeId]}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
