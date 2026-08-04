"use client";

import { space, listRow, iconBtn } from "@/lib/theme";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Layers,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Check,
  Minus,
} from "lucide-react";
import { useSelector } from "react-redux";
import {
  Button,
  Caption,
  Combobox,
  ConfirmModal,
  Input,
  Loader,
  PageHeader,
  ResponsiveSegmentedControl,
  Switch,
  vars,
} from "@/components/ui";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { RootState } from "@/redux/store";
import {
  buildCategoryTree,
  getCategoryAndDescendants,
} from "@/utils/categoryUtils";
import { isInSmartView, type SmartView } from "@/utils/dateUtils";
import { plannerCompletedEnd } from "@/utils/plannerCompletion";
import {
  getGoalDurationProgress,
  getRolledUpRemainingDuration,
} from "@/utils/plannerStatus";
import type { Category } from "@/types/prisma";
import { SMART_VIEWS } from "./_lib/smartViews";
import {
  CategoryTreeNode,
  type Selection,
} from "./_components/CategoryTreeNode";
import { ItemRow } from "./_components/ItemRow";
import { NewItemModal } from "./_components/NewItemModal";
import { BulkActionBar } from "./_components/BulkActionBar";
import { ScopeSheet } from "./_components/ScopeSheet";
import {
  assignCategoryToSubtrees,
  deleteSubtrees,
  setColorOnSubtrees,
  setPriorityOnRoots,
} from "@/utils/plannerBulkActions";
import {
  buildDemoteLossManifest,
  demoteRootIntoGoal,
} from "@/utils/goal-handlers/demoteRootIntoGoal";
import { GoalPickerList } from "@/components/GoalPickerList";
import {
  page,
  spacer,
  actionCluster,
  mainGrid,
  rail,
  railHeader,
  railToggle,
  railToggleIcon,
  railSection,
  railSectionHead,
  railRow,
  railRowActive,
  railRowIcon,
  railRowLabel,
  railRowCount,
  railRowCountAlert,
  mainCard,
  filterStrip,
  filterRow,
  searchWrap,
  searchInput,
  breadcrumb,
  breadcrumbSep,
  breadcrumbCurrent,
  scopeRow,
  scopePill,
  scopePillLabel,
  scopePillCount,
  scopePillChevron,
  sortCluster,
  tableWrap,
  tableHead,
  cellCheck,
  rowCheckbox,
  headerCell,
  headerCellSortable,
  headerCellActive,
  headerCellIcon,
  headerCellIconIdle,
  showCompletedToggle,
  draftHint,
  draftNotice,
  draftNoticeLink,
  nestModalBody,
  emptyState,
  emptyStateTitle,
} from "./page.css";

const RAIL_COLLAPSE_KEY = "circadium.library.railCollapsed";

type TypeFilter = "all" | "task" | "plan" | "goal";
type SortKey =
  | "title"
  | "type"
  | "duration"
  | "priority"
  | "deadline"
  | "category";
type SortDir = "asc" | "desc";
type Readiness = "all" | "ready" | "not-ready";

const DEFAULT_SORT_DIR: Record<SortKey, SortDir> = {
  title: "asc",
  type: "asc",
  duration: "desc",
  priority: "desc",
  deadline: "asc",
  category: "asc",
};

// Mobile sort control; "newest" stands in for the null sortKey (created-desc).
const SORT_OPTIONS: Array<{ value: SortKey | "newest"; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "title", label: "Title" },
  { value: "type", label: "Type" },
  { value: "duration", label: "Duration" },
  { value: "priority", label: "Priority" },
  { value: "deadline", label: "Deadline" },
  { value: "category", label: "Category" },
];

