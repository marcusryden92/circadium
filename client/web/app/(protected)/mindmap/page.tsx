"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { ArrowLeft, Sliders } from "lucide-react";
import {
  BottomSheet,
  Button,
  Kbd,
  Loader,
  Switch,
  usePreviousPathname,
  useTheme,
} from "@/components/ui";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { usePlatform } from "@/hooks/usePlatform";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useViewStatePersistence } from "@/hooks/useViewStatePersistence";
import type { RootState } from "@/redux/store";
import { plannerIsCompleted } from "@/utils/plannerCompletion";
import {
  buildMindmapTree,
  layoutMindmap,
  mindmapZoomToScale,
  mindmapScaleToZoom,
  MINDMAP_ZOOM_MIN_SCALE,
  MINDMAP_LAYOUT_DEFAULTS,
  type MindmapLayoutOptions,
} from "./_lib/mindmapModel";
import { MindmapCanvas } from "./_components/MindmapCanvas";
import {
  MindmapControls,
  MindmapControlsBody,
} from "./_components/MindmapControls";
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
  legendKeys,
  canvasCard,
  emptyMain,
  mobileSettingsButton,
  sheetSection,
  sheetRow,
  sheetRowLabel,
  sheetZoomTrack,
  sheetHint,
  sheetColumns,
  sheetColumn,
} from "./page.css";

const DEFAULT_ZOOM = 46;

// Must match SLIDER_THUMB in page.css.ts: nudges the fill's right edge so it
// stays centred under the thumb across the whole track.
const SLIDER_THUMB_PX = 13;

