"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { v4 as uuidv4 } from "uuid";
import { Plus } from "lucide-react";
import {
  BottomSheet,
  Button,
  ConfirmModal,
  Loader,
  PageHeader,
  vars,
} from "@/components/ui";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  upsertCategory,
  removeCategory,
  upsertTimeWindow,
  recordHistory,
} from "@/redux/slices/calendarSourceSlice";
import type { AppDispatch, RootState } from "@/redux/store";
import {
  buildCategoryTree,
  compareCategoryNames,
  getCategoryAndDescendants,
} from "@/utils/categoryUtils";
import type { Category } from "@/types/prisma";
import { historyMessages } from "@/utils/historyMessages";
import { WeekStructureModal } from "@/components/calendar/WeekStructureModal";
import { CategoryEditor, SWATCH_PALETTE } from "./_components/CategoryEditor";
import {
  CategoryTreeNode,
  type CategoryDropTarget,
} from "./_components/CategoryTreeNode";
import { CategoryDragBox } from "./_components/CategoryDragBox";
import {
  page,
  mainGrid,
  rail,
  railHead,
  railBody,
  railBodyDragActive,
  railFooter,
  railNewButton,
  mainCard,
  emptyMain,
  errorBanner,
} from "./page.css";

export default function CategoriesPage() {
  const dispatch = useDispatch<AppDispatch>();
  const { planner, categories, updateAll } = useCalendarProvider();
  const locations = useSelector(
    (state: RootState) => state.schedulingSettings.locations,
  );
  const isLoaded = useSelector(
    (state: RootState) => state.calendarSource.isLoaded,
  );

  const isMobile = useIsMobile();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, _setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [windowsOpen, setWindowsOpen] = useState(false);
  const [editorSheetOpen, setEditorSheetOpen] = useState(false);
  // Grip-pointer drag state (useCategoryDrag drives it). draggedId tracks
  // the source; dragOver tracks the current folder-style target (a row to
  // nest into, or the rail background = move to top level); droppedId runs
  // the post-drop landing flash on the moved row.
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<CategoryDropTarget | null>(null);
  const [droppedId, setDroppedId] = useState<string | null>(null);
  const dropFlashTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (dropFlashTimer.current !== null)
        window.clearTimeout(dropFlashTimer.current);
    },
    [],
  );

  const tree = useMemo(() => buildCategoryTree(categories), [categories]);

  // Default to first top-level category on first render once data is in.
  const effectiveSelectedId =
    selectedId ?? (tree.length > 0 ? tree[0].id : null);

  const selected = useMemo(
    () =>
      effectiveSelectedId
        ? (categories.find((c) => c.id === effectiveSelectedId) ?? null)
        : null,
    [categories, effectiveSelectedId],
  );

  const itemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of categories) {
      const descendantIds = new Set(
        getCategoryAndDescendants(category.id, categories),
      );
      const count = planner.filter(
        (i) => !i.parentId && i.categoryId && descendantIds.has(i.categoryId),
      ).length;
      counts.set(category.id, count);
    }
    return counts;
  }, [categories, planner]);

  const subCategories = useMemo(
    () =>
      selected
        ? categories
            .filter((c) => c.parentId === selected.id)
            .sort(compareCategoryNames)
        : [],
    [categories, selected],
  );

  // Mutations commit via direct calendarSource dispatches (synced by
  // useCalendarServerSync). Those don't run the engine, so every handler also
  // calls updateAll() to regen — the thunk reads getState() fresh, so it sees
  // the dispatch that just landed.
  const replace = (next: Partial<Category>, label: string) => {
    if (!selected) return;
    dispatch(recordHistory({ label }));
    dispatch(upsertCategory({ ...selected, ...next }));
    updateAll();
  };

  const handleRename = (name: string) =>
    replace({ name }, historyMessages.category.rename(name));
  const handleChangeColor = (color: string) =>
    replace(
      { color },
      historyMessages.category.field("color", selected?.name),
    );
  const handleChangeLocation = (locationId: string | null) =>
    replace(
      { locationId },
      historyMessages.category.field("location", selected?.name),
    );
  const handleToggleStrict = () =>
    selected &&
    replace(
      { isStrict: !selected.isStrict },
      historyMessages.category.field("strictness", selected.name),
    );
  const handleToggleUseTimeWindows = () =>
    selected &&
    replace(
      { useTimeWindows: !selected.useTimeWindows },
      historyMessages.category.field("time windows", selected.name),
    );
  const handleToggleConfine = () =>
    selected &&
    replace(
      { confineToOwnWindows: !selected.confineToOwnWindows },
      historyMessages.category.field("window confinement", selected.name),
    );

  // Granular window dispatch, not upsertCategory with rebuilt timeSlots — the
  // category row stays untouched (no updatedAt restamp, no phantom category
  // update in the sync diff).
  const handleChangeWindowExceptions = (
    windowId: string,
    serialized: string | null,
  ) => {
    const row = selected?.timeSlots.find((ts) => ts.id === windowId);
    if (!row) return;
    dispatch(
      recordHistory({
        label: historyMessages.category.windowExceptions(selected?.name),
      }),
    );
    dispatch(upsertTimeWindow({ ...row, recurrenceExceptions: serialized }));
    updateAll();
  };

  // Reparenting recomputes sortOrder client-side (append to the new sibling
  // group) so we don't need a separate moveCategory server action.
  const handleChangeParent = (parentId: string | null) => {
    if (!selected) return;
    const siblingMax = categories
      .filter((c) => c.parentId === parentId && c.id !== selected.id)
      .reduce((max, c) => Math.max(max, c.sortOrder), -1);
    replace(
      { parentId, sortOrder: siblingMax + 1 },
      historyMessages.category.move(selected.name),
    );
  };

  const handleConfirmDelete = () => {
    if (!deletingId) return;
    if (effectiveSelectedId === deletingId) {
      const remaining = categories.filter((c) => c.id !== deletingId);
      setSelectedId(remaining.find((c) => !c.parentId)?.id ?? null);
      setEditorSheetOpen(false);
    }
    dispatch(
      recordHistory({
        label: historyMessages.category.delete(
          categories.find((c) => c.id === deletingId)?.name,
        ),
      }),
    );
    dispatch(removeCategory(deletingId));
    updateAll();
    setDeletingId(null);
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    if (isMobile) setEditorSheetOpen(true);
  };

  // The WeekStructureModal fills the page element at a z-index below the
  // sheet, so on mobile the sheet steps aside and comes back when it closes.
  const handleOpenWindows = () => {
    if (isMobile) {
      setEditorSheetOpen(false);
      window.scrollTo({ top: 0 });
    }
    setWindowsOpen(true);
  };

  const handleCloseWindows = () => {
    setWindowsOpen(false);
    if (isMobile && effectiveSelectedId) setEditorSheetOpen(true);
  };

  // Drag-and-drop is folder-like: sibling order between categories has no
  // scheduling meaning, so there is no reordering. Dropping onto a row nests
  // the dragged category under it (appended after its new siblings); dropping
  // on the rail background moves it out to top level. Cycle prevention:
  // refuse to drop a category onto any of its own descendants. One entry
  // point: the grip's pointer drag (mouse and touch), which passes its source
  // explicitly because its listeners outlive the render that bound them.
  const performDrop = (sourceId: string, target: CategoryDropTarget) => {
    const dragged = categories.find((c) => c.id === sourceId);
    if (!dragged) return false;

    const newParentId = target.kind === "into" ? target.id : null;
    if (newParentId === dragged.parentId) return false;

    if (target.kind === "into") {
      if (target.id === sourceId) return false;
      const descendants = new Set(
        getCategoryAndDescendants(sourceId, categories),
      );
      if (descendants.has(target.id)) return false;
      if (!categories.some((c) => c.id === target.id)) return false;
    }

    const siblingMax = categories
      .filter((c) => c.parentId === newParentId && c.id !== sourceId)
      .reduce((max, c) => Math.max(max, c.sortOrder), -1);

    const moved: Category = {
      ...dragged,
      parentId: newParentId,
      sortOrder: siblingMax + 1,
    };
    dispatch(
      recordHistory({ label: historyMessages.category.move(dragged.name) }),
    );
    dispatch(upsertCategory(moved));
    updateAll();

    if (target.kind === "into") {
      setExpanded((prev) => new Set(prev).add(target.id));
    }
    return true;
  };

  const handleDrop = (sourceId: string, target: CategoryDropTarget) => {
    if (!performDrop(sourceId, target)) return;
    if (dropFlashTimer.current !== null)
      window.clearTimeout(dropFlashTimer.current);
    setDroppedId(sourceId);
    dropFlashTimer.current = window.setTimeout(() => {
      setDroppedId(null);
      dropFlashTimer.current = null;
    }, 700);
  };

  const handleCreate = (parentId: string | null = null) => {
    const swatch = SWATCH_PALETTE[categories.length % SWATCH_PALETTE.length];
    const id = uuidv4();
    const now = new Date().toISOString();
    // Sub-categories append to the end of their sibling group; top-level uses
    // the total category count as a reasonable tail position. Either way the
    // sync sends the sortOrder along, so the tree renders in the expected
    // slot without a separate moveCategory round-trip.
    const siblingMax = categories
      .filter((c) => c.parentId === parentId)
      .reduce((max, c) => Math.max(max, c.sortOrder), -1);
    const created: Category = {
      id,
      name: parentId ? "New category" : "New role",
      icon: null,
      color: swatch,
      sortOrder: siblingMax + 1,
      isStrict: false,
      useTimeWindows: false,
      confineToOwnWindows: false,
      locationId: null,
      parentId,
      userId: "",
      timeSlots: [],
      createdAt: now,
      updatedAt: now,
    };
    dispatch(
      recordHistory({ label: historyMessages.category.create(!parentId) }),
    );
    dispatch(upsertCategory(created));
    updateAll();
    setSelectedId(id);
    if (isMobile) setEditorSheetOpen(true);
    if (parentId) {
      setExpanded((prev) => new Set(prev).add(parentId));
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deletingCategory = deletingId
    ? categories.find((c) => c.id === deletingId)
    : undefined;
  const deletingName = deletingCategory?.name ?? "this role";
  const deletingIsRole = deletingCategory ? !deletingCategory.parentId : true;

  const editorElement = selected ? (
    <CategoryEditor
      category={selected}
      categories={categories}
      locations={locations}
      itemCount={itemCounts.get(selected.id) ?? 0}
      subCategories={subCategories}
      subCategoryCounts={itemCounts}
      onRename={handleRename}
      onChangeColor={handleChangeColor}
      onChangeParent={handleChangeParent}
      onChangeLocation={handleChangeLocation}
      onToggleStrict={handleToggleStrict}
      onToggleUseTimeWindows={handleToggleUseTimeWindows}
      onToggleConfine={handleToggleConfine}
      onDelete={() => setDeletingId(selected.id)}
      onSelectSubCategory={setSelectedId}
      onOpenWindows={handleOpenWindows}
      onChangeWindowExceptions={handleChangeWindowExceptions}
    />
  ) : null;

  return (
    <div className={page} data-windows-open={windowsOpen ? "true" : undefined}>
      <PageHeader
        title="Roles"
        summary={
          <>
            {tree.length} role{tree.length === 1 ? "" : "s"} ·{" "}
            {planner.filter((i) => !i.parentId && i.categoryId).length}{" "}
            categorized
          </>
        }
      />

      {error && <div className={errorBanner}>{error}</div>}

      <div className={mainGrid}>
        <aside
          className={rail}
          data-category-root-zone="true"
          data-drag-over-root={dragOver?.kind === "root" ? "true" : undefined}
        >
          <div className={railHead}>Roles</div>
          <div
            className={`${railBody} ${draggedId ? railBodyDragActive : ""}`}
          >
            {!isLoaded ? (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "16px 8px",
                }}
              >
                <Loader size="md" label="Loading roles" />
              </div>
            ) : tree.length === 0 ? (
              <div
                style={{
                  padding: "12px 8px",
                  fontSize: 12.5,
                  color: vars.muted,
                }}
              >
                No roles yet — create one.
              </div>
            ) : (
              tree.map((node) => (
                <CategoryTreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  toggleExpand={toggleExpand}
                  selectedId={effectiveSelectedId}
                  onSelect={handleSelect}
                  counts={itemCounts}
                  onAddChild={(parentId) => handleCreate(parentId)}
                  draggedId={draggedId}
                  setDraggedId={setDraggedId}
                  dragOver={dragOver}
                  setDragOver={setDragOver}
                  onDrop={handleDrop}
                  droppedId={droppedId}
                />
              ))
            )}
          </div>
          <div className={railFooter}>
            <Button
              variant="ghost"
              size="sm"
              className={railNewButton}
              onClick={() => handleCreate()}
            >
              <Plus size={13} strokeWidth={2.4} />
              New role
            </Button>
          </div>
        </aside>

        {!isMobile && (
          <section className={mainCard}>
            {!isLoaded ? (
              <div className={emptyMain}>
                <Loader size="md" label="Loading roles" />
              </div>
            ) : (
              (editorElement ?? (
                <div className={emptyMain}>
                  Pick a role from the left, or create a new one to begin.
                </div>
              ))
            )}
          </section>
        )}
      </div>

      {isMobile && (
        <BottomSheet
          open={editorSheetOpen && !!selected}
          onOpenChange={setEditorSheetOpen}
          title={
            selected
              ? `Edit ${selected.parentId ? "category" : "role"}`
              : "Edit role"
          }
          hideTitle
          flush
          onOpenAutoFocus={(e) => e.preventDefault()}
          // The delete ConfirmModal is a page-owned sibling dialog; taps on it
          // land "outside" this sheet and must not dismiss it.
          onPointerDownOutside={(e) => {
            if (deletingId) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (deletingId) e.preventDefault();
          }}
        >
          {editorElement}
        </BottomSheet>
      )}

      <CategoryDragBox
        label={
          draggedId
            ? (categories.find((c) => c.id === draggedId)?.name ?? null)
            : null
        }
      />

      <WeekStructureModal
        open={windowsOpen}
        onClose={handleCloseWindows}
        initialMode="windows"
        focusedCategoryId={selected?.id ?? null}
      />

      <ConfirmModal
        open={!!deletingId}
        title={deletingIsRole ? "Delete role?" : "Delete category?"}
        tone="danger"
        confirmLabel="Delete"
        body={
          <>
            <p style={{ margin: 0 }}>
              Delete &ldquo;{deletingName}&rdquo;? This also deletes everything
              nested under it. Items in it become uncategorized.
            </p>
          </>
        }
        onCancel={() => setDeletingId(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
