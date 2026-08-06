"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { ArrowLeft, Sliders } from "lucide-react";
import {
  BottomSheet,
  Button,
  Kbd,
  Loader,
  Switch,
  usePreviousPathname,
  vars,
} from "@/components/ui";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { usePlatform } from "@/hooks/usePlatform";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useViewStatePersistence } from "@/hooks/useViewStatePersistence";
import { reorderQueueMember } from "@/utils/queue-handlers/mutateQueueMembers";
import { wouldCreateCycleAddingDependency } from "@/utils/precedence/findCycle";
import { describeCycle } from "@/utils/precedence/describeCycle";
import { historyMessages } from "@/utils/historyMessages";
import {
  buildRootSpans,
  buildLeafSpans,
  buildGraphLanes,
  layoutGraph,
  ZOOM_MIN_PX_PER_DAY,
  ZOOM_MAX_PX_PER_DAY,
  type GraphTickUnits,
} from "./_lib/graphModel";
import { GraphCanvas } from "./_components/GraphCanvas";
import { MarkerMenu, MARKER_UNIT_ROWS } from "./_components/MarkerMenu";
import {
  page,
  subHeader,
  titleGroup,
  pageTitle,
  titleSummary,
  headerControls,
  controlGroup,
  controlLabel,
  backButton,
  settingsButton,
  zoomTrack,
  zoomTrackBar,
  zoomFill,
  zoomSlider,
  legendRow,
  legendItem,
  legendKeys,
  errorBanner,
  canvasCard,
  emptyMain,
  sheetSection,
  sheetRow,
  sheetRowLabel,
  sheetZoomTrack,
  sheetHint,
  sheetColumns,
  sheetColumn,
} from "./page.css";

// Logarithmic zoom: slider 0..100 maps to the model's px-per-day range, so
// each step feels proportionally the same at both ends.
const zoomToPxPerDay = (t: number): number =>
  Math.round(
    ZOOM_MIN_PX_PER_DAY *
      Math.pow(ZOOM_MAX_PX_PER_DAY / ZOOM_MIN_PX_PER_DAY, t / 100),
  );

// Inverse of zoomToPxPerDay — the slider value that yields a given px/day.
const pxPerDayToZoom = (pxPerDay: number): number => {
  const clamped = Math.max(
    ZOOM_MIN_PX_PER_DAY,
    Math.min(ZOOM_MAX_PX_PER_DAY, pxPerDay),
  );
  const t =
    (100 * Math.log(clamped / ZOOM_MIN_PX_PER_DAY)) /
    Math.log(ZOOM_MAX_PX_PER_DAY / ZOOM_MIN_PX_PER_DAY);
  return Math.max(0, Math.min(100, t));
};

// Days of timeline the initial view fits into the viewport (now → now + 1 week).
const DEFAULT_HORIZON_DAYS = 7;

// Fallback zoom before the viewport width is measured (~30 px/day).
const DEFAULT_ZOOM = 32;

const DEFAULT_MARKERS: GraphTickUnits = {
  hour: true,
  day: true,
  week: true,
  month: true,
};

// Must match SLIDER_THUMB in page.css.ts: the fill's right edge is nudged by the
// thumb radius so it stays centred under the thumb across the whole track.
const SLIDER_THUMB_PX = 13;

function LegendSwatch({
  dashed,
  arrow,
  color,
  opacity,
}: {
  dashed?: boolean;
  arrow?: boolean;
  color: string;
  opacity?: number;
}) {
  return (
    <svg width={26} height={10} aria-hidden>
      <line
        x1={0}
        y1={5}
        x2={arrow ? 18 : 26}
        y2={5}
        style={{
          stroke: color,
          strokeOpacity: opacity ?? 1,
          strokeWidth: 1.5,
          strokeDasharray: dashed ? "4 3" : undefined,
        }}
      />
      {arrow && (
        <path
          d="M 25 5 l -7 -4 l 0 8 z"
          style={{ fill: color, fillOpacity: opacity ?? 1 }}
        />
      )}
    </svg>
  );
}