export default function MindmapPage() {
  const { isLoaded, planner, categories } = useCalendarProvider();
  const user = useSelector((state: RootState) => state.user.user);
  const { dark } = useTheme();
  const { modKey } = usePlatform();
  const coarsePointer = useCoarsePointer();
  const isMobile = useIsMobile();
  const router = useRouter();
  const previousPathname = usePreviousPathname();

  const goBack = () => router.push(previousPathname ?? "/dashboard");

  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [showLeaves, setShowLeaves] = useState(false);
  const [layoutOptions, setLayoutOptions] = useState<MindmapLayoutOptions>(
    MINDMAP_LAYOUT_DEFAULTS,
  );
  const scale = mindmapZoomToScale(zoom);

  // Legacy localStorage layout blob: read once as the pre-DB seed (the DB
  // view state below overrides it when present, and now owns all saves).
  const storageKey = user?.id ? `circadium.mindmap.layout.${user.id}` : null;
  const settingsLoadedRef = useRef(false);
  useEffect(() => {
    if (settingsLoadedRef.current || !storageKey) return;
    settingsLoadedRef.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MindmapLayoutOptions>;
        setLayoutOptions({ ...MINDMAP_LAYOUT_DEFAULTS, ...parsed });
      }
    } catch {
      // ignore malformed stored settings
    }
  }, [storageKey]);

  // Zoom is deliberately not persisted: the canvas re-fits on mount and on
  // layout-mode switches, so a restored zoom would just be yanked away.
  const viewSnapshot = useMemo(
    () =>
      JSON.stringify({ showCompleted, hideEmpty, showLeaves, layoutOptions }),
    [showCompleted, hideEmpty, showLeaves, layoutOptions],
  );
  useViewStatePersistence("mindmap", viewSnapshot, (raw) => {
    try {
      const saved = JSON.parse(raw) as Record<string, unknown>;
      if (typeof saved.showCompleted === "boolean")
        setShowCompleted(saved.showCompleted);
      if (typeof saved.hideEmpty === "boolean") setHideEmpty(saved.hideEmpty);
      if (typeof saved.showLeaves === "boolean")
        setShowLeaves(saved.showLeaves);
      if (saved.layoutOptions && typeof saved.layoutOptions === "object") {
        setLayoutOptions({
          ...MINDMAP_LAYOUT_DEFAULTS,
          ...(saved.layoutOptions as Partial<MindmapLayoutOptions>),
        });
      }
    } catch {
      // Malformed blob: keep defaults.
    }
  });

  const resetView = () => {
    setZoom(DEFAULT_ZOOM);
    setShowCompleted(false);
    setHideEmpty(false);
    setShowLeaves(false);
    setLayoutOptions(MINDMAP_LAYOUT_DEFAULTS);
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore privacy-mode failures
      }
    }
  };

  const patchLayoutOptions = useCallback((patch: Partial<MindmapLayoutOptions>) => {
    setLayoutOptions((prev) => ({ ...prev, ...patch }));
  }, []);

  const tree = useMemo(
    () =>
      buildMindmapTree({
        planner,
        categories,
        userName: "me",
        theme: dark ? "dark" : "light",
        showCompleted,
        hideEmpty,
        showLeaves,
      }),
    [planner, categories, dark, showCompleted, hideEmpty, showLeaves],
  );
  const layout = useMemo(
    () => layoutMindmap(tree, layoutOptions),
    [tree, layoutOptions],
  );

  const rolesCount = useMemo(
    () => categories.filter((c) => !c.parentId).length,
    [categories],
  );
  const itemsCount = useMemo(
    () =>
      planner.filter(
        (p) =>
          p.parentId == null &&
          p.isTriaged &&
          (p.plannerType === "task" || p.plannerType === "goal") &&
          (showCompleted || !plannerIsCompleted(p)),
      ).length,
    [planner, showCompleted],
  );

  const handleZoomDelta = useCallback((delta: number) => {
    setZoom((prev) => Math.max(0, Math.min(100, prev + delta)));
  }, []);

  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  // Fits whenever the canvas asks (initial mount + a layout-mode switch); the
  // canvas gates the timing so tuning sliders never yanks the view.
  const handleFit = useCallback((viewportWidth: number, viewportHeight: number) => {
    if (viewportWidth <= 0 || viewportHeight <= 0) return;
    const current = layoutRef.current;
    const fit =
      Math.min(
        viewportWidth / current.width,
        viewportHeight / current.height,
      ) * 0.92;
    const clamped = Math.max(MINDMAP_ZOOM_MIN_SCALE, Math.min(1.1, fit));
    setZoom(mindmapScaleToZoom(clamped));
  }, []);

  // Gate on what the tree actually renders, not raw counts — Hide-empty can
  // prune every branch down to a lone "Me", which should read as empty.
  const hasAnything = tree.children.length > 0;
  const hiddenByToggle =
    !hasAnything && hideEmpty && (rolesCount > 0 || itemsCount > 0);

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
          <h1 className={pageTitle}>Mindmap</h1>
          <span className={titleSummary}>
            {rolesCount} role{rolesCount === 1 ? "" : "s"} · {itemsCount} item
            {itemsCount === 1 ? "" : "s"}
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
            <div className={controlGroup}>
              <span className={controlLabel}>Leaf tasks</span>
              <Switch
                checked={showLeaves}
                onCheckedChange={setShowLeaves}
                aria-label="Branch each goal out into its leaf tasks"
              />
            </div>
            <div className={controlGroup}>
              <span className={controlLabel}>Hide empty</span>
              <Switch
                checked={hideEmpty}
                onCheckedChange={setHideEmpty}
                aria-label="Hide roles and categories with no items"
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
                  aria-label="Zoom mindmap"
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
          <span>
            Your roles and everything you&rsquo;re working on, organized.
          </span>
          <span className={legendKeys}>
            {coarsePointer ? (
              <span>Pinch to zoom · Tap to focus · Tap Open to navigate</span>
            ) : (
              <>
                <Kbd keys="Drag" instruction="pan" />
                <Kbd keys={[modKey, "Scroll"]} instruction="zoom" />
              </>
            )}
          </span>
        </div>
      )}

      <div className={canvasCard}>
        {!isLoaded ? (
          <div className={emptyMain}>
            <Loader size="md" label="Loading mindmap" />
          </div>
        ) : !hasAnything ? (
          <div className={emptyMain}>
            {hiddenByToggle
              ? "Everything is hidden — turn off “Hide empty” to see your roles."
              : "Nothing to map yet — add roles and items and they’ll branch out from here."}
          </div>
        ) : (
          <>
            <MindmapCanvas
              layout={layout}
              scale={scale}
              refitToken={layoutOptions.layout}
              touch={coarsePointer}
              onZoomDelta={handleZoomDelta}
              onFit={handleFit}
            />
            {isMobile ? null : coarsePointer ? (
              <>
                <button
                  type="button"
                  className={mobileSettingsButton}
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Layout settings"
                >
                  <Sliders size={15} strokeWidth={2} aria-hidden />
                  Layout
                </button>
                <BottomSheet
                  open={settingsOpen}
                  onOpenChange={setSettingsOpen}
                  title="Layout settings"
                >
                  <MindmapControlsBody
                    options={layoutOptions}
                    onChange={patchLayoutOptions}
                  />
                </BottomSheet>
              </>
            ) : (
              <MindmapControls
                options={layoutOptions}
                onChange={patchLayoutOptions}
              />
            )}
          </>
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
                  checked={showLeaves}
                  onCheckedChange={setShowLeaves}
                  aria-label="Branch each goal out into its leaf tasks"
                />
              </div>
              <div className={sheetRow}>
                <span className={sheetRowLabel}>Hide empty</span>
                <Switch
                  checked={hideEmpty}
                  onCheckedChange={setHideEmpty}
                  aria-label="Hide roles and categories with no items"
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
                    aria-label="Zoom mindmap"
                  />
                </div>
              </div>
            </div>
            <div className={sheetColumn}>
              <span className={sheetSection}>Layout</span>
              <MindmapControlsBody
                options={layoutOptions}
                onChange={patchLayoutOptions}
              />
              <div className={sheetHint}>
                Pinch to zoom · Tap to focus · Tap Open to navigate
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
