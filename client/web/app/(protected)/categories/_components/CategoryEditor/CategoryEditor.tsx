"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Lock, MapPin, SquarePen, Trash2 } from "lucide-react";
import { Button, Caption, Combobox, FieldStack, Input } from "@/components/ui";
import { PopoverColorPicker } from "@/components/events/PopoverColorPicker";
import type { Category } from "@/types/prisma";
import type { SerializedLocation } from "@/redux/slices/schedulingSettingsSlice";
import { parseRecurrenceExceptions } from "@/utils/planRecurrence";
import { buildIndentedCategoryList } from "@/utils/categoryUtils";
import { WindowsMiniGrid } from "../WindowsMiniGrid";
import { CategoryExceptionsModal } from "../CategoryExceptionsModal";
import { useInlineEdit } from "./useInlineEdit";
import {
  editor,
  header,
  headerSwatch,
  headerInfo,
  headerName,
  headerNameInput,
  headerNamePencil,
  headerNameRow,
  headerSummary,
  headerActions,
  section,
  sectionPair,
  sectionTitle,
  fieldGrid,
  strictRow,
  strictToggle,
  strictToggleThumb,
  strictLabel,
  sectionHelp,
  windowsSubsection,
  subsectionLabel,
  classificationNote,
  subCategoriesList,
  subCategoryRow,
  subCategoryDot,
  subCategoryName,
  subCategoryMeta,
  inlineRow,
  inlineRowTight,
  parentOptionDot,
  lockIcon,
  subCategoryChevron,
  exceptionsBlock,
} from "./CategoryEditor.css";

export const SWATCH_PALETTE = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#64748b",
];

const FALLBACK_COLOR = "#9ca3af";

interface CategoryEditorProps {
  category: Category;
  categories: Category[];
  locations: SerializedLocation[];
  itemCount: number;
  subCategories: Category[];
  subCategoryCounts: Map<string, number>;
  onRename: (name: string) => void;
  onChangeColor: (color: string) => void;
  onChangeParent: (parentId: string | null) => void;
  onChangeLocation: (locationId: string | null) => void;
  onToggleStrict: () => void;
  onToggleUseTimeWindows: () => void;
  onToggleConfine: () => void;
  onDelete: () => void;
  onSelectSubCategory: (id: string) => void;
  onOpenWindows: () => void;
  onChangeWindowExceptions: (
    windowId: string,
    serialized: string | null,
  ) => void;
}