export default function GraphPage() {
  const {
    userId,
    isLoaded,
    planner,
    categories,
    queues,
    dependencies,
    calendar,
    weekStartDay,
    queueCategoryByRootId,
    updateQueueArray,
    updateDependencyArray,
  } = useCalendarProvider();

  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showLooseTasks, setShowLooseTasks] = useState(false);
  const [leafView, setLeafView] = useState(false);
  const [hoverLabels, setHoverLabels] = useState(true);
  const [markers, setMarkers] = useState<GraphTickUnits>(DEFAULT_MARKERS);
  const [cycleError, setCycleError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [now] = useState(() => Date.now());
  const { modKey } = usePlatform();
  const coarsePointer = useCoarsePointer();
  const isMobile = useIsMobile();
  const router = useRouter();
  const previousPathname = usePreviousPathname();
  const pxPerDay = zoomToPxPerDay(zoom);

  const goBack = () => router.push(previousPathname ?? "/dashboard");

  const handleZoomDelta = useCallback((delta: number) => {
    setZoom((prev) => Math.max(0, Math.min(100, prev + delta)));
  }, []);

  // On first mount the canvas reports its width so the initial view fits one
  // week (now → now + 1 week); GraphCanvas keeps "now" pinned to the left edge.
  const didFitRef = useRef(false);
  const handleFitWeek = useCallback((viewportWidth: number) => {
    if (didFitRef.current || viewportWidth <= 0) return;
    didFitRef.current = true;
    setZoom(pxPerDayToZoom(viewportWidth / DEFAULT_HORIZON_DAYS));
  }, []);

  const viewSnapshot = useMemo(
    () =>
      JSON.stringify({
        zoom,
        showCompleted,
        showLooseTasks,
        leafView,
        hoverLabels,
        markers,
      }),
    [zoom, showCompleted, showLooseTasks, leafView, hoverLabels, markers],
  );
  useViewStatePersistence("graph", viewSnapshot, (raw) => {
    try {
      const saved = JSON.parse(raw) as Record<string, unknown>;
      if (typeof saved.zoom === "number") {
        setZoom(Math.max(0, Math.min(100, saved.zoom)));
        // A restored zoom beats the fit-to-week default, whichever lands last.
        didFitRef.current = true;
      }
      if (typeof saved.showCompleted === "boolean")
        setShowCompleted(saved.showCompleted);
      if (typeof saved.showLooseTasks === "boolean")
        setShowLooseTasks(saved.showLooseTasks);
      if (typeof saved.leafView === "boolean") setLeafView(saved.leafView);
      if (typeof saved.hoverLabels === "boolean")
        setHoverLabels(saved.hoverLabels);
      if (saved.markers && typeof saved.markers === "object") {
        const savedMarkers = saved.markers as Record<string, unknown>;
        setMarkers((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(next) as Array<keyof GraphTickUnits>) {
            const value = savedMarkers[key];
            if (typeof value === "boolean") next[key] = value;
          }
          return next;
        });
      }
    } catch {
      // Malformed blob: keep defaults.
    }
  });

  const resetView = () => {
    setZoom(DEFAULT_ZOOM);
    setShowCompleted(false);
    setShowLooseTasks(false);
    setLeafView(false);
    setHoverLabels(true);
    setMarkers(DEFAULT_MARKERS);
  };

  const spans = useMemo(
    () => buildRootSpans(calendar, planner),
    [calendar, planner],
  );
  const leafSpans = useMemo(
    () => (leafView ? buildLeafSpans(calendar, planner) : null),
    [leafView, calendar, planner],
  );
  const lanes = useMemo(
    () =>
      buildGraphLanes({
        planner,
        queues,
        dependencies,
        categories,
        spans,
        leafSpans,
        showCompleted,
        showLooseTasks,
      }),
    [
      planner,
      queues,
      dependencies,
      categories,
      spans,
      leafSpans,
      showCompleted,
      showLooseTasks,
    ],
  );
  const layout = useMemo(
    () => layoutGraph(lanes, { pxPerDay, now }),
    [lanes, pxPerDay, now],
  );
  const nodeCount = useMemo(
    () => lanes.reduce((sum, lane) => sum + lane.nodes.length, 0),
    [lanes],
  );

  const handleAddDependency = (predecessorId: string, successorId: string) => {
    const cycle = wouldCreateCycleAddingDependency(
      queues,
      dependencies,
      predecessorId,
      successorId,
      planner,
    );
    if (cycle) {
      setCycleError(
        `That link would create a loop: ${describeCycle(cycle, planner, queues)}`,
      );
      return;
    }
    setCycleError(null);
    const nowIso = new Date().toISOString();
    updateDependencyArray(
      (prev) =>
        prev.some(
          (d) =>
            d.predecessorId === predecessorId && d.successorId === successorId,
        )
          ? prev
          : [
              ...prev,
              {
                id: uuidv4(),
                predecessorId,
                successorId,
                userId,
                createdAt: nowIso,
                updatedAt: nowIso,
              },
            ],
      historyMessages.dependency.add(
        planner.find((p) => p.id === predecessorId)?.title,
      ),
    );
  };

  const handleRemoveDependency = (edgeId: string) => {
    setCycleError(null);
    updateDependencyArray(
      (prev) => prev.filter((d) => d.id !== edgeId),
      historyMessages.dependency.remove(
        planner.find(
          (p) =>
            p.id ===
            dependencies.find((d) => d.id === edgeId)?.predecessorId,
        )?.title,
      ),
    );
  };

  const handleReorderMember = (
    queueId: string,
    plannerId: string,
    toIndex: number,
  ) => {
    const result = reorderQueueMember({
      queues,
      dependencies,
      queueId,
      plannerId,
      toIndex,
      planner,
    });
    if (!result.ok) {
      setCycleError(
        `That order would create a loop: ${describeCycle(result.cycle, planner, queues)}`,
      );
      return;
    }
    setCycleError(null);
    updateQueueArray(
      result.queues,
      historyMessages.queue.reorderMember(
        planner.find((p) => p.id === plannerId)?.title,
      ),
    );
  };

  const hasAnything = nodeCount > 0 || queues.length > 0;

  return (
    <div className={page}>
      <div className={subHeader}>
        {isMobile && (
          <button
            type="button"
            className={backButton}
            onClick={goBack}
            aria-label="Back"
          >
            <ArrowLeft size={17} strokeWidth={2.2} aria-hidden />
          </button>
        )}
        <div className={titleGroup}>
          <h1 className={pageTitle}>Graph</h1>
          <span className={titleSummary}>
            {queues.length} queue{queues.length === 1 ? "" : "s"} ·{" "}
            {dependencies.length} dependenc
            {dependencies.length === 1 ? "y" : "ies"} · {nodeCount} item
            {nodeCount === 1 ? "" : "s"}
          </span>
        </div>
        {isMobile ? (
          <button
            type="button"
            className={settingsButton}
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            <Sliders size={16} strokeWidth={2} aria-hidden />
          </button>
        ) : (
          <div className={headerControls}>
            <MarkerMenu value={markers} onChange={setMarkers} />
            <div className={controlGroup}>
              <span className={controlLabel}>Leaf tasks</span>
              <Switch
                checked={leafView}
                onCheckedChange={setLeafView}
                aria-label="Break items into their leaf tasks"
              />
            </div>
            <div className={controlGroup}>
              <span className={controlLabel}>Hover labels</span>
              <Switch
                checked={hoverLabels}
                onCheckedChange={setHoverLabels}
                aria-label="Show item names on hover"
              />
            </div>
            <div className={controlGroup}>
              <span className={controlLabel}>Show completed</span>
              <Switch
                checked={showCompleted}
                onCheckedChange={setShowCompleted}
                aria-label="Show completed items"
              />
            </div>
            <div className={controlGroup}>
              <span className={controlLabel}>Standalone tasks</span>
              <Switch
                checked={showLooseTasks}
                onCheckedChange={setShowLooseTasks}
                aria-label="Show tasks with no queue or dependency"
              />
            </div>
            <div className={controlGroup}>
              <span className={controlLabel}>Zoom</span>
              <div className={zoomTrack}>
                <div className={zoomTrackBar} />
                <div
                  className={zoomFill}
                  style={{
                    width: `calc(${zoom}% + ${(SLIDER_THUMB_PX * (50 - zoom)) / 100}px)`,
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className={zoomSlider}
                  aria-label="Zoom timeline"
                />
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={resetView}>
              Reset view
            </Button>
          </div>
        )}
      </div>

      {!isMobile && (
        <div className={legendRow}>
          <span className={legendItem}>
            <LegendSwatch color={vars.muted} arrow opacity={0.75} />
            dependency
          </span>
          <span className={legendItem}>
            <LegendSwatch
              color={vars.status.error}
              dashed
              arrow
              opacity={0.8}
            />
            out of order
          </span>
          <span className={legendKeys}>
            {coarsePointer ? (
              <span>
                Drag to pan · Pinch to zoom · Tap to inspect · Hold to reorder
              </span>
            ) : (
              <>
                <Kbd keys="Scroll" instruction="pan" />
                <Kbd keys={["Shift", "Scroll"]} instruction="vertical" />
                <Kbd keys={[modKey, "Scroll"]} instruction="zoom" />
              </>
            )}
          </span>
        </div>
      )}

      {cycleError && <div className={errorBanner}>{cycleError}</div>}

      <div className={canvasCard}>
        {!isLoaded ? (
          <div className={emptyMain}>
            <Loader size="md" label="Loading graph" />
          </div>
        ) : !hasAnything ? (
          <div className={emptyMain}>
            Nothing to map yet — goals, queues, and dependencies show up here as
            a timeline of what happens when.
          </div>
        ) : (
          <GraphCanvas
            layout={layout}
            weekStartDay={weekStartDay}
            markers={markers}
            planner={planner}
            queues={queues}
            dependencies={dependencies}
            categories={categories}
            queueCategoryByRootId={queueCategoryByRootId}
            onAddDependency={handleAddDependency}
            onRemoveDependency={handleRemoveDependency}
            onReorderMember={handleReorderMember}
            onLinkRefused={setCycleError}
            hoverLabels={hoverLabels}
            touch={coarsePointer}
            onZoomDelta={handleZoomDelta}
            onFitWeek={handleFitWeek}
          />
        )}
      </div>

      {isMobile && (
        <BottomSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          title="Settings"
        >
          <div className={sheetColumns}>
            <div className={sheetColumn}>
              <span className={sheetSection}>View</span>
              <div className={sheetRow}>
                <span className={sheetRowLabel}>Leaf tasks</span>
                <Switch
                  checked={leafView}
                  onCheckedChange={setLeafView}
                  aria-label="Break items into their leaf tasks"
                />
              </div>
              <div className={sheetRow}>
                <span className={sheetRowLabel}>Hover labels</span>
                <Switch
                  checked={hoverLabels}
                  onCheckedChange={setHoverLabels}
                  aria-label="Show item names on hover"
                />
              </div>
              <div className={sheetRow}>
                <span className={sheetRowLabel}>Show completed</span>
                <Switch
                  checked={showCompleted}
                  onCheckedChange={setShowCompleted}
                  aria-label="Show completed items"
                />
              </div>
              <div className={sheetRow}>
                <span className={sheetRowLabel}>Standalone tasks</span>
                <Switch
                  checked={showLooseTasks}
                  onCheckedChange={setShowLooseTasks}
                  aria-label="Show tasks with no queue or dependency"
                />
              </div>
              <div className={sheetRow}>
                <span className={sheetRowLabel}>Zoom</span>
                <div className={sheetZoomTrack}>
                  <div className={zoomTrackBar} />
                  <div
                    className={zoomFill}
                    style={{
                      width: `calc(${zoom}% + ${(SLIDER_THUMB_PX * (50 - zoom)) / 100}px)`,
                    }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className={zoomSlider}
                    aria-label="Zoom timeline"
                  />
                </div>
              </div>
            </div>
            <div className={sheetColumn}>
              <span className={sheetSection}>Time markers</span>
              {MARKER_UNIT_ROWS.map((unit) => (
                <div key={unit.key} className={sheetRow}>
                  <span className={sheetRowLabel}>{unit.label}</span>
                  <Switch
                    checked={markers[unit.key]}
                    onCheckedChange={(checked) =>
                      setMarkers((prev) => ({ ...prev, [unit.key]: checked }))
                    }
                    aria-label={`Show ${unit.label.toLowerCase()} markers`}
                  />
                </div>
              ))}
              <div className={sheetHint}>
                <span className={legendItem}>
                  <LegendSwatch color={vars.muted} arrow opacity={0.75} />
                  dependency
                </span>
                <span className={legendItem}>
                  <LegendSwatch
                    color={vars.status.error}
                    dashed
                    arrow
                    opacity={0.8}
                  />
                  out of order
                </span>
              </div>
              <div className={sheetHint}>
                Drag to pan · Pinch to zoom · Tap to inspect · Hold to reorder
              </div>
              <div className={sheetRow}>
                <Button variant="ghost" size="sm" onClick={resetView}>
                  Reset view
                </Button>
              </div>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