function SortHeader({
  k,
  label,
  sortKey,
  sortDir,
  onSort,
}: {
  k: SortKey;
  label: string;
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  const className = `${headerCell} ${headerCellSortable} ${active ? headerCellActive : ""}`;
  return (
    <button type="button" className={className} onClick={() => onSort(k)}>
      <span>{label}</span>
      <span
        className={`${headerCellIcon} ${active ? "" : headerCellIconIdle}`}
        aria-hidden
      >
        {!active ? (
          <ChevronsUpDown size={11} strokeWidth={2.5} />
        ) : sortDir === "asc" ? (
          <ChevronUp size={11} strokeWidth={2.5} />
        ) : (
          <ChevronDown size={11} strokeWidth={2.5} />
        )}
      </span>
    </button>
  );
}

export default function LibraryPage() {
  const router = useRouter();
  const { planner, categories, updatePlannerArray, queues, dependencies } =
    useCalendarProvider();
  const isLoaded = useSelector(
    (state: RootState) => state.calendarSource.isLoaded,
  );
  const now = useMemo(() => new Date(), []);
  const isMobile = useIsMobile();
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [scopeSheetOpen, setScopeSheetOpen] = useState(false);

  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[] | null>(null);
  const [nestNotice, setNestNotice] = useState<string | null>(null);
  const [nestPickerOpen, setNestPickerOpen] = useState(false);
  const [nestTargetId, setNestTargetId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [readiness, setReadiness] = useState<Readiness>("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [showDrafts, setShowDrafts] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [railCollapsed, setRailCollapsed] = useState(false);
  const [railHydrated, setRailHydrated] = useState(false);
  // Suppresses the rail width transition on the first frame so restoring a
  // collapsed rail from localStorage doesn't animate 260 -> 44 on mount.
  const [railTransitionsReady, setRailTransitionsReady] = useState(false);

  useLayoutEffect(() => {
    try {
      if (window.localStorage.getItem(RAIL_COLLAPSE_KEY) === "1") {
        setRailCollapsed(true);
      }
    } catch {
      // localStorage may be unavailable (private mode, disabled cookies)
    }
    setRailHydrated(true);
    const id = requestAnimationFrame(() => setRailTransitionsReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useLayoutEffect(() => {
    if (!railHydrated) return;
    try {
      window.localStorage.setItem(RAIL_COLLAPSE_KEY, railCollapsed ? "1" : "0");
    } catch {
      // localStorage may be unavailable (private mode, quota exceeded)
    }
  }, [railCollapsed, railHydrated]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_SORT_DIR[key]);
    }
  };

  const rootItems = useMemo(
    () => planner.filter((i) => !i.parentId),
    [planner],
  );

  const categoryTree = useMemo(
    () => buildCategoryTree(categories),
    [categories],
  );

  const categoryIndex = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cat of categories) {
      const descendantIds = getCategoryAndDescendants(cat.id, categories);
      const set = new Set(descendantIds);
      const count = rootItems.filter(
        (i) => i.categoryId && set.has(i.categoryId),
      ).length;
      counts.set(cat.id, count);
    }
    return counts;
  }, [categories, rootItems]);

  const smartViewCounts = useMemo(() => {
    const counts: Record<SmartView, number> = {
      today: 0,
      "this-week": 0,
      inbox: 0,
      overdue: 0,
      "all-goals": 0,
      "all-plans": 0,
      "done-7d": 0,
    };
    for (const item of rootItems) {
      for (const v of SMART_VIEWS) {
        if (isInSmartView(item, v.key, now)) counts[v.key]++;
      }
    }
    return counts;
  }, [rootItems, now]);

  const filteredItems = useMemo(() => {
    let result = rootItems;

    if (selection.kind === "view") {
      result = result.filter((i) => isInSmartView(i, selection.view, now));
    } else if (selection.kind === "category") {
      const descendantIds = new Set(
        getCategoryAndDescendants(selection.id, categories),
      );
      result = result.filter(
        (i) => i.categoryId && descendantIds.has(i.categoryId),
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((i) => i.title.toLowerCase().includes(q));
    }

    if (!showCompleted) {
      result = result.filter((i) => !plannerCompletedEnd(i));
    }

    if (!showDrafts) {
      result = result.filter((i) => i.isTriaged);
    }

    if (typeFilter !== "all") {
      result = result.filter((i) => i.plannerType === typeFilter);
    }

    if (readiness !== "all") {
      const wantReady = readiness === "ready";
      result = result.filter((i) => !!i.isReady === wantReady);
    }

    const sorted = [...result].sort((a, b) => {
      if (sortKey === null) {
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
      let cmp = 0;
      switch (sortKey) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "type":
          cmp = a.plannerType.localeCompare(b.plannerType);
          break;
        case "duration":
          cmp = a.duration - b.duration;
          break;
        case "priority":
          cmp = a.priority - b.priority;
          break;
        case "deadline":
          if (!a.deadline && !b.deadline) cmp = 0;
          else if (!a.deadline) return 1;
          else if (!b.deadline) return -1;
          else
            cmp =
              new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
          break;
        case "category": {
          const ca = a.categoryId
            ? (categoryIndex.get(a.categoryId)?.name ?? "")
            : "";
          const cb = b.categoryId
            ? (categoryIndex.get(b.categoryId)?.name ?? "")
            : "";
          if (!ca && !cb) cmp = 0;
          else if (!ca) return 1;
          else if (!cb) return -1;
          else cmp = ca.localeCompare(cb);
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [
    rootItems,
    selection,
    categories,
    categoryIndex,
    search,
    typeFilter,
    readiness,
    showCompleted,
    showDrafts,
    sortKey,
    sortDir,
    now,
  ]);

  const draftCount = useMemo(
    () => rootItems.filter((i) => !i.isTriaged).length,
    [rootItems],
  );

  const nestTargets = useMemo(
    () =>
      rootItems
        .filter(
          (i) =>
            i.plannerType === "goal" &&
            i.isTriaged &&
            !plannerCompletedEnd(i) &&
            !selectedIds.has(i.id),
        )
        .sort((a, b) => (a.title || "").localeCompare(b.title || "")),
    [rootItems, selectedIds],
  );

  const selectedRoots = useMemo(
    () => planner.filter((p) => selectedIds.has(p.id)),
    [planner, selectedIds],
  );

  const sharedColor = useMemo(() => {
    const first = selectedRoots[0]?.color ?? "";
    return first && selectedRoots.every((p) => p.color === first) ? first : "";
  }, [selectedRoots]);

  const sharedPriority = useMemo(() => {
    if (selectedRoots.length === 0) return null;
    const first = selectedRoots[0].priority;
    return selectedRoots.every((p) => p.priority === first) ? first : null;
  }, [selectedRoots]);

  useEffect(() => {
    if (!nestNotice) return;
    const id = window.setTimeout(() => setNestNotice(null), 8000);
    return () => window.clearTimeout(id);
  }, [nestNotice]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Selected rows that get deleted elsewhere (another tab, the AI assistant)
  // must not linger as ghost targets for bulk actions.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const rootIdSet = new Set(
        planner.filter((p) => !p.parentId).map((p) => p.id),
      );
      const next = new Set([...prev].filter((id) => rootIdSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [planner]);

  useEffect(() => {
    if (selectedIds.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      setSelectedIds(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds.size]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allVisibleSelected =
    filteredItems.length > 0 &&
    filteredItems.every((i) => selectedIds.has(i.id));
  const someVisibleSelected = filteredItems.some((i) => selectedIds.has(i.id));

  const toggleSelectAll = () => {
    setSelectedIds(
      allVisibleSelected ? new Set() : new Set(filteredItems.map((i) => i.id)),
    );
  };

  const selectedTargets = useMemo(() => [...selectedIds], [selectedIds]);

  const handleAssignCategory = (categoryId: string | null) => {
    const categoryHasLocation = categoryId
      ? !!categoryIndex.get(categoryId)?.locationId
      : false;
    updatePlannerArray((prev) =>
      assignCategoryToSubtrees(
        prev,
        selectedTargets,
        categoryId,
        categoryHasLocation,
      ),
    );
  };

  const handleSetColor = (color: string) => {
    updatePlannerArray((prev) =>
      setColorOnSubtrees(prev, selectedTargets, color),
    );
  };

  const handleSetPriority = (priority: number) => {
    updatePlannerArray((prev) =>
      setPriorityOnRoots(prev, selectedTargets, priority),
    );
  };

  // Aggregated loss preview for the bulk nest confirm — the per-item version
  // (NestIntoGoalCard) enumerates everything, but across N items that reads
  // as a wall of text, so this collapses to counts.
  const nestManifest = useMemo(() => {
    if (!nestPickerOpen) return null;
    let queueLeavers = 0;
    const queueTitles = new Set<string>();
    let inboundLosers = 0;
    for (const id of selectedTargets) {
      const manifest = buildDemoteLossManifest(
        planner,
        queues,
        dependencies,
        id,
      );
      if (manifest.queueTitle) {
        queueLeavers += 1;
        queueTitles.add(manifest.queueTitle);
      }
      if (manifest.inboundHostTitles.length > 0) inboundLosers += 1;
    }
    return { queueLeavers, queueTitles: [...queueTitles], inboundLosers };
  }, [nestPickerOpen, selectedTargets, planner, queues, dependencies]);

  const closeNestPicker = () => {
    setNestPickerOpen(false);
    setNestTargetId(null);
  };

  const confirmBulkNest = () => {
    if (!nestTargetId) return;
    handleNestUnder(nestTargetId);
    closeNestPicker();
  };

  const handleNestUnder = (targetRootId: string) => {
    let next = planner;
    const failures: string[] = [];
    for (const id of selectedTargets) {
      if (id === targetRootId) continue;
      const result = demoteRootIntoGoal(
        next,
        id,
        targetRootId,
        queues,
        dependencies,
      );
      if (Array.isArray(result)) {
        next = result;
      } else {
        const title = planner.find((p) => p.id === id)?.title || "Untitled";
        failures.push(`"${title}" — ${result.error}`);
      }
    }
    if (next !== planner) updatePlannerArray(next);
    setSelectedIds(new Set());
    setNestNotice(failures.length > 0 ? failures.join(" ") : null);
  };

  const confirmDelete = () => {
    if (!deleteTargetIds || deleteTargetIds.length === 0) return;
    updatePlannerArray((prev) => deleteSubtrees(prev, deleteTargetIds));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of deleteTargetIds) next.delete(id);
      return next;
    });
    setDeleteTargetIds(null);
  };

  const deleteTargetTitle =
    deleteTargetIds?.length === 1
      ? planner.find((p) => p.id === deleteTargetIds[0])?.title
      : undefined;

  const goalProgressByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of rootItems) {
      if (item.plannerType !== "goal") continue;
      const pct = getGoalDurationProgress(item, planner);
      if (pct != null) map.set(item.id, pct);
    }
    return map;
  }, [rootItems, planner]);

  const remainingDurationByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of rootItems) {
      const remaining = getRolledUpRemainingDuration(item, planner);
      if (remaining != null) map.set(item.id, remaining);
    }
    return map;
  }, [rootItems, planner]);

  const breadcrumbPath = useMemo((): Category[] => {
    if (selection.kind !== "category") return [];
    const trail: Category[] = [];
    let cur: Category | undefined = categoryIndex.get(selection.id);
    while (cur) {
      trail.unshift(cur);
      cur = cur.parentId ? categoryIndex.get(cur.parentId) : undefined;
    }
    return trail;
  }, [selection, categoryIndex]);

  const selectionLabel = (() => {
    if (selection.kind === "all") return "All items";
    if (selection.kind === "view") {
      return SMART_VIEWS.find((v) => v.key === selection.view)?.label ?? "View";
    }
    return categoryIndex.get(selection.id)?.name ?? "Category";
  })();

  const breadcrumbCrumbs: string[] = (() => {
    if (selection.kind === "all") return ["All items"];
    if (selection.kind === "view") return [selectionLabel];
    return breadcrumbPath.map((c) => c.name);
  })();

  return (
    <div
      className={page}
      data-rail-collapsed={railCollapsed}
      data-no-transitions={railTransitionsReady ? undefined : "true"}
    >
      <PageHeader
        title="Library"
        summary={
          <>
            {planner.length} items · {categories.length} categor
            {categories.length === 1 ? "y" : "ies"}
          </>
        }
      >
        <span className={spacer} />
        <div className={actionCluster}>
          <Button
            variant="solid"
            size="sm"
            onClick={() => setNewItemOpen(true)}
          >
            <Plus size={13} strokeWidth={2.4} />
            New item
          </Button>
        </div>
      </PageHeader>

      <div className={mainGrid}>
        {!isMobile && (
          <aside className={rail}>
            <div className={railHeader}>
              <button
                type="button"
                className={railToggle}
                onClick={() => setRailCollapsed((c) => !c)}
                title={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-label={
                  railCollapsed ? "Expand sidebar" : "Collapse sidebar"
                }
                aria-expanded={!railCollapsed}
              >
                <span className={railToggleIcon} aria-hidden>
                  <ChevronLeft size={16} strokeWidth={2} />
                </span>
              </button>
            </div>
            <div className={railSection}>
              <div className={railSectionHead}>Smart views</div>
              <button
                className={`${listRow()} ${railRow} ${selection.kind === "all" ? railRowActive : ""}`}
                onClick={() => setSelection({ kind: "all" })}
              >
                <span className={railRowIcon}>
                  <Layers size={13} strokeWidth={2} />
                </span>
                <span className={railRowLabel}>Browse all</span>
                <span className={railRowCount}>{rootItems.length}</span>
              </button>
              {SMART_VIEWS.map((v) => {
                const Icon = v.icon;
                const count = smartViewCounts[v.key];
                const active =
                  selection.kind === "view" && selection.view === v.key;
                return (
                  <button
                    key={v.key}
                    className={`${listRow()} ${railRow} ${active ? railRowActive : ""}`}
                    onClick={() => setSelection({ kind: "view", view: v.key })}
                  >
                    <span className={railRowIcon}>
                      <Icon size={13} strokeWidth={2} />
                    </span>
                    <span className={railRowLabel}>{v.label}</span>
                    <span
                      className={`${railRowCount} ${
                        v.alert && count > 0 ? railRowCountAlert : ""
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className={railSection}>
              <div className={railSectionHead}>Categories</div>
              {categoryTree.length === 0 ? (
                <div
                  style={{
                    padding: space["2"],
                    fontSize: 12.5,
                    color: vars.muted,
                  }}
                >
                  <Caption>No categories yet</Caption>
                </div>
              ) : (
                categoryTree.map((node) => (
                  <CategoryTreeNode
                    key={node.id}
                    node={node}
                    depth={0}
                    expanded={expanded}
                    toggleExpand={toggleExpand}
                    selection={selection}
                    setSelection={setSelection}
                    counts={categoryCounts}
                  />
                ))
              )}
            </div>
          </aside>
        )}

        <section className={mainCard}>
          {isMobile ? (
            <div className={scopeRow}>
              <button
                type="button"
                className={scopePill}
                onClick={() => setScopeSheetOpen(true)}
                aria-haspopup="dialog"
              >
                <span className={scopePillLabel}>
                  {breadcrumbCrumbs.join(" › ")}
                </span>
                <span className={scopePillCount}>{filteredItems.length}</span>
                <span className={scopePillChevron} aria-hidden>
                  <ChevronDown size={14} strokeWidth={2.2} />
                </span>
              </button>
              <Button
                variant="solid"
                size="sm"
                onClick={() => setNewItemOpen(true)}
              >
                <Plus size={13} strokeWidth={2.4} />
                New item
              </Button>
            </div>
          ) : (
            <div className={breadcrumb}>
              <span>Library</span>
              {breadcrumbCrumbs.map((label, i) => {
                const isLast = i === breadcrumbCrumbs.length - 1;
                return (
                  <span
                    key={i}
                    style={{
                      display: "inline-flex",
                      gap: space["2"],
                      alignItems: "center",
                    }}
                  >
                    <span className={breadcrumbSep}>›</span>
                    <span className={isLast ? breadcrumbCurrent : undefined}>
                      {label}
                    </span>
                  </span>
                );
              })}
            </div>
          )}

          <div className={filterStrip}>
            <div className={filterRow}>
              <ResponsiveSegmentedControl<TypeFilter>
                value={typeFilter}
                onChange={setTypeFilter}
                ariaLabel="Filter by type"
                options={[
                  { key: "all", label: "All" },
                  { key: "task", label: "Task" },
                  { key: "plan", label: "Plan" },
                  { key: "goal", label: "Goal" },
                ]}
              />

              <ResponsiveSegmentedControl<Readiness>
                value={readiness}
                onChange={setReadiness}
                ariaLabel="Filter by readiness"
                options={[
                  { key: "all", label: "All" },
                  { key: "ready", label: "Ready" },
                  { key: "not-ready", label: "Not ready" },
                ]}
              />

              <span className={spacer} />

              <label className={showCompletedToggle}>
                <Switch checked={showDrafts} onCheckedChange={setShowDrafts} />
                <span>Show drafts</span>
              </label>
              {draftCount > 0 && (
                <span className={draftHint}>
                  {draftCount === 1 ? "1 draft stays" : `${draftCount} drafts stay`}{" "}
                  off the calendar until processed —{" "}
                  <button
                    type="button"
                    className={draftNoticeLink}
                    onClick={() => router.push("/capture")}
                  >
                    Open Capture
                  </button>
                </span>
              )}

              <label className={showCompletedToggle}>
                <Switch
                  checked={showCompleted}
                  onCheckedChange={setShowCompleted}
                />
                <span>Show completed</span>
              </label>
            </div>

            <div className={filterRow}>
              <div className={searchWrap}>
                <Search
                  size={13}
                  strokeWidth={2}
                  style={{ color: vars.muted }}
                />
                <Input
                  variant="bare"
                  className={searchInput}
                  placeholder={`Search ${selectionLabel.toLowerCase()}…`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {isMobile && (
                <div className={sortCluster}>
                  <Combobox<SortKey | "newest">
                    value={sortKey ?? "newest"}
                    options={SORT_OPTIONS}
                    onChange={(v) => {
                      if (v === "newest") {
                        setSortKey(null);
                      } else {
                        setSortKey(v);
                        setSortDir(DEFAULT_SORT_DIR[v]);
                      }
                    }}
                    ariaLabel="Sort by"
                    small
                  />
                  {sortKey !== null && (
                    <button
                      type="button"
                      className={iconBtn({ size: "sm" })}
                      onClick={() =>
                        setSortDir((d) => (d === "asc" ? "desc" : "asc"))
                      }
                      aria-label={
                        sortDir === "asc"
                          ? "Sorted ascending — switch to descending"
                          : "Sorted descending — switch to ascending"
                      }
                    >
                      {sortDir === "asc" ? (
                        <ChevronUp size={14} strokeWidth={2.2} />
                      ) : (
                        <ChevronDown size={14} strokeWidth={2.2} />
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {nestNotice && (
            <div
              className={draftNotice}
              style={{ color: vars.status.warning }}
              role="alert"
            >
              <span>{nestNotice}</span>
            </div>
          )}

          {!isLoaded ? (
            <div
              className={emptyState}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "200px",
              }}
            >
              <Loader size="md" label="Loading items" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className={emptyState}>
              <div className={emptyStateTitle}>Nothing here yet</div>
              <div>
                Try clearing filters, switching the view, or creating a new
                item.
              </div>
            </div>
          ) : (
            <div className={tableWrap}>
              {!isMobile && (
                <div className={tableHead}>
                  <span className={cellCheck}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={
                        allVisibleSelected
                          ? true
                          : someVisibleSelected
                            ? "mixed"
                            : false
                      }
                      aria-label="Select all"
                      data-checked={
                        allVisibleSelected
                          ? "true"
                          : someVisibleSelected
                            ? "mixed"
                            : undefined
                      }
                      className={rowCheckbox}
                      onClick={toggleSelectAll}
                    >
                      {allVisibleSelected ? (
                        <Check size={11} strokeWidth={3} aria-hidden />
                      ) : someVisibleSelected ? (
                        <Minus size={11} strokeWidth={3} aria-hidden />
                      ) : null}
                    </button>
                  </span>
                  <SortHeader
                    k="title"
                    label="Title"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortHeader
                    k="type"
                    label="Type"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortHeader
                    k="duration"
                    label="Duration"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortHeader
                    k="priority"
                    label="Priority"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortHeader
                    k="deadline"
                    label="Deadline"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortHeader
                    k="category"
                    label="Category"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <span className={headerCell}>Status</span>
                  <span />
                </div>
              )}
              {filteredItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  category={
                    item.categoryId
                      ? categoryIndex.get(item.categoryId)
                      : undefined
                  }
                  goalProgress={goalProgressByItemId.get(item.id)}
                  remainingDuration={remainingDurationByItemId.get(item.id)}
                  onClick={() => router.push(`/items/${item.id}`)}
                  now={now}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={() => toggleSelect(item.id)}
                  onDelete={() => setDeleteTargetIds([item.id])}
                  mobile={isMobile}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          categories={categories}
          currentColor={sharedColor}
          currentPriority={sharedPriority}
          onAssignCategory={handleAssignCategory}
          onSetColor={handleSetColor}
          onSetPriority={handleSetPriority}
          onOpenNest={() => setNestPickerOpen(true)}
          onDelete={() => setDeleteTargetIds(selectedTargets)}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      <ConfirmModal
        open={nestPickerOpen}
        title="Nest under a goal"
        body={
          <div className={nestModalBody}>
            <div>
              {selectedIds.size === 1
                ? "The selected item and everything under it moves"
                : `The ${selectedIds.size} selected items and everything under them move`}{" "}
              inside the goal you pick, adopting its category and readiness.
            </div>
            <GoalPickerList
              goals={nestTargets}
              onSelect={setNestTargetId}
              onSubmit={confirmBulkNest}
            />
            {nestManifest &&
              (nestManifest.queueLeavers > 0 ||
                nestManifest.inboundLosers > 0) && (
                <div>
                  {nestManifest.queueLeavers > 0 && (
                    <div>
                      {nestManifest.queueLeavers === 1
                        ? "1 item leaves its queue"
                        : `${nestManifest.queueLeavers} items leave their queues`}{" "}
                      (
                      {nestManifest.queueTitles
                        .map((t) => `"${t}"`)
                        .join(", ")}
                      ).
                    </div>
                  )}
                  {nestManifest.inboundLosers > 0 && (
                    <div>
                      Links into{" "}
                      {nestManifest.inboundLosers === 1
                        ? "1 item"
                        : `${nestManifest.inboundLosers} items`}{" "}
                      from other goals are removed.
                    </div>
                  )}
                  <div>
                    Dropped connections cannot be restored by promoting them
                    back later.
                  </div>
                </div>
              )}
          </div>
        }
        confirmLabel="Nest"
        cancelLabel="Cancel"
        confirmDisabled={!nestTargetId}
        onCancel={closeNestPicker}
        onConfirm={confirmBulkNest}
      />

      {isMobile && (
        <ScopeSheet
          open={scopeSheetOpen}
          onOpenChange={setScopeSheetOpen}
          selection={selection}
          onSelect={setSelection}
          rootItemCount={rootItems.length}
          smartViewCounts={smartViewCounts}
          categoryTree={categoryTree}
          categoryCounts={categoryCounts}
          expanded={expanded}
          toggleExpand={toggleExpand}
        />
      )}

      <ConfirmModal
        open={deleteTargetIds !== null}
        title={
          deleteTargetIds?.length === 1
            ? "Delete item?"
            : `Delete ${deleteTargetIds?.length ?? 0} items?`
        }
        body={
          deleteTargetTitle
            ? `This permanently removes "${deleteTargetTitle}" and all of its subtasks.`
            : `This permanently removes ${deleteTargetIds?.length ?? 0} items and all of their subtasks.`
        }
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setDeleteTargetIds(null)}
        onConfirm={confirmDelete}
      />

      <NewItemModal open={newItemOpen} onOpenChange={setNewItemOpen} />
    </div>
  );
}