export function CategoryEditor({
  category,
  categories,
  locations,
  itemCount,
  subCategories,
  subCategoryCounts,
  onRename,
  onChangeColor,
  onChangeParent,
  onChangeLocation,
  onToggleStrict,
  onToggleUseTimeWindows,
  onToggleConfine,
  onDelete,
  onSelectSubCategory,
  onOpenWindows,
  onChangeWindowExceptions,
}: CategoryEditorProps) {
  const {
    editing: editingName,
    draft: nameDraft,
    setDraft: setNameDraft,
    inputRef: nameInputRef,
    startEdit: startNameEdit,
    commit: commitName,
    cancel: cancelName,
  } = useInlineEdit({
    value: category.name,
    resetKey: category.id,
    onCommit: onRename,
  });

  const [exceptionsOpen, setExceptionsOpen] = useState(false);
  const totalExceptions = useMemo(
    () =>
      category.timeSlots.reduce(
        (sum, w) =>
          sum + parseRecurrenceExceptions(w.recurrenceExceptions).length,
        0,
      ),
    [category.timeSlots],
  );

  const color = category.color || FALLBACK_COLOR;
  const initial = category.name.charAt(0).toUpperCase() || "?";

  // Top-level categories are "roles"; nested ones stay "categories" (with
  // "sub-category" for a category's own children).
  const isRole = !category.parentId;
  const selfNoun = isRole ? "role" : "category";
  const childCountLabel =
    subCategories.length === 1
      ? isRole
        ? "category"
        : "sub-category"
      : isRole
        ? "categories"
        : "sub-categories";

  const parentOptions = [
    { value: null as string | null, label: <Caption>Top-level</Caption> },
    ...buildIndentedCategoryList(categories)
      .filter((c) => c.id !== category.id && c.parentId !== category.id)
      .map((c) => ({
        value: c.id,
        label: (
          <span className={inlineRow} style={{ paddingLeft: c.depth * 12 }}>
            {c.color && (
              <span
                className={parentOptionDot}
                style={{ background: c.color }}
              />
            )}
            <span>{c.name}</span>
          </span>
        ),
      })),
  ];

  const locationOptions = [
    { value: null as string | null, label: <Caption>No default</Caption> },
    ...locations.map((l) => ({
      value: l.id,
      label: (
        <span className={inlineRow}>
          <MapPin size={12} strokeWidth={2} />
          <span>{l.name}</span>
        </span>
      ),
    })),
  ];

  const currentLocation = locations.find((l) => l.id === category.locationId);
  const parentCategory = category.parentId
    ? categories.find((c) => c.id === category.parentId)
    : undefined;
  const summary = [
    `${itemCount} item${itemCount === 1 ? "" : "s"}`,
    subCategories.length > 0
      ? `${subCategories.length} ${childCountLabel}`
      : null,
    category.isStrict ? "strict" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={editor}>
      <div className={header}>
        <div className={headerSwatch} style={{ background: color }}>
          {initial}
        </div>
        <div className={headerInfo}>
          <div className={headerNameRow}>
            {editingName ? (
              <Input
                ref={nameInputRef}
                variant="titleInline"
                className={headerNameInput}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitName();
                  else if (e.key === "Escape") cancelName();
                }}
                aria-label={isRole ? "Role name" : "Category name"}
              />
            ) : (
              <>
                <h2
                  className={headerName}
                  onClick={() => startNameEdit()}
                  title="Click to rename"
                >
                  {category.name}
                </h2>
                <button
                  type="button"
                  className={headerNamePencil}
                  onClick={() => startNameEdit()}
                  aria-label={isRole ? "Rename role" : "Rename category"}
                >
                  <SquarePen size={14} strokeWidth={2} />
                </button>
              </>
            )}
          </div>
          <div className={headerSummary}>{summary}</div>
        </div>
        <div className={headerActions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            aria-label={isRole ? "Delete role" : "Delete category"}
          >
            <Trash2 size={12} strokeWidth={2.2} />
            Delete
          </Button>
        </div>
      </div>

      <div className={section}>
        <div className={sectionTitle}>Identity</div>
        <div className={fieldGrid}>
          <FieldStack label="Color">
            <PopoverColorPicker currentColor={color} onChange={onChangeColor} />
          </FieldStack>
          <FieldStack label="Parent">
            <Combobox
              value={category.parentId ?? null}
              options={parentOptions}
              onChange={(v) => onChangeParent(v)}
              ariaLabel="Parent"
            />
          </FieldStack>
        </div>
      </div>

      <div className={sectionPair}>
        <div className={section}>
          <div className={sectionTitle}>Default location</div>
          <Combobox
            value={category.locationId ?? null}
            options={locationOptions}
            onChange={(v) => onChangeLocation(v)}
            renderValue={() =>
              currentLocation ? (
                <span className={inlineRowTight}>
                  <MapPin size={12} strokeWidth={2} />
                  {currentLocation.name}
                </span>
              ) : (
                <Caption>No default</Caption>
              )
            }
            ariaLabel="Default location"
          />
          <div className={sectionHelp}>
            Items in this {selfNoun} inherit this location unless overridden.
          </div>
        </div>
        <div className={section}>
          <div className={sectionTitle}>Uses time windows</div>
          <div className={strictRow}>
            <button
              type="button"
              className={strictToggle}
              data-on={category.useTimeWindows}
              onClick={onToggleUseTimeWindows}
              aria-pressed={category.useTimeWindows}
              aria-label="Toggle time-window scheduling"
            >
              <span className={strictToggleThumb} />
            </button>
            <span className={strictLabel}>
              {category.useTimeWindows ? "On" : "Off"}
            </span>
          </div>
          <div className={sectionHelp}>
            {category.useTimeWindows
              ? `Items in this ${selfNoun} schedule into the weekly windows below.`
              : `Items in this ${selfNoun} schedule freely — it's used for classification only.`}
          </div>
        </div>
      </div>

      {category.useTimeWindows ? (
        <div className={section}>
          <div className={sectionTitle}>Time windows</div>
          <div className={windowsSubsection}>
            <span className={subsectionLabel}>Strict mode</span>
            <div className={strictRow}>
              <button
                type="button"
                className={strictToggle}
                data-on={category.isStrict}
                onClick={onToggleStrict}
                aria-pressed={category.isStrict}
                aria-label="Toggle strict mode"
              >
                <span className={strictToggleThumb} />
              </button>
              <span className={strictLabel}>
                {category.isStrict ? "On" : "Off"}
              </span>
              <Lock
                size={13}
                strokeWidth={2}
                className={lockIcon}
                data-on={category.isStrict}
              />
            </div>
            <div className={sectionHelp}>
              {category.isStrict
                ? `Only ${category.name} items can be scheduled inside these windows.`
                : "Other items may fill empty space inside these windows."}
            </div>
          </div>
          <span className={subsectionLabel}>Weekly windows</span>
          <WindowsMiniGrid
            windows={category.timeSlots}
            color={color}
            onOpen={onOpenWindows}
          />
          {category.timeSlots.length > 0 && (
            <div className={exceptionsBlock}>
              <span className={subsectionLabel}>Per-occurrence exceptions</span>
              <Button
                variant="glass"
                size="sm"
                onClick={() => setExceptionsOpen(true)}
              >
                Manage exceptions
                {totalExceptions > 0 ? ` · ${totalExceptions}` : ""}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className={section}>
          <div className={sectionTitle}>Time windows</div>
          <div className={classificationNote}>
            This {selfNoun} doesn&apos;t use time-window scheduling. Items in it
            schedule wherever there&apos;s capacity. Turn on{" "}
            <strong>Uses time windows</strong> to add weekly windows or strict
            mode.
          </div>
        </div>
      )}

      {parentCategory && (
        <div className={section}>
          <div className={sectionTitle}>Window cascade</div>
          <div className={strictRow}>
            <button
              type="button"
              className={strictToggle}
              data-on={category.confineToOwnWindows}
              onClick={onToggleConfine}
              aria-pressed={category.confineToOwnWindows}
              aria-label="Toggle confine to own windows"
            >
              <span className={strictToggleThumb} />
            </button>
            <span className={strictLabel}>
              {category.confineToOwnWindows ? "Confined" : "Cascades up"}
            </span>
          </div>
          <div className={sectionHelp}>
            {category.confineToOwnWindows
              ? `Items in ${category.name} schedule only in its own windows.`
              : `Items in ${category.name} may also schedule in ${parentCategory.name}'s windows.`}
          </div>
        </div>
      )}

      {subCategories.length > 0 && (
        <div className={section}>
          <div className={sectionTitle}>
            {isRole ? "Categories" : "Sub-categories"} · {subCategories.length}
          </div>
          <div className={subCategoriesList}>
            {subCategories.map((s) => {
              const count = subCategoryCounts.get(s.id) ?? 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={subCategoryRow}
                  onClick={() => onSelectSubCategory(s.id)}
                >
                  <span
                    className={subCategoryDot}
                    style={{ background: s.color || FALLBACK_COLOR }}
                  />
                  <span className={subCategoryName}>{s.name}</span>
                  <span className={subCategoryMeta}>
                    {count} item{count === 1 ? "" : "s"}
                  </span>
                  <ChevronRight
                    size={14}
                    strokeWidth={2}
                    className={subCategoryChevron}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <CategoryExceptionsModal
        open={exceptionsOpen}
        onClose={() => setExceptionsOpen(false)}
        category={category}
        onChangeWindowExceptions={onChangeWindowExceptions}
      />
    </div>
  );
}
