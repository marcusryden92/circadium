"use client";

import { useState, type CSSProperties } from "react";
import { Plus, X } from "lucide-react";
import { Button, FieldStack, Input } from "@/components/ui";
import { StepFrame } from "../_components/StepFrame";
import {
  STARTER_ROLE_PRESETS,
  CUSTOM_ROLE_COLORS,
  type RoleSelection,
} from "../_lib/starterCategories";
import {
  roleColumns,
  roleColumn,
  roleColumnTitle,
  roleRow,
  roleRowLabel,
  roleRowIcon,
  roleSelectedList,
  roleSelectedRow,
  roleDot,
  roleRowDragging,
  roleRowDropBefore,
  roleRowDropAfter,
  roleRowRemove,
  roleEmptyNote,
  customRow,
  input,
  selectionCaption,
  footerActions,
} from "../onboarding.css";

type DragZone = "before" | "after";

type RolesStepProps = {
  stepIndex: number;
  totalSteps: number;
  selections: RoleSelection[];
  onChange: (next: RoleSelection[]) => void;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
  // True while the initial calendar snapshot is still loading — committing
  // before it lands would be wholesale-replaced by the fetch.
  continueDisabled?: boolean;
};

function roleColorVar(color: string): CSSProperties {
  return { ["--role-color"]: color } as CSSProperties;
}

// Transparent 1x1 GIF used as the drag image so the browser doesn't paint its
// default row screenshot; the dragging row's own dimmed styling signals the
// source. Matches the categories rail.
const TRANSPARENT_DRAG_IMAGE: HTMLImageElement | null = (() => {
  if (typeof document === "undefined") return null;
  const img = new Image();
  img.src =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  return img;
})();

export function RolesStep({
  stepIndex,
  totalSteps,
  selections,
  onChange,
  onBack,
  onContinue,
  onSkip,
  continueDisabled = false,
}: RolesStepProps) {
  const [customName, setCustomName] = useState("");
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{
    key: string;
    zone: DragZone;
  } | null>(null);

  const selectedKeys = new Set(selections.map((s) => s.key));
  // Dedupe by normalized name, not key: the preset "Self" (key `self`) and a
  // typed custom "Self" (key `custom:self`) are the same role to the user, and
  // the commit reconciles by name anyway.
  const hasName = (name: string) =>
    selections.some(
      (s) => s.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );

  // Reorder relative to a target row: pull the source out first, then insert
  // before/after the target in the remaining list so the math is correct in
  // both drag directions.
  const moveRelative = (
    sourceKey: string,
    targetKey: string,
    zone: DragZone,
  ) => {
    if (sourceKey === targetKey) return;
    const moved = selections.find((s) => s.key === sourceKey);
    if (!moved) return;
    const without = selections.filter((s) => s.key !== sourceKey);
    const targetIdx = without.findIndex((s) => s.key === targetKey);
    if (targetIdx === -1) return;
    const insertIdx = zone === "before" ? targetIdx : targetIdx + 1;
    const next = [...without];
    next.splice(insertIdx, 0, moved);
    onChange(next);
  };

  const endDrag = () => {
    setDraggedKey(null);
    setDragOver(null);
  };

  const addPreset = (key: string, name: string, color: string) => {
    if (selectedKeys.has(key) || hasName(name)) return;
    onChange([...selections, { key, name, color }]);
  };

  const removeSelection = (key: string) => {
    onChange(selections.filter((s) => s.key !== key));
  };

  const addCustom = () => {
    const name = customName.trim();
    if (!name) return;
    if (hasName(name)) {
      setCustomName("");
      return;
    }
    const key = `custom:${name.toLowerCase()}`;
    const color =
      CUSTOM_ROLE_COLORS[selections.length % CUSTOM_ROLE_COLORS.length];
    onChange([...selections, { key, name, color }]);
    setCustomName("");
  };

  const availablePresets = STARTER_ROLE_PRESETS.filter(
    (preset) => !selectedKeys.has(preset.key) && !hasName(preset.name),
  );

  return (
    <StepFrame
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Choose your roles"
      subtitle="The key roles you play in life — you'll set goals within each one. Group finer categories under them later."
      onSkip={onSkip}
      footer={
        <>
          <Button variant="glass" onClick={onBack}>
            Back
          </Button>
          <div className={footerActions}>
            <Button
              variant="glassInk"
              onClick={onContinue}
              disabled={continueDisabled}
            >
              Continue
            </Button>
          </div>
        </>
      }
    >
      <div className={roleColumns}>
        <FieldStack>
          <span className={roleColumnTitle}>Suggestions</span>
          <div className={roleColumn}>
            {availablePresets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                className={roleRow}
                style={roleColorVar(preset.color)}
                onClick={() => addPreset(preset.key, preset.name, preset.color)}
              >
                <span className={roleRowLabel}>{preset.name}</span>
                <span className={roleRowIcon}>
                  <Plus size={15} strokeWidth={2.2} />
                </span>
              </button>
            ))}
          </div>
        </FieldStack>
        <FieldStack>
          <span className={roleColumnTitle}>Your roles</span>
          <div className={roleColumn}>
            {selections.length === 0 ? (
              <span className={roleEmptyNote}>
                Nothing yet — add from the left or type your own.
              </span>
            ) : (
              <div className={roleSelectedList}>
                {selections.map((sel) => {
                  const dropZone =
                    dragOver?.key === sel.key ? dragOver.zone : null;
                  return (
                    <div
                      key={sel.key}
                      className={`${roleSelectedRow} ${
                        draggedKey === sel.key ? roleRowDragging : ""
                      } ${
                        dropZone === "before"
                          ? roleRowDropBefore
                          : dropZone === "after"
                            ? roleRowDropAfter
                            : ""
                      }`}
                      style={roleColorVar(sel.color)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        // Firefox needs data set or the drag won't start; the
                        // value is unused (source comes from draggedKey state).
                        e.dataTransfer.setData("text/plain", sel.key);
                        if (TRANSPARENT_DRAG_IMAGE) {
                          e.dataTransfer.setDragImage(
                            TRANSPARENT_DRAG_IMAGE,
                            0,
                            0,
                          );
                        }
                        setDraggedKey(sel.key);
                      }}
                      onDragEnd={endDrag}
                      onDragOver={(e) => {
                        if (!draggedKey) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (draggedKey === sel.key) {
                          if (dragOver?.key === sel.key) setDragOver(null);
                          return;
                        }
                        const rect = e.currentTarget.getBoundingClientRect();
                        const zone: DragZone =
                          e.clientY - rect.top < rect.height / 2
                            ? "before"
                            : "after";
                        if (
                          dragOver?.key !== sel.key ||
                          dragOver.zone !== zone
                        ) {
                          setDragOver({ key: sel.key, zone });
                        }
                      }}
                      onDragLeave={(e) => {
                        const next = e.relatedTarget as Node | null;
                        if (next && e.currentTarget.contains(next)) return;
                        if (dragOver?.key === sel.key) setDragOver(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedKey && dragOver && draggedKey !== sel.key) {
                          moveRelative(draggedKey, sel.key, dragOver.zone);
                        }
                        endDrag();
                      }}
                    >
                      <span className={roleDot} aria-hidden />
                      <span className={roleRowLabel}>{sel.name}</span>
                      <button
                        type="button"
                        className={roleRowRemove}
                        onClick={() => removeSelection(sel.key)}
                        aria-label={`Remove ${sel.name}`}
                      >
                        <X size={13} strokeWidth={2.2} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>{" "}
          <div className={customRow}>
            <Input
              className={input}
              placeholder="Add your own role…"
              value={customName}
              maxLength={40}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
            />
            <Button
              variant="glass"
              size="sm"
              onClick={addCustom}
              disabled={!customName.trim()}
            >
              Add
            </Button>
          </div>
          <span className={selectionCaption}>
            {selections.length === 0
              ? "None selected yet"
              : `${selections.length} selected`}
          </span>
        </FieldStack>
      </div>
    </StepFrame>
  );
}
